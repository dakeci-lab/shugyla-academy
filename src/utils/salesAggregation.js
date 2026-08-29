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

/**
 * Total revenue/cogs/profit per month across all categories, sorted oldest→newest.
 * `receiptsByMonth` (monthKey -> receipt count) is optional; when given, each
 * month also gets `receiptCount` and `avgCheck` (revenue / receiptCount).
 */
export function buildMonthlyTotals(facts, receiptsByMonth = null) {
  const byMonth = new Map()
  for (const row of facts) {
    if (!byMonth.has(row.monthKey)) byMonth.set(row.monthKey, emptyTotals())
    addTotals(byMonth.get(row.monthKey), row)
  }
  return [...byMonth.entries()]
    .map(([monthKey, totals]) => {
      const receiptCount = receiptsByMonth?.get(monthKey) ?? null
      return {
        monthKey,
        revenue: totals.revenue,
        cogs: totals.cogs,
        profit: totals.profit,
        margin: marginPct(totals),
        receiptCount,
        avgCheck: receiptCount ? totals.revenue / receiptCount : null,
      }
    })
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
}

/**
 * 5-step funnel for the last synced month vs the same month a year earlier.
 * `receiptsByMonth` (monthKey -> receipt count, from sales_month_receipt_facts)
 * is optional — Чеки/Средний чек render as "нет данных" until it's supplied
 * (e.g. before the first receipts backfill has run).
 */
export function buildFunnelSteps(facts, latestMonthKey, receiptsByMonth = null) {
  if (!latestMonthKey) return []
  const monthly = buildMonthlyTotals(facts, receiptsByMonth)
  const priorKey = priorYearMonthKey(latestMonthKey)
  const current = monthly.find((m) => m.monthKey === latestMonthKey) || null
  const prior = monthly.find((m) => m.monthKey === priorKey) || null

  return [
    {
      key: 'checks',
      label: 'Чеки',
      value: current?.receiptCount ?? null,
      unit: '',
      deltaPct: current?.receiptCount && prior?.receiptCount ? deltaPct(current.receiptCount, prior.receiptCount) : null,
      unavailable: current?.receiptCount == null,
    },
    {
      key: 'avgCheck',
      label: 'Средний чек',
      value: current?.avgCheck ?? null,
      unit: '₸',
      deltaPct: current?.avgCheck && prior?.avgCheck ? deltaPct(current.avgCheck, prior.avgCheck) : null,
      unavailable: current?.avgCheck == null,
    },
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
  if (metric === 'marginPct') return cell.revenue > 0 ? (cell.profit / cell.revenue) * 100 : null
  return cell.revenue
}

function categoryTotal(cat, metric) {
  if (metric === 'revenue') return cat.totalRevenue
  if (metric === 'profit') return cat.totalProfit
  if (metric === 'quantity') return cat.totalQuantity
  if (metric === 'markup') return cat.totalCogs > 0 ? cat.totalRevenue / cat.totalCogs : null
  if (metric === 'marginPct') return cat.totalRevenue > 0 ? (cat.totalProfit / cat.totalRevenue) * 100 : null
  return cat.totalRevenue
}

function priorYearMonthKey(monthKey) {
  const [y, m] = monthKey.split('-')
  return `${Number(y) - 1}-${m}-01`
}

/** % change for revenue/profit/quantity, pp difference for ratio metrics (markup, marginPct) — matches the reference's isRatio() split. */
function cellDelta(current, previous, metric) {
  if (current == null || previous == null) return null
  if (metric === 'markup' || metric === 'marginPct') return previous === 0 ? null : current - previous
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

const SHORT_MONTH_NAMES = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
]

export function shortMonthLabel(monthNumber) {
  return SHORT_MONTH_NAMES[monthNumber - 1] || ''
}

/**
 * Which calendar months to show as columns for a year-band comparison, and
 * which two years to compare: months 1..cutoff (cutoff = the latest synced
 * month's number), currentYear = its year, priorYear = currentYear - 1 —
 * a like-for-like YTD window for both bands.
 */
export function resolveYearBandRange(latestMonthKey) {
  if (!latestMonthKey) return { months: [], currentYear: null, priorYear: null }
  const { year, month } = monthParts(latestMonthKey)
  const months = []
  for (let m = 1; m <= month; m += 1) months.push(m)
  return { months, currentYear: year, priorYear: year - 1 }
}

function emptyCell() {
  return { revenue: 0, cogs: 0, profit: 0, quantity: 0 }
}

function addCell(target, row) {
  target.revenue += row.revenue
  target.cogs += row.cogs
  target.profit += row.profit
  target.quantity += row.quantity
}

/**
 * Category/subcategory × month table for the "Продажи" tab, banded by year
 * (current vs prior, like-for-like months) plus a Δ band — mirrors the
 * reference dashboard's stacked 2026/2025/Δ layout instead of a single
 * flat YoY row. `metric`: revenue | profit | quantity | markup | marginPct.
 */
export function buildSalesCategoryBands(facts, { metric = 'revenue', months, currentYear, priorYear }) {
  if (!months || months.length === 0 || !currentYear || !priorYear) {
    return { months: [], currentYear, priorYear, rows: [] }
  }

  // category -> subcategory ('' = direct) -> year -> month -> cell
  const tree = new Map()
  for (const row of facts) {
    const { year, month } = monthParts(row.monthKey)
    if ((year !== currentYear && year !== priorYear) || !months.includes(month)) continue

    const catKey = row.categoryName || 'Без категории'
    if (!tree.has(catKey)) tree.set(catKey, new Map())
    const subMap = tree.get(catKey)
    const subKey = row.subcategoryName || ''
    if (!subMap.has(subKey)) subMap.set(subKey, new Map())
    const yearMap = subMap.get(subKey)
    if (!yearMap.has(year)) yearMap.set(year, new Map())
    const monthMap = yearMap.get(year)
    const cell = monthMap.get(month) || emptyCell()
    addCell(cell, row)
    monthMap.set(month, cell)
  }

  function seriesFor(yearMap, year) {
    const monthMap = yearMap.get(year)
    const values = months.map((m) => cellValue(monthMap?.get(m), metric))
    const agg = emptyCell()
    let any = false
    for (const m of months) {
      const cell = monthMap?.get(m)
      if (cell) {
        any = true
        addCell(agg, cell)
      }
    }
    return { values, total: any ? cellValue(agg, metric) : null }
  }

  function bandsFor(yearMap) {
    const current = seriesFor(yearMap, currentYear)
    const prior = seriesFor(yearMap, priorYear)
    const delta = {
      values: months.map((_, i) => cellDelta(current.values[i], prior.values[i], metric)),
      total: cellDelta(current.total, prior.total, metric),
    }
    return { current, prior, delta }
  }

  function sortKey(row) {
    return row.current.total ?? 0
  }

  const rows = [...tree.entries()]
    .map(([categoryName, subMap]) => {
      // category-level totals = sum across all its subcategory buckets (including the '' direct bucket)
      const categoryYearMap = new Map()
      for (const [, yearMap] of subMap) {
        for (const [year, monthMap] of yearMap) {
          if (!categoryYearMap.has(year)) categoryYearMap.set(year, new Map())
          const destMonthMap = categoryYearMap.get(year)
          for (const [month, cell] of monthMap) {
            const dest = destMonthMap.get(month) || emptyCell()
            addCell(dest, cell)
            destMonthMap.set(month, dest)
          }
        }
      }

      const subRows = [...subMap.entries()]
        .filter(([subKey]) => subKey !== '')
        .map(([subKey, yearMap]) => ({ subcategoryName: subKey, ...bandsFor(yearMap) }))
        .sort((a, b) => sortKey(b) - sortKey(a))

      return { categoryName, ...bandsFor(categoryYearMap), subRows }
    })
    .sort((a, b) => sortKey(b) - sortKey(a))

  return { months, currentYear, priorYear, rows }
}

const KPI_ROW_DEFS = [
  { key: 'checks', label: 'Чеки, шт' },
  { key: 'avgCheck', label: 'Средний чек, ₸' },
  { key: 'revenue', label: 'Выручка, ₸' },
  { key: 'marginPct', label: 'Маржинальность, %' },
  { key: 'margin', label: 'Валовая маржа, ₸' },
]

function kpiValueFromCell(key, cell, receiptCount) {
  if (key === 'checks') return receiptCount ?? null
  if (!cell) return null
  if (key === 'avgCheck') return receiptCount ? cell.revenue / receiptCount : null
  if (key === 'revenue') return cell.revenue
  if (key === 'marginPct') return cell.revenue > 0 ? (cell.profit / cell.revenue) * 100 : null
  if (key === 'margin') return cell.profit
  return null
}

function kpiDelta(key, current, prior) {
  if (current == null || prior == null) return null
  if (key === 'marginPct') return current - prior
  if (prior === 0) return current === 0 ? 0 : null
  return ((current - prior) / prior) * 100
}

/**
 * "Ключевые показатели" mode for the "Продажи" tab: fixed rows (Чеки/
 * Средний чек/Выручка/Маржинальность/Валовая маржа) instead of categories,
 * same year-banded shape as buildSalesCategoryBands. `receiptsByMonth`:
 * Map<monthKey, receiptCount> from sales_month_receipt_facts.
 */
export function buildSalesKpiBands(facts, receiptsByMonth, { months, currentYear, priorYear }) {
  if (!months || months.length === 0 || !currentYear || !priorYear) {
    return { months: [], currentYear, priorYear, rows: [] }
  }

  const cellsByYearMonth = new Map()
  for (const row of facts) {
    const { year, month } = monthParts(row.monthKey)
    if ((year !== currentYear && year !== priorYear) || !months.includes(month)) continue
    if (!cellsByYearMonth.has(year)) cellsByYearMonth.set(year, new Map())
    const monthMap = cellsByYearMonth.get(year)
    const cell = monthMap.get(month) || emptyCell()
    addCell(cell, row)
    monthMap.set(month, cell)
  }

  function receiptsFor(year, month) {
    return receiptsByMonth?.get(`${year}-${String(month).padStart(2, '0')}-01`) ?? null
  }

  function seriesFor(key, year) {
    const monthMap = cellsByYearMonth.get(year)
    const values = months.map((m) => kpiValueFromCell(key, monthMap?.get(m), receiptsFor(year, m)))
    const agg = emptyCell()
    let anyCell = false
    let totalReceipts = 0
    let anyReceipts = false
    for (const m of months) {
      const cell = monthMap?.get(m)
      if (cell) {
        anyCell = true
        addCell(agg, cell)
      }
      const r = receiptsFor(year, m)
      if (r != null) {
        anyReceipts = true
        totalReceipts += r
      }
    }
    const total = kpiValueFromCell(key, anyCell ? agg : null, anyReceipts ? totalReceipts : null)
    return { values, total }
  }

  const rows = KPI_ROW_DEFS.map(({ key, label }) => {
    const current = seriesFor(key, currentYear)
    const prior = seriesFor(key, priorYear)
    const delta = {
      values: months.map((_, i) => kpiDelta(key, current.values[i], prior.values[i])),
      total: kpiDelta(key, current.total, prior.total),
    }
    return { key, label, current, prior, delta }
  })

  return { months, currentYear, priorYear, rows }
}

/**
 * Same 5 KPI rows as buildSalesKpiBands, but as one continuous series across
 * whatever months are in `facts` — no year bands. Used by "Оцифровка", which
 * shows the whole synced history (2025 → today) in a single row per metric.
 */
export function buildDigitizationKpiRows(facts, receiptsByMonth, months) {
  const cellsByMonth = new Map()
  for (const row of facts) {
    if (!cellsByMonth.has(row.monthKey)) cellsByMonth.set(row.monthKey, emptyCell())
    addCell(cellsByMonth.get(row.monthKey), row)
  }

  return KPI_ROW_DEFS.map(({ key, label }) => ({
    key,
    label,
    values: months.map((monthKey) =>
      kpiValueFromCell(key, cellsByMonth.get(monthKey), receiptsByMonth?.get(monthKey) ?? null)
    ),
  }))
}
