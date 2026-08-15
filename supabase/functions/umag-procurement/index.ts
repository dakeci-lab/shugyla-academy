/**
 * umag-procurement — UMAG stock + 8-week sales → procurement planning snapshot.
 *
 * Actions:
 * - sync: create immutable facts snapshot (requires procurement.edit)
 * - generate: create analytics purchase_orders + receiving_documents from current
 *             snapshot qty. Same attempt_key is idempotent; a new key creates a
 *             new order after the buyer enters qty again.
 *             (requires procurement.create AND procurement.transfer)
 *
 * Never writes back to UMAG. Never returns UMAG secrets to the client.
 */

import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import {
  adminErrorResponse,
  authorizeWorkforceRequest,
} from '../_shared/employeeAuthorization.ts'
import { maskStoreId } from '../_shared/umagConfig.ts'
import {
  acquireUmagSession,
  umagFetchAuthed,
} from '../_shared/umagAuth.ts'
import {
  accumulateSalesRows,
  assignSnapshotAbcClasses,
  mergeWeekSalesIntoSnapshot,
  roundMoney,
  shouldIncludeSnapshotBarcode,
} from './abcClassification.js'

const PERMISSION_EDIT = 'procurement.edit'
const PERMISSION_CREATE = 'procurement.create'
const PERMISSION_TRANSFER = 'procurement.transfer'

const STOCK_PATH = '/rest/cabinet/opr/stock/find'
const SALES_PATH = '/rest/cabinet/report/list-product-report'
const PAGE_SIZE = 50_000
const DEFAULT_NORM_DAYS = 14
const INSERT_CHUNK = 400
const UMAG_FETCH_TIMEOUT_MS = 120_000
const ALMATY_TZ = 'Asia/Almaty'
const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_GENERATE_SUPPLIERS = 500

type NormRule = {
  category_name: string
  subcategory_name: string
  norm_days: number
}

type StockRow = {
  barcode?: string | null
  name?: string | null
  fullName?: string | null
  stockQuantity?: number | string | null
  categoryId?: number | string | null
  categoryName?: string | null
  subCategoryName?: string | null
  supplierId?: number | string | null
  supplierName?: string | null
  measureUnit?: string | null
  measureUnitCode?: string | null
  productDetails?: {
    arrivalCost?: number | string | null
    sellingPrice?: number | string | null
  } | null
}

type SalesRow = {
  barcode?: string | null
  productName?: string | null
  productFullName?: string | null
  measure?: string | null
  saleQuantity?: number | string | null
  saleArrivalAmount?: number | string | null
  saleSellingAmount?: number | string | null
  stockQuantity?: number | string | null
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
  return umagErrorResponse(
    'UMAG_NETWORK_ERROR',
    'Не удалось связаться с UMAG. Повторите попытку.',
    502
  )
}

function mapUmagHttpError(status: number): Response {
  if (status === 401 || status === 403) return mapUmagAuthError('UMAG_AUTH_FAILED')
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

function almatyDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ALMATY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${d}`
}

function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d) + deltaDays * 86_400_000
  const next = new Date(utc)
  const yy = next.getUTCFullYear()
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(next.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Inclusive day bounds in Asia/Almaty as Unix ms for UMAG fromTime/toTime. */
function almatyDayBoundsMs(dateKey: string): { fromTime: number; toTime: number } {
  const [y, m, d] = dateKey.split('-').map(Number)
  const fromTime = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - ALMATY_OFFSET_MS
  const toTime = Date.UTC(y, m - 1, d, 23, 59, 59, 999) - ALMATY_OFFSET_MS
  return { fromTime, toTime }
}

/** 8 weekly windows ending today (Almaty). Index 0 = oldest, 7 = newest. */
export function buildEightWeekRanges(reference = new Date()): {
  weeks: Array<{ fromKey: string; toKey: string; fromTime: number; toTime: number }>
  periodFrom: string
  periodTo: string
} {
  const todayKey = almatyDateKey(reference)
  const weeks: Array<{ fromKey: string; toKey: string; fromTime: number; toTime: number }> = []
  for (let i = 7; i >= 0; i -= 1) {
    const toKey = addDaysToDateKey(todayKey, -(i * 7))
    const fromKey = addDaysToDateKey(toKey, -6)
    const fromBounds = almatyDayBoundsMs(fromKey)
    const toBounds = almatyDayBoundsMs(toKey)
    weeks.push({
      fromKey,
      toKey,
      fromTime: fromBounds.fromTime,
      toTime: toBounds.toTime,
    })
  }
  return {
    weeks,
    periodFrom: weeks[0].fromKey,
    periodTo: weeks[7].toKey,
  }
}

export function calcAvgDaily(weeklySales: number[]): number {
  const sum = weeklySales.reduce((acc, n) => acc + (Number.isFinite(n) ? n : 0), 0)
  return sum / 56
}

export function calcCalculationStock(rawStock: number): number {
  return Math.max(0, Number.isFinite(rawStock) ? rawStock : 0)
}

export function calcRecommendedQty(
  avgDaily: number,
  normDays: number,
  calculationStock: number
): number {
  const raw = avgDaily * normDays - calculationStock
  return Math.max(0, Math.round(raw))
}

function parseNormDays(value: unknown, fallback = DEFAULT_NORM_DAYS): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.round(n)
}

function resolveNormDays(
  categoryName: string,
  subcategoryName: string,
  rules: NormRule[]
): number {
  const cat = categoryName || ''
  const sub = subcategoryName || ''
  if (sub) {
    const subRule = rules.find(
      (r) => r.category_name === cat && r.subcategory_name === sub
    )
    if (subRule) return parseNormDays(subRule.norm_days)
  }
  const catRule = rules.find(
    (r) => r.category_name === cat && (!r.subcategory_name || r.subcategory_name === '')
  )
  if (catRule) return parseNormDays(catRule.norm_days)
  return DEFAULT_NORM_DAYS
}

async function fetchCallerDisplayName(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  employeeId: number
): Promise<string> {
  const { data } = await serviceClient
    .from('academy_users')
    .select('full_name, first_name, last_name')
    .eq('id', employeeId)
    .maybeSingle()
  const full = asText(data?.full_name)
  if (full) return full
  return [data?.first_name, data?.last_name].filter(Boolean).join(' ').trim()
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

async function fetchAllStock(storeId: string): Promise<StockRow[] | Response> {
  const page = await fetchUmagListPage(STOCK_PATH, {
    first: 0,
    pageSize: PAGE_SIZE,
    includeNonZero: false,
    sortField: 'quantity',
    sortType: 'desc',
    storeId,
  })
  if (page instanceof Response) return page
  return page.rows as StockRow[]
}

async function fetchWeekSales(
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

async function handleSync(
  authz: Exclude<Awaited<ReturnType<typeof authorizeWorkforceRequest>>, Response>
): Promise<Response> {
  if (authz.permissions[PERMISSION_EDIT] !== true) {
    return adminErrorResponse('forbidden', 403)
  }

  const session = await acquireUmagSession()
  if ('error' in session) return mapUmagAuthError(session.error)

  const storeId = session.storeId
  console.log('umag_procurement_sync_start', { storeId: maskStoreId(storeId) })

  const { weeks, periodFrom, periodTo } = buildEightWeekRanges()
  const createdBy = String(authz.caller.id)
  const createdByName = await fetchCallerDisplayName(authz.serviceClient, authz.caller.id)

  const { data: snapshot, error: snapErr } = await authz.serviceClient
    .from('procurement_snapshots')
    .insert({
      status: 'syncing',
      period_from: periodFrom,
      period_to: periodTo,
      created_by: createdBy,
      created_by_name: createdByName || null,
    })
    .select('id')
    .single()

  if (snapErr || !snapshot?.id) {
    console.error('umag_procurement_snapshot_create_failed', {
      message: snapErr?.message,
      code: snapErr?.code,
    })
    return umagErrorResponse(
      'SNAPSHOT_CREATE_FAILED',
      'Не удалось создать снимок планирования.',
      500
    )
  }

  const snapshotId = snapshot.id as string

  try {
    const [stockResult, rulesResult, suppliersResult] = await Promise.all([
      fetchAllStock(storeId),
      authz.serviceClient
        .from('procurement_norm_rules')
        .select('category_name, subcategory_name, norm_days'),
      authz.serviceClient
        .from('platform_suppliers')
        .select('id, umag_supplier_id')
        .not('umag_supplier_id', 'is', null),
    ])

    if (stockResult instanceof Response) {
      await markSnapshotFailed(authz.serviceClient, snapshotId, 'UMAG stock fetch failed')
      return stockResult
    }

    const weeklySalesByBarcode = new Map<string, number[]>()
    const moneyByBarcode = new Map<string, { revenue: number; cogs: number }>()
    const salesMetaByBarcode = new Map<
      string,
      { productName: string; measure: string }
    >()

    for (let weekIndex = 0; weekIndex < weeks.length; weekIndex += 1) {
      const week = weeks[weekIndex]
      const sales = await fetchWeekSales(storeId, week.fromTime, week.toTime)
      if (sales instanceof Response) {
        await markSnapshotFailed(authz.serviceClient, snapshotId, 'UMAG sales fetch failed')
        return sales
      }

      const { totals: weekTotals, meta: weekMeta } = accumulateSalesRows(sales)
      for (const [barcode, meta] of weekMeta) {
        if (!salesMetaByBarcode.has(barcode)) {
          salesMetaByBarcode.set(barcode, meta)
        }
      }

      mergeWeekSalesIntoSnapshot({
        weeklySalesByBarcode,
        moneyByBarcode,
        weekTotals,
        weekIndex,
      })
    }

    const supplierByUmagId = new Map<number, string>()
    for (const row of suppliersResult.data || []) {
      const umagId = Number(row.umag_supplier_id)
      if (Number.isFinite(umagId) && row.id) {
        supplierByUmagId.set(umagId, row.id as string)
      }
    }

    const rules = (rulesResult.data || []) as NormRule[]
    const stockByBarcode = new Map<string, StockRow>()
    for (const row of stockResult) {
      const barcode = asBarcode(row.barcode)
      if (!barcode) continue
      stockByBarcode.set(barcode, row)
    }

    const barcodeSet = new Set<string>()
    const candidateBarcodes = new Set<string>([
      ...stockByBarcode.keys(),
      ...weeklySalesByBarcode.keys(),
      ...moneyByBarcode.keys(),
    ])
    for (const barcode of candidateBarcodes) {
      const stock = asNumber(stockByBarcode.get(barcode)?.stockQuantity, 0)
      const weekly = weeklySalesByBarcode.get(barcode) || []
      const sales8w = weekly.reduce((a, b) => a + b, 0)
      const money = moneyByBarcode.get(barcode) || { revenue: 0, cogs: 0 }
      if (
        shouldIncludeSnapshotBarcode({
          stock,
          sales8w,
          revenue: money.revenue,
          cogs: money.cogs,
          profit: money.revenue - money.cogs,
        })
      ) {
        barcodeSet.add(barcode)
      }
    }

    const nowIso = new Date().toISOString()
    const draftItems: Record<string, unknown>[] = []
    let negativeStockCount = 0
    let orderableCount = 0

    for (const barcode of barcodeSet) {
      const stock = stockByBarcode.get(barcode)
      const weekly = weeklySalesByBarcode.get(barcode) || Array.from({ length: 8 }, () => 0)
      const salesMeta = salesMetaByBarcode.get(barcode)
      const rawStock = asNumber(stock?.stockQuantity, 0)
      const negativeStock = rawStock < 0
      if (negativeStock) negativeStockCount += 1
      const calculationStock = calcCalculationStock(rawStock)
      const sales8w = weekly.reduce((a, b) => a + b, 0)
      const avgDaily = calcAvgDaily(weekly)
      const categoryName = asText(stock?.categoryName)
      const subcategoryName = asText(stock?.subCategoryName)
      const normDays = resolveNormDays(categoryName, subcategoryName, rules)
      const recommendedQty = calcRecommendedQty(avgDaily, normDays, calculationStock)
      const umagSupplierIdRaw = stock?.supplierId
      const umagSupplierId =
        umagSupplierIdRaw == null || umagSupplierIdRaw === ''
          ? null
          : Number(umagSupplierIdRaw)
      const platformSupplierId =
        umagSupplierId != null && Number.isFinite(umagSupplierId)
          ? supplierByUmagId.get(umagSupplierId) || null
          : null

      if (recommendedQty > 0) orderableCount += 1

      const money = moneyByBarcode.get(barcode) || { revenue: 0, cogs: 0 }
      const revenue8w = roundMoney(money.revenue)
      const cogs8w = roundMoney(money.cogs)
      const profit8w = roundMoney(revenue8w - cogs8w)

      draftItems.push({
        snapshot_id: snapshotId,
        barcode,
        product_name:
          asText(stock?.fullName) ||
          asText(stock?.name) ||
          salesMeta?.productName ||
          barcode,
        category_id:
          stock?.categoryId == null || stock.categoryId === ''
            ? null
            : String(stock.categoryId),
        category_name: categoryName,
        subcategory_name: subcategoryName,
        umag_supplier_id:
          umagSupplierId != null && Number.isFinite(umagSupplierId)
            ? umagSupplierId
            : null,
        umag_supplier_name: asText(stock?.supplierName),
        platform_supplier_id: platformSupplierId,
        measure:
          asText(stock?.measureUnit) ||
          asText(stock?.measureUnitCode) ||
          salesMeta?.measure ||
          '',
        raw_stock: rawStock,
        calculation_stock: calculationStock,
        negative_stock: negativeStock,
        weekly_sales: weekly,
        sales_8w: sales8w,
        avg_daily: avgDaily,
        purchase_price: asNumber(stock?.productDetails?.arrivalCost, 0),
        selling_price: asNumber(stock?.productDetails?.sellingPrice, 0),
        revenue_8w: revenue8w,
        cogs_8w: cogs8w,
        profit_8w: profit8w,
        norm_days: normDays,
        recommended_qty: recommendedQty,
        final_order_qty: recommendedQty,
        manual_override: false,
        created_at: nowIso,
        updated_at: nowIso,
      })
    }

    const abcByBarcode = assignSnapshotAbcClasses(draftItems)
    const items = draftItems.map((item) => {
      const abc = abcByBarcode.get(String(item.barcode || '')) || {
        abc_qty: null,
        abc_revenue: null,
        abc_profit: null,
      }
      return {
        ...item,
        abc_qty: abc.abc_qty,
        abc_revenue: abc.abc_revenue,
        abc_profit: abc.abc_profit,
      }
    })

    for (let i = 0; i < items.length; i += INSERT_CHUNK) {
      const chunk = items.slice(i, i + INSERT_CHUNK)
      const { error: insertErr } = await authz.serviceClient
        .from('procurement_snapshot_items')
        .insert(chunk)
      if (insertErr) {
        console.error('umag_procurement_items_insert_failed', {
          message: insertErr.message,
          code: insertErr.code,
          chunkStart: i,
        })
        await markSnapshotFailed(
          authz.serviceClient,
          snapshotId,
          'Failed to insert snapshot items'
        )
        return umagErrorResponse(
          'SNAPSHOT_ITEMS_FAILED',
          'Не удалось сохранить позиции снимка.',
          500
        )
      }
    }

    const { error: readyErr } = await authz.serviceClient
      .from('procurement_snapshots')
      .update({
        status: 'ready',
        synced_at: nowIso,
        item_count: items.length,
        negative_stock_count: negativeStockCount,
        orderable_count: orderableCount,
        error: null,
        updated_at: nowIso,
      })
      .eq('id', snapshotId)

    if (readyErr) {
      console.error('umag_procurement_mark_ready_failed', { message: readyErr.message })
      return umagErrorResponse(
        'SNAPSHOT_READY_FAILED',
        'Снимок создан, но не удалось отметить как готовый.',
        500
      )
    }

    console.log('umag_procurement_sync_ok', {
      storeId: maskStoreId(storeId),
      snapshotId,
      itemCount: items.length,
      negativeStockCount,
      orderableCount,
    })

    return jsonResponse({
      success: true,
      action: 'sync',
      snapshotId,
      periodFrom,
      periodTo,
      itemCount: items.length,
      negativeStockCount,
      orderableCount,
      syncedAt: nowIso,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.error('umag_procurement_sync_exception', { message })
    await markSnapshotFailed(authz.serviceClient, snapshotId, message)
    return umagErrorResponse(
      'SYNC_FAILED',
      'Синхронизация планирования завершилась с ошибкой.',
      500
    )
  }
}

async function markSnapshotFailed(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  snapshotId: string,
  error: string
) {
  await serviceClient
    .from('procurement_snapshots')
    .update({
      status: 'failed',
      error: error.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', snapshotId)
}

async function handleGenerate(
  authz: Exclude<Awaited<ReturnType<typeof authorizeWorkforceRequest>>, Response>,
  body: Record<string, unknown>
): Promise<Response> {
  if (
    authz.permissions[PERMISSION_CREATE] !== true ||
    authz.permissions[PERMISSION_TRANSFER] !== true
  ) {
    return adminErrorResponse('forbidden', 403)
  }

  const snapshotId = asText(body.snapshotId)
  const expectedDeliveryDate = asText(body.expectedDeliveryDate)
  if (!snapshotId) {
    return umagErrorResponse('VALIDATION_ERROR', 'Укажите snapshotId.', 400)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDeliveryDate)) {
    return umagErrorResponse(
      'VALIDATION_ERROR',
      'Укажите корректную дату поставки (YYYY-MM-DD).',
      400
    )
  }

  const singularSupplierId = asText(body.supplierId)
  const hasSupplierIds = body.supplierIds !== undefined && body.supplierIds !== null
  if (hasSupplierIds && !Array.isArray(body.supplierIds)) {
    return umagErrorResponse(
      'VALIDATION_ERROR',
      'supplierIds должен быть списком идентификаторов поставщиков.',
      400
    )
  }

  const supplierIds = Array.from(
    new Set([
      ...(singularSupplierId ? [singularSupplierId] : []),
      ...((Array.isArray(body.supplierIds) ? body.supplierIds : [])
        .map((value) => asText(value))
        .filter(Boolean)),
    ])
  )

  if (supplierIds.length === 0) {
    return umagErrorResponse(
      'VALIDATION_ERROR',
      'Выберите хотя бы одного поставщика.',
      400
    )
  }
  if (supplierIds.length > MAX_GENERATE_SUPPLIERS) {
    return umagErrorResponse(
      'VALIDATION_ERROR',
      `За один раз можно сформировать не более ${MAX_GENERATE_SUPPLIERS} поставщиков.`,
      400
    )
  }
  if (supplierIds.some((supplierId) => !UUID_PATTERN.test(supplierId))) {
    return umagErrorResponse(
      'VALIDATION_ERROR',
      'Некорректный идентификатор поставщика.',
      400
    )
  }

  const attemptKey = asText(body.attemptKey || body.attempt_key)
  if (attemptKey && !UUID_PATTERN.test(attemptKey)) {
    return umagErrorResponse(
      'VALIDATION_ERROR',
      'Некорректный идентификатор попытки формирования заказа.',
      400
    )
  }
  if (attemptKey && supplierIds.length !== 1) {
    return umagErrorResponse(
      'VALIDATION_ERROR',
      'Повторное формирование с ключом попытки возможно только для одного поставщика.',
      400
    )
  }

  const payloadFingerprintRaw = asText(
    body.payloadFingerprint || body.payload_fingerprint
  )
  const payloadFingerprint = payloadFingerprintRaw ? payloadFingerprintRaw.trim() : ''
  if (attemptKey && !payloadFingerprint) {
    return umagErrorResponse(
      'VALIDATION_ERROR',
      'Повторное формирование требует отпечаток состава заказа.',
      400
    )
  }
  if (
    payloadFingerprint &&
    (!payloadFingerprint.startsWith('shugyla.procurement.attempt.fp.v1\n') ||
      payloadFingerprint.length > 100_000)
  ) {
    return umagErrorResponse(
      'VALIDATION_ERROR',
      'Некорректный отпечаток содержимого попытки.',
      400
    )
  }

  const createdBy = String(authz.caller.id)
  const createdByName = await fetchCallerDisplayName(authz.serviceClient, authz.caller.id)

  const { data, error } = await authz.serviceClient.rpc(
    'generate_procurement_orders_from_snapshot',
    {
      p_snapshot_id: snapshotId,
      p_expected_delivery_date: expectedDeliveryDate,
      p_supplier_ids: supplierIds,
      p_created_by: createdBy,
      p_created_by_name: createdByName || null,
      p_attempt_key: attemptKey || null,
      p_payload_fingerprint: payloadFingerprint || null,
    }
  )

  if (error) {
    console.error('umag_procurement_generate_rpc_failed', {
      message: error.message,
      code: error.code,
    })
    const msg = error.message || ''
    if (msg.includes('snapshot is not available for generation')) {
      return umagErrorResponse(
        'SNAPSHOT_NOT_READY',
        'Снимок сейчас недоступен для формирования заказов.',
        409
      )
    }
    if (msg.includes('snapshot not found')) {
      return umagErrorResponse('SNAPSHOT_NOT_FOUND', 'Снимок не найден.', 404)
    }
    if (msg.includes('supplier selection is required')) {
      return umagErrorResponse(
        'VALIDATION_ERROR',
        'Выберите хотя бы одного поставщика.',
        400
      )
    }
    if (msg.includes('attempt_key requires a single supplier')) {
      return umagErrorResponse(
        'VALIDATION_ERROR',
        'Повторное формирование с ключом попытки возможно только для одного поставщика.',
        400
      )
    }
    if (msg.includes('attempt_key requires payload fingerprint')) {
      return umagErrorResponse(
        'VALIDATION_ERROR',
        'Повторное формирование требует отпечаток состава заказа.',
        400
      )
    }
    if (msg.includes('attempt_key payload conflict')) {
      return umagErrorResponse(
        'ATTEMPT_CONFLICT',
        'Эта попытка уже использовалась с другим составом заказа. Создайте новую попытку.',
        409
      )
    }
    if (msg.includes('cannot create an order without items')) {
      return umagErrorResponse(
        'GENERATE_FAILED',
        'Нельзя сформировать заказ без позиций. Укажите количество и повторите.',
        409
      )
    }
    return umagErrorResponse(
      'GENERATE_FAILED',
      'Не удалось сформировать заказы из снимка.',
      500
    )
  }

  const result = (data || {}) as Record<string, unknown>
  return jsonResponse({
    success: true,
    action: 'generate',
    ...result,
  })
}

async function handleSetNorm(
  authz: Exclude<Awaited<ReturnType<typeof authorizeWorkforceRequest>>, Response>,
  body: Record<string, unknown>
): Promise<Response> {
  if (authz.permissions[PERMISSION_EDIT] !== true) {
    return adminErrorResponse('forbidden', 403)
  }

  const snapshotId = asText(body.snapshotId)
  if (!snapshotId) {
    return umagErrorResponse('VALIDATION_ERROR', 'Укажите snapshotId.', 400)
  }

  const categoryName = typeof body.categoryName === 'string' ? body.categoryName : ''
  const subcategoryName =
    typeof body.subcategoryName === 'string' ? body.subcategoryName : ''

  const normRaw = body.normDays
  const normDays =
    typeof normRaw === 'number'
      ? normRaw
      : typeof normRaw === 'string' && normRaw.trim() !== ''
        ? Number(normRaw)
        : NaN
  if (!Number.isInteger(normDays) || normDays < 0) {
    return umagErrorResponse(
      'VALIDATION_ERROR',
      'normDays должен быть целым числом ≥ 0.',
      400
    )
  }

  const updatedBy = String(authz.caller.id)
  const updatedByName = await fetchCallerDisplayName(authz.serviceClient, authz.caller.id)

  const { data, error } = await authz.serviceClient.rpc(
    'set_procurement_norm_rule_for_snapshot',
    {
      p_snapshot_id: snapshotId,
      p_category_name: categoryName,
      p_subcategory_name: subcategoryName,
      p_norm_days: normDays,
      p_updated_by: updatedBy,
      p_updated_by_name: updatedByName || null,
    }
  )

  if (error) {
    console.error('umag_procurement_set_norm_rpc_failed', {
      message: error.message,
      code: error.code,
    })
    const msg = error.message || ''
    if (msg.includes('snapshot must be ready')) {
      return umagErrorResponse(
        'SNAPSHOT_NOT_READY',
        'Снимок ещё не готов к изменению норм.',
        409
      )
    }
    if (msg.includes('snapshot not found')) {
      return umagErrorResponse('SNAPSHOT_NOT_FOUND', 'Снимок не найден.', 404)
    }
    return umagErrorResponse(
      'SET_NORM_FAILED',
      'Не удалось сохранить норму планирования.',
      500
    )
  }

  const result = (data || {}) as Record<string, unknown>
  return jsonResponse({
    success: true,
    action: 'set_norm',
    ...result,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()
  if (req.method !== 'POST') return adminErrorResponse('method_not_allowed', 405)

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return umagErrorResponse('VALIDATION_ERROR', 'Некорректный JSON в теле запроса.', 400)
  }

  const action = asText(body.action)
  if (action !== 'sync' && action !== 'generate' && action !== 'set_norm') {
    return umagErrorResponse(
      'VALIDATION_ERROR',
      'Укажите action: sync, generate или set_norm.',
      400
    )
  }

  const needed =
    action === 'generate'
      ? [PERMISSION_CREATE, PERMISSION_TRANSFER]
      : [PERMISSION_EDIT]

  const authz = await authorizeWorkforceRequest(req, needed)
  if (authz instanceof Response) return authz

  if (action === 'sync') return handleSync(authz)
  if (action === 'set_norm') return handleSetNorm(authz, body)
  return handleGenerate(authz, body)
})
