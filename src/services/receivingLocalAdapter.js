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
import { getLocalPurchasesBundle } from './purchaseLocalAdapter'

const DOCUMENTS_KEY = 'shugyla_receiving_documents'
const ITEMS_KEY = 'shugyla_receiving_items'
const COUNTER_KEY = 'shugyla_receiving_counter'
const ORDERS_KEY = 'shugyla_purchase_orders'

function readDocuments() {
  const data = localStorage.getItem(DOCUMENTS_KEY)
  return data ? JSON.parse(data) : []
}

function writeDocuments(documents) {
  localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(documents))
}

function readItems() {
  const data = localStorage.getItem(ITEMS_KEY)
  return data ? JSON.parse(data) : []
}

function writeItems(items) {
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items))
}

function readPurchaseOrders() {
  const data = localStorage.getItem(ORDERS_KEY)
  return data ? JSON.parse(data) : []
}

function writePurchaseOrders(orders) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders))
}

function genId() {
  return crypto.randomUUID()
}

function nextReceivingNumber() {
  const year = new Date().getFullYear()
  const documents = readDocuments()
  const prefix = `R-${year}-`
  let counter = 1

  const latest = documents
    .map((doc) => doc.number)
    .filter((num) => num?.startsWith(prefix))
    .sort()
    .pop()

  if (latest) {
    const match = latest.match(/R-\d{4}-(\d+)/)
    if (match) counter = Number(match[1]) + 1
  }

  return `${prefix}${String(counter).padStart(4, '0')}`
}

function bundleDocuments() {
  const documents = readDocuments()
  const items = readItems()
  const purchases = getLocalPurchasesBundle().orders
  const purchaseById = new Map(purchases.map((order) => [order.id, order]))

  const itemsByDoc = new Map()
  for (const item of items) {
    const docId = item.receivingDocumentId ?? item.receiving_document_id
    if (!itemsByDoc.has(docId)) itemsByDoc.set(docId, [])
    itemsByDoc.get(docId).push(item)
  }

  return documents.map((doc) => {
    const purchase = purchaseById.get(doc.purchaseOrderId ?? doc.purchase_order_id)
    return normalizeReceivingDocument(
      {
        ...doc,
        purchaseOrderNumber: purchase?.number ?? null,
      },
      itemsByDoc.get(doc.id) || []
    )
  })
}

export function getLocalReceivingBundle() {
  const documents = bundleDocuments()
  return { documents }
}

export async function fetchReceivingDataLocal() {
  return getLocalReceivingBundle()
}

export function getLocalReceivingDocumentById(id) {
  return getLocalReceivingBundle().documents.find((doc) => doc.id === id) || null
}

export async function transferFromPurchaseLocal(orderId, user) {
  const purchases = readPurchaseOrders()
  const order = purchases.find((o) => o.id === orderId)
  if (!order) throw new Error('Закуп не найден')

  if (order.transferredToReceiving || order.transferred_to_receiving || order.receivingDocumentId || order.receiving_document_id) {
    throw new Error('Этот закуп уже передан в приёмку.')
  }

  const items = order.items || []
  const mappedForTotals = items.map((item) =>
    normalizeReceivingItem({
      orderedQty: item.orderQty ?? item.orderedQty ?? item.ordered_qty ?? 0,
      receivedQty: 0,
    })
  )
  const totals = calcReceivingTotals(mappedForTotals)
  const now = new Date().toISOString()
  const docId = genId()
  const number = nextReceivingNumber()

  const document = normalizeReceivingDocument({
    id: docId,
    number,
    purchaseOrderId: order.id,
    purchaseOrderNumber: order.number,
    supplierId: order.supplierId ?? order.supplier_id ?? null,
    supplierName: order.supplierName ?? order.supplier_name ?? '',
    status: RECEIVING_STATUS.AWAITING_RECEIVING,
    expectedDeliveryDate: order.expectedDeliveryDate ?? order.expected_delivery_date ?? '',
    createdBy: user?.login || user?.id || '',
    createdByName: user?.name || '',
    receivedBy: null,
    receivedByName: null,
    comment: order.comment ?? '',
    totalOrderedQty: totals.totalOrderedQty,
    totalReceivedQty: 0,
    totalDifferenceQty: 0 - totals.totalOrderedQty,
    created_at: now,
    updated_at: now,
  })

  const receivingItems = items.map((item, index) =>
    normalizeReceivingItem({
      id: genId(),
      receivingDocumentId: docId,
      purchaseOrderItemId: item.id,
      productName: item.productName ?? item.product_name ?? '',
      barcode: item.barcode ?? '',
      orderedQty: item.orderQty ?? item.orderedQty ?? item.ordered_qty ?? 0,
      receivedQty: 0,
      differenceQty: calcDifferenceQty(0, item.orderQty ?? item.orderedQty ?? item.ordered_qty ?? 0),
      purchasePrice: item.purchasePrice ?? item.purchase_price ?? 0,
      status: RECEIVING_ITEM_STATUS.PENDING,
      comment: item.comment ?? '',
      sortOrder: index,
      created_at: now,
      updated_at: now,
    })
  )

  const documents = readDocuments()
  documents.unshift({
    ...document,
    items: undefined,
  })
  writeDocuments(documents)

  const allItems = readItems()
  allItems.push(...receivingItems)
  writeItems(allItems)

  const orderIdx = purchases.findIndex((o) => o.id === orderId)
  purchases[orderIdx] = {
    ...purchases[orderIdx],
    status: PURCHASE_STATUS.AWAITING_RECEIVING,
    transferredToReceiving: true,
    transferred_to_receiving: true,
    receivingDocumentId: docId,
    receiving_document_id: docId,
    updated_at: now,
  }
  writePurchaseOrders(purchases)

  return { receivingDocumentId: docId, number }
}

export async function saveReceivingDocumentLocal(documentId, items, user) {
  const documents = readDocuments()
  const docIdx = documents.findIndex((doc) => doc.id === documentId)
  if (docIdx < 0) throw new Error('Документ приёмки не найден')

  const normalizedItems = (items || []).map(normalizeReceivingItem)
  const totals = calcReceivingTotals(normalizedItems)
  const now = new Date().toISOString()

  const allItems = readItems().filter(
    (item) => (item.receivingDocumentId ?? item.receiving_document_id) !== documentId
  )

  const updatedItems = normalizedItems.map((item, index) =>
    normalizeReceivingItem({
      ...item,
      receivingDocumentId: documentId,
      differenceQty: calcDifferenceQty(item.receivedQty, item.orderedQty),
      sortOrder: index,
      updated_at: now,
    })
  )

  allItems.push(...updatedItems)
  writeItems(allItems)

  let nextStatus = documents[docIdx].status
  if (
    nextStatus === RECEIVING_STATUS.AWAITING_RECEIVING ||
    nextStatus === 'awaiting'
  ) {
    if (totals.totalReceivedQty > 0) {
      nextStatus = RECEIVING_STATUS.IN_PROGRESS
    }
  }

  documents[docIdx] = {
    ...documents[docIdx],
    status: nextStatus,
    totalOrderedQty: totals.totalOrderedQty,
    totalReceivedQty: totals.totalReceivedQty,
    totalDifferenceQty: totals.totalDifferenceQty,
    receivedBy: user?.login || user?.id || documents[docIdx].receivedBy || null,
    receivedByName: user?.name || documents[docIdx].receivedByName || null,
    updated_at: now,
  }
  writeDocuments(documents)

  return getLocalReceivingDocumentById(documentId)
}

export async function completeReceivingDocumentLocal(documentId, items, user) {
  const documents = readDocuments()
  const docIdx = documents.findIndex((doc) => doc.id === documentId)
  if (docIdx < 0) throw new Error('Документ приёмки не найден')

  const normalizedItems = (items || []).map(normalizeReceivingItem)
  const totals = calcReceivingTotals(normalizedItems)
  const finalStatus = resolveReceivingCompleteStatus(normalizedItems)
  const now = new Date().toISOString()

  const allItems = readItems().filter(
    (item) => (item.receivingDocumentId ?? item.receiving_document_id) !== documentId
  )

  const updatedItems = normalizedItems.map((item, index) => {
    const received = Number(item.receivedQty)
    const ordered = Number(item.orderedQty)
    let itemStatus = RECEIVING_ITEM_STATUS.PENDING
    if (received === ordered) itemStatus = RECEIVING_ITEM_STATUS.RECEIVED
    else if (received > 0) itemStatus = RECEIVING_ITEM_STATUS.PARTIAL

    return normalizeReceivingItem({
      ...item,
      receivingDocumentId: documentId,
      differenceQty: calcDifferenceQty(received, ordered),
      status: itemStatus,
      sortOrder: index,
      updated_at: now,
    })
  })

  allItems.push(...updatedItems)
  writeItems(allItems)

  const doc = documents[docIdx]
  documents[docIdx] = {
    ...doc,
    status: finalStatus,
    totalOrderedQty: totals.totalOrderedQty,
    totalReceivedQty: totals.totalReceivedQty,
    totalDifferenceQty: totals.totalDifferenceQty,
    receivedBy: user?.login || user?.id || doc.receivedBy || null,
    receivedByName: user?.name || doc.receivedByName || null,
    updated_at: now,
  }
  writeDocuments(documents)

  const purchaseOrderId = doc.purchaseOrderId ?? doc.purchase_order_id
  if (purchaseOrderId) {
    const purchases = readPurchaseOrders()
    const orderIdx = purchases.findIndex((o) => o.id === purchaseOrderId)
    if (orderIdx >= 0) {
      const purchaseStatus =
        finalStatus === RECEIVING_STATUS.RECEIVED
          ? PURCHASE_STATUS.RECEIVED
          : PURCHASE_STATUS.PARTIALLY_RECEIVED
      purchases[orderIdx] = {
        ...purchases[orderIdx],
        status: purchaseStatus,
        updated_at: now,
      }
      writePurchaseOrders(purchases)
    }
  }

  return getLocalReceivingDocumentById(documentId)
}
