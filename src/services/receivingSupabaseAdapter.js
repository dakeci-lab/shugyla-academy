import { supabase } from '../lib/supabaseClient'
import {
  normalizeReceivingDocument,
  normalizeReceivingItem,
  calcReceivingTotals,
  calcDifferenceQty,
  resolveReceivingCompleteStatus,
  RECEIVING_STATUS,
  RECEIVING_ITEM_STATUS,
} from '../utils/receivingData'
import { PURCHASE_STATUS } from '../utils/purchaseData'
import { fetchOrderById } from './purchaseSupabaseAdapter'

async function throwIfError(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`)
  return result.data
}

function ensureClient() {
  if (!supabase) throw new Error('Supabase не настроен')
}

function rowToItem(row) {
  return normalizeReceivingItem({
    id: row.id,
    receiving_document_id: row.receiving_document_id,
    purchase_order_item_id: row.purchase_order_item_id,
    product_name: row.product_name,
    barcode: row.barcode,
    ordered_qty: row.ordered_qty,
    received_qty: row.received_qty,
    difference_qty: row.difference_qty,
    purchase_price: row.purchase_price,
    status: row.status,
    comment: row.comment,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  })
}

function itemToRow(item, documentId) {
  const orderedQty = item.orderedQty ?? item.ordered_qty ?? 0
  const receivedQty = item.receivedQty ?? item.received_qty ?? 0
  const now = new Date().toISOString()

  const row = {
    id: item.id || crypto.randomUUID(),
    receiving_document_id: documentId,
    purchase_order_item_id: item.purchaseOrderItemId ?? item.purchase_order_item_id ?? null,
    product_name: item.productName ?? item.product_name ?? '',
    barcode: item.barcode ?? '',
    ordered_qty: orderedQty,
    received_qty: receivedQty,
    difference_qty: calcDifferenceQty(receivedQty, orderedQty),
    purchase_price: item.purchasePrice ?? item.purchase_price ?? 0,
    status: item.status ?? RECEIVING_ITEM_STATUS.PENDING,
    comment: item.comment ?? '',
    sort_order: item.sortOrder ?? item.sort_order ?? 0,
    updated_at: now,
  }

  if (item.createdAt || item.created_at) {
    row.created_at = item.createdAt ?? item.created_at
  }

  return row
}

function rowToDocument(row, items = [], purchaseOrderNumber = null) {
  return normalizeReceivingDocument(
    {
      id: row.id,
      number: row.number,
      purchase_order_id: row.purchase_order_id,
      purchase_order_number: purchaseOrderNumber,
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name,
      status: row.status,
      expected_delivery_date: row.expected_delivery_date,
      created_by: row.created_by,
      created_by_name: row.created_by_name,
      received_by: row.received_by,
      received_by_name: row.received_by_name,
      comment: row.comment,
      total_ordered_qty: row.total_ordered_qty,
      total_received_qty: row.total_received_qty,
      total_difference_qty: row.total_difference_qty,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    items.map(rowToItem)
  )
}

function documentToRow(doc, extras = {}) {
  const row = {
    number: doc.number,
    purchase_order_id: doc.purchaseOrderId ?? doc.purchase_order_id ?? null,
    supplier_id: doc.supplierId ?? doc.supplier_id ?? null,
    supplier_name: (doc.supplierName ?? doc.supplier_name ?? '').trim(),
    status: doc.status ?? RECEIVING_STATUS.AWAITING_RECEIVING,
    expected_delivery_date: doc.expectedDeliveryDate ?? doc.expected_delivery_date ?? null,
    created_by: doc.createdBy ?? doc.created_by ?? null,
    created_by_name: doc.createdByName ?? doc.created_by_name ?? null,
    received_by: doc.receivedBy ?? doc.received_by ?? null,
    received_by_name: doc.receivedByName ?? doc.received_by_name ?? null,
    comment: (doc.comment ?? '').trim(),
    total_ordered_qty: doc.totalOrderedQty ?? doc.total_ordered_qty ?? 0,
    total_received_qty: doc.totalReceivedQty ?? doc.total_received_qty ?? 0,
    total_difference_qty: doc.totalDifferenceQty ?? doc.total_difference_qty ?? 0,
  }

  if (extras.id) row.id = extras.id
  if (extras.created_at) row.created_at = extras.created_at
  if (extras.updated_at) row.updated_at = extras.updated_at

  return row
}

async function nextReceivingNumber() {
  ensureClient()
  const year = new Date().getFullYear()
  const prefix = `R-${year}-`

  const result = await supabase
    .from('receiving_documents')
    .select('number')
    .like('number', `${prefix}%`)
    .order('number', { ascending: false })
    .limit(1)

  let counter = 1
  const latest = result.data?.[0]?.number
  if (latest) {
    const match = latest.match(/R-\d{4}-(\d+)/)
    if (match) counter = Number(match[1]) + 1
  }

  return `${prefix}${String(counter).padStart(4, '0')}`
}

async function fetchDocumentById(documentId) {
  ensureClient()

  const docResult = await supabase
    .from('receiving_documents')
    .select('*')
    .eq('id', documentId)
    .maybeSingle()

  const docRow = await throwIfError(docResult, 'Загрузка документа приёмки')
  if (!docRow) return null

  const itemsResult = await supabase
    .from('receiving_items')
    .select('*')
    .eq('receiving_document_id', documentId)
    .order('sort_order', { ascending: true })

  const items = await throwIfError(itemsResult, 'Загрузка позиций приёмки')

  let purchaseOrderNumber = null
  if (docRow.purchase_order_id) {
    const orderResult = await supabase
      .from('purchase_orders')
      .select('number')
      .eq('id', docRow.purchase_order_id)
      .maybeSingle()
    purchaseOrderNumber = orderResult.data?.number ?? null
  }

  return rowToDocument(docRow, items || [], purchaseOrderNumber)
}

export async function fetchReceivingDataCloud() {
  ensureClient()

  const docsResult = await supabase
    .from('receiving_documents')
    .select('*')
    .order('created_at', { ascending: false })

  const documents = await throwIfError(docsResult, 'Загрузка документов приёмки')
  if (!documents?.length) {
    return { documents: [] }
  }

  const docIds = documents.map((row) => row.id)
  const itemsResult = await supabase
    .from('receiving_items')
    .select('*')
    .in('receiving_document_id', docIds)
    .order('sort_order', { ascending: true })

  const items = await throwIfError(itemsResult, 'Загрузка позиций приёмки')

  const purchaseOrderIds = [
    ...new Set(documents.map((row) => row.purchase_order_id).filter(Boolean)),
  ]
  const purchaseNumbers = new Map()
  if (purchaseOrderIds.length > 0) {
    const ordersResult = await supabase
      .from('purchase_orders')
      .select('id, number')
      .in('id', purchaseOrderIds)
    const orders = await throwIfError(ordersResult, 'Загрузка связанных закупов')
    for (const order of orders || []) {
      purchaseNumbers.set(order.id, order.number)
    }
  }

  const itemsByDoc = new Map()
  for (const row of items || []) {
    if (!itemsByDoc.has(row.receiving_document_id)) {
      itemsByDoc.set(row.receiving_document_id, [])
    }
    itemsByDoc.get(row.receiving_document_id).push(row)
  }

  return {
    documents: documents.map((row) =>
      rowToDocument(row, itemsByDoc.get(row.id) || [], purchaseNumbers.get(row.purchase_order_id))
    ),
  }
}

export async function transferFromPurchaseCloud(orderId, user) {
  ensureClient()

  const order = await fetchOrderById(orderId)
  if (!order) throw new Error('Закуп не найден')

  if (order.transferredToReceiving || order.receivingDocumentId) {
    throw new Error('Этот закуп уже передан в приёмку.')
  }

  const items = order.items || []
  const totals = calcReceivingTotals(
    items.map((item) =>
      normalizeReceivingItem({
        orderedQty: item.orderQty,
        receivedQty: 0,
      })
    )
  )
  const now = new Date().toISOString()
  const docId = crypto.randomUUID()
  const number = await nextReceivingNumber()

  const docRow = documentToRow(
    {
      number,
      purchaseOrderId: order.id,
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      status: RECEIVING_STATUS.AWAITING_RECEIVING,
      expectedDeliveryDate: order.expectedDeliveryDate,
      createdBy: user?.login || user?.id || '',
      createdByName: user?.name || '',
      receivedBy: null,
      receivedByName: null,
      comment: order.comment,
      totalOrderedQty: totals.totalOrderedQty,
      totalReceivedQty: 0,
      totalDifferenceQty: 0 - totals.totalOrderedQty,
    },
    { id: docId, created_at: now, updated_at: now }
  )

  await throwIfError(
    await supabase.from('receiving_documents').insert(docRow),
    'Создание документа приёмки'
  )

  if (items.length > 0) {
    const itemRows = items.map((item, index) =>
      itemToRow(
        normalizeReceivingItem({
          purchaseOrderItemId: item.id,
          productName: item.productName,
          barcode: item.barcode,
          orderedQty: item.orderQty,
          receivedQty: 0,
          differenceQty: calcDifferenceQty(0, item.orderQty),
          purchasePrice: item.purchasePrice,
          status: RECEIVING_ITEM_STATUS.PENDING,
          comment: item.comment,
          sortOrder: index,
          created_at: now,
        }),
        docId
      )
    )

    await throwIfError(
      await supabase.from('receiving_items').insert(itemRows),
      'Создание позиций приёмки'
    )
  }

  await throwIfError(
    await supabase
      .from('purchase_orders')
      .update({
        status: PURCHASE_STATUS.AWAITING_RECEIVING,
        transferred_to_receiving: true,
        receiving_document_id: docId,
        updated_at: now,
      })
      .eq('id', orderId),
    'Обновление закупа после передачи в приёмку'
  )

  return { receivingDocumentId: docId, number }
}

async function syncReceivingItems(documentId, items) {
  ensureClient()

  const normalized = (items || []).map(normalizeReceivingItem)
  const incomingIds = new Set(normalized.map((item) => item.id).filter(Boolean))

  const existingResult = await supabase
    .from('receiving_items')
    .select('id')
    .eq('receiving_document_id', documentId)

  const existing = await throwIfError(existingResult, 'Загрузка позиций для синхронизации')
  const toDelete = (existing || [])
    .filter((row) => !incomingIds.has(row.id))
    .map((row) => row.id)

  if (toDelete.length > 0) {
    await throwIfError(
      await supabase.from('receiving_items').delete().in('id', toDelete),
      'Удаление позиций приёмки'
    )
  }

  if (normalized.length > 0) {
    const rows = normalized.map((item, index) =>
      itemToRow({ ...item, sortOrder: index }, documentId)
    )
    await throwIfError(
      await supabase.from('receiving_items').upsert(rows),
      'Сохранение позиций приёмки'
    )
  }
}

export async function saveReceivingDocumentCloud(documentId, items, user) {
  ensureClient()

  const current = await fetchDocumentById(documentId)
  if (!current) throw new Error('Документ приёмки не найден')

  const normalizedItems = (items || []).map(normalizeReceivingItem)
  const totals = calcReceivingTotals(normalizedItems)
  const now = new Date().toISOString()

  let nextStatus = current.status
  if (
    nextStatus === RECEIVING_STATUS.AWAITING_RECEIVING ||
    nextStatus === 'awaiting'
  ) {
    if (totals.totalReceivedQty > 0) {
      nextStatus = RECEIVING_STATUS.IN_PROGRESS
    }
  }

  await syncReceivingItems(documentId, normalizedItems)

  await throwIfError(
    await supabase
      .from('receiving_documents')
      .update({
        status: nextStatus,
        total_ordered_qty: totals.totalOrderedQty,
        total_received_qty: totals.totalReceivedQty,
        total_difference_qty: totals.totalDifferenceQty,
        received_by: user?.login || user?.id || current.receivedBy || null,
        received_by_name: user?.name || current.receivedByName || null,
        updated_at: now,
      })
      .eq('id', documentId),
    'Сохранение документа приёмки'
  )

  return fetchDocumentById(documentId)
}

export async function completeReceivingDocumentCloud(documentId, items, user) {
  ensureClient()

  const current = await fetchDocumentById(documentId)
  if (!current) throw new Error('Документ приёмки не найден')

  const normalizedItems = (items || []).map((item) => {
    const received = Number(item.receivedQty)
    const ordered = Number(item.orderedQty)
    let itemStatus = RECEIVING_ITEM_STATUS.PENDING
    if (received === ordered) itemStatus = RECEIVING_ITEM_STATUS.RECEIVED
    else if (received > 0) itemStatus = RECEIVING_ITEM_STATUS.PARTIAL

    return normalizeReceivingItem({
      ...item,
      status: itemStatus,
      differenceQty: calcDifferenceQty(received, ordered),
    })
  })

  const totals = calcReceivingTotals(normalizedItems)
  const finalStatus = resolveReceivingCompleteStatus(normalizedItems)
  const now = new Date().toISOString()

  await syncReceivingItems(documentId, normalizedItems)

  await throwIfError(
    await supabase
      .from('receiving_documents')
      .update({
        status: finalStatus,
        total_ordered_qty: totals.totalOrderedQty,
        total_received_qty: totals.totalReceivedQty,
        total_difference_qty: totals.totalDifferenceQty,
        received_by: user?.login || user?.id || current.receivedBy || null,
        received_by_name: user?.name || current.receivedByName || null,
        updated_at: now,
      })
      .eq('id', documentId),
    'Завершение документа приёмки'
  )

  if (current.purchaseOrderId) {
    const purchaseStatus =
      finalStatus === RECEIVING_STATUS.RECEIVED
        ? PURCHASE_STATUS.RECEIVED
        : PURCHASE_STATUS.PARTIALLY_RECEIVED

    await throwIfError(
      await supabase
        .from('purchase_orders')
        .update({
          status: purchaseStatus,
          updated_at: now,
        })
        .eq('id', current.purchaseOrderId),
      'Обновление связанного закупа'
    )
  }

  return fetchDocumentById(documentId)
}

export { fetchDocumentById, rowToDocument, rowToItem, itemToRow }
