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

/** Group a list row belongs to on phones: its creation day (drafts and saved documents are mixed by time, like UMAG). */
export function documentGroupKey(order) {
  return createdDateKey(order) || 'none'
}

/** «Вт, 3 Ноября» (like UMAG) for a group key. */
export function formatDocumentGroupLabel(key) {
  if (key === 'none') return 'Без даты'
  const date = new Date(`${key}T00:00:00`)
  if (Number.isNaN(date.getTime())) return key
  const text = date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
  // «вт, 3 ноября» → «Вт, 3 Ноября»
  return text.replace(/^./, (c) => c.toUpperCase()).replace(/(\d+ )(\p{L})/u, (_, d, c) => d + c.toUpperCase())
}

/** Time of creation as «17:26» (Aqtobe), for the second line of a phone row. */
export function formatDocumentTime(order) {
  const value = order.createdAt || order.date
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Aqtobe' })
}

/**
 * Pure list logic: drafts are never cut by the period (a draft created last month must not vanish with it),
 * saved documents are cut by the creation period; supplier / status / number / text filters apply to both.
 * Desktop: drafts first, then saved by number. Phones (`chronological`): everything by creation time, newest first.
 */
export function selectPurchaseDocuments(orders, filter, itemOrderIds, { chronological = false } = {}) {
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
  if (chronological) {
    // Phones: one list by creation time, newest first; a draft can sit below a saved document.
    return [...drafts, ...saved].sort(
      (a, b) =>
        (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || '') || (b.number || 0) - (a.number || 0)
    )
  }
  return [...drafts, ...saved]
}

/**
 * Pure list logic of the receiver's «Заказы»: saved orders only, cut by the expected delivery date,
 * the nearest delivery last-to-first, then by supplier.
 */
/** Statuses of the receiver's filter: the whole document is «Сверено» (the receiver ticked it) or not yet. */
export const RECEIVER_STATUS = Object.freeze({ CHECKED: 'checked', UNCHECKED: 'unchecked' })

export const DEFAULT_RECEIVER_FILTER = Object.freeze({ supplierIds: [], status: '', q: '' })

/**
 * The receiver's list: saved orders whose DELIVERY date is in the period, narrowed by supplier, by «Сверено» / «Не сверено»
 * and by a text (an order number, the supplier's name, or — via `itemOrderIds`, found on the server — an item's name / barcode).
 */
export function selectReceiverOrders(orders, filter, itemOrderIds = null) {
  const { dateFrom, dateTo } = filter
  const suppliers = new Set(filter.supplierIds || [])
  const q = String(filter.q || '').trim().toLowerCase()
  return orders
    .filter(isOrderSaved)
    .filter(
      (order) =>
        order.expectedDeliveryDate && order.expectedDeliveryDate >= dateFrom && order.expectedDeliveryDate <= dateTo
    )
    .filter((order) => !suppliers.size || suppliers.has(order.supplierId))
    .filter((order) => {
      if (filter.status === RECEIVER_STATUS.CHECKED) return Boolean(order.checkedAt)
      if (filter.status === RECEIVER_STATUS.UNCHECKED) return !order.checkedAt
      return true
    })
    .filter((order) => {
      if (!q) return true
      return (
        String(order.number ?? '').includes(q) ||
        (order.supplierName || '').toLowerCase().includes(q) ||
        Boolean(itemOrderIds?.has(order.id))
      )
    })
    .sort(
      (a, b) =>
        (b.expectedDeliveryDate || '').localeCompare(a.expectedDeliveryDate || '') ||
        (a.supplierName || '').localeCompare(b.supplierName || '', 'ru')
    )
}
