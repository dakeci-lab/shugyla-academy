/**
 * Procurement Planning v1 — Edge invoke + paginated Supabase reads/updates.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { extractFunctionErrorBody, isGenericInvokeErrorMessage } from '../utils/edgeFunctionErrors'
import {
  calcRecommendedQty,
  DEFAULT_NORM_DAYS,
  parseNormDays,
} from '../utils/procurementPlanningMath'

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
    return fail(
      data.code,
      data.message || USER_MESSAGES[data.code] || USER_MESSAGES[PROCUREMENT_PLANNING_ERROR_CODES.UNKNOWN]
    )
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
  const message =
    extracted?.message ||
    (isGenericInvokeErrorMessage(error.message)
      ? USER_MESSAGES[code] || USER_MESSAGES[PROCUREMENT_PLANNING_ERROR_CODES.UNKNOWN]
      : error.message)
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
    normDays: parseNormDays(row.norm_days),
    recommendedQty: finiteNumber(row.recommended_qty, 0),
    finalOrderQty: finiteNumber(row.final_order_qty, 0),
    manualOverride: Boolean(row.manual_override),
    generatedPurchaseOrderId: row.generated_purchase_order_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
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

export async function generateProcurementOrders(snapshotId, expectedDeliveryDate) {
  if (!isSupabaseConfigured() || !supabase) {
    return fail(PROCUREMENT_PLANNING_ERROR_CODES.UNKNOWN, 'Сервер не настроен')
  }
  if (!snapshotId || !expectedDeliveryDate) {
    return fail(PROCUREMENT_PLANNING_ERROR_CODES.VALIDATION)
  }

  try {
    const { data, error } = await supabase.functions.invoke('umag-procurement', {
      body: {
        action: 'generate',
        snapshotId,
        expectedDeliveryDate,
      },
    })
    if (error) return mapInvokeFailure(error, data)
    if (data?.success === true) {
      return {
        success: true,
        alreadyGenerated: Boolean(data.already_generated),
        snapshotId: data.snapshot_id || snapshotId,
        purchaseOrderIds: data.purchase_order_ids || [],
        receivingDocumentIds: data.receiving_document_ids || [],
        ordersCreated: data.orders_created ?? 0,
        skippedNoSupplier: data.skipped_no_supplier ?? 0,
        itemsOrdered: data.items_ordered ?? 0,
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
} = {}) {
  ensureClient()
  if (!snapshotId) return { items: [], totalCount: 0, page, pageSize }

  const from = Math.max(0, (page - 1) * pageSize)
  const to = from + pageSize - 1

  let query = supabase
    .from('procurement_snapshot_items')
    .select('*', { count: 'exact' })
    .eq('snapshot_id', snapshotId)

  const q = sanitizePlanningSearch(search)
  if (q) {
    query = query.or(`product_name.ilike.%${q}%,barcode.ilike.%${q}%`)
  }
  if (categoryName) query = query.eq('category_name', categoryName)
  if (subcategoryName) query = query.eq('subcategory_name', subcategoryName)
  if (platformSupplierId) query = query.eq('platform_supplier_id', platformSupplierId)
  if (warningsOnly) query = query.eq('negative_stock', true)
  if (orderableOnly) query = query.gt('final_order_qty', 0)

  query = query
    .order('category_name', { ascending: true })
    .order('subcategory_name', { ascending: true })
    .order('product_name', { ascending: true })
    .range(from, to)

  const { data, error, count } = await query
  if (error) throw new Error(error.message || 'Не удалось загрузить позиции')

  return {
    items: (data || []).map(normalizeItem),
    totalCount: count ?? 0,
    page,
    pageSize,
  }
}

export async function fetchSnapshotFilterOptions(snapshotId) {
  ensureClient()
  if (!snapshotId) {
    return { categories: [], categorySubcategories: [], suppliers: [] }
  }

  const pageSize = 1000
  const categories = new Set()
  const pairs = new Set()
  const suppliers = new Map()

  for (let from = 0; from < 100_000; from += pageSize) {
    const { data, error } = await supabase
      .from('procurement_snapshot_items')
      .select('category_name, subcategory_name, platform_supplier_id, umag_supplier_name')
      .eq('snapshot_id', snapshotId)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message || 'Не удалось загрузить фильтры')
    for (const row of data || []) {
      const cat = row.category_name || ''
      const sub = row.subcategory_name || ''
      if (cat) categories.add(cat)
      if (cat && sub) pairs.add(`${cat}\u0000${sub}`)
      if (row.platform_supplier_id) {
        suppliers.set(
          row.platform_supplier_id,
          row.umag_supplier_name || row.platform_supplier_id
        )
      }
    }
    if (!data || data.length < pageSize) break
  }

  const categorySubcategories = [...pairs]
    .map((key) => {
      const [categoryName, subcategoryName] = key.split('\u0000')
      return { categoryName, subcategoryName }
    })
    .sort((a, b) => {
      const catCmp = a.categoryName.localeCompare(b.categoryName, 'ru')
      if (catCmp !== 0) return catCmp
      return a.subcategoryName.localeCompare(b.subcategoryName, 'ru')
    })

  return {
    categories: [...categories].sort((a, b) => a.localeCompare(b, 'ru')),
    categorySubcategories,
    suppliers: [...suppliers.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  }
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
