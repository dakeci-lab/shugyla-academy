import { calcLineTotal, isOrderDraft } from './purchaseData'

const WEEKDAYS_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

/** «вс, 25.10.2026» from YYYY-MM-DD. */
export function formatLongRuDate(dateKey) {
  if (!dateKey) return ''
  const [y, m, d] = String(dateKey).slice(0, 10).split('-')
  if (!(d && m && y)) return String(dateKey)
  const weekday = WEEKDAYS_RU[new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay()]
  return `${weekday}, ${d}.${m}.${y}`
}

/** «Заказ №1047» for a saved document, «Новый заказ» for a draft that has no number yet. */
export function documentTitle(order) {
  return order?.number ? `Заказ №${order.number}` : 'Новый заказ'
}

export function documentTotal(items) {
  return (items || []).reduce((sum, item) => sum + calcLineTotal(item.orderQty, item.purchasePrice), 0)
}

/**
 * What stops «Сохранить»: the document needs a supplier, at least one item and a quantity above zero in
 * every row. Returns the message to show, or '' when it can be saved.
 */
export function validateDocumentForSave(order, items) {
  if (!order || !isOrderDraft(order)) return 'Сохранить можно только черновик.'
  if (!items.length) return 'Добавьте в заказ хотя бы один товар.'
  if (!order.supplierId && !order.supplierName) return 'Выберите поставщика.'
  const empty = items.filter((item) => !(Number(item.orderQty) > 0))
  if (empty.length) {
    return empty.length === 1
      ? `Укажите количество у товара «${empty[0].productName}».`
      : `Укажите количество у ${empty.length} товаров (в строках с нулём).`
  }
  return ''
}

/** Suppliers whose order day is today (the «Сегодня» tab of the supplier picker). */
export function suppliersOrderedToday(suppliers, weekdayId) {
  return suppliers.filter((supplier) => (supplier.orderWeekdays || []).includes(weekdayId))
}
