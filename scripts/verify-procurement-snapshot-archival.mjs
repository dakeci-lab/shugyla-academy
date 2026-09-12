#!/usr/bin/env node
/**
 * Verifies the procurement snapshot archival system: the migration's safety
 * guarantees (never touches the latest ready/generated snapshot, never
 * partially_generated/syncing, only deletes items after a successful
 * archive upload), and the Edge Function's shape (rollup -> export -> prune
 * order, pagination past PostgREST's 1000-row cap, scheduler auth).
 *
 * Usage:
 *   npm run verify:procurement-snapshot-archival
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let testsRun = 0
let testsPassed = 0

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  testsRun += 1
  if (!condition) fail(`${name}${detail ? `: ${detail}` : ''}`)
  testsPassed += 1
  console.log(`  ✓ ${name}`)
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function findMigration() {
  const dir = path.join(ROOT, 'supabase/migrations')
  const match = fs.readdirSync(dir).find((name) => name.includes('procurement_snapshot_archival'))
  if (!match) fail('archival migration file not found in supabase/migrations')
  return `supabase/migrations/${match}`
}

function stageMigration() {
  console.log('Stage 1: migration — schema, rollup, safety-gated eligibility, storage')

  const sql = read(findMigration())

  assert('adds procurement_snapshots.archived_at', /add column if not exists archived_at timestamptz/.test(sql))
  assert('adds procurement_snapshots.archive_path', /add column if not exists archive_path text/.test(sql))
  assert('creates the category rollup table', /create table if not exists public\.procurement_snapshot_category_rollup/.test(sql))
  assert(
    'rollup table has a unique key per snapshot/category/subcategory (idempotent inserts)',
    /unique \(snapshot_id, category_name, subcategory_name\)/.test(sql)
  )
  assert('rollup table has RLS enabled', /alter table public\.procurement_snapshot_category_rollup enable row level security/.test(sql))
  assert(
    'rollup select policy is gated by procurement.view',
    /procurement_snapshot_category_rollup_select[\s\S]{0,200}procurement\.view/.test(sql)
  )
  assert(
    'compute_procurement_snapshot_rollup is service_role only (not public/authenticated)',
    /revoke all on function public\.compute_procurement_snapshot_rollup\(uuid\) from public/.test(sql) &&
      /grant execute on function public\.compute_procurement_snapshot_rollup\(uuid\) to service_role/.test(sql)
  )

  assert(
    'eligibility picker excludes the single latest ready/generated snapshot',
    /latest_ready as \(/.test(sql) && /and s\.id not in \(select id from latest_ready\)/.test(sql)
  )
  assert(
    'eligibility picker only considers ready/generated status (never partially_generated or syncing)',
    /status in \('ready', 'generated'\)/.test(sql)
  )
  assert('eligibility picker respects a cutoff_days parameter', /coalesce\(s\.synced_at, s\.created_at\) < now\(\) - make_interval\(days => greatest\(p_cutoff_days, 1\)\)/.test(sql))
  assert(
    'eligibility function is service_role only',
    /revoke all on function public\.get_procurement_snapshots_eligible_for_archive/.test(sql) &&
      /grant execute on function public\.get_procurement_snapshots_eligible_for_archive\(integer, integer\) to service_role/.test(sql)
  )

  assert(
    'prune function refuses to delete items without an archive_path first',
    /if v_archive_path is null then\s*\n\s*raise exception 'snapshot_not_archived/.test(sql)
  )
  assert('prune function is service_role only', /grant execute on function public\.prune_procurement_snapshot_items\(uuid\) to service_role/.test(sql))
  assert('prune function sets archived_at', /set archived_at = coalesce\(archived_at, now\(\)\)/.test(sql))

  assert(
    'creates the private procurement-snapshot-archives bucket',
    /'procurement-snapshot-archives',\s*\n\s*'procurement-snapshot-archives',\s*\n\s*false,/.test(sql)
  )
  assert(
    'archive bucket select policy is gated by procurement.view, no public/authenticated write policy',
    /procurement_snapshot_archives_select[\s\S]{0,200}procurement\.view/.test(sql) &&
      !/procurement_snapshot_archives.*insert/i.test(sql)
  )

  assert('sets a lock_timeout before the rewrite', /set lock_timeout/.test(sql))
  assert('sets a statement_timeout before the rewrite', /set statement_timeout/.test(sql))
  assert(
    'scheduler function mirrors invoke_procurement_sync_scheduler (dedicated vault secret, same HMAC canonical form)',
    /procurement_archive_scheduler_hmac_secret/.test(sql) && /v_ts \|\| E'\\n' \|\| 'POST' \|\| E'\\n' \|\| v_body_hash/.test(sql)
  )
  assert('registers the daily cron job', /cron\.schedule\(\s*\n\s*'procurement-archive-scheduler-daily-0730-aqtobe'/.test(sql))

  console.log('')
}

function stageEdgeFunction() {
  console.log('Stage 2: Edge Function — rollup-before-export-before-prune, pagination, auth')

  const fn = read('supabase/functions/procurement-archive/index.ts')

  assert(
    'archiveOneSnapshot computes the rollup before exporting items',
    /rpc\('compute_procurement_snapshot_rollup'[\s\S]*?fetchAllItemsCsv/.test(fn)
  )
  assert(
    'archiveOneSnapshot uploads the archive before pruning',
    /storage[\s\S]*?\.upload\(path, gzipped[\s\S]*?prune_procurement_snapshot_items/.test(fn)
  )
  assert('items are paginated past the PostgREST 1000-row cap', /ITEMS_PAGE_SIZE = 1000/.test(fn) && /\.range\(from, from \+ ITEMS_PAGE_SIZE - 1\)/.test(fn))
  assert('CSV values are escaped (commas/quotes/newlines)', /csvEscape/.test(fn) && /replace\(\/"\/g, '""'\)/.test(fn))
  assert('archive is gzip-compressed before upload', /CompressionStream\('gzip'\)/.test(fn))
  assert('uploads with the correct content type', /contentType: 'application\/gzip'/.test(fn))

  assert('scheduler branch checks the enabled flag before verifying HMAC', /isArchiveSchedulerEnabled\(\)/.test(fn) && /scheduler_disabled/.test(fn))
  assert(
    'scheduler branch uses the shared verifySchedulerRequest helper',
    /verifySchedulerRequest\(\{[\s\S]{0,200}currentSecret: Deno\.env\.get\('PROCUREMENT_ARCHIVE_SCHEDULER_SECRET_CURRENT'\)/.test(fn)
  )
  assert(
    'manual trigger requires procurement.edit, same as the sync button',
    /authorizeWorkforceRequest\(req, \[PERMISSION_EDIT\]\)/.test(fn) && /PERMISSION_EDIT = 'procurement\.edit'/.test(fn)
  )
  assert('a failed snapshot stops the batch instead of masking the error by continuing', /break$/m.test(fn))
  assert(
    'ArchiveResult carries only counts, never the raw CSV/item rows',
    /type ArchiveResult = \{ id: string; rowsExported: number; rowsDeleted: number \}/.test(fn)
  )
  assert(
    'jsonResponse calls never pass the raw csv variable',
    !(fn.match(/jsonResponse\([^)]*\)/g) || []).some((call) => /\bcsv\b/.test(call))
  )

  console.log('')
}

function main() {
  try {
    stageMigration()
    stageEdgeFunction()
    console.log(`=== All ${testsPassed}/${testsRun} checks passed ===`)
  } catch (err) {
    console.error(`\n✗ FAILED after ${testsPassed}/${testsRun} checks: ${err.message}`)
    process.exitCode = 1
  }
}

main()
