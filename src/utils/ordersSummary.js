import { pluralizeRu } from './procurementPlannerUx.js'

const DELIVERY_FORMS = ['поставка', 'поставки', 'поставок']
const ITEM_FORMS = ['товар', 'товара', 'товаров']

/** What the receiver wants at a glance: how many deliveries are coming and how many items in them. */
export function summarizeOrders(orders) {
  let items = 0
  const list = orders || []
  for (const order of list) items += Number(order.itemsCount ?? order.items?.length ?? 0) || 0
  return { deliveries: list.length, items }
}

/**
 * «Сегодня ждём 5 поставок, 38 товаров» for today; «Неделя: 12 поставок, 120 товаров» for other periods.
 * null when there is nothing to say (the empty list already explains itself).
 */
export function describeOrdersSummary(summary, { periodLabel, isToday, cancelled = false }) {
  if (!summary || summary.deliveries === 0) return null
  const deliveries = `${summary.deliveries} ${pluralizeRu(summary.deliveries, DELIVERY_FORMS)}`
  const items = `${summary.items} ${pluralizeRu(summary.items, ITEM_FORMS)}`
  if (cancelled) return `Отменено: ${deliveries}, ${items}`
  if (isToday) return `Сегодня ждём ${deliveries}, ${items}`
  return `${periodLabel}: ${deliveries}, ${items}`
}
