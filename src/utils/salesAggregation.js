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
 * 5-step funnel for the last synced month vs the same month a year earlier —
 * Чеки/Средний чек have no UMAG source wired up yet (no receipts endpoint
 * in use), so they come back with value:null and are rendered as "нет
 * данных" rather than silently omitted.
 */
export function buildFunnelSteps(facts, latestMonthKey) {
  if (!latestMonthKey) return []
  const monthly = buildMonthlyTotals(facts)
  const priorKey = priorYearMonthKey(latestMonthKey)
  const current = monthly.find((m) => m.monthKey === latestMonthKey) || null
  const prior = monthly.find((m) => m.monthKey === priorKey) || null

  return [
    { key: 'checks', label: 'Чеки', value: null, unit: '', deltaPct: null, unavailable: true },
    { key: 'avgCheck', label: 'Средний чек', value: null, unit: '₸', deltaPct: null, unavailable: true },
    {
      key: 'revenue',
      label: 'Выручка',
      value: current?.revenue ?? null,
      unit: '₸',
      deltaPct: current && prior ? deltaPct(current.revenue, prior.revenue) : null,
    },
    {
      key: 'marginPct',
      label: 'Маржинальность',
      value: current?.margin ?? null,
      unit: '%',
      deltaPct: current && prior ? current.margin - prior.margin : null,
      isPoints: true,
    },
    {
      key: 'margin',
      label: 'Валовая маржа',
      value: current?.profit ?? null,
      unit: '₸',
      deltaPct: current && prior ? deltaPct(current.profit, prior.profit) : null,
    },
  ]
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

function cellValue(cell, metric) {
  if (!cell) return null
  if (metric === 'revenue') return cell.revenue
  if (metric === 'profit') return cell.profit
  if (metric === 'quantity') return cell.quantity
  if (metric === 'markup') return cell.cogs > 0 ? cell.revenue / cell.cogs : null
  return cell.revenue
}

function categoryTotal(cat, metric) {
  if (metric === 'revenue') return cat.totalRevenue
  if (metric === 'profit') return cat.totalProfit
  if (metric === 'quantity') return cat.totalQuantity
  if (metric === 'markup') return cat.totalCogs > 0 ? cat.totalRevenue / cat.totalCogs : null
  return cat.totalRevenue
}

function priorYearMonthKey(monthKey) {
  const [y, m] = monthKey.split('-')
  return `${Number(y) - 1}-${m}-01`
}

/** % change for revenue/profit/quantity, raw-unit difference for the markup ratio (matches the reference's isRatio() split). */
function cellDelta(current, previous, metric) {
  if (current == null || previous == null) return null
  if (metric === 'markup') return previous === 0 ? null : (current - previous) * 100
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

/**
 * Category × month matrix for "Оцифровка". `null` marks a category/month
 * with no facts at all (as opposed to a real zero), so the heat scale and
 * the '—' display can tell the two apart — matches the reference dashboard.
 * `mode: 'delta'` returns % change vs the same calendar month a year
 * earlier instead of raw values (null where no prior-year month exists).
 */
export function buildDigitizationMatrix(facts, metric = 'revenue', mode = 'value') {
  const months = [...new Set(facts.map((r) => r.monthKey))].sort()
  const categories = new Map()

  for (const row of facts) {
    const catKey = row.categoryName || 'Без категории'
    if (!categories.has(catKey)) {
      categories.set(catKey, {
        categoryName: catKey,
        cellsByMonth: new Map(),
        totalRevenue: 0,
        totalCogs: 0,
        totalProfit: 0,
        totalQuantity: 0,
      })
    }
    const cat = categories.get(catKey)
    const cell = cat.cellsByMonth.get(row.monthKey) || { revenue: 0, cogs: 0, profit: 0, quantity: 0 }
    cell.revenue += row.revenue
    cell.cogs += row.cogs
    cell.profit += row.profit
    cell.quantity += row.quantity
    cat.cellsByMonth.set(row.monthKey, cell)
    cat.totalRevenue += row.revenue
    cat.totalCogs += row.cogs
    cat.totalProfit += row.profit
    cat.totalQuantity += row.quantity
  }

  const rows = [...categories.values()]
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .map((cat) => {
      const values = months.map((monthKey) => {
        const current = cellValue(cat.cellsByMonth.get(monthKey), metric)
        if (mode !== 'delta') return current
        const previous = cellValue(cat.cellsByMonth.get(priorYearMonthKey(monthKey)), metric)
        return cellDelta(current, previous, metric)
      })
      return {
        categoryName: cat.categoryName,
        total: mode === 'delta' ? null : categoryTotal(cat, metric),
        values,
      }
    })

  return { months, rows, mode }
}
