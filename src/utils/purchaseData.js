import { getWorkflowMode, isSimpleWorkflow } from './procurementWorkflow'

export { PROCUREMENT_WORKFLOW_MODE, getWorkflowMode, isSimpleWorkflow } from './procurementWorkflow'

/**
 * Заказ бывает только «Черновик» или «Сохранён» (схема владельца, этап 25;
 * `docs/procurement/order-lifecycle/final-statuses.md`). Другие значения база не принимает (CHECK).
 */
export const PURCHASE_STATUS = {
  DRAFT: 'draft',
  SAVED: 'saved',
}

export const PURCHASE_STATUS_LABELS = {
  draft: 'Черновик',
  saved: 'Сохранён',
}

export const PURCHASE_STATUS_BADGE = {
  draft: 'warning',
  saved: 'done',
}

export const isOrderDraft = (order) => order?.status === PURCHASE_STATUS.DRAFT
export const isOrderSaved = (order) => order?.status === PURCHASE_STATUS.SAVED

/** Приёмщик видит только сохранённые заказы; закупщик — и черновики. */
export function isOrderVisibleToRole(order, canEdit) {
  if (isOrderSaved(order)) return true
  return isOrderDraft(order) && Boolean(canEdit)
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
