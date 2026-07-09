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
  in_progress: 'На приёмке',
  partially_received: 'Частично принят',
  partial: 'Частично принят',
  received: 'Принят',
  cancelled: 'Отменён',
}

export const RECEIVING_STATUS_BADGE = {
  awaiting_receiving: 'warning',
  awaiting: 'warning',
  in_progress: 'info',
  partially_received: 'warning',
  partial: 'warning',
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
  return {
    totalOrderedQty,
    totalReceivedQty,
    totalDifferenceQty: totalReceivedQty - totalOrderedQty,
  }
}

export function normalizeReceivingItem(raw) {
  if (!raw) return null
  const orderedQty = raw.orderedQty ?? raw.ordered_qty ?? 0
  const receivedQty = raw.receivedQty ?? raw.received_qty ?? 0
  return {
    id: raw.id,
    receivingDocumentId: raw.receivingDocumentId ?? raw.receiving_document_id ?? null,
    purchaseOrderItemId: raw.purchaseOrderItemId ?? raw.purchase_order_item_id ?? null,
    productName: raw.productName ?? raw.product_name ?? '',
    barcode: raw.barcode ?? '',
    orderedQty,
    receivedQty,
    differenceQty:
      raw.differenceQty ??
      raw.difference_qty ??
      calcDifferenceQty(receivedQty, orderedQty),
    purchasePrice: raw.purchasePrice ?? raw.purchase_price ?? 0,
    status: raw.status ?? RECEIVING_ITEM_STATUS.PENDING,
    comment: raw.comment ?? '',
    sortOrder: raw.sortOrder ?? raw.sort_order ?? 0,
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? null,
  }
}

export function normalizeReceivingDocument(raw, items = []) {
  if (!raw) return null
  const normalizedItems = (items.length ? items : raw.items || []).map(normalizeReceivingItem)
  const totals = calcReceivingTotals(normalizedItems)
  const status = normalizeReceivingStatus(raw.status)

  return {
    id: raw.id,
    number: raw.number,
    purchaseOrderId: raw.purchaseOrderId ?? raw.purchase_order_id ?? null,
    purchaseOrderNumber: raw.purchaseOrderNumber ?? raw.purchase_order_number ?? null,
    supplierId: raw.supplierId ?? raw.supplier_id ?? null,
    supplierName: raw.supplierName ?? raw.supplier_name ?? '',
    status,
    expectedDeliveryDate: raw.expectedDeliveryDate ?? raw.expected_delivery_date ?? '',
    createdBy: raw.createdBy ?? raw.created_by ?? '',
    createdByName: raw.createdByName ?? raw.created_by_name ?? '',
    receivedBy: raw.receivedBy ?? raw.received_by ?? null,
    receivedByName: raw.receivedByName ?? raw.received_by_name ?? null,
    comment: raw.comment ?? '',
    totalOrderedQty: raw.totalOrderedQty ?? raw.total_ordered_qty ?? totals.totalOrderedQty,
    totalReceivedQty: raw.totalReceivedQty ?? raw.total_received_qty ?? totals.totalReceivedQty,
    totalDifferenceQty:
      raw.totalDifferenceQty ?? raw.total_difference_qty ?? totals.totalDifferenceQty,
    itemsCount: raw.itemsCount ?? raw.items_count ?? normalizedItems.length,
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
  const normalized = (items || []).map(normalizeReceivingItem)
  if (normalized.length === 0) return RECEIVING_STATUS.RECEIVED
  const allMatch = normalized.every(
    (item) => Number(item.receivedQty) === Number(item.orderedQty)
  )
  return allMatch ? RECEIVING_STATUS.RECEIVED : RECEIVING_STATUS.PARTIALLY_RECEIVED
}
