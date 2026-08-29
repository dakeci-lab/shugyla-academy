import { useMemo } from 'react'
import {
  buildMonthlyTotals,
  buildFunnelSteps,
  buildCategoryContribution,
  buildCategoryYoyRows,
} from '../../utils/salesAggregation'
import { heatColor } from '../../utils/salesHeat'
import { formatUmagMoney } from '../../services/umagSettlementsService'
import SalesTrendChart from './SalesTrendChart'
import SalesFunnelRow from './SalesFunnelRow'
import SalesRankList from './SalesRankList'
import SalesSectionHeader from './SalesSectionHeader'
import './SalesShared.css'

function formatShare(share) {
  return ` ${share.toFixed(1)}%`
}

function formatMarginPct(value) {
  return `${value.toFixed(1)}%`
}

/** Diverging red→amber→green bar color, relative to this list's own min/median/max. */
function heatBarColor(item, _i, items) {
  const values = items.map((x) => x.value).filter((v) => v != null && !Number.isNaN(v))
  if (values.length < 2) return 'var(--color-primary, #059669)'
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  if (!(hi > lo)) return 'var(--color-primary, #059669)'
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted[Math.floor(sorted.length / 2)]
  return heatColor(item.value, lo, mid, hi) || 'var(--color-primary, #059669)'
}

/** «Анализ»: воронка прибыли, динамика выручки/маржи, вклад категорий, маржа vs маржинальность. */
export default function SalesAnalysisView({ facts, latestMonthKey, receiptsByMonth }) {
  const monthlyTotals = useMemo(() => buildMonthlyTotals(facts, receiptsByMonth), [facts, receiptsByMonth])
  const funnelSteps = useMemo(
    () => buildFunnelSteps(facts, latestMonthKey, receiptsByMonth),
    [facts, latestMonthKey, receiptsByMonth]
  )
  const contribution = useMemo(
    () => buildCategoryContribution(facts, latestMonthKey),
    [facts, latestMonthKey]
  )
  const marginRows = useMemo(
    () => buildCategoryYoyRows(facts, latestMonthKey).rows,
    [facts, latestMonthKey]
  )

  const chartPoints = monthlyTotals.map((row) => ({
    monthKey: row.monthKey,
    revenue: row.revenue,
    grossMargin: row.profit,
    marginPct: row.margin,
  }))

  const byMarginValue = [...marginRows]
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.profit - a.profit)
    .map((r) => ({ categoryName: r.categoryName, value: r.profit }))

  const byMarginPct = [...marginRows]
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.margin - a.margin)
    .map((r) => ({ categoryName: r.categoryName, value: r.margin }))

  return (
    <div className="sales-view">
      <SalesSectionHeader index={1} title="Воронка прибыли" />
      <SalesFunnelRow steps={funnelSteps} />

      <SalesSectionHeader index={2} title="Динамика выручки и маржи" />
      <div className="sales-chart-card">
        <SalesTrendChart points={chartPoints} />
      </div>

      <SalesSectionHeader index={3} title="Категории: вклад в выручку и маржу" />
      <div className="sales-rank-grid">
        <SalesRankList
          title="Вклад в выручку, ₸"
          items={contribution.byRevenue}
          formatValue={formatUmagMoney}
          formatShare={formatShare}
        />
        <SalesRankList
          title="Вклад в валовую маржу, ₸"
          items={contribution.byMargin}
          formatValue={formatUmagMoney}
          formatShare={formatShare}
        />
      </div>

      <SalesSectionHeader index={4} title="Маржа vs Маржинальность" />
      <div className="sales-rank-grid">
        <SalesRankList title="Валовая маржа по категориям, ₸" items={byMarginValue} formatValue={formatUmagMoney} />
        <SalesRankList
          title="Маржинальность по категориям, %"
          items={byMarginPct}
          formatValue={formatMarginPct}
          colorForItem={heatBarColor}
        />
      </div>
    </div>
  )
}
