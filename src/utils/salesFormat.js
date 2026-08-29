/**
 * Money formatting for the «Продажи» section. Rounds to the nearest whole
 * tenge (standard half-up rounding) — no kopecks anywhere in these views.
 */

/** Bare rounded number, thousands-grouped, no currency symbol — for table
 * cells whose unit is already stated once in a row/column label or a
 * "Показатель" dropdown, so repeating "₸" on every cell would be noise. */
export function formatSalesMoney(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return Math.round(value).toLocaleString('ru-KZ', { maximumFractionDigits: 0 })
}

/** Same rounding, with the ₸ symbol — for standalone values (KPI cards, a
 * chart tooltip) that have no shared header to carry the unit instead. */
export function formatSalesMoneyWithUnit(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${formatSalesMoney(value)} ₸`
}
