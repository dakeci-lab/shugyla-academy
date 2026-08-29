/**
 * Pure aggregation helpers over sales_category_month_facts rows
 * ({ monthKey, categoryName, subcategoryName, revenue, cogs, profit, quantity, skuCount }).
 * No I/O — takes the already-fetched array, returns view-ready shapes.
 */

function emptyTotals() {
  return { revenue: 0, cogs: 0, profit: 0, quantity: 0 }
}

function addTotals(target, row) {
  target.revenue += row.revenue
  target.cogs += row.cogs
  target.profit += row.profit
  target.quantity += row.quantity
}

function marginPct(totals) {
  if (!totals.revenue) return 0
  return (totals.profit / totals.revenue) * 100
}

function deltaPct(current, previous) {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

function monthParts(monthKey) {
  const [y, m] = String(monthKey || '').split('-')
  return { year: Number(y), month: Number(m) }
}

/**
 * Category/subcategory rows for the "Продажи" tab: year-to-date totals
 * through the month of `latestMonthKey`, plus the same-months-last-year
 * total for a like-for-like Δ. `latestMonthKey` should be the most recent
 * month present in `facts` (usually the last successfully synced month).
 */
export function buildCategoryYoyRows(facts, latestMonthKey) {
  if (!latestMonthKey || facts.length === 0) {
    return { currentYear: null, priorYear: null, rows: [] }
  }
  const { year: currentYear, month: cutoffMonth } = monthParts(latestMonthKey)
  const priorYear = currentYear - 1

  const categories = new Map()

  for (const row of facts) {
    const { year, month } = monthParts(row.monthKey)
    if (month > cutoffMonth) continue
    if (year !== currentYear && year !== priorYear) continue

    const catKey = row.categoryName || 'Без категории'
    if (!categories.has(catKey)) {
      categories.set(catKey, {
        categoryName: catKey,
        current: emptyTotals(),
        prior: emptyTotals(),
        subcategories: new Map(),
      })
    }
    const cat = categories.get(catKey)
    const bucket = year === currentYear ? cat.current : cat.prior
    addTotals(bucket, row)

    if (row.subcategoryName) {
      if (!cat.subcategories.has(row.subcategoryName)) {
        cat.subcategories.set(row.subcategoryName, {
          subcategoryName: row.subcategoryName,
          current: emptyTotals(),
          prior: emptyTotals(),
        })
      }
      const sub = cat.subcategories.get(row.subcategoryName)
      addTotals(year === currentYear ? sub.current : sub.prior, row)
    }
  }

  const rows = [...categories.values()]
    .map((cat) => ({
      categoryName: cat.categoryName,
      revenue: cat.current.revenue,
      cogs: cat.current.cogs,
      profit: cat.current.profit,
      quantity: cat.current.quantity,
      margin: marginPct(cat.current),
      deltaPct: deltaPct(cat.current.revenue, cat.prior.revenue),
      subRows: [...cat.subcategories.values()]
        .map((sub) => ({
          subcategoryName: sub.subcategoryName,
          revenue: sub.current.revenue,
          cogs: sub.current.cogs,
          profit: sub.current.profit,
          quantity: sub.current.quantity,
          margin: marginPct(sub.current),
          deltaPct: deltaPct(sub.current.revenue, sub.prior.revenue),
        }))
        .sort((a, b) => b.revenue - a.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue)

  return { currentYear, priorYear, cutoffMonth, rows }
}

/** Total revenue/cogs/profit per month across all categories, sorted oldest→newest. */
export function buildMonthlyTotals(facts) {
  const byMonth = new Map()
  for (const row of facts) {
    if (!byMonth.has(row.monthKey)) byMonth.set(row.monthKey, emptyTotals())
    addTotals(byMonth.get(row.monthKey), row)
  }
  return [...byMonth.entries()]
    .map(([monthKey, totals]) => ({
      monthKey,
      revenue: totals.revenue,
      cogs: totals.cogs,
      profit: totals.profit,
      margin: marginPct(totals),
    }))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
}

/**
 * Categories whose revenue dropped the most (as %) in `latestMonthKey`
 * versus the same calendar month a year earlier. Only categories with some
 * revenue in either month are considered; brand-new/discontinued categories
 * are not flagged as "attention" (nothing to compare against).
 */
export function findCategoriesNeedingAttention(facts, latestMonthKey, limit = 5) {
  if (!latestMonthKey) return []
  const { year, month } = monthParts(latestMonthKey)
  const priorMonthKey = `${year - 1}-${String(month).padStart(2, '0')}-01`

  const current = new Map()
  const prior = new Map()
  for (const row of facts) {
    const catKey = row.categoryName || 'Без категории'
    if (row.monthKey === latestMonthKey) {
      current.set(catKey, (current.get(catKey) || 0) + row.revenue)
    } else if (row.monthKey === priorMonthKey) {
      prior.set(catKey, (prior.get(catKey) || 0) + row.revenue)
    }
  }

  const results = []
  for (const [catKey, priorRevenue] of prior) {
    if (priorRevenue <= 0) continue
    const currentRevenue = current.get(catKey) || 0
    const pct = ((currentRevenue - priorRevenue) / priorRevenue) * 100
    if (pct < 0) {
      results.push({ categoryName: catKey, currentRevenue, priorRevenue, deltaPct: pct })
    }
  }

  return results.sort((a, b) => a.deltaPct - b.deltaPct).slice(0, limit)
}

const DIGITIZATION_METRICS = {
  revenue: (row) => row.revenue,
  profit: (row) => row.profit,
  quantity: (row) => row.quantity,
}

/** Category × month matrix for the "Оцифровка" heatmap. */
export function buildDigitizationMatrix(facts, metric = 'revenue') {
  const valueOf = DIGITIZATION_METRICS[metric] || DIGITIZATION_METRICS.revenue
  const months = [...new Set(facts.map((r) => r.monthKey))].sort()
  const categories = new Map()

  for (const row of facts) {
    const catKey = row.categoryName || 'Без категории'
    if (!categories.has(catKey)) categories.set(catKey, { categoryName: catKey, valuesByMonth: new Map(), total: 0 })
    const cat = categories.get(catKey)
    const value = valueOf(row)
    cat.valuesByMonth.set(row.monthKey, (cat.valuesByMonth.get(row.monthKey) || 0) + value)
    cat.total += value
  }

  const rows = [...categories.values()]
    .sort((a, b) => b.total - a.total)
    .map((cat) => ({
      categoryName: cat.categoryName,
      total: cat.total,
      values: months.map((monthKey) => cat.valuesByMonth.get(monthKey) || 0),
    }))

  const max = rows.reduce(
    (acc, row) => Math.max(acc, ...row.values.map((v) => Math.abs(v))),
    0
  )

  return { months, rows, max }
}
