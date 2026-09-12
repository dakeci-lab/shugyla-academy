/**
 * procurement-archive — archives + prunes old procurement_snapshot_items
 * rows so the database stays under the Supabase free-tier size limit.
 * Storage has a separate, much less full quota, so this actually solves the
 * problem instead of moving it. See 20260912090000_procurement_snapshot_archival.sql.
 *
 * For each eligible snapshot (get_procurement_snapshots_eligible_for_archive —
 * never the single latest 'ready'/'generated' snapshot, which the live
 * Планирование/ABC/Нормы views depend on; never 'partially_generated' or
 * 'syncing'; only snapshots older than RETENTION_DAYS):
 *   1. compute_procurement_snapshot_rollup — permanent per-category summary,
 *      stays in Postgres (cheap) even after the raw rows are gone.
 *   2. Export every item row to a gzipped CSV in the private
 *      `procurement-snapshot-archives` Storage bucket.
 *   3. prune_procurement_snapshot_items — delete the raw rows, mark
 *      archived_at. (Refuses to run if the archive upload didn't happen
 *      first — see the SQL function.)
 *
 * A crash mid-batch is safely resumable: the next call re-derives the same
 * eligible snapshot (archived_at is still null), recomputes the rollup
 * (idempotent, ON CONFLICT DO NOTHING), re-uploads the archive (upsert), and
 * finishes the prune. Never returns raw item data to the client — counts only.
 *
 * Triggered by:
 *   - the daily 07:30 (Aqtobe) cron, HMAC-signed
 *     (see public.invoke_procurement_archive_scheduler)
 *   - an authenticated call with procurement.edit — used to clear the
 *     initial backlog fast; call repeatedly, one batch per call.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { adminErrorResponse, authorizeWorkforceRequest } from '../_shared/employeeAuthorization.ts'
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import { isSchedulerSecretConfigured, verifySchedulerRequest } from '../_shared/schedulerRequestAuth.ts'

const PERMISSION_EDIT = 'procurement.edit'
const BUCKET = 'procurement-snapshot-archives'
const BATCH_SIZE = 5
const RETENTION_DAYS = 7
const ITEMS_PAGE_SIZE = 1000

const ITEM_COLUMNS = [
  'barcode',
  'product_name',
  'category_name',
  'subcategory_name',
  'umag_supplier_name',
  'measure',
  'raw_stock',
  'calculation_stock',
  'negative_stock',
  'sales_8w',
  'avg_daily',
  'purchase_price',
  'selling_price',
  'norm_days',
  'recommended_qty',
  'final_order_qty',
  'manual_override',
  'reserve_status',
  'created_at',
] as const

type EligibleSnapshot = { id: string; created_at: string; synced_at: string | null; item_count: number | null }
type ArchiveResult = { id: string; rowsExported: number; rowsDeleted: number }

function isArchiveSchedulerEnabled(): boolean {
  if (Deno.env.get('PROCUREMENT_ARCHIVE_SCHEDULER_ENABLED') !== 'true') return false
  return isSchedulerSecretConfigured(Deno.env.get('PROCUREMENT_ARCHIVE_SCHEDULER_SECRET_CURRENT'))
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/["\n\r,]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function archivePath(snapshotId: string): string {
  return `archives/${snapshotId}.csv.gz`
}

async function fetchAllItemsCsv(
  serviceClient: SupabaseClient,
  snapshotId: string
): Promise<{ csv: string; rowCount: number }> {
  const lines: string[] = [ITEM_COLUMNS.join(',')]
  let from = 0
  let rowCount = 0

  for (;;) {
    const { data, error } = await serviceClient
      .from('procurement_snapshot_items')
      .select(ITEM_COLUMNS.join(','))
      .eq('snapshot_id', snapshotId)
      .order('id', { ascending: true })
      .range(from, from + ITEMS_PAGE_SIZE - 1)
    if (error) throw new Error(`fetch_items_failed: ${error.message}`)

    const page = (data || []) as unknown as Record<string, unknown>[]
    for (const row of page) {
      lines.push(ITEM_COLUMNS.map((col) => csvEscape(row[col])).join(','))
    }
    rowCount += page.length
    if (page.length < ITEMS_PAGE_SIZE) break
    from += ITEMS_PAGE_SIZE
  }

  return { csv: lines.join('\n'), rowCount }
}

async function gzipText(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

async function archiveOneSnapshot(
  serviceClient: SupabaseClient,
  snapshot: EligibleSnapshot
): Promise<ArchiveResult> {
  const { error: rollupError } = await serviceClient.rpc('compute_procurement_snapshot_rollup', {
    p_snapshot_id: snapshot.id,
  })
  if (rollupError) throw new Error(`rollup_failed[${snapshot.id}]: ${rollupError.message}`)

  const { csv, rowCount } = await fetchAllItemsCsv(serviceClient, snapshot.id)
  const gzipped = await gzipText(csv)
  const path = archivePath(snapshot.id)

  const { error: uploadError } = await serviceClient.storage
    .from(BUCKET)
    .upload(path, gzipped, { contentType: 'application/gzip', upsert: true })
  if (uploadError) throw new Error(`upload_failed[${snapshot.id}]: ${uploadError.message}`)

  const { error: markError } = await serviceClient
    .from('procurement_snapshots')
    .update({ archive_path: path })
    .eq('id', snapshot.id)
  if (markError) throw new Error(`mark_archived_failed[${snapshot.id}]: ${markError.message}`)

  const { data: deletedCount, error: pruneError } = await serviceClient.rpc(
    'prune_procurement_snapshot_items',
    { p_snapshot_id: snapshot.id }
  )
  if (pruneError) throw new Error(`prune_failed[${snapshot.id}]: ${pruneError.message}`)

  return { id: snapshot.id, rowsExported: rowCount, rowsDeleted: (deletedCount as number) ?? 0 }
}

async function runArchivalBatch(serviceClient: SupabaseClient) {
  const { data: eligible, error } = await serviceClient.rpc(
    'get_procurement_snapshots_eligible_for_archive',
    { p_cutoff_days: RETENTION_DAYS, p_limit: BATCH_SIZE }
  )
  if (error) throw new Error(`eligibility_query_failed: ${error.message}`)

  const processed: ArchiveResult[] = []
  for (const snapshot of (eligible || []) as EligibleSnapshot[]) {
    try {
      processed.push(await archiveOneSnapshot(serviceClient, snapshot))
    } catch (err) {
      console.error('procurement_archive_snapshot_failed', {
        snapshotId: snapshot.id,
        message: err instanceof Error ? err.message : String(err),
      })
      // Stop the batch on the first failure — a partial batch is fine (the
      // next run retries this same snapshot), but don't paper over an error
      // by charging ahead to the rest.
      break
    }
  }

  const { data: stillEligible } = await serviceClient.rpc(
    'get_procurement_snapshots_eligible_for_archive',
    { p_cutoff_days: RETENTION_DAYS, p_limit: 1 }
  )

  return {
    processed,
    hasMore: Boolean(stillEligible && (stillEligible as unknown[]).length > 0),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()
  if (req.method !== 'POST') return adminErrorResponse('method_not_allowed', 405)

  const rawBody = new Uint8Array(await req.arrayBuffer())

  // Daily 07:30 (Aqtobe) cron — HMAC-signed system caller, same scheme as
  // umag-procurement's sync scheduler. 30 minutes after the sync scheduler so
  // today's fresh snapshot already exists before this looks for stale ones.
  if (req.headers.get('x-shugyla-scheduler-signature')) {
    if (!isArchiveSchedulerEnabled()) {
      return adminErrorResponse('scheduler_disabled', 503)
    }
    const authorized = await verifySchedulerRequest({
      request: req,
      rawBody,
      currentSecret: Deno.env.get('PROCUREMENT_ARCHIVE_SCHEDULER_SECRET_CURRENT'),
      previousSecret: Deno.env.get('PROCUREMENT_ARCHIVE_SCHEDULER_SECRET_PREVIOUS'),
    })
    if (!authorized) return adminErrorResponse('unauthorized', 401)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    try {
      const result = await runArchivalBatch(serviceClient)
      return jsonResponse({ success: true, ...result })
    } catch (err) {
      console.error('procurement_archive_scheduler_failed', {
        message: err instanceof Error ? err.message : String(err),
      })
      return adminErrorResponse('archive_failed', 500)
    }
  }

  // Manual trigger — same permission as the sync button. Used to clear the
  // initial backlog fast (call repeatedly; each call handles one batch) and
  // as a manual nudge if the cron job ever needs one.
  const authz = await authorizeWorkforceRequest(req, [PERMISSION_EDIT])
  if (authz instanceof Response) return authz

  try {
    const result = await runArchivalBatch(authz.serviceClient)
    return jsonResponse({ success: true, ...result })
  } catch (err) {
    console.error('procurement_archive_manual_failed', {
      message: err instanceof Error ? err.message : String(err),
    })
    return adminErrorResponse('archive_failed', 500)
  }
})
