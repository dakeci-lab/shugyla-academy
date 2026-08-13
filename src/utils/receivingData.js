import { getWorkflowMode } from './procurementWorkflow'

/** Статусы документа приёмки (receiving_documents.status) */

export const RECEIVING_STATUS = {
  AWAITING_RECEIVING: 'awaiting_receiving',
  IN_PROGRESS: 'in_progress',
  PARTIALLY_RECEIVED: 'partially_received',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
}

export const RECEIVING_STATUS_LABELS = {
  awaiting_receiving: 'Ожидает приёмки',
  awaiting: 'Ожидает приёмки',
  in_progress: 'Черновик',
  partially_received: 'Принят',
  partial: 'Принят',
  received: 'Принят',
  cancelled: 'Отменён',
}

export const RECEIVING_STATUS_BADGE = {
  awaiting_receiving: 'progress',
  awaiting: 'progress',
  in_progress: 'draft',
  partially_received: 'done',
  partial: 'done',
  received: 'done',
  cancelled: 'idle',
}

export const RECEIVING_ITEM_STATUS = {
  PENDING: 'pending',
  RECEIVED: 'received',
  PARTIAL: 'partial',
}

const LEGACY_STATUS_MAP = {
  awaiting: RECEIVING_STATUS.AWAITING_RECEIVING,
  partial: RECEIVING_STATUS.PARTIALLY_RECEIVED,
}

export function normalizeReceivingStatus(status) {
  if (!status) return RECEIVING_STATUS.AWAITING_RECEIVING
  return LEGACY_STATUS_MAP[status] || status
}

export function formatReceivingDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}

export function calcDifferenceQty(receivedQty, orderedQty) {
  return Number(receivedQty || 0) - Number(orderedQty || 0)
}

export function calcReceivingTotals(items) {
  const normalized = (items || []).map(normalizeReceivingItem)
  const totalOrderedQty = normalized.reduce((sum, item) => sum + Number(item.orderedQty || 0), 0)
  const totalReceivedQty = normalized.reduce((sum, item) => sum + Number(item.receivedQty || 0), 0)
  const totalOrderedAmount = normalized.reduce(
    (sum, item) => sum + Number(item.orderedQty || 0) * Number(item.orderedPurchasePrice || 0),
    0
  )
  const totalReceivedAmount = normalized.reduce(
    (sum, item) => sum + Number(item.receivedQty || 0) * Number(item.actualPurchasePrice || 0),
    0
  )
  return {
    totalOrderedQty,
    totalReceivedQty,
    totalDifferenceQty: totalReceivedQty - totalOrderedQty,
    totalOrderedAmount,
    totalReceivedAmount,
    totalAmountDifference: totalReceivedAmount - totalOrderedAmount,
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

export function isTemporaryReceivingPhotoUrl(value) {
  return /^(?:https?:|blob:)/i.test(String(value || '').trim())
}

export function normalizeReceivingPhotoPaths(value) {
  return normalizeStringArray(value).filter((path) => !isTemporaryReceivingPhotoUrl(path))
}

function normalizePhotoMetadata(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
}

export function normalizeReceivingItem(raw) {
  if (!raw) return null
  const orderedQty = raw.orderedQty ?? raw.ordered_qty ?? 0
  const receivedQty = raw.receivedQty ?? raw.received_qty ?? 0
  const orderedPurchasePrice =
    raw.orderedPurchasePrice ?? raw.ordered_purchase_price ?? raw.purchasePrice ?? raw.purchase_price ?? 0
  const actualPurchasePrice =
    raw.actualPurchasePrice ?? raw.actual_purchase_price ?? orderedPurchasePrice
  const photoPaths = normalizeReceivingPhotoPaths(
    raw.photoPaths ?? raw.photo_paths ?? raw.photo_urls
  )
  const hasDisplayPhotoUrls = raw.photoUrls != null
  return {
    id: raw.id,
    receivingDocumentId: raw.receivingDocumentId ?? raw.receiving_document_id ?? null,
    purchaseOrderItemId: raw.purchaseOrderItemId ?? raw.purchase_order_item_id ?? null,
    productName: raw.productName ?? raw.product_name ?? '',
    barcode: raw.barcode ?? '',
    unit: raw.unit ?? raw.measure ?? '',
    orderedQty,
    receivedQty,
    differenceQty:
      raw.differenceQty ??
      raw.difference_qty ??
      calcDifferenceQty(receivedQty, orderedQty),
    // purchasePrice remains as a backwards-compatible alias for the ordered
    // price snapshot. New receiving screens must edit actualPurchasePrice.
    purchasePrice: orderedPurchasePrice,
    orderedPurchasePrice,
    actualPurchasePrice,
    priceDifference: Number(actualPurchasePrice || 0) - Number(orderedPurchasePrice || 0),
    isOutsideOrder: Boolean(raw.isOutsideOrder ?? raw.is_outside_order),
    discrepancyReasonCode:
      raw.discrepancyReasonCode ?? raw.discrepancy_reason_code ?? null,
    discrepancyReason:
      raw.discrepancyReason ?? raw.discrepancy_reason ??
      raw.discrepancyReasonCode ?? raw.discrepancy_reason_code ?? '',
    // photoPaths are the durable private Storage keys persisted in photo_urls.
    // photoUrls may contain short-lived signed URLs attached only for display.
    photoPaths,
    photoUrls: normalizeStringArray(hasDisplayPhotoUrls ? raw.photoUrls : photoPaths),
    photoMetadata: normalizePhotoMetadata(raw.photoMetadata ?? raw.photo_metadata),
    status: raw.status ?? RECEIVING_ITEM_STATUS.PENDING,
    comment: raw.comment ?? '',
    sortOrder: raw.sortOrder ?? raw.sort_order ?? 0,
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? null,
  }
}

/**
 * Начал ли склад приёмку по документу.
 * Единственное определение на весь проект — им пользуются и UI, и адаптеры.
 * Принимает как доменную модель, так и сырую строку БД.
 */
export function isReceivingStarted(doc) {
  if (!doc) return false
  if (doc.status === RECEIVING_STATUS.CANCELLED) return false
  const received = Number(doc.totalReceivedQty ?? doc.total_received_qty ?? 0)
  return doc.status !== RECEIVING_STATUS.AWAITING_RECEIVING || received > 0
}

export function normalizeReceivingDocument(raw, items = []) {
  if (!raw) return null
  const normalizedItems = (items.length ? items : raw.items || []).map(normalizeReceivingItem)
  const totals = calcReceivingTotals(normalizedItems)
  const status = normalizeReceivingStatus(raw.status)

  return {
    id: raw.id,
    purchaseOrderId: raw.purchaseOrderId ?? raw.purchase_order_id ?? null,
    supplierId: raw.supplierId ?? raw.supplier_id ?? null,
    supplierName: raw.supplierName ?? raw.supplier_name ?? '',
    status,
    expectedDeliveryDate: raw.expectedDeliveryDate ?? raw.expected_delivery_date ?? '',
    createdBy: raw.createdBy ?? raw.created_by ?? '',
    createdByName: raw.createdByName ?? raw.created_by_name ?? '',
    receivedBy: raw.receivedBy ?? raw.received_by ?? null,
    receivedByName: raw.receivedByName ?? raw.received_by_name ?? null,
    supplierInvoiceNumbers: normalizeStringArray(
      raw.supplierInvoiceNumbers ?? raw.supplier_invoice_numbers
    ),
    comment: raw.comment ?? '',
    totalOrderedQty: raw.totalOrderedQty ?? raw.total_ordered_qty ?? totals.totalOrderedQty,
    totalReceivedQty: raw.totalReceivedQty ?? raw.total_received_qty ?? totals.totalReceivedQty,
    totalDifferenceQty:
      raw.totalDifferenceQty ?? raw.total_difference_qty ?? totals.totalDifferenceQty,
    totalAmount: raw.totalAmount ?? raw.total_amount ?? 0,
    totalReceivedAmount:
      raw.totalReceivedAmount ?? raw.total_received_amount ?? totals.totalReceivedAmount,
    itemsCount: raw.itemsCount ?? raw.items_count ?? normalizedItems.length,
    version: Number(raw.version ?? 1),
    startedAt: raw.startedAt ?? raw.started_at ?? null,
    completedAt: raw.completedAt ?? raw.completed_at ?? null,
    exportVersion: Number(raw.exportVersion ?? raw.export_version ?? 0),
    lastExportedAt: raw.lastExportedAt ?? raw.last_exported_at ?? null,
    lastExportedBy: raw.lastExportedBy ?? raw.last_exported_by ?? null,
    lastExportFilename: raw.lastExportFilename ?? raw.last_export_filename ?? null,
    workflowMode: getWorkflowMode(raw),
    items: normalizedItems,
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? null,
  }
}

export function countReceivingByStatus(documents) {
  const list = documents || []
  return {
    awaitingReceiving: list.filter(
      (doc) =>
        doc.status === RECEIVING_STATUS.AWAITING_RECEIVING ||
        doc.status === 'awaiting'
    ).length,
    inProgress: list.filter((doc) => doc.status === RECEIVING_STATUS.IN_PROGRESS).length,
    partiallyReceived: list.filter(
      (doc) =>
        doc.status === RECEIVING_STATUS.PARTIALLY_RECEIVED || doc.status === 'partial'
    ).length,
    received: list.filter((doc) => doc.status === RECEIVING_STATUS.RECEIVED).length,
  }
}

export function resolveReceivingCompleteStatus(items) {
  // Completion describes the workflow state, not whether quantities matched.
  // All discrepancies remain on item lines and the completed document is still
  // fully received as a process.
  void items
  return RECEIVING_STATUS.RECEIVED
}
