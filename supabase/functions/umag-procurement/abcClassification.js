/**
 * Pure ABC classification + UMAG sales-amount parsing for procurement snapshots.
 *
 * Tie policy: sort metric DESC, then barcode ASC. Equal metrics are one group.
 * The group class is taken from the cumulative share of strictly higher metrics:
 *   priorShare < 0.80 → A
 *   priorShare < 0.95 → B
 *   else → C
 * A tie therefore never straddles 80/95. The item that crosses a threshold stays
 * in the class where its group started (inclusive Pareto).
 *
 * Quantity metrics are quantized to 3 decimal places (`sales_8w numeric(14, 3)`)
 * after barcode aggregation and before positiveTotal / sort / tie grouping, so
 * float sums like 0.1+0.2 match 0.3.
 */

export const ABC_SHARE_A = 0.8
export const ABC_SHARE_B = 0.95
export const ABC_CLASSES = Object.freeze(['A', 'B', 'C'])

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

function compareBarcodeAsc(a, b) {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/**
 * Sum metrics per barcode so each SKU contributes once. Duplicate rows add;
 * last-wins overwrites are not used for totals or class assignment.
 * @param {Array<{ barcode: string, metric: number }>} rows
 * @returns {Array<{ barcode: string, metric: number }>}
 */
export function aggregateMetricsByBarcode(rows) {
  const aggregated = new Map()
  for (const row of rows || []) {
    const barcode = barcodeKey(row?.barcode)
    if (!barcode) continue
    const raw = Number(row.metric)
    const metric = Number.isFinite(raw) ? raw : 0
    aggregated.set(barcode, (aggregated.get(barcode) || 0) + metric)
  }
  return [...aggregated.entries()].map(([barcode, metric]) => ({ barcode, metric }))
}

/**
 * @param {Array<{ barcode: string, metric: number }>} rows
 * @param {{ negativesAsCIfPositiveTotal?: boolean }} [options]
 * @returns {Map<string, 'A'|'B'|'C'|null>}
 */
export function classifyAbcAxis(rows, options = {}) {
  const negativesAsCIfPositiveTotal = Boolean(options.negativesAsCIfPositiveTotal)
  const result = new Map()
  const parsed = aggregateMetricsByBarcode(rows).map((row) => ({
    barcode: row.barcode,
    metric: roundQty(row.metric),
  }))

  const positiveTotal = parsed.reduce(
    (sum, row) => sum + (row.metric > 0 ? row.metric : 0),
    0
  )

  for (const row of parsed) {
    if (row.metric > 0) continue
    if (negativesAsCIfPositiveTotal && row.metric < 0 && positiveTotal > 0) {
      result.set(row.barcode, 'C')
    } else {
      result.set(row.barcode, null)
    }
  }

  if (!(positiveTotal > 0)) {
    return result
  }

  const positives = parsed
    .filter((row) => row.metric > 0)
    .sort((a, b) => {
      if (b.metric !== a.metric) return b.metric - a.metric
      return compareBarcodeAsc(a.barcode, b.barcode)
    })

  let i = 0
  let cumulative = 0
  while (i < positives.length) {
    const metric = positives[i].metric
    const priorShare = cumulative / positiveTotal
    const groupClass =
      priorShare < ABC_SHARE_A ? 'A' : priorShare < ABC_SHARE_B ? 'B' : 'C'
    while (i < positives.length && positives[i].metric === metric) {
      result.set(positives[i].barcode, groupClass)
      cumulative += positives[i].metric
      i += 1
    }
  }

  return result
}

function metricOf(item, key) {
  const n = Number(item?.[key])
  return Number.isFinite(n) ? n : 0
}

/**
 * Assign the three independent ABC classes for a completed snapshot.
 * Mutates nothing; returns a barcode → classes map.
 */
export function assignSnapshotAbcClasses(items) {
  const list = Array.isArray(items) ? items : []
  const qtyMap = classifyAbcAxis(
    list.map((item) => ({ barcode: item.barcode, metric: metricOf(item, 'sales_8w') }))
  )
  const revenueMap = classifyAbcAxis(
    list.map((item) => ({ barcode: item.barcode, metric: metricOf(item, 'revenue_8w') }))
  )
  const profitMap = classifyAbcAxis(
    list.map((item) => ({ barcode: item.barcode, metric: metricOf(item, 'profit_8w') })),
    { negativesAsCIfPositiveTotal: true }
  )

  const byBarcode = new Map()
  for (const item of list) {
    const barcode = barcodeKey(item?.barcode)
    if (!barcode) continue
    byBarcode.set(barcode, {
      abc_qty: qtyMap.get(barcode) ?? null,
      abc_revenue: revenueMap.get(barcode) ?? null,
      abc_profit: profitMap.get(barcode) ?? null,
    })
  }
  return byBarcode
}
