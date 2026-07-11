import { supabase } from '../lib/supabaseClient'
import {
  normalizePurchaseOrder,
  normalizePurchaseItem,
  calcLineTotal,
  PURCHASE_STATUS,
  PROCUREMENT_WORKFLOW_MODE,
} from '../utils/purchaseData'

import { throwUserError, toUserErrorMessage } from '../utils/userErrorMessage'

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
    transferred_to_receiving: row.transferred_to_receiving,
    receiving_document_id: row.receiving_document_id,
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
    transferred_to_receiving: order.transferredToReceiving ?? false,
    receiving_document_id: order.receivingDocumentId ?? null,
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
  if (patch.transferredToReceiving !== undefined) {
    row.transferred_to_receiving = Boolean(patch.transferredToReceiving)
  }
  if (patch.receivingDocumentId !== undefined) {
    row.receiving_document_id = patch.receivingDocumentId || null
  }
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
    .order('created_at', { ascending: true })

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
      transferredToReceiving: false,
      receivingDocumentId: null,
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
  if (updated?.workflowMode === PROCUREMENT_WORKFLOW_MODE.SIMPLE) {
    const { syncSimpleReceivingFromPurchaseCloud } = await import('./receivingSupabaseAdapter')
    await syncSimpleReceivingFromPurchaseCloud(updated)
  }

  return updated
}

/** Синхронизация заранее созданной простой закупки (optimistic UI) */
export async function syncSimplePurchaseCloud(order, document) {
  ensureClient()
  if (!order?.id) throw new Error('Закуп не найден')

  const existing = await fetchOrderById(order.id)
  if (existing) return existing.id

  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  const row = orderToRow(
    {
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      status: PURCHASE_STATUS.AWAITING_RECEIVING,
      date: order.date || today,
      expectedDeliveryDate: order.expectedDeliveryDate,
      totalAmount: order.totalAmount ?? 0,
      itemsCount: 0,
      createdBy: order.createdBy,
      createdByName: order.createdByName,
      comment: order.comment,
      transferredToReceiving: true,
      receivingDocumentId: document?.id ?? null,
      workflowMode: PROCUREMENT_WORKFLOW_MODE.SIMPLE,
    },
    { id: order.id, created_at: order.createdAt || now, updated_at: now }
  )

  await throwIfError(
    await supabase.from('purchase_orders').insert(row),
    'Создание закупа'
  )

  if (document?.id) {
    const { syncSimpleReceivingDocumentCloud } = await import('./receivingSupabaseAdapter')
    await syncSimpleReceivingDocumentCloud(document, order)
  }

  return order.id
}

/** Простая закупка: сразу в приёмку без позиций */
export async function createSimplePurchaseCloud(data, user) {
  ensureClient()

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const totalAmount = Math.max(0, Number(data.totalAmount) || 0)

  const row = orderToRow(
    {
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      status: PURCHASE_STATUS.AWAITING_RECEIVING,
      date: today,
      expectedDeliveryDate: data.expectedDeliveryDate,
      totalAmount,
      itemsCount: 0,
      createdBy: data.createdBy,
      createdByName: data.createdByName,
      comment: data.comment,
      transferredToReceiving: true,
      receivingDocumentId: null,
      workflowMode: PROCUREMENT_WORKFLOW_MODE.SIMPLE,
    },
    { id, created_at: now, updated_at: now }
  )

  await throwIfError(
    await supabase.from('purchase_orders').insert(row),
    'Создание закупа'
  )

  const { createSimpleReceivingFromPurchaseCloud } = await import('./receivingSupabaseAdapter')
  const { receivingDocumentId } = await createSimpleReceivingFromPurchaseCloud(
    await fetchOrderById(id),
    user
  )

  await throwIfError(
    await supabase
      .from('purchase_orders')
      .update({
        receiving_document_id: receivingDocumentId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id),
    'Привязка документа приёмки'
  )

  return id
}

/** Удаление закупа (каскадно удалит позиции) */
export async function deletePurchaseOrderCloud(orderId) {
  ensureClient()

  const { deleteReceivingByPurchaseIdCloud } = await import('./receivingSupabaseAdapter')
  await deleteReceivingByPurchaseIdCloud(orderId)

  await throwIfError(
    await supabase.from('purchase_orders').delete().eq('id', orderId),
    'Удаление закупа'
  )
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

export async function cancelPurchaseOrderCloud(orderId) {
  return updatePurchaseOrderCloud(orderId, { status: PURCHASE_STATUS.CANCELLED })
}

export function getCloudPurchasesBundleFromOrders(orders) {
  return { orders: orders || [] }
}

export { recalcOrderTotals, fetchOrderById, rowToOrder, orderToRow, rowToItem, itemToRow }
