import { getWorkflowMode, isSimpleWorkflow } from './procurementWorkflow'

export { PROCUREMENT_WORKFLOW_MODE, getWorkflowMode, isSimpleWorkflow } from './procurementWorkflow'

/** Статусы закупочного документа (purchase_orders.status) */

export const PURCHASE_STATUS = {
  DRAFT: 'draft',
  SAVED: 'saved',
  FORMED: 'formed',
  SENT: 'sent',
  AWAITING_RECEIVING: 'awaiting_receiving',
  PARTIALLY_RECEIVED: 'partially_received',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
}

export const PURCHASE_STATUS_LABELS = {
  draft: 'Черновик',
  saved: 'Сохранён',
  formed: 'Сформирован',
  sent: 'Отправлен поставщику',
  awaiting_receiving: 'Ожидает приёмки',
  partially_received: 'Частично принят',
  received: 'Принят',
  cancelled: 'Отменён',
}

export const PURCHASE_STATUS_BADGE = {
  draft: 'warning',
  saved: 'done',
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

/**
 * Заказ бывает только «Черновик» или «Сохранён» (схема владельца, этап 25).
 * Старые значения в базе (ожидает приёмки, принят, сформирован, отправлен, частично принят) читаются как «Сохранён»,
 * пока миграция этапа 25b не переименует их; «Отменён» — остаток старых данных, он скрыт и будет удалён.
 */
/** Остаётся для адаптеров приёмки до этапа 25c (удаление приёмки). */
export const ANALYTICS_DIRECT_WRITE_MESSAGE =
  'Заказ из планирования нельзя менять напрямую. Верните его в черновик.'

export const ORDER_VIEW_STATUS = Object.freeze({
  DRAFT: 'draft',
  SAVED: 'saved',
  CANCELLED: 'cancelled',
})

export function orderViewStatus(status) {
  if (status === PURCHASE_STATUS.DRAFT) return ORDER_VIEW_STATUS.DRAFT
  if (status === PURCHASE_STATUS.CANCELLED) return ORDER_VIEW_STATUS.CANCELLED
  return ORDER_VIEW_STATUS.SAVED
}

export const isOrderDraft = (order) => orderViewStatus(order?.status) === ORDER_VIEW_STATUS.DRAFT
export const isOrderSaved = (order) => orderViewStatus(order?.status) === ORDER_VIEW_STATUS.SAVED

/** Приёмщик видит только сохранённые заказы; закупщик — и черновики. */
export function isOrderVisibleToRole(order, canEdit) {
  const view = orderViewStatus(order?.status)
  if (view === ORDER_VIEW_STATUS.SAVED) return true
  return view === ORDER_VIEW_STATUS.DRAFT && Boolean(canEdit)
}

export function formatPurchaseAmount(amount) {
  if (amount == null || Number.isNaN(amount)) return '—'
  return `${Number(amount).toLocaleString('ru-RU')} ₸`
}

export function formatPurchaseDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}

export function formatPurchaseDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Almaty',
  })
}

export function calcLineTotal(qty, price) {
  return Math.round(Number(qty || 0) * Number(price || 0))
}

export function calcOrderTotal(items) {
  return items.reduce((sum, item) => sum + calcLineTotal(item.orderQty, item.purchasePrice), 0)
}

/**
 * Раньше формирование заказа из планирования само писало в комментарий эту фразу (миграция этапа 21
 * убрала запись); приёмщику она ничего не говорит, поэтому служебный текст считается пустым комментарием.
 */
const AUTO_ORDER_COMMENT = 'Сформировано из планирования закупок'

export function orderCommentForDisplay(comment) {
  const text = String(comment ?? '').trim()
  return text === AUTO_ORDER_COMMENT ? '' : text
}

export function normalizePurchaseOrder(raw) {
  if (!raw) return null
  const items = (raw.items || []).map(normalizePurchaseItem)
  return {
    id: raw.id,
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
    comment: orderCommentForDisplay(raw.comment),
    transferredToReceiving: raw.transferredToReceiving ?? raw.transferred_to_receiving ?? false,
    receivingDocumentId: raw.receivingDocumentId ?? raw.receiving_document_id ?? null,
    checkedAt: raw.checkedAt ?? raw.checked_at ?? null,
    checkedByName: raw.checkedByName ?? raw.checked_by_name ?? '',
    workflowMode: getWorkflowMode(raw),
    syncStatus: raw.syncStatus ?? raw.sync_status ?? null,
    syncError: raw.syncError ?? raw.sync_error ?? null,
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
    unit: raw.unit ?? raw.measure ?? '',
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
