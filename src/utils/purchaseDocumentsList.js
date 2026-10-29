import { isOrderDraft, isOrderSaved } from './purchaseData'
import { toSettlementsDateKey } from './settlementsPeriod'

export const DEFAULT_DOCUMENTS_FILTER = Object.freeze({
  supplierIds: [],
  status: '',
  q: '',
})

function createdDateKey(order) {
  const value = order.createdAt || order.date
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : toSettlementsDateKey(date)
}

/**
 * Pure list logic: drafts always stay on top (a draft created last month must not vanish with the period),
 * saved documents are cut by the creation period; supplier / status / number / text filters apply to both.
 */
export function selectPurchaseDocuments(orders, filter, itemOrderIds) {
  const q = (filter.q || '').trim().toLowerCase()
  const suppliers = new Set(filter.supplierIds || [])
  const matches = (order) => {
    if (suppliers.size && !suppliers.has(order.supplierId)) return false
    if (filter.status && order.status !== filter.status) return false
    if (q) {
      const hit =
        String(order.number ?? '').includes(q) ||
        (order.supplierName || '').toLowerCase().includes(q) ||
        Boolean(itemOrderIds?.has(order.id))
      if (!hit) return false
    }
    return true
  }
  const drafts = orders
    .filter(isOrderDraft)
    .filter(matches)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  const saved = orders
    .filter(isOrderSaved)
    .filter((order) => {
      const key = createdDateKey(order)
      return key >= filter.dateFrom && key <= filter.dateTo
    })
    .filter(matches)
    .sort((a, b) => (b.number || 0) - (a.number || 0))
  return [...drafts, ...saved]
}

/**
 * Pure list logic of the receiver's «Заказы»: saved orders only, cut by the expected delivery date,
 * the nearest delivery last-to-first, then by supplier.
 */
export function selectReceiverOrders(orders, { dateFrom, dateTo }) {
  return orders
    .filter(isOrderSaved)
    .filter(
      (order) =>
        order.expectedDeliveryDate && order.expectedDeliveryDate >= dateFrom && order.expectedDeliveryDate <= dateTo
    )
    .sort(
      (a, b) =>
        (b.expectedDeliveryDate || '').localeCompare(a.expectedDeliveryDate || '') ||
        (a.supplierName || '').localeCompare(b.supplierName || '', 'ru')
    )
}
