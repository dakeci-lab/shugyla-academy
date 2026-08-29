/**
 * umag-sales-sync — monthly category revenue/margin facts for the "Продажи" section.
 *
 * Action: sync_next — syncs exactly ONE calendar month (the next unsynced one,
 * resuming from the last successful run) and returns whether more months
 * remain. The frontend calls this in a loop to walk through history without
 * a single long-running request. Safe to interrupt: each call is a complete,
 * independently-committed unit of work.
 *
 * Category is not present on UMAG's sales rows — it is attributed by joining
 * the sold barcode against the CURRENT stock catalog. UMAG's category
 * taxonomy is assumed materially stable over time, so today's mapping is
 * used as a stand-in for a historical month's (see migration comment on
 * sales_category_month_facts).
 *
 * Never writes back to UMAG. Never returns UMAG secrets to the client.
 */

import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import {
  adminErrorResponse,
  authorizeWorkforceRequest,
} from '../_shared/employeeAuthorization.ts'
import { maskStoreId, STALE_SYNC_THRESHOLD_MINUTES } from '../_shared/umagConfig.ts'
import { acquireUmagSession, umagFetchAuthed } from '../_shared/umagAuth.ts'

const PERMISSION_SYNC = 'sales.sync'

const STOCK_PATH = '/rest/cabinet/opr/stock/find'
const SALES_PATH = '/rest/cabinet/report/list-product-report'
/** Receipt list (one row per чек, not per product) — used only for its count/receipt_count per month. */
const RECEIPT_PATH = '/rest/cabinet/opr/sale/list-without-products'
const PAGE_SIZE = 50_000
/** Receipts/month comfortably fits one page at this size (~20-25k/month observed). */
const RECEIPT_PAGE_SIZE = 100_000
const UMAG_FETCH_TIMEOUT_MS = 120_000
const ALMATY_TZ = 'Asia/Almaty'
const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000
/** First month the "Продажи" section covers — matches the source dashboard's own range. */
const DEFAULT_HISTORY_START = '2025-01-01'

type StockRow = {
  barcode?: string | null
  categoryName?: string | null
  subCategoryName?: string | null
}

type SalesRow = {
  barcode?: string | null
  saleQuantity?: number | string | null
  saleArrivalAmount?: number | string | null
  saleSellingAmount?: number | string | null
}

function umagErrorResponse(
  code: string,
  message: string,
  status = 502,
  extra: Record<string, unknown> = {}
) {
  return jsonResponse({ success: false, code, message, ...extra }, status)
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
  return umagErrorResponse('UMAG_NETWORK_ERROR', 'Не удалось связаться с UMAG. Повторите попытку.', 502)
}

function mapUmagHttpError(status: number): Response {
  if (status === 401 || status === 403) return mapUmagAuthError('UMAG_AUTH_FAILED')
  if (status >= 500) {
    return umagErrorResponse('UMAG_UPSTREAM_ERROR', 'Сервис UMAG временно недоступен. Повторите попытку позже.', 502)
  }
  return umagErrorResponse('UMAG_REQUEST_FAILED', `UMAG вернул ошибку (HTTP ${status}).`, 502)
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function asBarcode(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

function asText(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function currentAlmatyMonthKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ALMATY_TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  return `${y}-${m}-01`
}

function nextMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function lastDayOfMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 0))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`
}

/** Inclusive month bounds in Asia/Almaty as Unix ms for UMAG fromTime/toTime. */
function almatyMonthBoundsMs(monthKey: string): { fromTime: number; toTime: number } {
  const [y, m] = monthKey.split('-').map(Number)
  const fromTime = Date.UTC(y, m - 1, 1, 0, 0, 0, 0) - ALMATY_OFFSET_MS
  const toTime = Date.UTC(y, m, 1, 0, 0, 0, 0) - ALMATY_OFFSET_MS - 1
  return { fromTime, toTime }
}

async function fetchUmagListPage(
  path: string,
  search: Record<string, string | number | boolean>
): Promise<{ rows: unknown[]; count: number } | Response> {
  const result = await umagFetchAuthed(path, search, { timeoutMs: UMAG_FETCH_TIMEOUT_MS })
  if ('error' in result) return mapUmagAuthError(result.error)
  if (result.status < 200 || result.status >= 300) return mapUmagHttpError(result.status)

  const body = result.json as { data?: unknown; count?: number } | null
  const rows = Array.isArray(body?.data) ? body.data : []
  const count = typeof body?.count === 'number' ? body.count : rows.length
  return { rows, count }
}

async function fetchStockCategoryMap(storeId: string): Promise<Map<string, StockRow> | Response> {
  const page = await fetchUmagListPage(STOCK_PATH, {
    first: 0,
    pageSize: PAGE_SIZE,
    includeNonZero: false,
    sortField: 'quantity',
    sortType: 'desc',
    storeId,
  })
  if (page instanceof Response) return page
  const map = new Map<string, StockRow>()
  for (const row of page.rows as StockRow[]) {
    const barcode = asBarcode(row.barcode)
    if (!barcode) continue
    map.set(barcode, row)
  }
  return map
}

async function fetchMonthSales(
  storeId: string,
  fromTime: number,
  toTime: number
): Promise<SalesRow[] | Response> {
  const page = await fetchUmagListPage(SALES_PATH, {
    first: 0,
    pageSize: PAGE_SIZE,
    fromTime,
    toTime,
    storeId,
  })
  if (page instanceof Response) return page
  return page.rows as SalesRow[]
}

/**
 * Receipt count for the month. list-without-products responds with a
 * `sales` array (not `data`, unlike the other list endpoints), so this
 * bypasses fetchUmagListPage and reads the raw body directly. Falls back to
 * counting the array when no explicit count/total field is present — a
 * single 100k-row page comfortably covers a month's receipts either way.
 */
async function fetchMonthReceiptCount(
  storeId: string,
  fromTime: number,
  toTime: number
): Promise<number | Response> {
  const result = await umagFetchAuthed(
    RECEIPT_PATH,
    { first: 0, pageSize: RECEIPT_PAGE_SIZE, fromTime, toTime, storeId },
    { timeoutMs: UMAG_FETCH_TIMEOUT_MS }
  )
  if ('error' in result) return mapUmagAuthError(result.error)
  if (result.status < 200 || result.status >= 300) return mapUmagHttpError(result.status)

  const body = result.json as { sales?: unknown[]; count?: number; total?: number } | null
  const sales = Array.isArray(body?.sales) ? body.sales : []
  const explicitCount = typeof body?.count === 'number' ? body.count : typeof body?.total === 'number' ? body.total : null
  return explicitCount != null ? Math.max(explicitCount, sales.length) : sales.length
}

// ---------------------------------------------------------------------------
// umag_sync_runs lock — identical machinery to umag-sync's (see that file's
// comments); duplicated here rather than shared since neither side exports it.
// ---------------------------------------------------------------------------

const PG_UNIQUE_VIOLATION = '23505'
const SYNC_LOCK_INDEX_NAME = 'umag_sync_runs_entity_running_lock'

function isSyncLockConflict(
  error: { code?: string; message?: string; details?: string } | null | undefined
): boolean {
  if (!error) return false
  if (error.code !== PG_UNIQUE_VIOLATION) return false
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  return text.includes(SYNC_LOCK_INDEX_NAME)
}

async function cleanupStaleSyncRuns(
  // deno-lint-ignore no-explicit-any
  serviceClient: any
): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_SYNC_THRESHOLD_MINUTES * 60_000).toISOString()
  const { error } = await serviceClient
    .from('umag_sync_runs')
    .update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_message: `stale: run exceeded ${STALE_SYNC_THRESHOLD_MINUTES} min without finishing — closed by the next sync attempt's cleanup step.`,
    })
    .eq('entity', 'sales_facts')
    .eq('status', 'running')
    .lt('started_at', staleBefore)
  if (error) {
    console.error('umag_sales_sync_stale_cleanup_failed', { message: error.message, code: error.code })
  }
}

type SyncRunAcquireResult =
  | { ok: true; runId: string }
  | { ok: false; alreadyRunning: true; startedAt: string | null }
  | { ok: false; alreadyRunning: false; response: Response }

async function acquireSyncRun(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  fields: Record<string, unknown>
): Promise<SyncRunAcquireResult> {
  const { data, error } = await serviceClient
    .from('umag_sync_runs')
    .insert({ entity: 'sales_facts', status: 'running', started_at: new Date().toISOString(), ...fields })
    .select('id')
    .single()

  if (!error) {
    if (!data?.id) {
      return {
        ok: false,
        alreadyRunning: false,
        response: umagErrorResponse('SUPABASE_UPSERT_FAILED', 'Не удалось создать запись синхронизации.', 500),
      }
    }
    return { ok: true, runId: data.id }
  }

  if (isSyncLockConflict(error)) {
    const { data: running } = await serviceClient
      .from('umag_sync_runs')
      .select('started_at')
      .eq('entity', 'sales_facts')
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return { ok: false, alreadyRunning: true, startedAt: running?.started_at ?? null }
  }

  console.error('umag_sales_sync_run_create_failed', { message: error.message, code: error.code })
  return {
    ok: false,
    alreadyRunning: false,
    response: umagErrorResponse('SUPABASE_UPSERT_FAILED', `Не удалось создать запись синхронизации: ${error.message}`, 500),
  }
}

async function finishSyncRun(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  runId: string,
  patch: Record<string, unknown>
) {
  const { error } = await serviceClient
    .from('umag_sync_runs')
    .update({ finished_at: new Date().toISOString(), ...patch })
    .eq('id', runId)
  if (error) {
    console.error('umag_sales_sync_run_finish_failed', { message: error.message })
  }
}

async function resolveNextMonthKey(
  // deno-lint-ignore no-explicit-any
  serviceClient: any
): Promise<string> {
  const { data } = await serviceClient
    .from('umag_sync_runs')
    .select('date_from')
    .eq('entity', 'sales_facts')
    .eq('status', 'success')
    .order('date_from', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.date_from) return DEFAULT_HISTORY_START
  return nextMonthKey(String(data.date_from))
}

async function handleSyncNext(
  authz: Exclude<Awaited<ReturnType<typeof authorizeWorkforceRequest>>, Response>
): Promise<Response> {
  if (authz.permissions[PERMISSION_SYNC] !== true) {
    return adminErrorResponse('forbidden', 403)
  }

  await cleanupStaleSyncRuns(authz.serviceClient)

  const monthKey = await resolveNextMonthKey(authz.serviceClient)
  const currentMonthKey = currentAlmatyMonthKey()
  if (monthKey > currentMonthKey) {
    return jsonResponse({ success: true, upToDate: true, monthSynced: null, nextMonth: null })
  }

  const acquired = await acquireSyncRun(authz.serviceClient, {
    date_from: monthKey,
    date_to: lastDayOfMonthKey(monthKey),
  })
  if (!acquired.ok) {
    if (acquired.alreadyRunning) {
      return umagErrorResponse(
        'SYNC_ALREADY_RUNNING',
        'Синхронизация продаж уже выполняется.',
        409,
        { startedAt: acquired.startedAt }
      )
    }
    return acquired.response
  }
  const runId = acquired.runId

  const session = await acquireUmagSession()
  if ('error' in session) {
    await finishSyncRun(authz.serviceClient, runId, {
      status: 'failed',
      error_message: `UMAG auth failed: ${session.error}`,
    })
    return mapUmagAuthError(session.error)
  }
  const storeId = session.storeId
  console.log('umag_sales_sync_month_start', { storeId: maskStoreId(storeId), monthKey })

  const { fromTime, toTime } = almatyMonthBoundsMs(monthKey)

  const [stockResult, salesResult, receiptCountResult] = await Promise.all([
    fetchStockCategoryMap(storeId),
    fetchMonthSales(storeId, fromTime, toTime),
    fetchMonthReceiptCount(storeId, fromTime, toTime),
  ])

  if (stockResult instanceof Response) {
    await finishSyncRun(authz.serviceClient, runId, { status: 'failed', error_message: 'UMAG stock fetch failed' })
    return stockResult
  }
  if (salesResult instanceof Response) {
    await finishSyncRun(authz.serviceClient, runId, { status: 'failed', error_message: 'UMAG sales fetch failed' })
    return salesResult
  }

  const stockByBarcode = stockResult
  const salesRows = salesResult

  type Agg = { revenue: number; cogs: number; quantity: number; barcodes: Set<string> }
  const byKey = new Map<string, Agg>()

  for (const row of salesRows) {
    const barcode = asBarcode(row.barcode)
    if (!barcode) continue
    const revenue = asNumber(row.saleSellingAmount, 0)
    const cogs = asNumber(row.saleArrivalAmount, 0)
    const quantity = asNumber(row.saleQuantity, 0)
    if (revenue === 0 && cogs === 0 && quantity === 0) continue

    const stock = stockByBarcode.get(barcode)
    const categoryName = asText(stock?.categoryName)
    const subcategoryName = asText(stock?.subCategoryName)
    const key = `${categoryName}${subcategoryName}`

    const agg = byKey.get(key) || { revenue: 0, cogs: 0, quantity: 0, barcodes: new Set<string>() }
    agg.revenue += revenue
    agg.cogs += cogs
    agg.quantity += quantity
    agg.barcodes.add(barcode)
    byKey.set(key, agg)
  }

  const nowIso = new Date().toISOString()
  const factRows = [...byKey.entries()].map(([key, agg]) => {
    const [categoryName, subcategoryName] = key.split('')
    const revenue = roundMoney(agg.revenue)
    const cogs = roundMoney(agg.cogs)
    return {
      month_key: monthKey,
      category_name: categoryName,
      subcategory_name: subcategoryName,
      revenue,
      cogs,
      profit: roundMoney(revenue - cogs),
      quantity: agg.quantity,
      sku_count: agg.barcodes.size,
      synced_at: nowIso,
    }
  })

  const { error: deleteErr } = await authz.serviceClient
    .from('sales_category_month_facts')
    .delete()
    .eq('month_key', monthKey)
  if (deleteErr) {
    await finishSyncRun(authz.serviceClient, runId, {
      status: 'failed',
      error_message: `Не удалось очистить месяц перед перезаписью: ${deleteErr.message}`,
    })
    return umagErrorResponse('SUPABASE_DELETE_FAILED', `Не удалось очистить месяц: ${deleteErr.message}`, 500)
  }

  if (factRows.length > 0) {
    const { error: insertErr } = await authz.serviceClient.from('sales_category_month_facts').insert(factRows)
    if (insertErr) {
      await finishSyncRun(authz.serviceClient, runId, {
        status: 'failed',
        error_message: `Не удалось сохранить факты продаж: ${insertErr.message}`,
      })
      return umagErrorResponse('SUPABASE_INSERT_FAILED', `Не удалось сохранить факты продаж: ${insertErr.message}`, 500)
    }
  }

  // Receipt count is a nice-to-have (Средний чек) — never fail the whole
  // month's sync over it; log and move on if UMAG's receipt list errors.
  let receiptCount: number | null = null
  if (receiptCountResult instanceof Response) {
    console.warn('umag_sales_sync_receipt_count_failed', { monthKey })
  } else {
    receiptCount = receiptCountResult
    const { error: receiptErr } = await authz.serviceClient
      .from('sales_month_receipt_facts')
      .upsert(
        { month_key: monthKey, receipt_count: receiptCount, synced_at: nowIso },
        { onConflict: 'month_key' }
      )
    if (receiptErr) {
      console.warn('umag_sales_sync_receipt_write_failed', { monthKey, message: receiptErr.message })
    }
  }

  await finishSyncRun(authz.serviceClient, runId, {
    status: 'success',
    records_received: salesRows.length,
    records_created: factRows.length,
  })

  const next = nextMonthKey(monthKey)
  const upToDate = next > currentAlmatyMonthKey()

  return jsonResponse({
    success: true,
    upToDate,
    monthSynced: monthKey,
    categoriesWritten: factRows.length,
    recordsReceived: salesRows.length,
    receiptCount,
    nextMonth: upToDate ? null : next,
  })
}

/** One-off backfill: fills sales_month_receipt_facts for months already in sales_category_month_facts that never got a receipt count (e.g. synced before this endpoint was wired up). */
async function handleBackfillReceipts(
  authz: Exclude<Awaited<ReturnType<typeof authorizeWorkforceRequest>>, Response>
): Promise<Response> {
  if (authz.permissions[PERMISSION_SYNC] !== true) {
    return adminErrorResponse('forbidden', 403)
  }

  const session = await acquireUmagSession()
  if ('error' in session) return mapUmagAuthError(session.error)
  const storeId = session.storeId

  const { data: factMonths, error: factMonthsErr } = await authz.serviceClient
    .from('sales_category_month_facts')
    .select('month_key')
  if (factMonthsErr) {
    return umagErrorResponse('SUPABASE_SELECT_FAILED', `Не удалось прочитать месяцы: ${factMonthsErr.message}`, 500)
  }
  const allMonths = [...new Set((factMonths || []).map((r: { month_key: string }) => r.month_key))].sort()

  const { data: doneMonths, error: doneErr } = await authz.serviceClient
    .from('sales_month_receipt_facts')
    .select('month_key')
  if (doneErr) {
    return umagErrorResponse('SUPABASE_SELECT_FAILED', `Не удалось прочитать статус чеков: ${doneErr.message}`, 500)
  }
  const done = new Set((doneMonths || []).map((r: { month_key: string }) => r.month_key))

  const MAX_PER_CALL = 60
  const pending = allMonths.filter((m) => !done.has(m)).slice(0, MAX_PER_CALL)

  let filled = 0
  const nowIso = new Date().toISOString()
  for (const monthKey of pending) {
    const { fromTime, toTime } = almatyMonthBoundsMs(monthKey)
    const count = await fetchMonthReceiptCount(storeId, fromTime, toTime)
    if (count instanceof Response) {
      console.warn('umag_sales_sync_receipt_backfill_month_failed', { monthKey })
      continue
    }
    const { error: upsertErr } = await authz.serviceClient
      .from('sales_month_receipt_facts')
      .upsert({ month_key: monthKey, receipt_count: count, synced_at: nowIso }, { onConflict: 'month_key' })
    if (upsertErr) {
      console.warn('umag_sales_sync_receipt_backfill_write_failed', { monthKey, message: upsertErr.message })
      continue
    }
    filled += 1
  }

  return jsonResponse({
    success: true,
    filled,
    remaining: allMonths.length - done.size - filled,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()
  if (req.method !== 'POST') return adminErrorResponse('method_not_allowed', 405)

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const action = asText(body.action) || 'sync_next'
  if (action !== 'sync_next' && action !== 'backfill_receipts') {
    return umagErrorResponse('VALIDATION_ERROR', 'Укажите action: sync_next или backfill_receipts.', 400)
  }

  const authz = await authorizeWorkforceRequest(req, [PERMISSION_SYNC])
  if (authz instanceof Response) return authz

  if (action === 'backfill_receipts') return handleBackfillReceipts(authz)
  return handleSyncNext(authz)
})
