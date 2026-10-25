/**
 * UMAG sales-report parsing and per-barcode aggregation for procurement snapshots.
 * (ABC classification lived here until 2026-10; removed together with the ABC analysis.)
 */

export function parseReportAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim())
    if (Number.isFinite(n)) return n
  }
  return 0
}

export function roundMoney(value) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

/** Quantity precision matches `sales_8w numeric(14, 3)` before ABC tie grouping. */
export const QTY_DECIMALS = 3

export function roundQty(value) {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** QTY_DECIMALS
  return Math.round(value * factor) / factor
}

export function barcodeKey(value) {
  if (value == null) return ''
  return String(value).trim()
}

/**
 * Sum qty / selling / arrival per barcode. Duplicate rows add. Missing or
 * non-numeric amounts become 0 — never price × quantity.
 */
export function accumulateSalesRows(rows) {
  const totals = new Map()
  const meta = new Map()
  for (const row of rows || []) {
    const barcode = barcodeKey(row?.barcode)
    if (!barcode) continue
    const prev = totals.get(barcode) || { qty: 0, revenue: 0, cogs: 0 }
    prev.qty += parseReportAmount(row.saleQuantity)
    prev.revenue += parseReportAmount(row.saleSellingAmount)
    prev.cogs += parseReportAmount(row.saleArrivalAmount)
    totals.set(barcode, prev)
    if (!meta.has(barcode)) {
      const productName =
        String(row.productFullName || row.productName || barcode).trim() || barcode
      meta.set(barcode, {
        productName,
        measure: String(row.measure || '').trim(),
      })
    }
  }
  return { totals, meta }
}

function finiteAmount(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Fold one week's already-summed barcode totals into the 8-week snapshot maps.
 * Qty is stored in that week slot; revenue/cogs += across weeks.
 */
export function mergeWeekSalesIntoSnapshot({
  weeklySalesByBarcode,
  moneyByBarcode,
  weekTotals,
  weekIndex,
  weekCount = 8,
}) {
  const weekly = weeklySalesByBarcode
  const moneyMap = moneyByBarcode
  const count = Math.max(1, Number(weekCount) || 8)
  for (const [barcode, totals] of weekTotals || []) {
    if (!weekly.has(barcode)) {
      weekly.set(barcode, Array.from({ length: count }, () => 0))
    }
    weekly.get(barcode)[weekIndex] = finiteAmount(totals?.qty)
    const money = moneyMap.get(barcode) || { revenue: 0, cogs: 0 }
    money.revenue += finiteAmount(totals?.revenue)
    money.cogs += finiteAmount(totals?.cogs)
    moneyMap.set(barcode, money)
  }
  return { weeklySalesByBarcode: weekly, moneyByBarcode: moneyMap }
}

/** Include SKU when stock, 8w qty, or any money fact is nonzero (returns and zero-qty money kept). */
export function shouldIncludeSnapshotBarcode({
  stock = 0,
  sales8w = 0,
  revenue = 0,
  cogs = 0,
  profit = 0,
} = {}) {
  return (
    finiteAmount(stock) !== 0 ||
    finiteAmount(sales8w) !== 0 ||
    finiteAmount(revenue) !== 0 ||
    finiteAmount(cogs) !== 0 ||
    finiteAmount(profit) !== 0
  )
}
