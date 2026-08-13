import {
  normalizeReceivingDocument,
  normalizeReceivingItem,
  calcReceivingTotals,
  calcDifferenceQty,
  resolveReceivingCompleteStatus,
  isReceivingStarted,
  RECEIVING_STATUS,
  RECEIVING_ITEM_STATUS,
} from '../utils/receivingData'
import { PURCHASE_STATUS, PROCUREMENT_WORKFLOW_MODE } from '../utils/purchaseData'
import { readReceivingPhotoAsDataUrl, validateReceivingPhotoFile } from './receivingPhotoUtils'

const DOCUMENTS_KEY = 'shugyla_receiving_documents'
const ITEMS_KEY = 'shugyla_receiving_items'
const ORDERS_KEY = 'shugyla_purchase_orders'
const EXPORTS_KEY = 'shugyla_receiving_umag_exports'

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

function readExports() {
  const data = localStorage.getItem(EXPORTS_KEY)
  return data ? JSON.parse(data) : []
}

function writeExports(exports) {
  localStorage.setItem(EXPORTS_KEY, JSON.stringify(exports))
}

function normalizeInvoiceNumbers(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : []
}

function assertExpectedVersion(document, expectedVersion) {
  if (expectedVersion == null) return
  if (Number(document.version ?? 1) !== Number(expectedVersion)) {
    throw new Error('Приёмка была изменена другим сотрудником. Обновите страницу.')
  }
}

function genId() {
  return crypto.randomUUID()
}

function bundleDocuments() {
  const documents = readDocuments()
  const items = readItems()

  const itemsByDoc = new Map()
  for (const item of items) {
    const docId = item.receivingDocumentId ?? item.receiving_document_id
    if (!itemsByDoc.has(docId)) itemsByDoc.set(docId, [])
    itemsByDoc.get(docId).push(item)
  }

  return documents.map((doc) =>
    normalizeReceivingDocument(doc, itemsByDoc.get(doc.id) || [])
  )
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

  const document = normalizeReceivingDocument({
    id: docId,
    purchaseOrderId: order.id,
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
      unit: item.unit ?? item.measure ?? '',
      orderedQty: item.orderQty ?? item.orderedQty ?? item.ordered_qty ?? 0,
      receivedQty: 0,
      differenceQty: calcDifferenceQty(0, item.orderQty ?? item.orderedQty ?? item.ordered_qty ?? 0),
      purchasePrice: item.purchasePrice ?? item.purchase_price ?? 0,
      actualPurchasePrice: item.purchasePrice ?? item.purchase_price ?? 0,
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

  return { receivingDocumentId: docId }
}

export function createSimpleReceivingFromPurchaseLocal(order, user) {
  const purchases = readPurchaseOrders()
  const existing = purchases.find((o) => o.id === order.id)
  if (!existing) throw new Error('Закуп не найден')

  if (existing.receivingDocumentId || existing.receiving_document_id) {
    return {
      receivingDocumentId: existing.receivingDocumentId ?? existing.receiving_document_id,
    }
  }

  const now = new Date().toISOString()
  const docId = genId()
  const totalAmount = Number(order.totalAmount ?? order.total_amount ?? 0)

  const document = normalizeReceivingDocument({
    id: docId,
    purchaseOrderId: order.id,
    supplierId: order.supplierId ?? order.supplier_id ?? null,
    supplierName: order.supplierName ?? order.supplier_name ?? '',
    status: RECEIVING_STATUS.AWAITING_RECEIVING,
    expectedDeliveryDate: order.expectedDeliveryDate ?? order.expected_delivery_date ?? '',
    createdBy: user?.login || user?.id || order.createdBy || '',
    createdByName: user?.name || order.createdByName || '',
    receivedBy: null,
    receivedByName: null,
    comment: order.comment ?? '',
    totalAmount,
    totalOrderedQty: 0,
    totalReceivedQty: 0,
    totalDifferenceQty: 0,
    workflowMode: PROCUREMENT_WORKFLOW_MODE.SIMPLE,
    created_at: now,
    updated_at: now,
  })

  const documents = readDocuments()
  documents.unshift({ ...document, items: undefined })
  writeDocuments(documents)

  const orderIdx = purchases.findIndex((o) => o.id === order.id)
  if (orderIdx >= 0) {
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
  }

  return { receivingDocumentId: docId }
}

export function syncSimpleReceivingFromPurchaseLocal(order) {
  const documents = readDocuments()
  const docId = order.receivingDocumentId ?? order.receiving_document_id
  if (!docId) return

  const docIdx = documents.findIndex((doc) => doc.id === docId)
  if (docIdx < 0) return

  documents[docIdx] = {
    ...documents[docIdx],
    supplierId: order.supplierId ?? null,
    supplier_id: order.supplierId ?? null,
    supplierName: order.supplierName ?? '',
    supplier_name: order.supplierName ?? '',
    expectedDeliveryDate: order.expectedDeliveryDate ?? '',
    expected_delivery_date: order.expectedDeliveryDate ?? '',
    comment: order.comment ?? '',
    totalAmount: order.totalAmount ?? 0,
    total_amount: order.totalAmount ?? 0,
    updated_at: new Date().toISOString(),
  }
  writeDocuments(documents)
}

export function deleteReceivingByPurchaseIdLocal(purchaseOrderId) {
  const documents = readDocuments()
  const docIds = documents
    .filter((doc) => (doc.purchaseOrderId ?? doc.purchase_order_id) === purchaseOrderId)
    .map((doc) => doc.id)

  if (docIds.length === 0) return

  writeDocuments(documents.filter((doc) => !docIds.includes(doc.id)))

  const allItems = readItems().filter(
    (item) => !docIds.includes(item.receivingDocumentId ?? item.receiving_document_id)
  )
  writeItems(allItems)
}

/**
 * Тронул ли склад приёмку по этому закупу.
 * Приёмка считается начатой, если документ вышел из «Ожидает приёмки»
 * или в него уже что-то принято.
 */
export function getReceivingLockStateByPurchaseIdLocal(purchaseOrderId) {
  const documents = readDocuments().filter(
    (doc) =>
      (doc.purchaseOrderId ?? doc.purchase_order_id) === purchaseOrderId &&
      doc.status !== RECEIVING_STATUS.CANCELLED
  )

  return {
    documentIds: documents.map((doc) => doc.id),
    receivingStarted: documents.some(isReceivingStarted),
  }
}

/** Мягкая отмена документов приёмки по закупу: данные остаются, склад их больше не ждёт */
export function cancelReceivingByPurchaseIdLocal(purchaseOrderId) {
  const documents = readDocuments()
  const now = new Date().toISOString()
  let cancelled = 0

  const next = documents.map((doc) => {
    const belongs = (doc.purchaseOrderId ?? doc.purchase_order_id) === purchaseOrderId
    if (!belongs || doc.status === RECEIVING_STATUS.CANCELLED) return doc
    cancelled += 1
    return { ...doc, status: RECEIVING_STATUS.CANCELLED, updated_at: now }
  })

  if (cancelled > 0) writeDocuments(next)
  return cancelled
}

/** Гарантирует наличие документа приёмки в localStorage (для чек-листа) */
export function ensureSimpleReceivingDocumentLocal(document, order) {
  if (!document?.id) return null

  const documents = readDocuments()
  const idx = documents.findIndex(
    (doc) =>
      doc.id === document.id ||
      (order?.id && (doc.purchaseOrderId ?? doc.purchase_order_id) === order.id)
  )

  if (idx >= 0) {
    return normalizeReceivingDocument(documents[idx])
  }

  const now = new Date().toISOString()
  const normalized = normalizeReceivingDocument({
    ...document,
    purchaseOrderId: order?.id ?? document.purchaseOrderId,
    supplierId: document.supplierId ?? order?.supplierId ?? null,
    supplierName: document.supplierName ?? order?.supplierName ?? '',
    expectedDeliveryDate: document.expectedDeliveryDate ?? order?.expectedDeliveryDate ?? '',
    totalAmount: document.totalAmount ?? order?.totalAmount ?? 0,
    workflowMode: document.workflowMode ?? PROCUREMENT_WORKFLOW_MODE.SIMPLE,
    created_at: document.createdAt ?? now,
    updated_at: now,
  })

  documents.unshift({
    ...normalized,
    purchase_order_id: normalized.purchaseOrderId,
    supplier_id: normalized.supplierId,
    supplier_name: normalized.supplierName,
    expected_delivery_date: normalized.expectedDeliveryDate,
    total_amount: normalized.totalAmount,
    workflow_mode: normalized.workflowMode,
  })
  writeDocuments(documents)

  if (order?.id) {
    const purchases = readPurchaseOrders()
    const orderIdx = purchases.findIndex((item) => item.id === order.id)
    if (orderIdx >= 0) {
      purchases[orderIdx] = {
        ...purchases[orderIdx],
        receivingDocumentId: normalized.id,
        receiving_document_id: normalized.id,
        transferredToReceiving: true,
        transferred_to_receiving: true,
        updated_at: now,
      }
      writePurchaseOrders(purchases)
    }
  }

  return normalized
}

export async function acceptSimpleDeliveryLocal(documentId, user) {
  const documents = readDocuments()
  const docIdx = documents.findIndex((doc) => doc.id === documentId)
  if (docIdx < 0) throw new Error('Документ приёмки не найден')

  const doc = documents[docIdx]
  const now = new Date().toISOString()

  documents[docIdx] = {
    ...doc,
    status: RECEIVING_STATUS.RECEIVED,
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
      purchases[orderIdx] = {
        ...purchases[orderIdx],
        status: PURCHASE_STATUS.RECEIVED,
        updated_at: now,
      }
      writePurchaseOrders(purchases)
    }
  }

  return getLocalReceivingDocumentById(documentId)
}

export async function unacceptSimpleDeliveryLocal(documentId) {
  const documents = readDocuments()
  const docIdx = documents.findIndex((doc) => doc.id === documentId)
  if (docIdx < 0) throw new Error('Документ приёмки не найден')

  const doc = documents[docIdx]
  const now = new Date().toISOString()

  documents[docIdx] = {
    ...doc,
    status: RECEIVING_STATUS.AWAITING_RECEIVING,
    receivedBy: null,
    receivedByName: null,
    updated_at: now,
  }
  writeDocuments(documents)

  const purchaseOrderId = doc.purchaseOrderId ?? doc.purchase_order_id
  if (purchaseOrderId) {
    const purchases = readPurchaseOrders()
    const orderIdx = purchases.findIndex((o) => o.id === purchaseOrderId)
    if (orderIdx >= 0) {
      purchases[orderIdx] = {
        ...purchases[orderIdx],
        status: PURCHASE_STATUS.AWAITING_RECEIVING,
        updated_at: now,
      }
      writePurchaseOrders(purchases)
    }
  }

  return getLocalReceivingDocumentById(documentId)
}

export async function startReceivingDocumentLocal(documentId, { expectedVersion = null } = {}) {
  const documents = readDocuments()
  const docIdx = documents.findIndex((doc) => doc.id === documentId)
  if (docIdx < 0) throw new Error('Документ приёмки не найден')

  const doc = documents[docIdx]
  assertExpectedVersion(doc, expectedVersion)
  if (doc.status === RECEIVING_STATUS.CANCELLED) {
    throw new Error('Отменённую приёмку начать нельзя')
  }
  if (doc.status !== RECEIVING_STATUS.AWAITING_RECEIVING && doc.status !== 'awaiting') {
    return getLocalReceivingDocumentById(documentId)
  }

  const now = new Date().toISOString()
  const allItems = readItems()
  const nextItems = allItems.map((raw) => {
    if ((raw.receivingDocumentId ?? raw.receiving_document_id) !== documentId) return raw
    const item = normalizeReceivingItem(raw)
    return normalizeReceivingItem({
      ...item,
      receivedQty: item.orderedQty,
      actualPurchasePrice: item.orderedPurchasePrice,
      differenceQty: 0,
      status: RECEIVING_ITEM_STATUS.RECEIVED,
      updated_at: now,
    })
  })
  writeItems(nextItems)

  const documentItems = nextItems
    .filter((item) => (item.receivingDocumentId ?? item.receiving_document_id) === documentId)
    .map(normalizeReceivingItem)
  const totals = calcReceivingTotals(documentItems)
  documents[docIdx] = {
    ...doc,
    status: RECEIVING_STATUS.IN_PROGRESS,
    startedAt: doc.startedAt ?? doc.started_at ?? now,
    started_at: doc.startedAt ?? doc.started_at ?? now,
    totalOrderedQty: totals.totalOrderedQty,
    totalReceivedQty: totals.totalReceivedQty,
    totalDifferenceQty: totals.totalDifferenceQty,
    totalReceivedAmount: totals.totalReceivedAmount,
    version: Number(doc.version ?? 1) + 1,
    updated_at: now,
  }
  writeDocuments(documents)
  return getLocalReceivingDocumentById(documentId)
}

export async function saveReceivingDocumentLocal(documentId, items, user, options = {}) {
  const documents = readDocuments()
  const docIdx = documents.findIndex((doc) => doc.id === documentId)
  if (docIdx < 0) throw new Error('Документ приёмки не найден')
  assertExpectedVersion(documents[docIdx], options.expectedVersion)

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

  documents[docIdx] = {
    ...documents[docIdx],
    status: RECEIVING_STATUS.IN_PROGRESS,
    totalOrderedQty: totals.totalOrderedQty,
    totalReceivedQty: totals.totalReceivedQty,
    totalDifferenceQty: totals.totalDifferenceQty,
    totalReceivedAmount: totals.totalReceivedAmount,
    supplierInvoiceNumbers: normalizeInvoiceNumbers(
      options.invoiceNumbers ?? options.supplierInvoiceNumbers ?? options.supplier_invoice_numbers ??
      documents[docIdx].supplierInvoiceNumbers ?? documents[docIdx].supplier_invoice_numbers
    ),
    startedAt: documents[docIdx].startedAt ?? documents[docIdx].started_at ?? now,
    started_at: documents[docIdx].startedAt ?? documents[docIdx].started_at ?? now,
    completedAt: null,
    completed_at: null,
    version: Number(documents[docIdx].version ?? 1) + 1,
    receivedBy: user?.login || user?.id || documents[docIdx].receivedBy || null,
    receivedByName: user?.name || documents[docIdx].receivedByName || null,
    updated_at: now,
  }
  writeDocuments(documents)

  return getLocalReceivingDocumentById(documentId)
}

export async function uploadReceivingItemPhotosLocal(documentId, items) {
  void documentId
  const result = []

  for (const item of items || []) {
    const pendingFiles = Array.from(item.pendingPhotoFiles || [])
    if (pendingFiles.length === 0) {
      result.push(item)
      continue
    }

    const existingPhotos = item.photoPaths ?? item.photoUrls ?? item.photo_urls ?? []
    const existingMetadata = item.photoMetadata ?? item.photo_metadata ?? []
    const nextPhotos = [...existingPhotos]
    const nextMetadata = [...existingMetadata]

    for (const file of pendingFiles) {
      const { contentType, size } = validateReceivingPhotoFile(file)
      const dataUrl = await readReceivingPhotoAsDataUrl(file)
      nextPhotos.push(dataUrl)
      nextMetadata.push({
        fileName: file.name || null,
        contentType,
        size,
        storedLocally: true,
      })
    }

    result.push({
      ...item,
      photoPaths: nextPhotos,
      photoUrls: nextPhotos,
      photoMetadata: nextMetadata,
      pendingPhotoFiles: [],
    })
  }

  return result
}

export async function completeReceivingDocumentLocal(documentId, items, user, options = {}) {
  const documents = readDocuments()
  const docIdx = documents.findIndex((doc) => doc.id === documentId)
  if (docIdx < 0) throw new Error('Документ приёмки не найден')
  assertExpectedVersion(documents[docIdx], options.expectedVersion)

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
    totalReceivedAmount: totals.totalReceivedAmount,
    supplierInvoiceNumbers: normalizeInvoiceNumbers(
      options.invoiceNumbers ?? options.supplierInvoiceNumbers ?? options.supplier_invoice_numbers ??
      doc.supplierInvoiceNumbers ?? doc.supplier_invoice_numbers
    ),
    startedAt: doc.startedAt ?? doc.started_at ?? now,
    started_at: doc.startedAt ?? doc.started_at ?? now,
    completedAt: now,
    completed_at: now,
    version: Number(doc.version ?? 1) + 1,
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
      purchases[orderIdx] = {
        ...purchases[orderIdx],
        status: PURCHASE_STATUS.RECEIVED,
        updated_at: now,
      }
      writePurchaseOrders(purchases)
    }
  }

  return getLocalReceivingDocumentById(documentId)
}

export async function recordReceivingUmagExportLocal(documentId, metadata = {}) {
  const documents = readDocuments()
  const docIdx = documents.findIndex((doc) => doc.id === documentId)
  if (docIdx < 0) throw new Error('Документ приёмки не найден')
  const doc = normalizeReceivingDocument(documents[docIdx])
  assertExpectedVersion(doc, metadata.expectedVersion)
  if (
    metadata.expectedExportVersion != null &&
    Number(metadata.expectedExportVersion) !== Number(doc.exportVersion || 0)
  ) {
    throw new Error('История выгрузки была изменена. Сформируйте файл заново.')
  }
  if (doc.status !== RECEIVING_STATUS.RECEIVED || !doc.completedAt) {
    throw new Error('Выгрузка доступна только для завершённой приёмки')
  }
  if (!String(metadata.fileName || '').trim()) throw new Error('Не указано имя файла выгрузки')
  if (Number(metadata.rowCount || 0) <= 0) throw new Error('В приёмке нет строк для выгрузки в UMAG')

  const now = new Date().toISOString()
  const exportVersion = Number(doc.exportVersion || 0) + 1
  const entry = {
    id: genId(),
    receivingDocumentId: documentId,
    documentVersion: doc.version,
    exportVersion,
    fileName: String(metadata.fileName).trim(),
    rowCount: Number(metadata.rowCount || 0),
    totalQuantity: Number(metadata.totalQuantity || 0),
    totalAmount: Number(metadata.totalAmount || 0),
    umagComment: metadata.umagComment || '',
    generatedAt: now,
  }
  const exports = readExports()
  exports.push(entry)
  writeExports(exports)

  documents[docIdx] = {
    ...documents[docIdx],
    exportVersion,
    export_version: exportVersion,
    lastExportedAt: now,
    last_exported_at: now,
    lastExportFilename: entry.fileName,
    last_export_filename: entry.fileName,
    updated_at: now,
  }
  writeDocuments(documents)
  return entry
}
