/**
 * Procurement Planning v1 — Edge invoke + paginated Supabase reads/updates.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import {
  extractFunctionErrorBody,
  resolveEdgeFunctionUserMessage,
} from '../utils/edgeFunctionErrors'
import {
  calcRecommendedQty,
  DEFAULT_NORM_DAYS,
  parseNormDays,
} from '../utils/procurementPlanningMath'
import {
  describeSnapshotItemsAbcQuery,
  snapshotItemsPageRange,
} from '../utils/procurementAbc'
import {
  accumulateSnapshotFilterRow,
  createSnapshotFilterAccumulator,
  finalizeSnapshotFilterOptions,
} from '../utils/procurementPlannerUx'
import {
  createEmptyFilterOptions,
  loadSnapshotFilterOptionsCached,
  revalidateSnapshotFilterOptions,
} from './procurementFilterOptionsCache.js'

/** Strip PostgREST .or / filter metacharacters from free-text search. */
export function sanitizePlanningSearch(value) {
  return String(value || '')
    .trim()
    .replace(/[,.()"'\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function nullableFiniteNumber(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function nullableAbcClass(value) {
  const cls = String(value || '').trim().toUpperCase()
  return cls === 'A' || cls === 'B' || cls === 'C' ? cls : null
}

export const PROCUREMENT_PLANNING_ERROR_CODES = {
  VALIDATION: 'VALIDATION_ERROR',
  UMAG_AUTH: 'UMAG_AUTH_FAILED',
  UMAG_NETWORK: 'UMAG_NETWORK_ERROR',
  UMAG_NOT_CONFIGURED: 'UMAG_NOT_CONFIGURED',
  UMAG_TIMEOUT: 'UMAG_TIMEOUT',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  SNAPSHOT_NOT_READY: 'SNAPSHOT_NOT_READY',
  SNAPSHOT_NOT_FOUND: 'SNAPSHOT_NOT_FOUND',
  GENERATE_FAILED: 'GENERATE_FAILED',
  ATTEMPT_CONFLICT: 'ATTEMPT_CONFLICT',
  SYNC_FAILED: 'SYNC_FAILED',
  UNKNOWN: 'UNKNOWN',
}

const USER_MESSAGES = {
  [PROCUREMENT_PLANNING_ERROR_CODES.VALIDATION]: 'Проверьте параметры запроса.',
  [PROCUREMENT_PLANNING_ERROR_CODES.UMAG_AUTH]:
    'Не удалось войти в UMAG. Проверьте логин и пароль интеграции.',
  [PROCUREMENT_PLANNING_ERROR_CODES.UMAG_NETWORK]:
    'Не удалось получить данные из UMAG. Повторите попытку.',
  [PROCUREMENT_PLANNING_ERROR_CODES.UMAG_NOT_CONFIGURED]:
    'Подключение к UMAG ещё не настроено.',
  [PROCUREMENT_PLANNING_ERROR_CODES.UMAG_TIMEOUT]:
    'Превышено время ожидания ответа UMAG. Повторите попытку.',
  [PROCUREMENT_PLANNING_ERROR_CODES.FORBIDDEN]:
    'Недостаточно прав для планирования закупок.',
  [PROCUREMENT_PLANNING_ERROR_CODES.UNAUTHORIZED]: 'Сессия истекла. Войдите снова.',
  [PROCUREMENT_PLANNING_ERROR_CODES.SNAPSHOT_NOT_READY]:
    'Снимок ещё не готов к формированию заказов.',
  [PROCUREMENT_PLANNING_ERROR_CODES.SNAPSHOT_NOT_FOUND]: 'Снимок не найден.',
  [PROCUREMENT_PLANNING_ERROR_CODES.GENERATE_FAILED]:
    'Не удалось сформировать заказы. Повторите попытку.',
  [PROCUREMENT_PLANNING_ERROR_CODES.ATTEMPT_CONFLICT]:
    'Эта попытка уже использовалась с другим составом заказа. Создайте новую попытку.',
  [PROCUREMENT_PLANNING_ERROR_CODES.SYNC_FAILED]:
    'Не удалось синхронизировать остатки и продажи.',
  [PROCUREMENT_PLANNING_ERROR_CODES.UNKNOWN]:
    'Не удалось выполнить операцию планирования. Повторите попытку.',
}

function fail(code, message) {
  return {
    success: false,
    code,
    message: message || USER_MESSAGES[code] || USER_MESSAGES[PROCUREMENT_PLANNING_ERROR_CODES.UNKNOWN],
  }
}

async function mapInvokeFailure(error, data) {
  if (data?.success === false && data?.code) {
    const code = data.code
    const message = resolveEdgeFunctionUserMessage({
      error: null,
      body: data,
      fallback: USER_MESSAGES[code] || USER_MESSAGES[PROCUREMENT_PLANNING_ERROR_CODES.UNKNOWN],
    })
    return fail(code, message)
  }
  if (!error) {
    return fail(PROCUREMENT_PLANNING_ERROR_CODES.UNKNOWN)
  }
  const extracted = await extractFunctionErrorBody(error)
  const code =
    extracted?.code ||
    (error?.context?.status === 401
      ? PROCUREMENT_PLANNING_ERROR_CODES.UNAUTHORIZED
      : error?.context?.status === 403
        ? PROCUREMENT_PLANNING_ERROR_CODES.FORBIDDEN
        : PROCUREMENT_PLANNING_ERROR_CODES.UNKNOWN)
  const message = resolveEdgeFunctionUserMessage({
    error,
    body: extracted,
    fallback: USER_MESSAGES[code] || USER_MESSAGES[PROCUREMENT_PLANNING_ERROR_CODES.UNKNOWN],
  })
  return fail(code, message)
}

function ensureClient() {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Сервер не настроен')
  }
}

function normalizeSnapshot(row) {
  if (!row) return null
  return {
    id: row.id,
    status: row.status,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    syncedAt: row.synced_at,
    generatedAt: row.generated_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    itemCount: row.item_count ?? 0,
    negativeStockCount: row.negative_stock_count ?? 0,
    orderableCount: row.orderable_count ?? 0,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeItem(row) {
  if (!row) return null
  const weekly = Array.isArray(row.weekly_sales)
    ? row.weekly_sales.map((n) => finiteNumber(n, 0))
    : []
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    barcode: row.barcode || '',
    productName: row.product_name || '',
    categoryId: row.category_id,
    categoryName: row.category_name || '',
    subcategoryName: row.subcategory_name || '',
    umagSupplierId: row.umag_supplier_id,
    umagSupplierName: row.umag_supplier_name || '',
    platformSupplierId: row.platform_supplier_id,
    measure: row.measure || '',
    rawStock: finiteNumber(row.raw_stock, 0),
    calculationStock: finiteNumber(row.calculation_stock, 0),
    negativeStock: Boolean(row.negative_stock),
    weeklySales: weekly,
    sales8w: finiteNumber(row.sales_8w, 0),
    avgDaily: finiteNumber(row.avg_daily, 0),
    purchasePrice: finiteNumber(row.purchase_price, 0),
    sellingPrice: finiteNumber(row.selling_price, 0),
    revenue8w: nullableFiniteNumber(row.revenue_8w),
    cogs8w: nullableFiniteNumber(row.cogs_8w),
    profit8w: nullableFiniteNumber(row.profit_8w),
    abcQty: nullableAbcClass(row.abc_qty),
    abcRevenue: nullableAbcClass(row.abc_revenue),
    abcProfit: nullableAbcClass(row.abc_profit),
    normDays: parseNormDays(row.norm_days),
    recommendedQty: finiteNumber(row.recommended_qty, 0),
    finalOrderQty: finiteNumber(row.final_order_qty, 0),
    manualOverride: Boolean(row.manual_override),
    generatedPurchaseOrderId: row.generated_purchase_order_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const COUNTED_ORDER_STATUSES = new Set([
  'draft',
  'formed',
  'sent',
  'awaiting_receiving',
  'partially_received',
  'received',
])

function normalizeHistoryRow(row) {
  const order = row.purchase_orders || {}
  const status = order.status || ''
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id || order.id,
    barcode: row.barcode || '',
    productName: row.product_name || '',
    orderedQty: finiteNumber(row.ordered_qty, 0),
    purchasePrice: finiteNumber(row.purchase_price, 0),
    totalAmount: finiteNumber(row.total_amount, 0),
    createdAt: row.created_at,
    status,
    supplierId: order.supplier_id || null,
    supplierName: order.supplier_name || '',
    attemptKey: order.attempt_key || null,
    expectedDeliveryDate: order.expected_delivery_date || null,
    countsAsOrdered: COUNTED_ORDER_STATUSES.has(status),
  }
}

/**
 * Order journal for one SKU inside a snapshot.
 * Cancelled rows are returned with countsAsOrdered=false so the UI can show
 * history separately from "already ordered" totals.
 */
export async function fetchSnapshotSkuOrderHistory(snapshotId, barcode) {
  ensureClient()
  if (!snapshotId || !barcode) return []

  const { data, error } = await supabase
    .from('purchase_order_items')
    .select(
      [
        'id, purchase_order_id, barcode, product_name, ordered_qty, purchase_price, total_amount, created_at',
        'purchase_orders!inner(id, status, supplier_id, supplier_name, workflow_mode, source_snapshot_id, attempt_key, expected_delivery_date)',
      ].join(', ')
    )
    .eq('barcode', barcode)
    .eq('purchase_orders.source_snapshot_id', snapshotId)
    .eq('purchase_orders.workflow_mode', 'analytics')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Не удалось загрузить историю заказов')
  return (data || []).map(normalizeHistoryRow)
}

/**
 * Fold purchase_order_items rows into per-barcode { qty, documents }.
 * Cancelled (and any status outside COUNTED_ORDER_STATUSES) are ignored.
 */
export function foldCountedSkuOrderAggregates(rows) {
  const totals = new Map()
  for (const row of rows || []) {
    const status = row?.status || row?.purchase_orders?.status || ''
    if (!COUNTED_ORDER_STATUSES.has(status)) continue
    const barcode = String(row?.barcode || '').trim()
    if (!barcode) continue
    let agg = totals.get(barcode)
    if (!agg) {
      agg = { qty: 0, orderIds: new Set() }
      totals.set(barcode, agg)
    }
    agg.qty += finiteNumber(row.ordered_qty ?? row.orderedQty, 0)
    const orderId = row.purchase_order_id || row.purchaseOrderId
    if (orderId) agg.orderIds.add(orderId)
  }
  const result = new Map()
  for (const [barcode, agg] of totals) {
    result.set(barcode, { qty: agg.qty, documents: agg.orderIds.size })
  }
  return result
}

function attachSkuOrderAggregates(items, aggregates) {
  return (items || []).map((item) => {
    if (!item) return item
    const agg = aggregates.get(item.barcode) || { qty: 0, documents: 0 }
    return {
      ...item,
      orderedQtyTotal: agg.qty,
      orderedDocumentCount: agg.documents,
      ordered_qty_total: agg.qty,
      ordered_document_count: agg.documents,
    }
  })
}

/**
 * One batched history query for the barcodes on the current page.
 * Cancelled orders are excluded; draft/active/received count.
 */
export async function fetchSnapshotSkuOrderAggregates(snapshotId, barcodes) {
  ensureClient()
  const unique = [
    ...new Set((barcodes || []).map((b) => String(b || '').trim()).filter(Boolean)),
  ]
  if (!snapshotId || unique.length === 0) return new Map()

  const rows = []
  const chunkSize = 100
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('purchase_order_items')
      .select(
        [
          'barcode, ordered_qty, purchase_order_id',
          'purchase_orders!inner(id, status, workflow_mode, source_snapshot_id)',
        ].join(', ')
      )
      .in('barcode', chunk)
      .eq('purchase_orders.source_snapshot_id', snapshotId)
      .eq('purchase_orders.workflow_mode', 'analytics')
      .neq('purchase_orders.status', 'cancelled')

    if (error) throw new Error(error.message || 'Не удалось загрузить историю заказов')
    rows.push(...(data || []))
  }

  return foldCountedSkuOrderAggregates(rows)
}

/**
 * Barcode + qty for the selected supplier's next order (full snapshot, not one page).
 * Used to compute the attempt fingerprint from the same set the RPC will consume.
 */
export async function fetchSnapshotAttemptItems(snapshotId, supplierId) {
  ensureClient()
  if (!snapshotId || !supplierId) return []

  const { data, error } = await supabase
    .from('procurement_snapshot_items')
    .select('barcode, final_order_qty')
    .eq('snapshot_id', snapshotId)
    .eq('platform_supplier_id', supplierId)
    .gt('final_order_qty', 0)
    .order('barcode', { ascending: true })

  if (error) throw new Error(error.message || 'Не удалось загрузить состав заказа')
  return (data || []).map((row) => ({
    barcode: row.barcode || '',
    qty: finiteNumber(row.final_order_qty, 0),
  }))
}

export async function syncProcurementPlanning() {
  if (!isSupabaseConfigured() || !supabase) {
    return fail(PROCUREMENT_PLANNING_ERROR_CODES.UNKNOWN, 'Сервер не настроен')
  }

  try {
    const { data, error } = await supabase.functions.invoke('umag-procurement', {
      body: { action: 'sync' },
    })
    if (error) return mapInvokeFailure(error, data)
    if (data?.success === true) {
      return {
        success: true,
        snapshotId: data.snapshotId,
        periodFrom: data.periodFrom,
        periodTo: data.periodTo,
        itemCount: data.itemCount,
        negativeStockCount: data.negativeStockCount,
        orderableCount: data.orderableCount,
        syncedAt: data.syncedAt,
      }
    }
    return mapInvokeFailure(null, data)
  } catch (err) {
    return fail(
      PROCUREMENT_PLANNING_ERROR_CODES.UNKNOWN,
      err?.message || USER_MESSAGES[PROCUREMENT_PLANNING_ERROR_CODES.SYNC_FAILED]
    )
  }
}

export async function generateProcurementOrders(
  snapshotId,
  expectedDeliveryDate,
  { supplierId = '', supplierIds = [], attemptKey = '', payloadFingerprint = '' } = {}
) {
  if (!isSupabaseConfigured() || !supabase) {
    return fail(PROCUREMENT_PLANNING_ERROR_CODES.UNKNOWN, 'Сервер не настроен')
  }
  if (!snapshotId || !expectedDeliveryDate) {
    return fail(PROCUREMENT_PLANNING_ERROR_CODES.VALIDATION)
  }
  if (!supplierId && supplierIds.length === 0) {
    return fail(
      PROCUREMENT_PLANNING_ERROR_CODES.VALIDATION,
      'Выберите хотя бы одного поставщика.'
    )
  }
  if (attemptKey && !payloadFingerprint) {
    return fail(
      PROCUREMENT_PLANNING_ERROR_CODES.VALIDATION,
      'Повторное формирование требует отпечаток состава заказа.'
    )
  }

  try {
    const { data, error } = await supabase.functions.invoke('umag-procurement', {
      body: {
        action: 'generate',
        snapshotId,
        expectedDeliveryDate,
        ...(supplierId ? { supplierId } : {}),
        ...(supplierIds.length ? { supplierIds } : {}),
        ...(attemptKey ? { attemptKey, payloadFingerprint } : {}),
      },
    })
    if (error) return mapInvokeFailure(error, data)
    if (data?.success === true) {
      return {
        success: true,
        alreadyGenerated: Boolean(data.already_generated),
        idempotentReplay: Boolean(data.idempotent_replay),
        nothingToOrder: Boolean(data.nothing_to_order),
        snapshotId: data.snapshot_id || snapshotId,
        purchaseOrderIds: data.purchase_order_ids || [],
        receivingDocumentIds: data.receiving_document_ids || [],
        ordersCreated: data.orders_created ?? 0,
        ordersExisting: data.orders_existing ?? 0,
        skippedNoSupplier: data.skipped_no_supplier ?? 0,
        itemsOrdered: data.items_ordered ?? 0,
        snapshotStatus: data.snapshot_status,
        remainingSuppliers: data.remaining_suppliers ?? 0,
        requestedSupplierIds: data.requested_supplier_ids || [],
        attemptKey: data.attempt_key || attemptKey || null,
        payloadFingerprint: data.payload_fingerprint || payloadFingerprint || null,
      }
    }
    return mapInvokeFailure(null, data)
  } catch (err) {
    return fail(
      PROCUREMENT_PLANNING_ERROR_CODES.UNKNOWN,
      err?.message || USER_MESSAGES[PROCUREMENT_PLANNING_ERROR_CODES.GENERATE_FAILED]
    )
  }
}

export async function fetchLatestProcurementSnapshot() {
  ensureClient()
  const { data, error } = await supabase
    .from('procurement_snapshots')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message || 'Не удалось загрузить снимок')
  return normalizeSnapshot(data)
}

export async function fetchProcurementSnapshotById(snapshotId) {
  ensureClient()
  const { data, error } = await supabase
    .from('procurement_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .maybeSingle()
  if (error) throw new Error(error.message || 'Не удалось загрузить снимок')
  return normalizeSnapshot(data)
}

/**
 * Server-side paginated items with filters.
 * @returns {{ items, totalCount, page, pageSize }}
 */
export async function fetchSnapshotItemsPage({
  snapshotId,
  page = 1,
  pageSize = 50,
  search = '',
  categoryName = '',
  subcategoryName = '',
  platformSupplierId = '',
  warningsOnly = false,
  orderableOnly = false,
  unassignedOnly = false,
  abcQty = [],
  abcRevenue = [],
  abcProfit = [],
  sortField = '',
  sortDir = 'asc',
} = {}) {
  ensureClient()
  if (!snapshotId) return { items: [], totalCount: 0, page, pageSize }

  const range = snapshotItemsPageRange(page, pageSize)

  let query = supabase
    .from('procurement_snapshot_items')
    .select('*', { count: 'exact' })

  query = applySnapshotItemsPageQuery(query, {
    snapshotId,
    search,
    categoryName,
    subcategoryName,
    platformSupplierId,
    warningsOnly,
    orderableOnly,
    unassignedOnly,
    abcQty,
    abcRevenue,
    abcProfit,
    sortField,
    sortDir,
  })

  query = query.range(range.from, range.to)

  const { data, error, count } = await query
  if (error) throw new Error(error.message || 'Не удалось загрузить позиции')

  const items = (data || []).map(normalizeItem)
  const aggregates = await fetchSnapshotSkuOrderAggregates(
    snapshotId,
    items.map((item) => item?.barcode)
  )

  return {
    items: attachSkuOrderAggregates(items, aggregates),
    totalCount: count ?? 0,
    page,
    pageSize,
  }
}

/**
 * Apply whitelisted filters/sort. ABC: OR inside an axis, AND across axes.
 * Unknown sort fields fall back to the default category/subcategory/name order.
 */
export function applySnapshotItemsPageQuery(query, {
  snapshotId,
  search = '',
  categoryName = '',
  subcategoryName = '',
  platformSupplierId = '',
  warningsOnly = false,
  orderableOnly = false,
  unassignedOnly = false,
  abcQty = [],
  abcRevenue = [],
  abcProfit = [],
  sortField = '',
  sortDir = 'asc',
} = {}) {
  query = query.eq('snapshot_id', snapshotId)

  const q = sanitizePlanningSearch(search)
  if (q) {
    query = query.or(`product_name.ilike.%${q}%,barcode.ilike.%${q}%`)
  }
  if (categoryName) query = query.eq('category_name', categoryName)
  if (subcategoryName) query = query.eq('subcategory_name', subcategoryName)
  if (platformSupplierId) query = query.eq('platform_supplier_id', platformSupplierId)
  if (unassignedOnly) query = query.is('platform_supplier_id', null)
  if (warningsOnly) query = query.eq('negative_stock', true)
  if (orderableOnly) query = query.gt('final_order_qty', 0)

  const abcQuery = describeSnapshotItemsAbcQuery({
    abcQty,
    abcRevenue,
    abcProfit,
    sortField,
    sortDir,
  })
  for (const filter of abcQuery.inFilters) {
    query = query.in(filter.column, filter.values)
  }
  for (const order of abcQuery.orders) {
    query = query.order(order.field, {
      ascending: order.ascending,
      ...(order.nullsFirst === false ? { nullsFirst: false } : {}),
    })
  }

  return query
}

/** Full paginated scan of snapshot filter aggregates (no cache). */
export async function scanSnapshotFilterOptions(snapshotId) {
  ensureClient()
  if (!snapshotId) return createEmptyFilterOptions()

  const pageSize = 1000
  const state = createSnapshotFilterAccumulator()

  for (let from = 0; from < 100_000; from += pageSize) {
    const { data, error } = await supabase
      .from('procurement_snapshot_items')
      .select(
        'category_name, subcategory_name, platform_supplier_id, umag_supplier_name, final_order_qty, generated_purchase_order_id'
      )
      .eq('snapshot_id', snapshotId)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message || 'Не удалось загрузить фильтры')
    for (const row of data || []) {
      accumulateSnapshotFilterRow(row, state)
    }
    if (!data || data.length < pageSize) break
  }

  return finalizeSnapshotFilterOptions(state)
}

/**
 * Filter options for a snapshot with freshness tiers (fresh / SWR / forced).
 */
export async function fetchSnapshotFilterOptions(
  snapshotId,
  {
    forceRefresh = false,
    onCached = null,
    onFresh = null,
    scan = scanSnapshotFilterOptions,
  } = {}
) {
  if (!snapshotId) return createEmptyFilterOptions()

  const result = await loadSnapshotFilterOptionsCached(snapshotId, scan, {
    forceRefresh,
    onCached,
  })

  if (result.fromCache && result.refreshPromise) {
    void result.refreshPromise
      .then((fresh) => {
        onFresh?.(fresh)
      })
      .catch(() => {})
    return result.options
  }

  if (result.fromCache) {
    // Fresh cache (< REVALIDATE_AFTER): already delivered via onCached, no scan.
    return result.options
  }

  onFresh?.(result.options)
  return result.options
}

/** Force a fresh scan and cache write (sync/generate). */
export async function revalidateSnapshotFilterOptionsCache(
  snapshotId,
  { scan = scanSnapshotFilterOptions } = {}
) {
  if (!snapshotId) return createEmptyFilterOptions()
  return revalidateSnapshotFilterOptions(snapshotId, scan)
}

/** Direct client UPDATE is limited to final qty / override (column grants). */
export async function updateSnapshotItemPlanning(itemId, patch) {
  ensureClient()
  const row = {}
  if (patch.finalOrderQty != null) row.final_order_qty = patch.finalOrderQty
  if (patch.manualOverride != null) row.manual_override = patch.manualOverride
  row.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('procurement_snapshot_items')
    .update(row)
    .eq('id', itemId)
    .select('*')
    .single()
  if (error) throw new Error(error.message || 'Не удалось сохранить позицию')
  return normalizeItem(data)
}

export async function updateItemFinalOrderQty(item, nextQty) {
  const qty = Math.max(0, finiteNumber(nextQty, 0))
  const recommended = finiteNumber(item.recommendedQty, 0)
  return updateSnapshotItemPlanning(item.id, {
    finalOrderQty: qty,
    manualOverride: qty !== recommended,
  })
}

export async function resetItemToRecommendation(item) {
  return updateSnapshotItemPlanning(item.id, {
    finalOrderQty: finiteNumber(item.recommendedQty, 0),
    manualOverride: false,
  })
}

/**
 * Persist norm via Edge action set_norm → service_role RPC.
 * Preserves final_order_qty when manual_override=true.
 */
export async function persistNormDaysForScope({
  snapshotId,
  categoryName,
  subcategoryName = '',
  normDays,
  itemId = null,
}) {
  ensureClient()
  const days = parseNormDays(normDays, DEFAULT_NORM_DAYS)

  const { data, error } = await supabase.functions.invoke('umag-procurement', {
    body: {
      action: 'set_norm',
      snapshotId,
      categoryName: categoryName || '',
      subcategoryName: subcategoryName || '',
      normDays: days,
    },
  })
  if (error) {
    const mapped = await mapInvokeFailure(error, data)
    throw new Error(mapped.message || 'Не удалось сохранить норму')
  }
  if (data?.success === false) {
    throw new Error(data.message || 'Не удалось сохранить норму')
  }

  if (itemId) {
    const { data: itemRow, error: itemErr } = await supabase
      .from('procurement_snapshot_items')
      .select('*')
      .eq('id', itemId)
      .maybeSingle()
    if (itemErr) throw new Error(itemErr.message || 'Не удалось загрузить позицию')
    return normalizeItem(itemRow)
  }
  return { success: true, ...(data || {}), normDays: days }
}

export async function exportSnapshotItemsCsv(snapshotId, filters = {}) {
  ensureClient()
  const pageSize = 1000
  const rows = []
  for (let page = 1; page < 200; page += 1) {
    const result = await fetchSnapshotItemsPage({
      snapshotId,
      page,
      pageSize,
      ...filters,
    })
    rows.push(...result.items)
    if (rows.length >= result.totalCount) break
  }
  return rows
}

export function recalculateRecommendationLocal(item, normDays) {
  return calcRecommendedQty(item.avgDaily, normDays, item.calculationStock)
}

export { USER_MESSAGES as PROCUREMENT_PLANNING_USER_MESSAGES }
