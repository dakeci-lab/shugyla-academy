import { supabase } from '../lib/supabaseClient'
import {
  normalizePurchaseOrder,
  normalizePurchaseItem,
  calcLineTotal,
  PURCHASE_STATUS,
  PROCUREMENT_WORKFLOW_MODE,
} from '../utils/purchaseData'

import { throwUserError, toUserErrorMessage } from '../utils/userErrorMessage'
import { toProcurementUserMessage } from '../utils/procurementErrors'

function throwIfError(result, context, fallback = 'Не удалось сохранить закупку.') {
  return throwUserError(result, context, fallback)
}

function ensureClient() {
  if (!supabase) throw new Error(toUserErrorMessage('Supabase не настроен', 'Сервер не настроен'))
}

/** DB row → доменная модель заказа */
function rowToOrder(row, items = []) {
  return normalizePurchaseOrder({
    id: row.id,
    number: row.number,
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name,
    status: row.status,
    purchase_date: row.purchase_date,
    expected_delivery_date: row.expected_delivery_date,
    total_amount: row.total_amount,
    items_count: row.items_count,
    created_by: row.created_by,
    created_by_name: row.created_by_name,
    comment: row.comment,
    checked_at: row.checked_at,
    checked_by_name: row.checked_by_name,
    workflow_mode: row.workflow_mode,
    created_at: row.created_at,
    updated_at: row.updated_at,
    items: items.map(rowToItem),
  })
}

/** Доменная модель заказа → DB row */
function orderToRow(order, extras = {}) {
  const purchaseDate =
    order.purchaseDate ?? order.date ?? extras.purchaseDate ?? null

  const row = {
    supplier_id: order.supplierId ?? null,
    supplier_name: (order.supplierName ?? '').trim(),
    status: order.status ?? PURCHASE_STATUS.DRAFT,
    purchase_date: purchaseDate,
    expected_delivery_date: order.expectedDeliveryDate || null,
    total_amount: order.totalAmount ?? 0,
    items_count: order.itemsCount ?? 0,
    created_by: order.createdBy ?? null,
    created_by_name: order.createdByName ?? null,
    comment: (order.comment ?? '').trim(),
    workflow_mode: order.workflowMode ?? PROCUREMENT_WORKFLOW_MODE.ANALYTICS,
  }

  if (extras.id) row.id = extras.id
  if (extras.created_at) row.created_at = extras.created_at
  if (extras.updated_at) row.updated_at = extras.updated_at

  return row
}

/** Частичное обновление заказа → DB row (только переданные поля) */
function orderPatchToRow(patch) {
  const row = {}
  if (patch.supplierId !== undefined) row.supplier_id = patch.supplierId || null
  if (patch.supplierName !== undefined) {
    row.supplier_name = (patch.supplierName ?? '').trim()
  }
  if (patch.status != null) row.status = patch.status
  if (patch.date != null || patch.purchaseDate != null) {
    row.purchase_date = patch.purchaseDate ?? patch.date
  }
  if (patch.expectedDeliveryDate !== undefined) {
    row.expected_delivery_date = patch.expectedDeliveryDate || null
  }
  if (patch.totalAmount != null) row.total_amount = patch.totalAmount
  if (patch.itemsCount != null) row.items_count = patch.itemsCount
  if (patch.createdBy !== undefined) row.created_by = patch.createdBy || null
  if (patch.createdByName !== undefined) {
    row.created_by_name = patch.createdByName || null
  }
  if (patch.comment !== undefined) row.comment = (patch.comment ?? '').trim()
  if (patch.checkedAt !== undefined) row.checked_at = patch.checkedAt || null
  if (patch.checkedByName !== undefined) row.checked_by_name = patch.checkedByName || null
  if (patch.workflowMode !== undefined) {
    row.workflow_mode = patch.workflowMode
  }
  return row
}

/** DB row → доменная модель позиции */
function rowToItem(row) {
  return normalizePurchaseItem({
    id: row.id,
    purchase_order_id: row.purchase_order_id,
    product_name: row.product_name,
    barcode: row.barcode,
    unit: row.unit,
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name,
    stock_qty: row.stock_qty,
    sales_per_day: row.sales_per_day,
    recommended_qty: row.recommended_qty,
    ordered_qty: row.ordered_qty,
    purchase_price: row.purchase_price,
    total_amount: row.total_amount,
    comment: row.comment,
    created_at: row.created_at,
    updated_at: row.updated_at,
  })
}

/** Доменная модель позиции → DB row */
function itemToRow(item, orderId) {
  const orderedQty = item.orderQty ?? item.orderedQty ?? item.ordered_qty ?? 0
  const purchasePrice = item.purchasePrice ?? item.purchase_price ?? 0
  const now = new Date().toISOString()

  const row = {
    id: item.id || crypto.randomUUID(),
    purchase_order_id: orderId,
    product_name: item.productName ?? item.product_name ?? '',
    barcode: item.barcode ?? '',
    unit: item.unit ?? item.measure ?? '',
    supplier_id: item.supplierId ?? item.supplier_id ?? null,
    supplier_name: item.supplierName ?? item.supplier_name ?? '',
    stock_qty: item.stock ?? item.stockQty ?? item.stock_qty ?? 0,
    sales_per_day: item.salesPerDay ?? item.sales_per_day ?? 0,
    recommended_qty: item.recommendation ?? item.recommendedQty ?? item.recommended_qty ?? 0,
    ordered_qty: orderedQty,
    purchase_price: purchasePrice,
    total_amount: calcLineTotal(orderedQty, purchasePrice),
    comment: item.comment ?? '',
    updated_at: now,
  }

  if (item.createdAt || item.created_at) {
    row.created_at = item.createdAt ?? item.created_at
  }

  return row
}

async function recalcOrderTotals(orderId) {
  ensureClient()

  const itemsResult = await supabase
    .from('purchase_order_items')
    .select('total_amount')
    .eq('purchase_order_id', orderId)

  await throwIfError(itemsResult, 'Загрузка позиций закупа')

  const items = itemsResult.data || []
  const totalAmount = items.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)
  const itemsCount = items.length

  await throwIfError(
    await supabase
      .from('purchase_orders')
      .update({
        total_amount: totalAmount,
        items_count: itemsCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId),
    'Пересчёт суммы закупа'
  )

  return { totalAmount, itemsCount }
}

async function fetchOrderById(orderId) {
  ensureClient()

  const orderResult = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle()

  const orderRow = await throwIfError(orderResult, 'Загрузка закупа')
  if (!orderRow) return null

  const itemsResult = await supabase
    .from('purchase_order_items')
    .select('*')
    .eq('purchase_order_id', orderId)
    .order('created_at', { ascending: true })

  const items = await throwIfError(itemsResult, 'Загрузка позиций закупа')
  return rowToOrder(orderRow, items || [])
}

async function syncOrderItems(orderId, items) {
  ensureClient()

  const normalized = (items || []).map((item) => normalizePurchaseItem(item))
  const incomingIds = new Set(normalized.map((item) => item.id).filter(Boolean))

  const existingResult = await supabase
    .from('purchase_order_items')
    .select('id')
    .eq('purchase_order_id', orderId)

  const existing = await throwIfError(existingResult, 'Загрузка позиций для синхронизации')
  const toDelete = (existing || [])
    .filter((row) => !incomingIds.has(row.id))
    .map((row) => row.id)

  if (toDelete.length > 0) {
    await throwIfError(
      await supabase.from('purchase_order_items').delete().in('id', toDelete),
      'Удаление позиций закупа'
    )
  }

  if (normalized.length > 0) {
    const rows = normalized.map((item) => itemToRow(item, orderId))
    await throwIfError(
      await supabase.from('purchase_order_items').upsert(rows),
      'Сохранение позиций закупа'
    )
  }

  return recalcOrderTotals(orderId)
}

/**
 * Список заказов — только заголовки (один запрос). Позиции списку не нужны: ему хватает `items_count`,
 * а карточка заказа догружает свои позиции сама (`fetchOrderById`). Раньше список тянул все ~10 тыс. позиций
 * двумя десятками запросов при каждой загрузке, поэтому «Заказы» открывались заметно дольше.
 */
export async function fetchPurchasesDataCloud() {
  ensureClient()

  const ordersResult = await supabase
    .from('purchase_orders')
    .select('*')
    .order('created_at', { ascending: false })

  const orders = await throwIfError(ordersResult, 'Загрузка закупов')

  return { orders: (orders || []).map((row) => rowToOrder(row, [])) }
}

/** Создание закупа */
export async function createPurchaseOrderCloud(data) {
  ensureClient()

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  const row = orderToRow(
    {
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      status: PURCHASE_STATUS.DRAFT,
      date: data.date || today,
      expectedDeliveryDate: data.expectedDeliveryDate,
      totalAmount: 0,
      itemsCount: 0,
      createdBy: data.createdBy,
      createdByName: data.createdByName,
      comment: data.comment,
      workflowMode: PROCUREMENT_WORKFLOW_MODE.SIMPLE,
    },
    { id, created_at: now, updated_at: now }
  )

  await throwIfError(
    await supabase.from('purchase_orders').insert(row),
    'Создание закупа'
  )

  return id
}

/** Обновление закупа и/или позиций */
export async function updatePurchaseOrderCloud(orderId, patch) {
  ensureClient()

  const { items, ...orderPatch } = patch || {}

  if (items) {
    await syncOrderItems(orderId, items)
  }

  const row = orderPatchToRow(orderPatch)
  if (Object.keys(row).length > 0) {
    row.updated_at = new Date().toISOString()
    await throwIfError(
      await supabase.from('purchase_orders').update(row).eq('id', orderId),
      'Обновление закупа'
    )
  }

  const updated = await fetchOrderById(orderId)

  return updated
}

/** Удаление черновика насовсем (серверная функция возвращает количества в план, если заказ из «Закупа») */
export async function deletePurchaseOrderCloud(orderId) {
  ensureClient()
  if (!orderId) throw new Error('Заказ не найден')
  const { error } = await supabase.rpc('procurement_delete_draft_order', { p_order_id: orderId })
  if (error) {
    console.error('[Удаление черновика]', error)
    throw new Error(toProcurementUserMessage(error, 'Не удалось удалить черновик.'))
  }
}

/** Добавление позиции */
export async function addPurchaseOrderItemCloud(orderId, item) {
  ensureClient()

  const order = await fetchOrderById(orderId)
  if (!order) throw new Error('Закуп не найден')

  const enriched = normalizePurchaseItem({
    ...item,
    supplierId: item.supplierId ?? order.supplierId ?? null,
    supplierName: item.supplierName ?? order.supplierName ?? '',
  })

  const row = itemToRow(enriched, orderId)
  if (!row.created_at) row.created_at = new Date().toISOString()

  await throwIfError(
    await supabase.from('purchase_order_items').insert(row),
    'Добавление позиции закупа'
  )

  await recalcOrderTotals(orderId)
  return row.id
}

/** Обновление позиции */
export async function updatePurchaseOrderItemCloud(orderId, itemId, patch) {
  ensureClient()

  const currentResult = await supabase
    .from('purchase_order_items')
    .select('*')
    .eq('id', itemId)
    .eq('purchase_order_id', orderId)
    .maybeSingle()

  const current = await throwIfError(currentResult, 'Загрузка позиции закупа')
  if (!current) throw new Error('Позиция закупа не найдена')

  const merged = normalizePurchaseItem({ ...rowToItem(current), ...patch })
  const row = itemToRow(merged, orderId)
  row.created_at = current.created_at

  await throwIfError(
    await supabase.from('purchase_order_items').update(row).eq('id', itemId),
    'Обновление позиции закупа'
  )

  await recalcOrderTotals(orderId)
  return merged
}

/** Удаление позиции */
export async function deletePurchaseOrderItemCloud(orderId, itemId) {
  ensureClient()

  await throwIfError(
    await supabase
      .from('purchase_order_items')
      .delete()
      .eq('id', itemId)
      .eq('purchase_order_id', orderId),
    'Удаление позиции закупа'
  )

  await recalcOrderTotals(orderId)
}

/**
 * Смена состояния заказа одной серверной транзакцией.
 *
 * Раньше это были две отдельные записи с клиента — сначала документ приёмки,
 * потом заказ. Между ними заказ и приёмка могли разойтись, а проверка «склад
 * начал приёмку» читалась отдельно от записи. Теперь блокировка строк,
 * повторная проверка и обе записи выполняются внутри одной RPC.
 */
async function callOrderStateRpc(fnName, orderId, context) {
  ensureClient()
  if (!orderId) throw new Error('Заказ не найден')

  const { data, error } = await supabase.rpc(fnName, { p_order_id: orderId })
  if (error) {
    console.error(`[${context}]`, error)
    throw new Error(toProcurementUserMessage(error, 'Не удалось изменить заказ.'))
  }

  // Возвращаем перечитанный заказ: RPC отдаёт итоговое состояние, а UI работает
  // с доменной моделью.
  const updated = await fetchOrderById(orderId)
  if (!updated) throw new Error('Заказ не найден')
  return { order: updated, result: data ?? null }
}

/** «Сверено» ставится серверной функцией: прямая запись в заказ из планирования закрыта правами (RLS). */
export async function setOrderCheckedCloud(orderId, checked) {
  ensureClient()
  const { error } = await supabase.rpc('procurement_set_order_checked', {
    p_order_id: orderId,
    p_checked: Boolean(checked),
  })
  if (error) {
    console.error('[Отметка «Сверено»]', error)
    throw new Error(toProcurementUserMessage(error, 'Не удалось сохранить отметку.'))
  }
  return fetchOrderById(orderId)
}

/** «Сохранить»: черновик → «Сохранён». Сервер проверяет, что заказ не пустой и без нулевых количеств. */
export async function submitPurchaseOrderCloud(orderId) {
  const { order } = await callOrderStateRpc('procurement_submit_order', orderId, 'Сохранение заказа')
  return order
}

/** «Отменить»: «Сохранён» → черновик. Количества в план не возвращаются. */
export async function unsavePurchaseOrderCloud(orderId) {
  const { order } = await callOrderStateRpc('procurement_unsave_order', orderId, 'Отмена сохранённого заказа')
  return order
}

/**
 * id заказов, в позициях которых есть текст (название или штрихкод). Список заказов грузится без позиций,
 * поэтому поиск по товару делает сервер.
 */
export async function searchOrderIdsByItemTextCloud(text) {
  ensureClient()
  const q = String(text || '')
    .trim()
    .replace(/[%,()]/g, ' ')
  if (!q) return []
  const result = await supabase
    .from('purchase_order_items')
    .select('purchase_order_id')
    .or(`product_name.ilike.%${q}%,barcode.ilike.%${q}%`)
    .limit(5000)
  await throwIfError(result, 'Поиск по позициям заказов', 'Не удалось выполнить поиск по товарам.')
  return [...new Set((result.data || []).map((row) => row.purchase_order_id))]
}

export function getCloudPurchasesBundleFromOrders(orders) {
  return { orders: orders || [] }
}

export { recalcOrderTotals, fetchOrderById, rowToOrder, orderToRow, rowToItem, itemToRow }
