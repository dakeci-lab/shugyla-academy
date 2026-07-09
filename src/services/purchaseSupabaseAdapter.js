import { supabase } from '../lib/supabaseClient'
import {
  normalizePurchaseOrder,
  normalizePurchaseItem,
  calcLineTotal,
  PURCHASE_STATUS,
} from '../utils/purchaseData'

async function throwIfError(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`)
  return result.data
}

function ensureClient() {
  if (!supabase) throw new Error('Supabase не настроен')
}

function rowToItem(row) {
  return normalizePurchaseItem({
    id: row.id,
    purchase_order_id: row.purchase_order_id,
    product_name: row.product_name,
    barcode: row.barcode,
    stock: row.stock,
    sales_per_day: row.sales_per_day,
    recommendation: row.recommendation,
    order_qty: row.order_qty,
    purchase_price: row.purchase_price,
    line_total: row.line_total,
    comment: row.comment,
  })
}

function rowToOrder(row, items = []) {
  return normalizePurchaseOrder({
    id: row.id,
    number: row.number,
    date: row.date,
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name,
    status: row.status,
    total_amount: row.total_amount,
    items_count: row.items_count,
    created_by: row.created_by,
    created_by_name: row.created_by_name,
    expected_delivery_date: row.expected_delivery_date,
    comment: row.comment,
    created_at: row.created_at,
    updated_at: row.updated_at,
    items: items.map(rowToItem),
  })
}

function itemToRow(item, orderId, sortOrder = 0) {
  const orderQty = item.orderQty ?? item.order_qty ?? 0
  const purchasePrice = item.purchasePrice ?? item.purchase_price ?? 0
  return {
    id: item.id || crypto.randomUUID(),
    purchase_order_id: orderId,
    product_name: item.productName ?? item.product_name ?? '',
    barcode: item.barcode ?? '',
    stock: item.stock ?? 0,
    sales_per_day: item.salesPerDay ?? item.sales_per_day ?? 0,
    recommendation: item.recommendation ?? 0,
    order_qty: orderQty,
    purchase_price: purchasePrice,
    line_total: calcLineTotal(orderQty, purchasePrice),
    comment: item.comment ?? '',
    sort_order: sortOrder,
  }
}

function orderPatchToRow(patch) {
  const row = {}
  if (patch.date != null) row.date = patch.date
  if (patch.supplierId !== undefined) row.supplier_id = patch.supplierId || null
  if (patch.supplierName !== undefined) row.supplier_name = patch.supplierName?.trim() || ''
  if (patch.status != null) row.status = patch.status
  if (patch.comment !== undefined) row.comment = patch.comment?.trim() || ''
  if (patch.expectedDeliveryDate !== undefined) {
    row.expected_delivery_date = patch.expectedDeliveryDate || null
  }
  if (patch.createdBy !== undefined) row.created_by = patch.createdBy || null
  if (patch.createdByName !== undefined) row.created_by_name = patch.createdByName || null
  if (patch.totalAmount != null) row.total_amount = patch.totalAmount
  if (patch.itemsCount != null) row.items_count = patch.itemsCount
  return row
}

async function nextPurchaseNumber() {
  ensureClient()
  const year = new Date().getFullYear()
  const prefix = `Z-${year}-`

  const result = await supabase
    .from('purchase_orders')
    .select('number')
    .like('number', `${prefix}%`)
    .order('number', { ascending: false })
    .limit(1)

  let counter = 1
  const latest = result.data?.[0]?.number
  if (latest) {
    const match = latest.match(/Z-\d{4}-(\d+)/)
    if (match) counter = Number(match[1]) + 1
  }

  return `${prefix}${String(counter).padStart(4, '0')}`
}

async function recalcOrderTotals(orderId) {
  ensureClient()

  const itemsResult = await supabase
    .from('purchase_order_items')
    .select('line_total')
    .eq('purchase_order_id', orderId)

  await throwIfError(itemsResult, 'Загрузка позиций закупа')

  const items = itemsResult.data || []
  const totalAmount = items.reduce((sum, row) => sum + Number(row.line_total || 0), 0)
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
    .order('sort_order', { ascending: true })

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
    const rows = normalized.map((item, index) => itemToRow(item, orderId, index))
    await throwIfError(
      await supabase.from('purchase_order_items').upsert(rows),
      'Сохранение позиций закупа'
    )
  }

  return recalcOrderTotals(orderId)
}

/** Загрузка всех закупов с позициями */
export async function fetchPurchasesDataCloud() {
  ensureClient()

  const ordersResult = await supabase
    .from('purchase_orders')
    .select('*')
    .order('created_at', { ascending: false })

  const orders = await throwIfError(ordersResult, 'Загрузка закупов')

  if (!orders?.length) {
    return { orders: [] }
  }

  const orderIds = orders.map((row) => row.id)
  const itemsResult = await supabase
    .from('purchase_order_items')
    .select('*')
    .in('purchase_order_id', orderIds)
    .order('sort_order', { ascending: true })

  const items = await throwIfError(itemsResult, 'Загрузка позиций закупов')

  const itemsByOrder = new Map()
  for (const row of items || []) {
    if (!itemsByOrder.has(row.purchase_order_id)) {
      itemsByOrder.set(row.purchase_order_id, [])
    }
    itemsByOrder.get(row.purchase_order_id).push(row)
  }

  return {
    orders: orders.map((row) => rowToOrder(row, itemsByOrder.get(row.id) || [])),
  }
}

/** Создание закупа */
export async function createPurchaseOrderCloud(data) {
  ensureClient()

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const number = await nextPurchaseNumber()

  const row = {
    id,
    number,
    date: data.date || today,
    supplier_id: data.supplierId || null,
    supplier_name: data.supplierName?.trim() || '',
    status: PURCHASE_STATUS.DRAFT,
    total_amount: 0,
    items_count: 0,
    created_by: data.createdBy || null,
    created_by_name: data.createdByName || null,
    expected_delivery_date: data.expectedDeliveryDate || null,
    comment: data.comment?.trim() || '',
    created_at: now,
    updated_at: now,
  }

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

  return fetchOrderById(orderId)
}

/** Удаление закупа (каскадно удалит позиции) */
export async function deletePurchaseOrderCloud(orderId) {
  ensureClient()

  await throwIfError(
    await supabase.from('purchase_orders').delete().eq('id', orderId),
    'Удаление закупа'
  )
}

/** Добавление позиции */
export async function addPurchaseOrderItemCloud(orderId, item) {
  ensureClient()

  const countResult = await supabase
    .from('purchase_order_items')
    .select('id', { count: 'exact', head: true })
    .eq('purchase_order_id', orderId)

  await throwIfError(countResult, 'Подсчёт позиций закупа')

  const sortOrder = countResult.count ?? 0
  const row = itemToRow(item, orderId, sortOrder)

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
  const row = itemToRow(merged, orderId, current.sort_order ?? 0)

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

export async function cancelPurchaseOrderCloud(orderId) {
  return updatePurchaseOrderCloud(orderId, { status: PURCHASE_STATUS.CANCELLED })
}

export async function transferPurchaseToReceivingCloud(orderId) {
  await updatePurchaseOrderCloud(orderId, { status: PURCHASE_STATUS.AWAITING_RECEIVING })
  return { ok: true }
}

/** Для совместимости с local bundle API */
export function getCloudPurchasesBundleFromOrders(orders) {
  return { orders: orders || [] }
}

export { recalcOrderTotals, fetchOrderById }
