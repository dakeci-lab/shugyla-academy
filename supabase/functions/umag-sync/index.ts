/**
 * umag-sync — UMAG suppliers + supplies + supply returns + document payments.
 *
 * Frontend → this Edge Function → api.umag.kz → Supabase tables.
 * Never returns UMAG Authorization or raw credentials to the client.
 *
 * Primary endpoints:
 * - GET /rest/cabinet/org/agent/list (agentType=SUPPLIER)
 * - GET /rest/cabinet/opr/supplies/all
 * - GET /rest/cabinet/opr/supply-returns/list
 * - GET /rest/cabinet/fin/document-payment/list-all
 *
 * Does NOT call supply/return product lines or N+1 detail endpoints.
 */

import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import {
  adminErrorResponse,
  authorizeWorkforceRequest,
} from '../_shared/employeeAuthorization.ts'
import {
  aqtobePeriodBoundsMs,
  maskStoreId,
  MAX_AUTO_SYNC_LOOKBACK_MONTHS,
  nearlyEqual,
  parseUmagEditTime,
  STALE_SYNC_THRESHOLD_MINUTES,
  sumNumbers,
  UMAG_PAGE_SIZE,
} from '../_shared/umagConfig.ts'
import {
  acquireUmagSession,
  umagFetchAuthed,
  type UmagSession,
} from '../_shared/umagAuth.ts'
import {
  buildPaymentSupplierLinkMaps,
  fetchDocumentPaymentsForPeriod,
  rebuildLedgerEventsForPeriod,
  upsertDocumentPayments,
} from '../_shared/umagDocumentPayments.ts'

const PERMISSION_SYNC = 'umag.settlements.sync'
const ALLOWED_BODY_KEYS = new Set(['action', 'dateFrom', 'dateTo', 'syncSuppliers'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const AGGREGATE_EPSILON = 0.01

type SyncStatus = 'running' | 'success' | 'partial' | 'failed'

type UmagAgent = {
  id?: number | string
  name?: string | null
  legalName?: string | null
  bin?: string | null
  phone?: string | null
  actualAddress?: string | null
  legalAddress?: string | null
  isDeleted?: boolean | null
  editTime?: number | string | null
}

type UmagSupply = {
  id?: number | string
  type?: number | null
  docTime?: number | string | null
  editTime?: number | string | null
  paymentType?: number | null
  amount?: number | string | null
  comment?: string | null
  arrivalCost?: number | string | null
  sellingCost?: number | string | null
  paymentAmount?: number | string | null
  paymentRefundAmount?: number | string | null
  account?: string | null
  debt?: number | string | null
  supplierId?: number | string | null
  userId?: number | string | null
  userFirstName?: string | null
  supplierName?: string | null
  supplierLegalName?: string | null
}

type SuppliesPage = {
  fetchedCount?: number
  totalCount?: number
  amount?: number | string
  paymentAmount?: number | string
  paymentRefundAmount?: number | string
  debt?: number | string
  list?: UmagSupply[]
}

type AgentsPage = {
  agents?: UmagAgent[]
  count?: number
}

type UmagSupplyReturnDoc = {
  id?: number | string
  storeId?: number | string | null
  userId?: number | string | null
  agentId?: number | string | null
  amount?: number | string | null
  documentTime?: number | string | null
  note?: string | null
  isProvided?: boolean | null
  createTime?: number | string | null
  updateTime?: number | string | null
  operationTime?: number | string | null
  operationType?: string | null
}

type UmagSupplyReturnAdditional = {
  supplierName?: string | null
  payedAmount?: number | string | null
  userName?: string | null
  accountNames?: unknown
}

type UmagSupplyReturnItem = {
  supplyReturn?: UmagSupplyReturnDoc | null
  additionalData?: UmagSupplyReturnAdditional | null
} & UmagSupplyReturnDoc &
  UmagSupplyReturnAdditional

type SupplyReturnsPage = {
  fetchedCount?: number
  totalCount?: number
  amount?: number | string
  list?: UmagSupplyReturnItem[]
  supplyReturns?: UmagSupplyReturnItem[]
}

function umagErrorResponse(
  code: string,
  message: string,
  status = 502,
  extra: Record<string, unknown> = {}
) {
  return jsonResponse(
    {
      success: false,
      code,
      message,
      ...extra,
    },
    status
  )
}

function mapUmagAuthError(
  code:
    | 'UMAG_NOT_CONFIGURED'
    | 'UMAG_AUTH_FAILED'
    | 'UMAG_LOGIN_FAILED'
    | 'UMAG_TIMEOUT'
    | 'UMAG_NETWORK_ERROR'
): Response {
  if (code === 'UMAG_NOT_CONFIGURED') {
    return umagErrorResponse(
      'UMAG_NOT_CONFIGURED',
      'Подключение к UMAG ещё не настроено. Установите UMAG_LOGIN (или UMAG_USERNAME), UMAG_PASSWORD и UMAG_STORE_ID.',
      503
    )
  }
  if (code === 'UMAG_AUTH_FAILED' || code === 'UMAG_LOGIN_FAILED') {
    return umagErrorResponse(
      'UMAG_AUTH_FAILED',
      'Не удалось войти в UMAG. Проверьте логин и пароль или доступ учётной записи.',
      502
    )
  }
  if (code === 'UMAG_TIMEOUT') {
    return umagErrorResponse(
      'UMAG_TIMEOUT',
      'Превышено время ожидания ответа UMAG. Повторите попытку.',
      504
    )
  }
  return umagErrorResponse(
    'UMAG_NETWORK_ERROR',
    'Не удалось связаться с UMAG. Повторите попытку.',
    502
  )
}

function mapUmagHttpError(status: number): Response {
  if (status === 401 || status === 403) {
    return mapUmagAuthError('UMAG_AUTH_FAILED')
  }
  if (status >= 500) {
    return umagErrorResponse(
      'UMAG_UPSTREAM_ERROR',
      'Сервис UMAG временно недоступен. Повторите попытку позже.',
      502
    )
  }
  return umagErrorResponse(
    'UMAG_REQUEST_FAILED',
    `UMAG вернул ошибку (HTTP ${status}).`,
    502
  )
}

function asNumber(value: unknown, fallback = 0): number {
  if (value == null || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asBigIntId(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  return n
}

function validateBody(body: unknown): {
  dateFrom: string
  dateTo: string
  syncSuppliers: boolean
} | Response {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return umagErrorResponse('VALIDATION_ERROR', 'Некорректное тело запроса.', 400)
  }
  const record = body as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!ALLOWED_BODY_KEYS.has(key)) {
      return umagErrorResponse('VALIDATION_ERROR', `Недопустимое поле: ${key}`, 400)
    }
  }

  const action = record.action == null ? 'sync' : String(record.action)
  if (action !== 'sync') {
    return umagErrorResponse('VALIDATION_ERROR', 'Поддерживается только action=sync.', 400)
  }

  const dateFrom = String(record.dateFrom || '')
  const dateTo = String(record.dateTo || '')
  if (!DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo)) {
    return umagErrorResponse(
      'VALIDATION_ERROR',
      'Укажите период dateFrom/dateTo в формате YYYY-MM-DD.',
      400
    )
  }
  if (dateFrom > dateTo) {
    return umagErrorResponse(
      'VALIDATION_ERROR',
      'Дата начала периода не может быть позже даты окончания.',
      400
    )
  }

  return {
    dateFrom,
    dateTo,
    syncSuppliers: record.syncSuppliers !== false,
  }
}

/** Postgres unique_violation. */
const PG_UNIQUE_VIOLATION = '23505'
/** Must match the index name in supabase/migrations/20260819120000_umag_sync_runs_lock.sql. */
const SYNC_LOCK_INDEX_NAME = 'umag_sync_runs_entity_running_lock'

/**
 * True only for a unique-violation on the sync lock index specifically — not
 * any other insert failure (RLS, bad schema, connection error, ...). Those
 * must keep surfacing as real errors, never be swallowed as "already running".
 */
function isSyncLockConflict(
  error: { code?: string; message?: string; details?: string } | null | undefined
): boolean {
  if (!error) return false
  if (error.code !== PG_UNIQUE_VIOLATION) return false
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  return text.includes(SYNC_LOCK_INDEX_NAME)
}

/**
 * Этап 2.3: before a new sync attempts to acquire the lock, close any
 * `running` row that is older than STALE_SYNC_THRESHOLD_MINUTES — most
 * likely a crashed/killed Edge Function instance that never reached
 * finishSyncRun(). This alone is NOT the lock (see acquireSyncRun's unique
 * index) — it only recovers from a genuinely abandoned run so a fresh sync
 * isn't blocked forever. A run that is merely close to the threshold but
 * still legitimately in flight is left untouched.
 */
async function cleanupStaleSyncRuns(
  // deno-lint-ignore no-explicit-any
  serviceClient: any
): Promise<{ staleClosed: number } | Response> {
  const staleBefore = new Date(Date.now() - STALE_SYNC_THRESHOLD_MINUTES * 60_000).toISOString()
  const { data, error } = await serviceClient
    .from('umag_sync_runs')
    .update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_message: `stale: run exceeded ${STALE_SYNC_THRESHOLD_MINUTES} min without finishing — closed by the next sync attempt's cleanup step.`,
    })
    .eq('status', 'running')
    .lt('started_at', staleBefore)
    .select('id')

  if (error) {
    console.error('umag_sync_stale_cleanup_failed', { message: error.message, code: error.code })
    return umagErrorResponse(
      'SUPABASE_UPSERT_FAILED',
      `Не удалось проверить зависшие запуски синхронизации: ${error.message}`,
      500
    )
  }

  const staleClosed = (data || []).length
  if (staleClosed > 0) {
    console.warn('umag_sync_stale_runs_closed', { staleClosed, thresholdMinutes: STALE_SYNC_THRESHOLD_MINUTES })
  }
  return { staleClosed }
}

type SyncRunAcquireResult =
  | { ok: true; runId: string }
  | { ok: false; alreadyRunning: true; runId: string | null; startedAt: string | null }
  | { ok: false; alreadyRunning: false; response: Response }

/**
 * The insert IS the lock acquisition: the partial unique index on
 * umag_sync_runs (entity) WHERE status='running' (see the Этап 2.3
 * migration) lets at most one row per entity be `running` at a time. A
 * losing concurrent request gets a real 23505 from Postgres — that is the
 * authoritative guarantee, not this function's own logic. Any other insert
 * error (RLS, schema, connection, ...) is returned as a genuine failure.
 */
async function acquireSyncRun(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  fields: Record<string, unknown>
): Promise<SyncRunAcquireResult> {
  const { data, error } = await serviceClient
    .from('umag_sync_runs')
    .insert({
      entity: 'all',
      status: 'running',
      started_at: new Date().toISOString(),
      ...fields,
    })
    .select('id')
    .single()

  if (!error) {
    if (!data?.id) {
      console.error('umag_sync_run_create_failed', { message: 'insert returned no id' })
      return {
        ok: false,
        alreadyRunning: false,
        response: umagErrorResponse(
          'SUPABASE_UPSERT_FAILED',
          'Не удалось создать запись синхронизации.',
          500
        ),
      }
    }
    return { ok: true, runId: data.id }
  }

  if (isSyncLockConflict(error)) {
    // Best-effort: surface which run holds the lock. A race where it just
    // finished between the failed insert and this select is harmless — the
    // caller only needs "someone else was running a moment ago".
    const { data: running } = await serviceClient
      .from('umag_sync_runs')
      .select('id, started_at')
      .eq('entity', String(fields.entity ?? 'all'))
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return {
      ok: false,
      alreadyRunning: true,
      runId: running?.id ?? null,
      startedAt: running?.started_at ?? null,
    }
  }

  console.error('umag_sync_run_create_failed', { message: error.message, code: error.code })
  return {
    ok: false,
    alreadyRunning: false,
    response: umagErrorResponse(
      'SUPABASE_UPSERT_FAILED',
      `Не удалось создать запись синхронизации: ${error.message}`,
      500
    ),
  }
}

async function finishSyncRun(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  runId: string | null,
  patch: Record<string, unknown>
) {
  if (!runId) return
  const { error } = await serviceClient
    .from('umag_sync_runs')
    .update({
      finished_at: new Date().toISOString(),
      ...patch,
    })
    .eq('id', runId)
  if (error) {
    console.error('umag_sync_run_finish_failed', { message: error.message })
  }
}

async function fetchAllSuppliers(session: UmagSession): Promise<
  | { ok: true; agents: UmagAgent[]; pages: number }
  | { ok: false; response: Response }
> {
  const agents: UmagAgent[] = []
  let first = 0
  let pages = 0
  let reportedCount: number | null = null

  while (true) {
    pages += 1
    const result = await umagFetchAuthed('/rest/cabinet/org/agent/list', {
      agentType: 'SUPPLIER',
      first,
      pageSize: UMAG_PAGE_SIZE,
      deleted: false,
      searchString: '',
      storeId: session.storeId,
    })

    if ('error' in result) {
      return { ok: false, response: mapUmagAuthError(result.error) }
    }

    if (result.status !== 200) {
      return { ok: false, response: mapUmagHttpError(result.status) }
    }

    if (result.json == null || typeof result.json !== 'object') {
      return {
        ok: false,
        response: umagErrorResponse(
          'UMAG_INVALID_JSON',
          'UMAG вернул некорректный ответ при загрузке поставщиков.',
          502
        ),
      }
    }

    const page = result.json as AgentsPage
    const batch = Array.isArray(page.agents) ? page.agents : []
    if (typeof page.count === 'number') reportedCount = page.count
    agents.push(...batch)

    console.info('umag_sync_suppliers_page', {
      first,
      pageSize: UMAG_PAGE_SIZE,
      batch: batch.length,
      totalSoFar: agents.length,
      reportedCount,
      elapsedMs: result.elapsedMs,
      retriedAfterSignIn: result.retriedAfterSignIn,
      storeId: maskStoreId(session.storeId),
    })

    if (batch.length === 0) break
    if (reportedCount != null && agents.length >= reportedCount) break
    if (batch.length < UMAG_PAGE_SIZE) break
    first += UMAG_PAGE_SIZE
    if (pages > 200) {
      return {
        ok: false,
        response: umagErrorResponse(
          'UMAG_PAGINATION_FAILED',
          'Превышен лимит страниц при загрузке поставщиков UMAG.',
          502
        ),
      }
    }
  }

  return { ok: true, agents, pages }
}

async function fetchAllSupplies(
  session: UmagSession,
  fromTime: number,
  toTime: number
): Promise<
  | {
      ok: true
      supplies: UmagSupply[]
      pages: number
      source: {
        totalCount: number | null
        amount: number | null
        paymentAmount: number | null
        paymentRefundAmount: number | null
        debt: number | null
      }
    }
  | { ok: false; response: Response }
> {
  const supplies: UmagSupply[] = []
  let first = 0
  let pages = 0
  let source = {
    totalCount: null as number | null,
    amount: null as number | null,
    paymentAmount: null as number | null,
    paymentRefundAmount: null as number | null,
    debt: null as number | null,
  }

  while (true) {
    pages += 1
    const result = await umagFetchAuthed('/rest/cabinet/opr/supplies/all', {
      first,
      pageSize: UMAG_PAGE_SIZE,
      fromTime,
      toTime,
      storeId: session.storeId,
    })

    if ('error' in result) {
      return { ok: false, response: mapUmagAuthError(result.error) }
    }

    if (result.status !== 200) {
      return { ok: false, response: mapUmagHttpError(result.status) }
    }

    if (result.json == null || typeof result.json !== 'object') {
      return {
        ok: false,
        response: umagErrorResponse(
          'UMAG_INVALID_JSON',
          'UMAG вернул некорректный ответ при загрузке приёмок.',
          502
        ),
      }
    }

    const page = result.json as SuppliesPage
    if (pages === 1) {
      source = {
        totalCount: page.totalCount == null ? null : asNumber(page.totalCount, 0),
        amount: page.amount == null ? null : asNumber(page.amount),
        paymentAmount: page.paymentAmount == null ? null : asNumber(page.paymentAmount),
        paymentRefundAmount:
          page.paymentRefundAmount == null ? null : asNumber(page.paymentRefundAmount),
        debt: page.debt == null ? null : asNumber(page.debt),
      }
    }

    const batch = Array.isArray(page.list) ? page.list : []
    supplies.push(...batch)

    console.info('umag_sync_supplies_page', {
      first,
      pageSize: UMAG_PAGE_SIZE,
      batch: batch.length,
      totalSoFar: supplies.length,
      totalCount: source.totalCount,
      elapsedMs: result.elapsedMs,
      retriedAfterSignIn: result.retriedAfterSignIn,
      storeId: maskStoreId(session.storeId),
    })

    const totalCount = source.totalCount
    if (batch.length === 0) break
    if (totalCount != null && supplies.length >= totalCount) break
    if (batch.length < UMAG_PAGE_SIZE) break
    first += UMAG_PAGE_SIZE
    if (pages > 500) {
      return {
        ok: false,
        response: umagErrorResponse(
          'UMAG_PAGINATION_FAILED',
          'Превышен лимит страниц при загрузке приёмок UMAG.',
          502
        ),
      }
    }
  }

  return { ok: true, supplies, pages, source }
}

async function upsertSuppliers(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  agents: UmagAgent[]
): Promise<{ created: number; updated: number; map: Map<number, string> } | Response> {
  const map = new Map<number, string>()
  if (agents.length === 0) return { created: 0, updated: 0, map }

  const umagIds = agents
    .map((a) => asBigIntId(a.id))
    .filter((id): id is number => id != null)

  const { data: existingRows, error: existingError } = await serviceClient
    .from('umag_suppliers')
    .select('id, umag_supplier_id')
    .in('umag_supplier_id', umagIds)

  if (existingError) {
    console.error('umag_suppliers_select_failed', { message: existingError.message })
    return umagErrorResponse(
      'SUPABASE_UPSERT_FAILED',
      'Не удалось прочитать существующих поставщиков UMAG.',
      500
    )
  }

  const existingByUmag = new Map<number, string>()
  for (const row of existingRows || []) {
    existingByUmag.set(Number(row.umag_supplier_id), row.id)
  }

  const now = new Date().toISOString()
  const rows = []
  for (const agent of agents) {
    const umagId = asBigIntId(agent.id)
    if (umagId == null) continue
    const name = String(agent.name || '').trim() || `Поставщик ${umagId}`
    rows.push({
      umag_supplier_id: umagId,
      name,
      legal_name: agent.legalName ? String(agent.legalName) : null,
      bin: agent.bin ? String(agent.bin) : null,
      phone: agent.phone ? String(agent.phone) : null,
      actual_address: agent.actualAddress ? String(agent.actualAddress) : null,
      legal_address: agent.legalAddress ? String(agent.legalAddress) : null,
      is_deleted: Boolean(agent.isDeleted),
      umag_edit_time: parseUmagEditTime(agent.editTime),
      raw_payload: agent,
      last_synced_at: now,
    })
  }

  const { data: upserted, error } = await serviceClient
    .from('umag_suppliers')
    .upsert(rows, { onConflict: 'umag_supplier_id' })
    .select('id, umag_supplier_id')

  if (error) {
    console.error('umag_suppliers_upsert_failed', { message: error.message })
    return umagErrorResponse(
      'SUPABASE_UPSERT_FAILED',
      'Не удалось сохранить поставщиков UMAG.',
      500
    )
  }

  let created = 0
  let updated = 0
  for (const row of upserted || []) {
    const umagId = Number(row.umag_supplier_id)
    map.set(umagId, row.id)
    if (existingByUmag.has(umagId)) updated += 1
    else created += 1
  }

  // Ensure map includes previously-known ids even if upsert select is partial
  for (const [umagId, id] of existingByUmag) {
    if (!map.has(umagId)) map.set(umagId, id)
  }

  return { created, updated, map }
}

async function loadSupplierMap(
  // deno-lint-ignore no-explicit-any
  serviceClient: any
): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  const { data, error } = await serviceClient
    .from('umag_suppliers')
    .select('id, umag_supplier_id')
  if (error) {
    console.error('umag_suppliers_map_failed', { message: error.message })
    return map
  }
  for (const row of data || []) {
    map.set(Number(row.umag_supplier_id), row.id)
  }
  return map
}

type CanonicalReconcileStats = {
  sourceReceived: number
  created: number
  updated: number
  linkedByExternalId: number
  linkedByBin: number
  potentialDuplicates: number
  mappingErrors: number
  platformMap: Map<number, string>
}

function normalizeBin(value: unknown): string | null {
  const bin = String(value ?? '').trim()
  return bin ? bin : null
}

/**
 * Keep platform_suppliers as canonical.
 * Link by umag_supplier_id or unique BIN only — never by fuzzy/name merge.
 * UMAG-owned fields update; Shugyla operational fields are never written here.
 */
async function reconcileCanonicalSuppliers(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  activeUmagIds: Set<number>
): Promise<CanonicalReconcileStats | Response> {
  const emptyStats: CanonicalReconcileStats = {
    sourceReceived: 0,
    created: 0,
    updated: 0,
    linkedByExternalId: 0,
    linkedByBin: 0,
    potentialDuplicates: 0,
    mappingErrors: 0,
    platformMap: new Map(),
  }

  const { data: umagRows, error: umagError } = await serviceClient
    .from('umag_suppliers')
    .select(
      'umag_supplier_id, name, legal_name, bin, phone, actual_address, legal_address, is_deleted, last_synced_at'
    )
  if (umagError) {
    console.error('canonical_umag_select_failed', { message: umagError.message })
    return umagErrorResponse(
      'SUPABASE_UPSERT_FAILED',
      'Не удалось прочитать зеркало поставщиков UMAG для сверки.',
      500
    )
  }

  const { data: platformRows, error: platformError } = await serviceClient
    .from('platform_suppliers')
    .select('id, name, umag_supplier_id, bin, is_merged')
  if (platformError) {
    console.error('canonical_platform_select_failed', { message: platformError.message })
    return umagErrorResponse(
      'SUPABASE_UPSERT_FAILED',
      'Не удалось прочитать канонических поставщиков для сверки.',
      500
    )
  }

  const byUmagId = new Map<number, { id: string; name: string; bin: string | null }>()
  const unlinkedByBin = new Map<string, string[]>()
  const nameCountsPlatform = new Map<string, number>()
  const platformByName = new Map<string, string[]>()

  for (const row of platformRows || []) {
    // Soft-merged bootstrap duplicates must never receive sync updates or recreate links.
    if (row.is_merged === true) continue

    const nameKey = String(row.name || '')
      .trim()
      .toLowerCase()
    if (nameKey) {
      nameCountsPlatform.set(nameKey, (nameCountsPlatform.get(nameKey) || 0) + 1)
      const list = platformByName.get(nameKey) || []
      list.push(row.id)
      platformByName.set(nameKey, list)
    }
    if (row.umag_supplier_id != null) {
      byUmagId.set(Number(row.umag_supplier_id), {
        id: row.id,
        name: row.name,
        bin: normalizeBin(row.bin),
      })
    } else {
      const bin = normalizeBin(row.bin)
      if (bin) {
        const list = unlinkedByBin.get(bin) || []
        list.push(row.id)
        unlinkedByBin.set(bin, list)
      }
    }
  }

  const umagBinCounts = new Map<string, number>()
  const nameCountsUmag = new Map<string, number>()
  for (const row of umagRows || []) {
    const bin = normalizeBin(row.bin)
    if (bin) umagBinCounts.set(bin, (umagBinCounts.get(bin) || 0) + 1)
    const nameKey = String(row.name || '')
      .trim()
      .toLowerCase()
    if (nameKey) nameCountsUmag.set(nameKey, (nameCountsUmag.get(nameKey) || 0) + 1)
  }

  const stats = { ...emptyStats, sourceReceived: (umagRows || []).length, platformMap: new Map<number, string>() }
  const now = new Date().toISOString()
  const candidateRows: Array<{
    umag_supplier_id: number
    platform_supplier_id: string
    match_reason: string
    status: string
  }> = []

  // Decision pass — pure, no I/O per row. Every row's UPDATE-vs-INSERT choice
  // depends only on the byUmagId/unlinkedByBin/umagBinCounts maps built above
  // from data already fetched, never on another row's outcome: a given BIN
  // can only ever match one UMAG row per run (umagBinCounts.get(bin) === 1
  // is required to even consider the BIN-match branch), so there is no
  // cross-row ordering to preserve by writing one row at a time. This used
  // to be one awaited UPDATE or INSERT per supplier — hundreds of sequential
  // round trips on every sync click, for a catalog that rarely changes
  // (docs/performance/... N+1 in reconcileCanonicalSuppliers). Now it's one
  // batched write per 100 rows.
  const CANONICAL_CHUNK_SIZE = 100
  type UpdateDecision = {
    umagId: number
    platformId: string
    umagOwned: Record<string, unknown>
    linkMethod: 'external' | 'bin'
  }
  type InsertDecision = {
    umagId: number
    insertRow: Record<string, unknown>
    nameKey: string
  }
  const updateDecisions: UpdateDecision[] = []
  const insertDecisions: InsertDecision[] = []

  for (const umag of umagRows || []) {
    const umagId = Number(umag.umag_supplier_id)
    if (!Number.isFinite(umagId)) {
      stats.mappingErrors += 1
      continue
    }

    const umagOwned = {
      name: String(umag.name || '').trim() || `Поставщик ${umagId}`,
      legal_name: umag.legal_name ? String(umag.legal_name) : null,
      bin: normalizeBin(umag.bin),
      umag_phone: umag.phone ? String(umag.phone) : null,
      actual_address: umag.actual_address ? String(umag.actual_address) : null,
      legal_address: umag.legal_address ? String(umag.legal_address) : null,
      is_umag_active: activeUmagIds.has(umagId) && !Boolean(umag.is_deleted),
      umag_last_synced_at: umag.last_synced_at || now,
      umag_supplier_id: umagId,
    }

    let platformId = byUmagId.get(umagId)?.id || null
    let linkMethod: 'external' | 'bin' | null = platformId ? 'external' : null

    if (!platformId && umagOwned.bin && umagBinCounts.get(umagOwned.bin) === 1) {
      const candidates = unlinkedByBin.get(umagOwned.bin) || []
      if (candidates.length === 1) {
        platformId = candidates[0]
        linkMethod = 'bin'
      }
    }

    if (platformId) {
      updateDecisions.push({ umagId, platformId, umagOwned, linkMethod: linkMethod as 'external' | 'bin' })
      if (linkMethod === 'bin') {
        byUmagId.set(umagId, { id: platformId, name: umagOwned.name, bin: umagOwned.bin })
        // prevent reuse of this BIN for another create
        unlinkedByBin.delete(umagOwned.bin || '')
      }
      stats.platformMap.set(umagId, platformId)
    } else {
      const insertRow = {
        ...umagOwned,
        manager_name: '',
        manager_phone: '',
        order_days: '',
        delivery_days: '',
        product_categories: [],
        payment_type: 'cash',
        return_policy: 'no',
        status: umagOwned.is_umag_active ? 'active' : 'inactive',
        comment: null,
      }
      insertDecisions.push({
        umagId,
        insertRow,
        nameKey: umagOwned.name.trim().toLowerCase(),
      })
    }
  }

  // Batched UPDATE — upsert-on-id, since each row needs different values
  // (a plain .update() applies one payload to every matched row).
  for (let i = 0; i < updateDecisions.length; i += CANONICAL_CHUNK_SIZE) {
    const chunk = updateDecisions.slice(i, i + CANONICAL_CHUNK_SIZE)
    const { error } = await serviceClient
      .from('platform_suppliers')
      .upsert(
        chunk.map((d) => ({ id: d.platformId, ...d.umagOwned })),
        { onConflict: 'id' }
      )
    if (error) {
      console.error('canonical_update_batch_failed', { message: error.message, count: chunk.length })
      stats.mappingErrors += chunk.length
      continue
    }
    for (const d of chunk) {
      stats.updated += 1
      if (d.linkMethod === 'external') stats.linkedByExternalId += 1
      else stats.linkedByBin += 1
    }
  }

  // Batched INSERT. Every insert row carries umag_supplier_id, so returned
  // rows map back to their originating decision without depending on
  // Postgres preserving insert order.
  for (let i = 0; i < insertDecisions.length; i += CANONICAL_CHUNK_SIZE) {
    const chunk = insertDecisions.slice(i, i + CANONICAL_CHUNK_SIZE)
    const { data: created, error } = await serviceClient
      .from('platform_suppliers')
      .insert(chunk.map((d) => d.insertRow))
      .select('id, umag_supplier_id')
    if (error) {
      console.error('canonical_create_batch_failed', { message: error.message, count: chunk.length })
      stats.mappingErrors += chunk.length
      continue
    }
    const createdIdByUmagId = new Map<number, string>()
    for (const row of created || []) {
      createdIdByUmagId.set(Number(row.umag_supplier_id), row.id)
    }
    for (const d of chunk) {
      const createdId = createdIdByUmagId.get(d.umagId)
      if (!createdId) {
        stats.mappingErrors += 1
        continue
      }
      stats.created += 1
      stats.platformMap.set(d.umagId, createdId)
      byUmagId.set(d.umagId, {
        id: createdId,
        name: String(d.insertRow.name),
        bin: d.insertRow.bin as string | null,
      })

      if (
        d.nameKey &&
        nameCountsPlatform.get(d.nameKey) === 1 &&
        nameCountsUmag.get(d.nameKey) === 1
      ) {
        const existingIds = platformByName.get(d.nameKey) || []
        for (const existingId of existingIds) {
          if (existingId === createdId) continue
          candidateRows.push({
            umag_supplier_id: d.umagId,
            platform_supplier_id: existingId,
            match_reason: 'exact_name',
            status: 'open',
          })
        }
      }
    }
  }

  // Soft-deactivate canonical rows linked to UMAG agents missing from this active sync set
  const linkedPlatformIds: string[] = []
  for (const [umagId, meta] of byUmagId) {
    if (!activeUmagIds.has(umagId)) linkedPlatformIds.push(meta.id)
  }
  if (linkedPlatformIds.length > 0) {
    const chunkSize = 100
    for (let i = 0; i < linkedPlatformIds.length; i += chunkSize) {
      const chunk = linkedPlatformIds.slice(i, i + chunkSize)
      const { error } = await serviceClient
        .from('platform_suppliers')
        .update({ is_umag_active: false, umag_last_synced_at: now })
        .in('id', chunk)
      if (error) {
        console.error('canonical_deactivate_failed', { message: error.message })
        stats.mappingErrors += 1
      }
    }
  }

  if (candidateRows.length > 0) {
    const { error } = await serviceClient
      .from('supplier_umag_match_candidates')
      .upsert(candidateRows, {
        onConflict: 'umag_supplier_id,platform_supplier_id,match_reason',
        ignoreDuplicates: true,
      })
    if (error) {
      console.error('canonical_candidates_failed', { message: error.message })
      stats.mappingErrors += 1
    } else {
      stats.potentialDuplicates = candidateRows.length
    }
  }

  // Ensure map includes every already-linked platform supplier
  for (const [umagId, meta] of byUmagId) {
    if (!stats.platformMap.has(umagId)) stats.platformMap.set(umagId, meta.id)
  }

  console.info('umag_sync_canonical_reconcile', {
    sourceReceived: stats.sourceReceived,
    created: stats.created,
    updated: stats.updated,
    linkedByExternalId: stats.linkedByExternalId,
    linkedByBin: stats.linkedByBin,
    potentialDuplicates: stats.potentialDuplicates,
    mappingErrors: stats.mappingErrors,
  })

  if (stats.mappingErrors > 0) {
    return umagErrorResponse(
      'CANONICAL_SUPPLIER_RECONCILE_FAILED',
      'Сверка канонических поставщиков завершилась с ошибками. Sync не помечен как успешный.',
      500,
      { mappingErrors: stats.mappingErrors, stats }
    )
  }

  return stats
}

async function loadPlatformSupplierMap(
  // deno-lint-ignore no-explicit-any
  serviceClient: any
): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  const { data, error } = await serviceClient
    .from('platform_suppliers')
    .select('id, umag_supplier_id')
    .not('umag_supplier_id', 'is', null)
    .eq('is_merged', false)
  if (error) {
    console.error('platform_supplier_map_failed', { message: error.message })
    return map
  }
  for (const row of data || []) {
    map.set(Number(row.umag_supplier_id), row.id)
  }
  return map
}

async function upsertSupplies(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  supplies: UmagSupply[],
  supplierMap: Map<number, string>,
  platformMap: Map<number, string>
): Promise<{ created: number; updated: number; reactivated: number } | Response> {
  if (supplies.length === 0) return { created: 0, updated: 0, reactivated: 0 }

  const umagIds = supplies
    .map((s) => asBigIntId(s.id))
    .filter((id): id is number => id != null)

  const { data: existingRows, error: existingError } = await serviceClient
    .from('umag_supplies')
    .select('id, umag_supply_id, is_source_deleted')
    .in('umag_supply_id', umagIds)

  if (existingError) {
    console.error('umag_supplies_select_failed', { message: existingError.message })
    return umagErrorResponse(
      'SUPABASE_UPSERT_FAILED',
      'Не удалось прочитать существующие приёмки UMAG.',
      500
    )
  }

  const existing = new Map<number, boolean>()
  for (const row of existingRows || []) {
    existing.set(Number(row.umag_supply_id), Boolean(row.is_source_deleted))
  }
  const now = new Date().toISOString()
  const rows = []

  for (const supply of supplies) {
    const umagSupplyId = asBigIntId(supply.id)
    if (umagSupplyId == null) continue
    const umagSupplierId = asBigIntId(supply.supplierId)
    const docTime = parseUmagEditTime(supply.docTime)
    if (!docTime) continue

    rows.push({
      umag_supply_id: umagSupplyId,
      supplier_id: umagSupplierId != null ? supplierMap.get(umagSupplierId) ?? null : null,
      platform_supplier_id:
        umagSupplierId != null ? platformMap.get(umagSupplierId) ?? null : null,
      umag_supplier_id: umagSupplierId,
      supplier_name: String(supply.supplierName || '').trim() || 'Без названия',
      supplier_legal_name: supply.supplierLegalName ? String(supply.supplierLegalName) : null,
      doc_time: docTime,
      umag_edit_time: parseUmagEditTime(supply.editTime),
      type: supply.type == null ? null : asNumber(supply.type, 0),
      payment_type: supply.paymentType == null ? null : asNumber(supply.paymentType, 0),
      amount: asNumber(supply.amount),
      payment_amount: asNumber(supply.paymentAmount),
      payment_refund_amount: asNumber(supply.paymentRefundAmount),
      debt: asNumber(supply.debt),
      arrival_cost: supply.arrivalCost == null ? null : asNumber(supply.arrivalCost),
      selling_cost: supply.sellingCost == null ? null : asNumber(supply.sellingCost),
      account: supply.account != null ? String(supply.account) : null,
      comment: supply.comment != null ? String(supply.comment) : null,
      umag_user_id: asBigIntId(supply.userId),
      umag_user_name: supply.userFirstName != null ? String(supply.userFirstName) : null,
      raw_payload: supply,
      last_synced_at: now,
      last_seen_at: now,
      is_source_deleted: false,
      source_deleted_at: null,
    })
  }

  // Upsert in chunks to avoid payload limits
  const chunkSize = 200
  let created = 0
  let updated = 0
  let reactivated = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await serviceClient
      .from('umag_supplies')
      .upsert(chunk, { onConflict: 'umag_supply_id' })
    if (error) {
      console.error('umag_supplies_upsert_failed', { message: error.message, offset: i })
      return umagErrorResponse(
        'SUPABASE_UPSERT_FAILED',
        'Не удалось сохранить приёмки UMAG.',
        500
      )
    }
    for (const row of chunk) {
      const umagId = Number(row.umag_supply_id)
      if (existing.has(umagId)) {
        updated += 1
        if (existing.get(umagId) === true) reactivated += 1
      } else {
        created += 1
      }
    }
  }

  return { created, updated, reactivated }
}

/**
 * Soft-delete active DB supplies in the synced period that are absent from a
 * complete UMAG snapshot. Never hard-delete. Caller must only invoke after
 * full pagination + aggregate validation succeeded.
 *
 * docTime moves across periods: a supply missing from period A is marked
 * source-deleted for A; a later sync of period B re-upserts and reactivates it.
 */
async function reconcileMissingSupplies(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  dateFrom: string,
  dateTo: string,
  receivedUmagIds: Set<number>
): Promise<{ sourceDeleted: number } | Response> {
  const fromIso = `${dateFrom}T00:00:00+05:00`
  const toIso = `${dateTo}T23:59:59.999+05:00`

  const { data: activeRows, error } = await serviceClient
    .from('umag_supplies')
    .select('id, umag_supply_id')
    .eq('is_source_deleted', false)
    .gte('doc_time', fromIso)
    .lte('doc_time', toIso)

  if (error) {
    console.error('umag_supplies_reconcile_select_failed', { message: error.message })
    return umagErrorResponse(
      'SUPABASE_RECONCILE_FAILED',
      'Не удалось выполнить сверку удалённых приёмок UMAG.',
      500
    )
  }

  const missingIds = (activeRows || [])
    .filter((row: { umag_supply_id: number }) => !receivedUmagIds.has(Number(row.umag_supply_id)))
    .map((row: { id: string }) => row.id)

  if (missingIds.length === 0) {
    return { sourceDeleted: 0 }
  }

  const now = new Date().toISOString()
  const chunkSize = 200
  let sourceDeleted = 0
  for (let i = 0; i < missingIds.length; i += chunkSize) {
    const chunk = missingIds.slice(i, i + chunkSize)
    const { error: updateError, count } = await serviceClient
      .from('umag_supplies')
      .update(
        {
          is_source_deleted: true,
          source_deleted_at: now,
        },
        { count: 'exact' }
      )
      .in('id', chunk)
      .eq('is_source_deleted', false)

    if (updateError) {
      console.error('umag_supplies_reconcile_update_failed', {
        message: updateError.message,
        offset: i,
      })
      return umagErrorResponse(
        'SUPABASE_RECONCILE_FAILED',
        'Не удалось пометить отсутствующие приёмки UMAG.',
        500
      )
    }
    sourceDeleted += typeof count === 'number' ? count : chunk.length
  }

  console.info('umag_sync_reconcile_source_deleted', {
    dateFrom,
    dateTo,
    received: receivedUmagIds.size,
    sourceDeleted,
  })

  return { sourceDeleted }
}

function normalizeAccountNames(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed
    } catch {
      return [trimmed]
    }
    return [trimmed]
  }
  if (value == null) return []
  return [value]
}

function unwrapSupplyReturn(item: UmagSupplyReturnItem): {
  doc: UmagSupplyReturnDoc
  additional: UmagSupplyReturnAdditional
  raw: UmagSupplyReturnItem
} {
  const doc = (item.supplyReturn && typeof item.supplyReturn === 'object'
    ? item.supplyReturn
    : item) as UmagSupplyReturnDoc
  const additional = (item.additionalData && typeof item.additionalData === 'object'
    ? item.additionalData
    : item) as UmagSupplyReturnAdditional
  return { doc, additional, raw: item }
}

async function fetchAllSupplyReturns(
  session: UmagSession,
  fromTime: number,
  toTime: number
): Promise<
  | {
      ok: true
      returns: UmagSupplyReturnItem[]
      pages: number
      paginationComplete: boolean
      source: {
        totalCount: number | null
        amount: number | null
      }
    }
  | { ok: false; response: Response }
> {
  const returns: UmagSupplyReturnItem[] = []
  let first = 0
  let pages = 0
  let paginationComplete = false
  let source = {
    totalCount: null as number | null,
    amount: null as number | null,
  }

  while (true) {
    pages += 1
    const result = await umagFetchAuthed('/rest/cabinet/opr/supply-returns/list', {
      first,
      pageSize: UMAG_PAGE_SIZE,
      fromTime,
      toTime,
      storeId: session.storeId,
    })

    if ('error' in result) {
      return { ok: false, response: mapUmagAuthError(result.error) }
    }

    if (result.status !== 200) {
      return { ok: false, response: mapUmagHttpError(result.status) }
    }

    // HAR: endpoint returns a root JSON array of { supplyReturn, additionalData }.
    // Some environments may wrap it as an object with list/totalCount.
    const payload = result.json
    if (payload == null || typeof payload !== 'object') {
      return {
        ok: false,
        response: umagErrorResponse(
          'UMAG_INVALID_JSON',
          'UMAG вернул некорректный ответ при загрузке возвратов поставщикам.',
          502
        ),
      }
    }

    let batch: UmagSupplyReturnItem[] = []
    if (Array.isArray(payload)) {
      batch = payload as UmagSupplyReturnItem[]
    } else {
      const page = payload as SupplyReturnsPage
      if (pages === 1) {
        source = {
          totalCount: page.totalCount == null ? null : asNumber(page.totalCount, 0),
          amount: page.amount == null ? null : asNumber(page.amount),
        }
      }
      batch = Array.isArray(page.list)
        ? page.list
        : Array.isArray(page.supplyReturns)
          ? page.supplyReturns
          : []
    }

    returns.push(...batch)

    console.info('umag_sync_returns_page', {
      first,
      pageSize: UMAG_PAGE_SIZE,
      batch: batch.length,
      totalSoFar: returns.length,
      totalCount: source.totalCount,
      rootArray: Array.isArray(payload),
      elapsedMs: result.elapsedMs,
      retriedAfterSignIn: result.retriedAfterSignIn,
      storeId: maskStoreId(session.storeId),
    })

    const totalCount = source.totalCount
    if (batch.length === 0) {
      paginationComplete = true
      break
    }
    if (totalCount != null && returns.length >= totalCount) {
      paginationComplete = true
      break
    }
    if (batch.length < UMAG_PAGE_SIZE) {
      paginationComplete = true
      break
    }
    first += UMAG_PAGE_SIZE
    if (pages > 500) {
      return {
        ok: false,
        response: umagErrorResponse(
          'UMAG_PAGINATION_FAILED',
          'Превышен лимит страниц при загрузке возвратов UMAG.',
          502
        ),
      }
    }
  }

  return { ok: true, returns, pages, paginationComplete, source }
}

async function upsertSupplyReturns(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  items: UmagSupplyReturnItem[],
  platformMap: Map<number, string>
): Promise<{ created: number; updated: number; reactivated: number } | Response> {
  if (items.length === 0) return { created: 0, updated: 0, reactivated: 0 }

  const umagIds: number[] = []
  for (const item of items) {
    const { doc } = unwrapSupplyReturn(item)
    const id = asBigIntId(doc.id)
    if (id != null) umagIds.push(id)
  }

  const { data: existingRows, error: existingError } = await serviceClient
    .from('umag_supply_returns')
    .select('id, umag_return_id, is_source_deleted')
    .in('umag_return_id', umagIds)

  if (existingError) {
    console.error('umag_supply_returns_select_failed', { message: existingError.message })
    return umagErrorResponse(
      'SUPABASE_UPSERT_FAILED',
      'Не удалось прочитать существующие возвраты UMAG.',
      500
    )
  }

  const existing = new Map<number, boolean>()
  for (const row of existingRows || []) {
    existing.set(Number(row.umag_return_id), Boolean(row.is_source_deleted))
  }

  const now = new Date().toISOString()
  const rows = []

  for (const item of items) {
    const { doc, additional, raw } = unwrapSupplyReturn(item)
    const umagReturnId = asBigIntId(doc.id)
    if (umagReturnId == null) continue
    const umagSupplierId = asBigIntId(doc.agentId)
    const documentTime = parseUmagEditTime(doc.documentTime ?? doc.operationTime ?? doc.createTime)
    if (!documentTime) continue

    const supplierName =
      additional.supplierName != null
        ? String(additional.supplierName).trim()
        : doc && 'supplierName' in doc && (doc as { supplierName?: unknown }).supplierName != null
          ? String((doc as { supplierName?: unknown }).supplierName).trim()
          : null

    rows.push({
      umag_return_id: umagReturnId,
      platform_supplier_id:
        umagSupplierId != null ? platformMap.get(umagSupplierId) ?? null : null,
      umag_supplier_id: umagSupplierId,
      store_id: asBigIntId(doc.storeId),
      umag_user_id: asBigIntId(doc.userId),
      supplier_name: supplierName || null,
      user_name:
        additional.userName != null
          ? String(additional.userName)
          : null,
      amount: Math.abs(asNumber(doc.amount)),
      payed_amount:
        additional.payedAmount == null ? null : Math.abs(asNumber(additional.payedAmount)),
      document_time: documentTime,
      operation_time: parseUmagEditTime(doc.operationTime),
      create_time: parseUmagEditTime(doc.createTime),
      umag_update_time: parseUmagEditTime(doc.updateTime),
      operation_type: doc.operationType != null ? String(doc.operationType) : null,
      note: doc.note != null ? String(doc.note) : null,
      is_provided: typeof doc.isProvided === 'boolean' ? doc.isProvided : null,
      account_names: normalizeAccountNames(additional.accountNames),
      raw_payload: raw,
      last_synced_at: now,
      last_seen_at: now,
      is_source_deleted: false,
      source_deleted_at: null,
    })
  }

  const chunkSize = 200
  let created = 0
  let updated = 0
  let reactivated = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await serviceClient
      .from('umag_supply_returns')
      .upsert(chunk, { onConflict: 'umag_return_id' })
    if (error) {
      console.error('umag_supply_returns_upsert_failed', { message: error.message, offset: i })
      return umagErrorResponse(
        'SUPABASE_UPSERT_FAILED',
        'Не удалось сохранить возвраты UMAG.',
        500
      )
    }
    for (const row of chunk) {
      const umagId = Number(row.umag_return_id)
      if (existing.has(umagId)) {
        updated += 1
        if (existing.get(umagId) === true) reactivated += 1
      } else {
        created += 1
      }
    }
  }

  return { created, updated, reactivated }
}

async function reconcileMissingSupplyReturns(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  dateFrom: string,
  dateTo: string,
  receivedUmagIds: Set<number>
): Promise<{ sourceDeleted: number } | Response> {
  const fromIso = `${dateFrom}T00:00:00+05:00`
  const toIso = `${dateTo}T23:59:59.999+05:00`

  const { data: activeRows, error } = await serviceClient
    .from('umag_supply_returns')
    .select('id, umag_return_id')
    .eq('is_source_deleted', false)
    .gte('document_time', fromIso)
    .lte('document_time', toIso)

  if (error) {
    console.error('umag_supply_returns_reconcile_select_failed', { message: error.message })
    return umagErrorResponse(
      'SUPABASE_RECONCILE_FAILED',
      'Не удалось выполнить сверку удалённых возвратов UMAG.',
      500
    )
  }

  const missingIds = (activeRows || [])
    .filter((row: { umag_return_id: number }) => !receivedUmagIds.has(Number(row.umag_return_id)))
    .map((row: { id: string }) => row.id)

  if (missingIds.length === 0) {
    return { sourceDeleted: 0 }
  }

  const now = new Date().toISOString()
  const chunkSize = 200
  let sourceDeleted = 0
  for (let i = 0; i < missingIds.length; i += chunkSize) {
    const chunk = missingIds.slice(i, i + chunkSize)
    const { error: updateError, count } = await serviceClient
      .from('umag_supply_returns')
      .update(
        {
          is_source_deleted: true,
          source_deleted_at: now,
        },
        { count: 'exact' }
      )
      .in('id', chunk)
      .eq('is_source_deleted', false)

    if (updateError) {
      console.error('umag_supply_returns_reconcile_update_failed', {
        message: updateError.message,
        offset: i,
      })
      return umagErrorResponse(
        'SUPABASE_RECONCILE_FAILED',
        'Не удалось пометить отсутствующие возвраты UMAG.',
        500
      )
    }
    sourceDeleted += typeof count === 'number' ? count : chunk.length
  }

  console.info('umag_sync_returns_reconcile_source_deleted', {
    dateFrom,
    dateTo,
    received: receivedUmagIds.size,
    sourceDeleted,
  })

  return { sourceDeleted }
}

function aqtobeDateKeyFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Aqtobe',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  if (!y || !m || !day) return null
  return `${y}-${m}-${day}`
}

function addCalendarDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d) + days * 86_400_000
  const dt = new Date(utc)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Calendar-month subtraction (not days×30) — mirrors addCalendarDays' Date.UTC normalization. */
function subtractCalendarMonths(dateKey: string, months: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 - months, d))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** First day of the calendar month containing dateKey. */
function startOfMonthKey(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number)
  return `${y}-${String(m).padStart(2, '0')}-01`
}

function resolveTermsSnapshot(supplier: {
  payment_type?: string | null
  deferral_days?: number | null
} | null): {
  type: string | null
  days: number | null
  configured: boolean
  legacy: boolean
} {
  const raw = supplier?.payment_type == null ? '' : String(supplier.payment_type).trim()
  const type = raw || null
  if (type === 'cash' || type === 'transfer') {
    return { type, days: 0, configured: true, legacy: false }
  }
  if (type === 'deferral' || type === 'mixed') {
    const days = supplier?.deferral_days == null ? null : Number(supplier.deferral_days)
    if (days != null && Number.isInteger(days) && days >= 0 && days <= 365) {
      return { type, days, configured: true, legacy: false }
    }
    return { type, days: null, configured: false, legacy: false }
  }
  if (type) {
    // Legacy / unknown payment type — keep obligation, mark terms missing.
    return { type: null, days: null, configured: false, legacy: true }
  }
  return { type: null, days: null, configured: false, legacy: false }
}

type SupplierTermsRow = {
  id: string
  payment_type: string | null
  deferral_days: number | null
  is_merged: boolean | null
  merged_into_supplier_id: string | null
}

type ObligationsRefreshResult = {
  status: 'success' | 'partial' | 'failed'
  supplies_with_open_debt: number
  obligations_created: number
  obligations_updated: number
  obligations_paid: number
  obligations_terms_missing: number
  obligations_failed: number
  obligations_source_deleted: number
  obligations_reactivated: number
  failed_supply_ids: number[]
  error_code: string | null
  error_message: string | null
}

function emptyObligationsResult(
  patch: Partial<ObligationsRefreshResult> = {}
): ObligationsRefreshResult {
  return {
    status: 'success',
    supplies_with_open_debt: 0,
    obligations_created: 0,
    obligations_updated: 0,
    obligations_paid: 0,
    obligations_terms_missing: 0,
    obligations_failed: 0,
    obligations_source_deleted: 0,
    obligations_reactivated: 0,
    failed_supply_ids: [],
    error_code: null,
    error_message: null,
    ...patch,
  }
}

function resolveCanonicalSupplierId(
  startId: string | null,
  byId: Map<string, SupplierTermsRow>
): string | null {
  if (!startId) return null
  let current = startId
  const seen = new Set<string>()
  while (current) {
    if (seen.has(current)) return current
    seen.add(current)
    const row = byId.get(current)
    if (!row) return current
    if (row.is_merged && row.merged_into_supplier_id) {
      current = row.merged_into_supplier_id
      continue
    }
    return current
  }
  return null
}

async function fetchRowsByIdsInChunks(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  table: string,
  select: string,
  idColumn: string,
  ids: Array<string | number>,
  chunkSize = 100
  // deno-lint-ignore no-explicit-any
): Promise<{ rows: any[]; error: { message: string; code?: string } | null }> {
  const rows: unknown[] = []
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const { data, error } = await serviceClient.from(table).select(select).in(idColumn, chunk)
    if (error) return { rows: [], error }
    for (const row of data || []) rows.push(row)
  }
  return { rows, error: null }
}

async function fetchPaginatedSupplies(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  buildQuery: (q: any) => any
  // deno-lint-ignore no-explicit-any
): Promise<{ rows: any[]; error: { message: string; code?: string } | null }> {
  const pageSize = 1000
  const rows: unknown[] = []
  let from = 0
  for (;;) {
    const { data, error } = await buildQuery(
      serviceClient
        .from('umag_supplies')
        .select(
          'id, umag_supply_id, platform_supplier_id, doc_time, amount, payment_amount, debt, is_source_deleted'
        )
    ).range(from, from + pageSize - 1)
    if (error) return { rows: [], error }
    const page = data || []
    rows.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }
  return { rows, error: null }
}

type SyncScope = {
  requestedFrom: string
  requestedTo: string
  recentStart: string
  autoFloor: string
  oldestOpenDebtDate: string | null
  effectiveFrom: string
  effectiveTo: string
  openDebtCoverageComplete: boolean
  uncoveredOpenObligationsCount: number
  uncoveredOpenDebtAmount: number
  unresolvedDateObligationsCount: number
}

type OpenObligationDatePoint = {
  debt: number
  dateKey: string | null
}

/**
 * Paginated read of every currently open obligation's debt + best-effort date.
 * "Open" mirrors the canonical debt predicate from Этап 2.1: is_source_deleted
 * = false AND current_debt > 0 — closed/soft-deleted rows never widen the range.
 */
async function fetchOpenObligationDatePoints(
  // deno-lint-ignore no-explicit-any
  serviceClient: any
): Promise<{
  points: OpenObligationDatePoint[]
  error: { message: string; code?: string } | null
}> {
  const pageSize = 1000
  const rows: Array<{
    current_debt: number
    supply_document_date: string | null
    umag_supply_row_id: string | null
  }> = []
  let from = 0
  for (;;) {
    const { data, error } = await serviceClient
      .from('supplier_payment_obligations')
      .select('current_debt, supply_document_date, umag_supply_row_id')
      .eq('is_source_deleted', false)
      .gt('current_debt', 0)
      .range(from, from + pageSize - 1)
    if (error) return { points: [], error }
    const page = data || []
    rows.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }

  // supply_document_date should always be set (backfilled from doc_time at
  // obligation-refresh time), but fail-safe: recover it from the linked
  // umag_supplies row when missing — doc_time there is NOT NULL by schema,
  // and umag_supply_row_id is FK `on delete set null`, so if it's still
  // present the referenced row still exists.
  const needsLookup = rows.filter((r) => !r.supply_document_date && r.umag_supply_row_id)
  const lookupIds = [...new Set(needsLookup.map((r) => r.umag_supply_row_id as string))]
  const docTimeById = new Map<string, string>()
  if (lookupIds.length > 0) {
    const fetched = await fetchRowsByIdsInChunks(
      serviceClient,
      'umag_supplies',
      'id, doc_time',
      'id',
      lookupIds
    )
    if (fetched.error) return { points: [], error: fetched.error }
    for (const row of fetched.rows as Array<{ id: string; doc_time: string | null }>) {
      if (row.doc_time) docTimeById.set(row.id, row.doc_time)
    }
  }

  const points: OpenObligationDatePoint[] = rows.map((row) => {
    let dateKey = row.supply_document_date
    if (!dateKey && row.umag_supply_row_id) {
      const docTime = docTimeById.get(row.umag_supply_row_id)
      if (docTime) dateKey = aqtobeDateKeyFromIso(docTime)
    }
    return { debt: asNumber(row.current_debt), dateKey: dateKey ?? null }
  })

  return { points, error: null }
}

/**
 * Split the VIEW range a caller asked for from the range a normal sync
 * actually needs to hit UMAG for, so open supplier debt stays fresh no
 * matter how old the underlying приёмка is — Этап 2.2.
 *
 *   automaticOpenDebtFrom = max(oldestOpenDebtDate, autoFloor)   — capped widening
 *   effectiveFrom = min(recentStart, automaticOpenDebtFrom, requestedFrom)
 *   effectiveTo   = today (Aqtobe)                                — always refresh "now"
 *
 * requestedFrom itself is never capped by MAX_AUTO_SYNC_LOOKBACK_MONTHS — an
 * explicit historical VIEW-period request (backfill) stays honored even past it.
 * "Uncovered" folds in both cap-truncated old debt AND debt whose date could
 * not be resolved at all — neither can be called guaranteed-fresh.
 */
async function computeEffectiveSyncScope(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  requestedFrom: string,
  requestedTo: string
): Promise<SyncScope | Response> {
  const todayKey = aqtobeDateKeyFromIso(new Date().toISOString())
  if (!todayKey) {
    return umagErrorResponse('INTERNAL_ERROR', 'Не удалось определить текущую дату.', 500)
  }
  const recentStart = startOfMonthKey(todayKey)
  const autoFloor = subtractCalendarMonths(todayKey, MAX_AUTO_SYNC_LOOKBACK_MONTHS)

  const { points, error } = await fetchOpenObligationDatePoints(serviceClient)
  if (error) {
    console.error('sync_scope_open_obligations_failed', {
      message: error.message,
      code: error.code,
    })
    return umagErrorResponse(
      'SUPABASE_UPSERT_FAILED',
      `Не удалось прочитать открытые обязательства для расчёта диапазона синхронизации: ${error.message}`,
      500
    )
  }

  let oldestOpenDebtDate: string | null = null
  let unresolvedDateObligationsCount = 0
  for (const point of points) {
    if (point.dateKey == null) {
      unresolvedDateObligationsCount += 1
      continue
    }
    if (oldestOpenDebtDate == null || point.dateKey < oldestOpenDebtDate) {
      oldestOpenDebtDate = point.dateKey
    }
  }

  const automaticOpenDebtFrom =
    oldestOpenDebtDate == null
      ? recentStart
      : oldestOpenDebtDate < autoFloor
        ? autoFloor
        : oldestOpenDebtDate

  const effectiveFrom = [recentStart, automaticOpenDebtFrom, requestedFrom].reduce((min, key) =>
    key < min ? key : min
  )
  const effectiveTo = todayKey

  let uncoveredOpenObligationsCount = 0
  let uncoveredOpenDebtAmount = 0
  for (const point of points) {
    if (point.dateKey == null || point.dateKey < effectiveFrom) {
      uncoveredOpenObligationsCount += 1
      uncoveredOpenDebtAmount += point.debt
    }
  }

  const openDebtCoverageComplete =
    unresolvedDateObligationsCount === 0 && uncoveredOpenObligationsCount === 0

  return {
    requestedFrom,
    requestedTo,
    recentStart,
    autoFloor,
    oldestOpenDebtDate,
    effectiveFrom,
    effectiveTo,
    openDebtCoverageComplete,
    uncoveredOpenObligationsCount,
    uncoveredOpenDebtAmount,
    unresolvedDateObligationsCount,
  }
}

/**
 * Refresh payment obligations from already-imported umag_supplies.
 * Does not call UMAG. Snapshot terms are immutable after first fill.
 *
 * Critical: every upsert row must include the same object keys. PostgREST
 * rejects heterogeneous bulk payloads (e.g. first_seen_at only on inserts),
 * which previously aborted the whole batch after the first obligation existed.
 */
async function refreshPaymentObligations(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  dateFrom: string,
  dateTo: string
): Promise<ObligationsRefreshResult> {
  const fromIso = `${dateFrom}T00:00:00+05:00`
  const toIso = `${dateTo}T23:59:59.999+05:00`

  const periodResult = await fetchPaginatedSupplies(serviceClient, (q) =>
    q.gte('doc_time', fromIso).lte('doc_time', toIso)
  )
  if (periodResult.error) {
    console.error('spo_supplies_select_failed', {
      message: periodResult.error.message,
      code: periodResult.error.code,
    })
    return emptyObligationsResult({
      status: 'failed',
      error_code: 'SUPABASE_SELECT_FAILED',
      error_message: `Не удалось прочитать приёмки для обязательств: ${periodResult.error.message}`,
    })
  }

  const openDebtResult = await fetchPaginatedSupplies(serviceClient, (q) =>
    q.eq('is_source_deleted', false).gt('debt', 0)
  )
  if (openDebtResult.error) {
    console.error('spo_open_debt_select_failed', {
      message: openDebtResult.error.message,
      code: openDebtResult.error.code,
    })
    return emptyObligationsResult({
      status: 'failed',
      error_code: 'SUPABASE_SELECT_FAILED',
      error_message: `Не удалось прочитать открытые долги UMAG: ${openDebtResult.error.message}`,
    })
  }

  const supplyByUmagId = new Map<number, Record<string, unknown>>()
  for (const row of periodResult.rows) {
    supplyByUmagId.set(Number(row.umag_supply_id), row)
  }
  for (const row of openDebtResult.rows) {
    const id = Number(row.umag_supply_id)
    if (!supplyByUmagId.has(id)) supplyByUmagId.set(id, row)
  }

  const supplyRows = [...supplyByUmagId.values()]
  if (supplyRows.length === 0) return emptyObligationsResult()

  const seedSupplierIds = [
    ...new Set(
      supplyRows
        .map((s) => s.platform_supplier_id as string | null)
        .filter((id): id is string => Boolean(id))
    ),
  ]

  const suppliersById = new Map<string, SupplierTermsRow>()
  let pendingIds = [...seedSupplierIds]
  while (pendingIds.length > 0) {
    const fetched = await fetchRowsByIdsInChunks(
      serviceClient,
      'platform_suppliers',
      'id, payment_type, deferral_days, is_merged, merged_into_supplier_id',
      'id',
      pendingIds
    )
    if (fetched.error) {
      console.error('spo_suppliers_select_failed', {
        message: fetched.error.message,
        code: fetched.error.code,
      })
      return emptyObligationsResult({
        status: 'failed',
        error_code: 'SUPABASE_SELECT_FAILED',
        error_message: `Не удалось прочитать условия оплаты поставщиков: ${fetched.error.message}`,
      })
    }
    pendingIds = []
    for (const row of fetched.rows as SupplierTermsRow[]) {
      suppliersById.set(row.id, {
        id: row.id,
        payment_type: row.payment_type ?? null,
        deferral_days: row.deferral_days ?? null,
        is_merged: row.is_merged ?? false,
        merged_into_supplier_id: row.merged_into_supplier_id ?? null,
      })
      if (
        row.is_merged &&
        row.merged_into_supplier_id &&
        !suppliersById.has(row.merged_into_supplier_id)
      ) {
        pendingIds.push(row.merged_into_supplier_id)
      }
    }
  }

  const umagIds = supplyRows.map((s) => Number(s.umag_supply_id))
  const existingFetched = await fetchRowsByIdsInChunks(
    serviceClient,
    'supplier_payment_obligations',
    'id, umag_supply_id, payment_terms_type_snapshot, deferment_days_snapshot, due_date, terms_snapshot_created_at, paid_at, is_source_deleted, current_debt, first_seen_at, platform_supplier_id',
    'umag_supply_id',
    umagIds
  )
  if (existingFetched.error) {
    console.error('spo_existing_select_failed', {
      message: existingFetched.error.message,
      code: existingFetched.error.code,
    })
    return emptyObligationsResult({
      status: 'failed',
      error_code: 'SUPABASE_SELECT_FAILED',
      error_message: `Не удалось прочитать обязательства оплаты: ${existingFetched.error.message}`,
    })
  }

  const existingByUmagId = new Map<number, Record<string, unknown>>()
  for (const row of existingFetched.rows) {
    existingByUmagId.set(Number(row.umag_supply_id), row)
  }

  const now = new Date().toISOString()
  let created = 0
  let updated = 0
  let paid = 0
  let sourceDeleted = 0
  let reactivated = 0
  let termsMissing = 0
  let suppliesWithOpenDebt = 0
  const upsertRows: Record<string, unknown>[] = []
  const failedSupplyIds: number[] = []
  const failedDetails: Array<{ umag_supply_id: number; message: string; code?: string }> = []

  for (const supply of supplyRows) {
    const umagSupplyId = Number(supply.umag_supply_id)
    const debt = asNumber(supply.debt)
    const existing = existingByUmagId.get(umagSupplyId) || null
    const isDeleted = Boolean(supply.is_source_deleted)

    // Never create obligations for supplies that never carried open debt.
    if (!existing && (isDeleted || debt <= 0)) continue

    if (!isDeleted && debt > 0) suppliesWithOpenDebt += 1

    const canonicalSupplierId = resolveCanonicalSupplierId(
      (supply.platform_supplier_id as string | null) || null,
      suppliersById
    )
    const terms = resolveTermsSnapshot(
      canonicalSupplierId ? suppliersById.get(canonicalSupplierId) || null : null
    )
    if (terms.legacy) {
      console.warn('spo_legacy_payment_type', {
        umag_supply_id: umagSupplyId,
        platform_supplier_id: canonicalSupplierId,
      })
    }

    const docDate = aqtobeDateKeyFromIso(supply.doc_time as string | null)
    const hasSnapshot = existing?.due_date != null || existing?.terms_snapshot_created_at != null
    let paymentTermsType = (existing?.payment_terms_type_snapshot as string | null) ?? null
    let defermentDays = (existing?.deferment_days_snapshot as number | null) ?? null
    let dueDate = (existing?.due_date as string | null) ?? null
    let termsSnapshotCreatedAt =
      (existing?.terms_snapshot_created_at as string | null) ?? null

    // First snapshot only when missing; later supplier term changes do not rewrite.
    if (!hasSnapshot && terms.configured && docDate) {
      paymentTermsType = terms.type
      defermentDays = terms.days
      dueDate = addCalendarDays(docDate, terms.days ?? 0)
      termsSnapshotCreatedAt = now
    } else if (!hasSnapshot && !terms.configured) {
      paymentTermsType = terms.type
      defermentDays = null
      dueDate = null
      termsSnapshotCreatedAt = null
    }

    if (!isDeleted && debt > 0 && dueDate == null) termsMissing += 1

    let paidAt = (existing?.paid_at as string | null) ?? null
    if (debt <= 0) {
      if (!paidAt) {
        paidAt = now
        paid += 1
      }
    } else if (paidAt) {
      // UMAG debt returned after correction — reopen obligation.
      paidAt = null
    }

    if (isDeleted) {
      if (!existing?.is_source_deleted) sourceDeleted += 1
    } else if (existing?.is_source_deleted) {
      reactivated += 1
    }

    if (existing) updated += 1
    else created += 1

    // Homogeneous keys required for PostgREST bulk upsert.
    upsertRows.push({
      platform_supplier_id: canonicalSupplierId,
      umag_supply_id: umagSupplyId,
      umag_supply_row_id: supply.id,
      supply_document_date: docDate,
      source_doc_time: supply.doc_time ?? null,
      original_supply_amount: asNumber(supply.amount),
      current_payment_amount: asNumber(supply.payment_amount),
      current_debt: debt,
      payment_terms_type_snapshot: paymentTermsType,
      deferment_days_snapshot: defermentDays,
      due_date: dueDate,
      terms_snapshot_created_at: termsSnapshotCreatedAt,
      is_source_deleted: isDeleted,
      source_deleted_at: isDeleted ? now : null,
      last_synced_at: now,
      paid_at: paidAt,
      first_seen_at: (existing?.first_seen_at as string | null) || now,
    })
  }

  const chunkSize = 100
  for (let i = 0; i < upsertRows.length; i += chunkSize) {
    const chunk = upsertRows.slice(i, i + chunkSize)
    const { error } = await serviceClient
      .from('supplier_payment_obligations')
      .upsert(chunk, { onConflict: 'umag_supply_id' })
    if (!error) continue

    console.error('spo_upsert_chunk_failed', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      offset: i,
      chunkSize: chunk.length,
    })

    for (const row of chunk) {
      const umagSupplyId = Number(row.umag_supply_id)
      const { error: rowError } = await serviceClient
        .from('supplier_payment_obligations')
        .upsert([row], { onConflict: 'umag_supply_id' })
      if (!rowError) continue
      failedSupplyIds.push(umagSupplyId)
      failedDetails.push({
        umag_supply_id: umagSupplyId,
        message: rowError.message,
        code: rowError.code,
      })
      console.error('spo_upsert_row_failed', {
        umag_supply_id: umagSupplyId,
        platform_supplier_id: row.platform_supplier_id,
        message: rowError.message,
        code: rowError.code,
        details: rowError.details,
        hint: rowError.hint,
      })
    }
  }

  const failed = failedSupplyIds.length
  const status: ObligationsRefreshResult['status'] =
    failed === 0 ? 'success' : failed >= upsertRows.length ? 'failed' : 'partial'

  const result = emptyObligationsResult({
    status,
    supplies_with_open_debt: suppliesWithOpenDebt,
    obligations_created: Math.max(0, created - failed),
    obligations_updated: updated,
    obligations_paid: paid,
    obligations_terms_missing: termsMissing,
    obligations_failed: failed,
    obligations_source_deleted: sourceDeleted,
    obligations_reactivated: reactivated,
    failed_supply_ids: failedSupplyIds,
    error_code: failed
      ? failedDetails[0]?.code || 'SUPABASE_UPSERT_FAILED'
      : null,
    error_message: failed
      ? `Не удалось сохранить ${failed} обязательств: ${failedDetails[0]?.message || 'unknown'}`
      : null,
  })

  console.info('umag_sync_payment_obligations_refreshed', {
    dateFrom,
    dateTo,
    ...result,
    failed_details: failedDetails.slice(0, 20),
  })

  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()
  if (req.method !== 'POST') {
    return adminErrorResponse('method_not_allowed', 405)
  }

  const authz = await authorizeWorkforceRequest(req, [PERMISSION_SYNC])
  if (authz instanceof Response) return authz
  if (authz.permissions[PERMISSION_SYNC] !== true) {
    return adminErrorResponse('forbidden', 403)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return umagErrorResponse('VALIDATION_ERROR', 'Ожидается JSON-тело запроса.', 400)
  }

  const validated = validateBody(body)
  if (validated instanceof Response) return validated
  const { dateFrom: requestedFrom, dateTo: requestedTo, syncSuppliers } = validated

  // Этап 2.2: VIEW range (requested) vs. effective SYNC SCOPE — see
  // computeEffectiveSyncScope() for the widening rule. requestedFrom can only
  // push the sync range further back, never shrink it below what open
  // supplier debt needs.
  const syncScope = await computeEffectiveSyncScope(
    authz.serviceClient,
    requestedFrom,
    requestedTo
  )
  if (syncScope instanceof Response) return syncScope
  const { effectiveFrom, effectiveTo } = syncScope

  const bounds = aqtobePeriodBoundsMs(effectiveFrom, effectiveTo)
  if (!bounds) {
    return umagErrorResponse('VALIDATION_ERROR', 'Некорректный период синхронизации.', 400)
  }

  // Этап 2.3: close abandoned `running` rows before attempting the lock —
  // recovery from a crashed instance, not the lock itself (see below).
  const staleCleanup = await cleanupStaleSyncRuns(authz.serviceClient)
  if (staleCleanup instanceof Response) return staleCleanup

  // The insert below IS the lock acquisition (partial unique index on
  // umag_sync_runs (entity) WHERE status='running'). Done before the UMAG
  // signin so a losing concurrent request never pays for one.
  const acquired = await acquireSyncRun(authz.serviceClient, {
    entity: 'all',
    date_from: effectiveFrom,
    date_to: effectiveTo,
  })
  if (!acquired.ok) {
    if (acquired.alreadyRunning) {
      return umagErrorResponse(
        'SYNC_ALREADY_RUNNING',
        'Синхронизация UMAG уже выполняется. Дождитесь её завершения.',
        409,
        { runId: acquired.runId, startedAt: acquired.startedAt }
      )
    }
    return acquired.response
  }
  const runId = acquired.runId

  // Fresh signin when credentials exist (or warm cache). umagFetchAuthed retries once on 401/403.
  const session = await acquireUmagSession()
  if ('error' in session) {
    await finishSyncRun(authz.serviceClient, runId, {
      status: 'failed',
      error_message: `Ошибка входа в UMAG: ${session.error}`,
    })
    return mapUmagAuthError(session.error)
  }

  try {
    let suppliersCreated = 0
    let suppliersUpdated = 0
    let canonicalStats: CanonicalReconcileStats = {
      sourceReceived: 0,
      created: 0,
      updated: 0,
      linkedByExternalId: 0,
      linkedByBin: 0,
      potentialDuplicates: 0,
      mappingErrors: 0,
      platformMap: new Map(),
    }
    let supplierMap = await loadSupplierMap(authz.serviceClient)
    let platformMap = await loadPlatformSupplierMap(authz.serviceClient)

    if (syncSuppliers) {
      const suppliersResult = await fetchAllSuppliers(session)
      if (!suppliersResult.ok) {
        await finishSyncRun(authz.serviceClient, runId, {
          status: 'failed' satisfies SyncStatus,
          error_message: 'Ошибка загрузки поставщиков UMAG',
        })
        return suppliersResult.response
      }

      const upsertResult = await upsertSuppliers(authz.serviceClient, suppliersResult.agents)
      if (upsertResult instanceof Response) {
        await finishSyncRun(authz.serviceClient, runId, {
          status: 'failed',
          error_message: 'Ошибка сохранения поставщиков',
          records_received: suppliersResult.agents.length,
          source_suppliers_received: suppliersResult.agents.length,
        })
        return upsertResult
      }
      suppliersCreated = upsertResult.created
      suppliersUpdated = upsertResult.updated
      supplierMap = upsertResult.map.size > 0 ? upsertResult.map : supplierMap
      // Refresh full map so supplies can link even if some agents were already present
      supplierMap = await loadSupplierMap(authz.serviceClient)

      const activeUmagIds = new Set<number>()
      for (const agent of suppliersResult.agents) {
        const id = asBigIntId(agent.id)
        if (id != null) activeUmagIds.add(id)
      }

      const reconcileResult = await reconcileCanonicalSuppliers(
        authz.serviceClient,
        activeUmagIds
      )
      if (reconcileResult instanceof Response) {
        await finishSyncRun(authz.serviceClient, runId, {
          status: 'failed',
          error_message: 'Ошибка сверки канонических поставщиков',
          records_received: suppliersResult.agents.length,
          source_suppliers_received: suppliersResult.agents.length,
          records_created: suppliersCreated,
          records_updated: suppliersUpdated,
        })
        return reconcileResult
      }
      canonicalStats = reconcileResult
      platformMap = reconcileResult.platformMap.size
        ? reconcileResult.platformMap
        : await loadPlatformSupplierMap(authz.serviceClient)
    }

    const suppliesResult = await fetchAllSupplies(session, bounds.fromTime, bounds.toTime)
    if (!suppliesResult.ok) {
      await finishSyncRun(authz.serviceClient, runId, {
        status: 'failed',
        error_message: 'Ошибка загрузки приёмок UMAG',
        records_created: suppliersCreated,
        records_updated: suppliersUpdated,
      })
      return suppliesResult.response
    }

    const calculated = {
      amount: sumNumbers(suppliesResult.supplies.map((s) => s.amount)),
      paymentAmount: sumNumbers(suppliesResult.supplies.map((s) => s.paymentAmount)),
      paymentRefundAmount: sumNumbers(suppliesResult.supplies.map((s) => s.paymentRefundAmount)),
      debt: sumNumbers(suppliesResult.supplies.map((s) => s.debt)),
    }

    const source = suppliesResult.source
    const mismatches: string[] = []
    if (source.amount != null && !nearlyEqual(calculated.amount, source.amount, AGGREGATE_EPSILON)) {
      mismatches.push(
        `amount: rows=${calculated.amount} source=${source.amount}`
      )
    }
    if (
      source.paymentAmount != null &&
      !nearlyEqual(calculated.paymentAmount, source.paymentAmount, AGGREGATE_EPSILON)
    ) {
      mismatches.push(
        `paymentAmount: rows=${calculated.paymentAmount} source=${source.paymentAmount}`
      )
    }
    if (
      source.paymentRefundAmount != null &&
      !nearlyEqual(
        calculated.paymentRefundAmount,
        source.paymentRefundAmount,
        AGGREGATE_EPSILON
      )
    ) {
      mismatches.push(
        `paymentRefundAmount: rows=${calculated.paymentRefundAmount} source=${source.paymentRefundAmount}`
      )
    }
    if (source.debt != null && !nearlyEqual(calculated.debt, source.debt, AGGREGATE_EPSILON)) {
      mismatches.push(`debt: rows=${calculated.debt} source=${source.debt}`)
    }
    if (
      source.totalCount != null &&
      suppliesResult.supplies.length !== source.totalCount
    ) {
      mismatches.push(
        `totalCount: rows=${suppliesResult.supplies.length} source=${source.totalCount}`
      )
    }

    const aggregatesMatch = mismatches.length === 0
    const warningMessage = aggregatesMatch
      ? null
      : `Расхождение агрегатов UMAG: ${mismatches.join('; ')}`

    if (warningMessage) {
      console.warn('umag_sync_aggregate_mismatch', { mismatches, effectiveFrom, effectiveTo })
    }

    const suppliesUpsert = await upsertSupplies(
      authz.serviceClient,
      suppliesResult.supplies,
      supplierMap,
      platformMap
    )
    if (suppliesUpsert instanceof Response) {
      await finishSyncRun(authz.serviceClient, runId, {
        status: 'failed',
        error_message: 'Ошибка сохранения приёмок',
        records_received: suppliesResult.supplies.length,
        source_total_count: source.totalCount,
        source_amount: source.amount,
        source_payment_amount: source.paymentAmount,
        source_payment_refund_amount: source.paymentRefundAmount,
        source_debt: source.debt,
        calculated_amount: calculated.amount,
        calculated_payment_amount: calculated.paymentAmount,
        calculated_payment_refund_amount: calculated.paymentRefundAmount,
        calculated_debt: calculated.debt,
        aggregates_match: aggregatesMatch,
        warning_message: warningMessage,
      })
      return suppliesUpsert
    }

    let sourceDeleted = 0
    // Snapshot reconciliation ONLY after a fully validated period snapshot.
    // Prefer keeping a stale row over false mass soft-deletes.
    if (aggregatesMatch && source.totalCount != null) {
      const receivedIds = new Set<number>()
      for (const supply of suppliesResult.supplies) {
        const id = asBigIntId(supply.id)
        if (id != null) receivedIds.add(id)
      }

      if (receivedIds.size !== suppliesResult.supplies.length) {
        await finishSyncRun(authz.serviceClient, runId, {
          status: 'partial',
          error_message: 'Неполные ID приёмок — сверка удалений пропущена',
          records_received: suppliesResult.supplies.length,
          records_created: suppliesUpsert.created + suppliersCreated,
          records_updated: suppliesUpsert.updated + suppliersUpdated,
          records_reactivated: suppliesUpsert.reactivated,
          source_total_count: source.totalCount,
          source_amount: source.amount,
          source_payment_amount: source.paymentAmount,
          source_payment_refund_amount: source.paymentRefundAmount,
          source_debt: source.debt,
          calculated_amount: calculated.amount,
          calculated_payment_amount: calculated.paymentAmount,
          calculated_payment_refund_amount: calculated.paymentRefundAmount,
          calculated_debt: calculated.debt,
          aggregates_match: false,
          warning_message: 'Сверка удалённых приёмок пропущена: дубли/пустые ID в ответе UMAG',
        })
        return jsonResponse({
          success: true,
          status: 'partial',
          warning: 'Сверка удалённых приёмок пропущена: дубли/пустые ID в ответе UMAG',
          period: { dateFrom: effectiveFrom, dateTo: effectiveTo, fromTime: bounds.fromTime, toTime: bounds.toTime },
          syncScope,
          suppliers: {
            created: suppliersCreated,
            updated: suppliersUpdated,
            totalKnown: supplierMap.size,
          },
          supplies: {
            received: suppliesResult.supplies.length,
            created: suppliesUpsert.created,
            updated: suppliesUpsert.updated,
            reactivated: suppliesUpsert.reactivated,
            sourceDeleted: 0,
            pages: suppliesResult.pages,
          },
          aggregates: { match: false, source, calculated },
          syncRunId: runId,
        })
      }

      const reconcile = await reconcileMissingSupplies(
        authz.serviceClient,
        effectiveFrom,
        effectiveTo,
        receivedIds
      )
      if (reconcile instanceof Response) {
        await finishSyncRun(authz.serviceClient, runId, {
          status: 'failed',
          error_message: 'Ошибка сверки удалённых приёмок после импорта',
          records_received: suppliesResult.supplies.length,
          records_created: suppliesUpsert.created + suppliersCreated,
          records_updated: suppliesUpsert.updated + suppliersUpdated,
          records_reactivated: suppliesUpsert.reactivated,
          source_total_count: source.totalCount,
          source_amount: source.amount,
          source_payment_amount: source.paymentAmount,
          source_payment_refund_amount: source.paymentRefundAmount,
          source_debt: source.debt,
          calculated_amount: calculated.amount,
          calculated_payment_amount: calculated.paymentAmount,
          calculated_payment_refund_amount: calculated.paymentRefundAmount,
          calculated_debt: calculated.debt,
          aggregates_match: aggregatesMatch,
          warning_message: warningMessage,
        })
        return reconcile
      }
      sourceDeleted = reconcile.sourceDeleted
    }

    const obligationsRefresh = await refreshPaymentObligations(
      authz.serviceClient,
      effectiveFrom,
      effectiveTo
    )
    const obligationsWarning =
      obligationsRefresh.status === 'success'
        ? null
        : obligationsRefresh.status === 'partial'
          ? `Данные UMAG обновлены, календарь оплат обновлён не полностью (${obligationsRefresh.obligations_failed} обязательств).`
          : obligationsRefresh.error_message ||
            'Данные UMAG обновлены, календарь оплат обновить не удалось.'

    // Refresh platform map so returns map agentId → canonical even if suppliers were skipped
    if (!syncSuppliers || platformMap.size === 0) {
      platformMap = await loadPlatformSupplierMap(authz.serviceClient)
    }

    const returnsResult = await fetchAllSupplyReturns(session, bounds.fromTime, bounds.toTime)
    if (!returnsResult.ok) {
      await finishSyncRun(authz.serviceClient, runId, {
        status: 'failed',
        error_message: 'Ошибка загрузки возвратов поставщикам UMAG',
        records_received: suppliesResult.supplies.length,
        records_created: suppliesUpsert.created + suppliersCreated + canonicalStats.created,
        records_updated: suppliesUpsert.updated + suppliersUpdated + canonicalStats.updated,
        records_source_deleted: sourceDeleted,
        records_reactivated: suppliesUpsert.reactivated,
        source_total_count: source.totalCount,
        source_amount: source.amount,
        aggregates_match: aggregatesMatch,
        warning_message: warningMessage,
      })
      return returnsResult.response
    }

    const calculatedReturnAmount = sumNumbers(
      returnsResult.returns.map((item) => {
        const { doc } = unwrapSupplyReturn(item)
        return Math.abs(asNumber(doc.amount))
      })
    )
    const returnSource = returnsResult.source
    const returnMismatches: string[] = []
    if (
      returnSource.amount != null &&
      !nearlyEqual(
        calculatedReturnAmount,
        Math.abs(asNumber(returnSource.amount)),
        AGGREGATE_EPSILON
      )
    ) {
      returnMismatches.push(
        `returnAmount: rows=${calculatedReturnAmount} source=${returnSource.amount}`
      )
    }
    if (
      returnSource.totalCount != null &&
      returnsResult.returns.length !== returnSource.totalCount
    ) {
      returnMismatches.push(
        `returnTotalCount: rows=${returnsResult.returns.length} source=${returnSource.totalCount}`
      )
    }
    const returnsAggregatesMatch = returnMismatches.length === 0
    const returnsWarning = returnsAggregatesMatch
      ? null
      : `Расхождение агрегатов возвратов UMAG: ${returnMismatches.join('; ')}`
    if (returnsWarning) {
      console.warn('umag_sync_returns_aggregate_mismatch', {
        mismatches: returnMismatches,
        effectiveFrom,
        effectiveTo,
      })
    }

    const returnsUpsert = await upsertSupplyReturns(
      authz.serviceClient,
      returnsResult.returns,
      platformMap
    )
    if (returnsUpsert instanceof Response) {
      await finishSyncRun(authz.serviceClient, runId, {
        status: 'failed',
        error_message: 'Ошибка сохранения возвратов поставщикам',
        records_received: suppliesResult.supplies.length,
        returns_received: returnsResult.returns.length,
        source_return_count: returnSource.totalCount,
        source_return_amount: returnSource.amount,
        calculated_return_amount: calculatedReturnAmount,
        aggregates_match: aggregatesMatch && returnsAggregatesMatch,
        warning_message: [warningMessage, returnsWarning].filter(Boolean).join(' | ') || null,
      })
      return returnsUpsert
    }

    let returnsSourceDeleted = 0
    // Soft-delete only after a complete validated snapshot.
    // Root-array responses have no totalCount — require clean pagination instead.
    const returnsSnapshotComplete =
      returnsAggregatesMatch &&
      returnsResult.paginationComplete &&
      (returnSource.totalCount == null ||
        returnSource.totalCount === returnsResult.returns.length)

    if (returnsSnapshotComplete) {
      const receivedReturnIds = new Set<number>()
      for (const item of returnsResult.returns) {
        const { doc } = unwrapSupplyReturn(item)
        const id = asBigIntId(doc.id)
        if (id != null) receivedReturnIds.add(id)
      }

      if (receivedReturnIds.size === returnsResult.returns.length) {
        const reconcileReturns = await reconcileMissingSupplyReturns(
          authz.serviceClient,
          effectiveFrom,
          effectiveTo,
          receivedReturnIds
        )
        if (reconcileReturns instanceof Response) {
          await finishSyncRun(authz.serviceClient, runId, {
            status: 'failed',
            error_message: 'Ошибка сверки удалённых возвратов после импорта',
            returns_received: returnsResult.returns.length,
            returns_created: returnsUpsert.created,
            returns_updated: returnsUpsert.updated,
            returns_reactivated: returnsUpsert.reactivated,
            source_return_count: returnSource.totalCount,
            source_return_amount: returnSource.amount,
            calculated_return_amount: calculatedReturnAmount,
          })
          return reconcileReturns
        }
        returnsSourceDeleted = reconcileReturns.sourceDeleted
      }
    }

    // Document payments (real payment dates from UMAG fin/document-payment)
    let paymentsStats = {
      received: 0,
      created: 0,
      updated: 0,
      reactivated: 0,
      pages: 0,
      totalCount: null as number | null,
    }
    let ledgerUpserted = 0
    let paymentsWarning: string | null = null

    const paymentsResult = await fetchDocumentPaymentsForPeriod(
      session,
      bounds.fromTime,
      bounds.toTime
    )
    if (!paymentsResult.ok) {
      paymentsWarning = 'Не удалось загрузить оплаты UMAG (document-payment).'
      console.error('umag_sync_payments_fetch_failed')
    } else {
      const { supplyToSupplier, returnToSupplier } = await buildPaymentSupplierLinkMaps(
        authz.serviceClient,
        paymentsResult.payments
      )

      const platformByUmag = new Map<number, string>()
      for (const [umagId, platformId] of platformMap.entries()) {
        platformByUmag.set(Number(umagId), String(platformId))
      }

      const paymentsUpsert = await upsertDocumentPayments(
        authz.serviceClient,
        paymentsResult.payments,
        platformByUmag,
        supplyToSupplier,
        returnToSupplier
      )
      if (paymentsUpsert instanceof Response) {
        paymentsWarning = 'Оплаты UMAG получены, но не сохранились.'
      } else {
        paymentsStats = {
          received: paymentsResult.payments.length,
          created: paymentsUpsert.created,
          updated: paymentsUpsert.updated,
          reactivated: paymentsUpsert.reactivated,
          pages: paymentsResult.pages,
          totalCount: paymentsResult.totalCount,
        }
      }

      const ledgerResult = await rebuildLedgerEventsForPeriod(
        authz.serviceClient,
        effectiveFrom,
        effectiveTo
      )
      if (ledgerResult instanceof Response) {
        paymentsWarning = [paymentsWarning, 'Ledger events не обновлены.']
          .filter(Boolean)
          .join(' ')
      } else {
        ledgerUpserted = ledgerResult.upserted
      }
    }

    // Этап 2.2: a cap-truncated or date-unresolved old debt means this run
    // cannot promise every open supplier debt is fresh — that must show up
    // as 'partial', never a clean 'success' (see item 8/16 of Stage 2.2).
    const coverageWarning = syncScope.openDebtCoverageComplete
      ? null
      : `Не все открытые долги гарантированно обновлены: ${syncScope.uncoveredOpenObligationsCount} обязательств (Σ ${syncScope.uncoveredOpenDebtAmount} ₸) вне синхронизированного диапазона${
          syncScope.unresolvedDateObligationsCount > 0
            ? `, из них ${syncScope.unresolvedDateObligationsCount} с неизвестной датой приёмки`
            : ''
        }.`

    const combinedWarning =
      [warningMessage, returnsWarning, obligationsWarning, paymentsWarning, coverageWarning]
        .filter(Boolean)
        .join(' | ') || null
    const status: SyncStatus =
      aggregatesMatch &&
      returnsAggregatesMatch &&
      obligationsRefresh.status === 'success' &&
      !paymentsWarning &&
      syncScope.openDebtCoverageComplete
        ? 'success'
        : 'partial'
    await finishSyncRun(authz.serviceClient, runId, {
      status,
      records_received: suppliesResult.supplies.length,
      records_created: suppliesUpsert.created + suppliersCreated + canonicalStats.created,
      records_updated: suppliesUpsert.updated + suppliersUpdated + canonicalStats.updated,
      records_source_deleted: sourceDeleted,
      records_reactivated: suppliesUpsert.reactivated,
      returns_received: returnsResult.returns.length,
      returns_created: returnsUpsert.created,
      returns_updated: returnsUpsert.updated,
      returns_source_deleted: returnsSourceDeleted,
      returns_reactivated: returnsUpsert.reactivated,
      source_return_count: returnSource.totalCount,
      source_return_amount: returnSource.amount,
      calculated_return_amount: calculatedReturnAmount,
      source_suppliers_received: canonicalStats.sourceReceived || null,
      canonical_created: canonicalStats.created,
      canonical_updated: canonicalStats.updated,
      linked_by_external_id: canonicalStats.linkedByExternalId,
      linked_by_bin: canonicalStats.linkedByBin,
      potential_duplicates: canonicalStats.potentialDuplicates,
      mapping_errors: canonicalStats.mappingErrors,
      source_total_count: source.totalCount,
      source_amount: source.amount,
      source_payment_amount: source.paymentAmount,
      source_payment_refund_amount: source.paymentRefundAmount,
      source_debt: source.debt,
      calculated_amount: calculated.amount,
      calculated_payment_amount: calculated.paymentAmount,
      calculated_payment_refund_amount: calculated.paymentRefundAmount,
      calculated_debt: calculated.debt,
      aggregates_match: aggregatesMatch && returnsAggregatesMatch,
      warning_message: combinedWarning,
      error_message: null,
    })

    return jsonResponse({
      success: true,
      status,
      warning: combinedWarning,
      period: { dateFrom: effectiveFrom, dateTo: effectiveTo, fromTime: bounds.fromTime, toTime: bounds.toTime },
      syncScope,
      suppliers: {
        created: suppliersCreated,
        updated: suppliersUpdated,
        totalKnown: supplierMap.size,
        canonical: {
          created: canonicalStats.created,
          updated: canonicalStats.updated,
          linkedByExternalId: canonicalStats.linkedByExternalId,
          linkedByBin: canonicalStats.linkedByBin,
          potentialDuplicates: canonicalStats.potentialDuplicates,
          mappingErrors: canonicalStats.mappingErrors,
          totalLinked: platformMap.size,
        },
      },
      supplies: {
        received: suppliesResult.supplies.length,
        created: suppliesUpsert.created,
        updated: suppliesUpsert.updated,
        reactivated: suppliesUpsert.reactivated,
        sourceDeleted,
        pages: suppliesResult.pages,
      },
      paymentObligations: obligationsRefresh,
      payments: {
        ...paymentsStats,
        ledgerUpserted,
      },
      returns: {
        received: returnsResult.returns.length,
        created: returnsUpsert.created,
        updated: returnsUpsert.updated,
        reactivated: returnsUpsert.reactivated,
        sourceDeleted: returnsSourceDeleted,
        pages: returnsResult.pages,
        aggregates: {
          match: returnsAggregatesMatch,
          source: returnSource,
          calculatedAmount: calculatedReturnAmount,
        },
      },
      aggregates: {
        match: aggregatesMatch,
        source,
        calculated,
      },
      syncRunId: runId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.error('umag_sync_unexpected', { message })
    await finishSyncRun(authz.serviceClient, runId, {
      status: 'failed',
      error_message: 'Внутренняя ошибка синхронизации UMAG',
    })
    return umagErrorResponse(
      'INTERNAL_ERROR',
      'Внутренняя ошибка синхронизации UMAG. Повторите попытку.',
      500
    )
  }
})
