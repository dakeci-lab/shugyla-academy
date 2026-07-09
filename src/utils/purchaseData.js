/** Статусы закупочного документа (purchase_orders.status) */

export const PURCHASE_STATUS = {
  DRAFT: 'draft',
  FORMED: 'formed',
  SENT: 'sent',
  AWAITING_RECEIVING: 'awaiting_receiving',
  PARTIALLY_RECEIVED: 'partially_received',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
}

export const PURCHASE_STATUS_LABELS = {
  draft: 'Черновик',
  formed: 'Сформирован',
  sent: 'Отправлен поставщику',
  awaiting_receiving: 'Ожидает приёмки',
  partially_received: 'Частично принят',
  received: 'Принят',
  cancelled: 'Отменён',
}

export const PURCHASE_STATUS_BADGE = {
  draft: 'idle',
  formed: 'warning',
  sent: 'info',
  awaiting_receiving: 'warning',
  partially_received: 'warning',
  received: 'done',
  cancelled: 'idle',
}

export const ACTIVE_PURCHASE_STATUSES = [
  PURCHASE_STATUS.DRAFT,
  PURCHASE_STATUS.FORMED,
  PURCHASE_STATUS.SENT,
  PURCHASE_STATUS.AWAITING_RECEIVING,
  PURCHASE_STATUS.PARTIALLY_RECEIVED,
]

export function formatPurchaseAmount(amount) {
  if (amount == null || Number.isNaN(amount)) return '—'
  return `${Number(amount).toLocaleString('ru-RU')} ₸`
}

export function formatPurchaseDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}

export function calcLineTotal(qty, price) {
  return Math.round(Number(qty || 0) * Number(price || 0))
}

export function calcOrderTotal(items) {
  return items.reduce((sum, item) => sum + calcLineTotal(item.orderQty, item.purchasePrice), 0)
}

export function normalizePurchaseOrder(raw) {
  if (!raw) return null
  const items = (raw.items || []).map(normalizePurchaseItem)
  return {
    id: raw.id,
    number: raw.number,
    date: raw.date ?? raw.purchaseDate ?? raw.purchase_date ?? '',
    purchaseDate: raw.purchaseDate ?? raw.purchase_date ?? raw.date ?? '',
    supplierId: raw.supplierId ?? raw.supplier_id ?? null,
    supplierName: raw.supplierName ?? raw.supplier_name ?? '',
    itemsCount: raw.itemsCount ?? raw.items_count ?? items.length,
    totalAmount: raw.totalAmount ?? raw.total_amount ?? calcOrderTotal(items),
    status: raw.status ?? PURCHASE_STATUS.DRAFT,
    createdBy: raw.createdBy ?? raw.created_by ?? '',
    createdByName: raw.createdByName ?? raw.created_by_name ?? '',
    expectedDeliveryDate: raw.expectedDeliveryDate ?? raw.expected_delivery_date ?? '',
    comment: raw.comment ?? '',
    transferredToReceiving: raw.transferredToReceiving ?? raw.transferred_to_receiving ?? false,
    receivingDocumentId: raw.receivingDocumentId ?? raw.receiving_document_id ?? null,
    items,
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? null,
  }
}

export function normalizePurchaseItem(raw) {
  if (!raw) return null
  const orderQty =
    raw.orderQty ?? raw.order_qty ?? raw.orderedQty ?? raw.ordered_qty ?? 0
  const purchasePrice = raw.purchasePrice ?? raw.purchase_price ?? 0
  return {
    id: raw.id,
    purchaseOrderId: raw.purchaseOrderId ?? raw.purchase_order_id ?? null,
    productName: raw.productName ?? raw.product_name ?? '',
    barcode: raw.barcode ?? '',
    supplierId: raw.supplierId ?? raw.supplier_id ?? null,
    supplierName: raw.supplierName ?? raw.supplier_name ?? '',
    stock: raw.stock ?? raw.stockQty ?? raw.stock_qty ?? 0,
    salesPerDay: raw.salesPerDay ?? raw.sales_per_day ?? 0,
    recommendation: raw.recommendation ?? raw.recommendedQty ?? raw.recommended_qty ?? 0,
    orderQty,
    purchasePrice,
    lineTotal:
      raw.lineTotal ??
      raw.line_total ??
      raw.totalAmount ??
      raw.total_amount ??
      calcLineTotal(orderQty, purchasePrice),
    comment: raw.comment ?? '',
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? null,
  }
}

export function countPurchasesByStatus(orders) {
  return {
    drafts: orders.filter((o) => o.status === PURCHASE_STATUS.DRAFT).length,
    pendingSend: orders.filter((o) => o.status === PURCHASE_STATUS.FORMED).length,
    pendingReceiving: orders.filter((o) =>
      [
        PURCHASE_STATUS.SENT,
        PURCHASE_STATUS.AWAITING_RECEIVING,
        PURCHASE_STATUS.PARTIALLY_RECEIVED,
      ].includes(o.status)
    ).length,
    completed: orders.filter((o) => o.status === PURCHASE_STATUS.RECEIVED).length,
  }
}

export function filterActivePurchases(orders) {
  return orders.filter((o) => ACTIVE_PURCHASE_STATUSES.includes(o.status))
}
