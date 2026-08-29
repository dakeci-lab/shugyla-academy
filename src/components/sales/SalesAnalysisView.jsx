import { useMemo } from 'react'
import { buildMonthlyTotals, findCategoriesNeedingAttention } from '../../utils/salesAggregation'
import { formatUmagMoney } from '../../services/umagSettlementsService'
import { formatMonthLabel } from '../../services/salesDataService'
import SalesTrendChart from './SalesTrendChart'
import './SalesShared.css'

function yearOverYearDelta(monthlyTotals, latestMonthKey) {
  if (!latestMonthKey) return null
  const [y, m] = latestMonthKey.split('-')
  const priorMonthKey = `${Number(y) - 1}-${m}-01`
  const current = monthlyTotals.find((row) => row.monthKey === latestMonthKey)
  const prior = monthlyTotals.find((row) => row.monthKey === priorMonthKey)
  if (!current) return null
  if (!prior || prior.revenue === 0) return null
  return ((current.revenue - prior.revenue) / prior.revenue) * 100
}

/** «Анализ» (по умолчанию): KPI-плитки, «требует внимания», график тренда за весь период. */
export default function SalesAnalysisView({ facts, latestMonthKey }) {
  const monthlyTotals = useMemo(() => buildMonthlyTotals(facts), [facts])
  const attention = useMemo(
    () => findCategoriesNeedingAttention(facts, latestMonthKey),
    [facts, latestMonthKey]
  )

  const latest = monthlyTotals[monthlyTotals.length - 1]
  const yoyDelta = yearOverYearDelta(monthlyTotals, latestMonthKey)
  const chartPoints = monthlyTotals.map((row) => ({ monthKey: row.monthKey, value: row.revenue }))

  return (
    <div className="sales-view">
      <div className="sales-kpi-grid">
        <div className="sales-kpi-card">
          <span className="sales-kpi-card__label">
            Выручка · {latest ? formatMonthLabel(latest.monthKey) : '—'}
          </span>
          <span className="sales-kpi-card__value">{latest ? formatUmagMoney(latest.revenue) : '—'}</span>
        </div>
        <div className="sales-kpi-card">
          <span className="sales-kpi-card__label">Маржа</span>
          <span className="sales-kpi-card__value">{latest ? formatUmagMoney(latest.profit) : '—'}</span>
        </div>
        <div className="sales-kpi-card">
          <span className="sales-kpi-card__label">К прошлому году</span>
          <span className="sales-kpi-card__value">
            {yoyDelta == null ? 'нет данных' : `${yoyDelta > 0 ? '▲' : '▼'} ${Math.abs(yoyDelta).toFixed(1)}%`}
          </span>
        </div>
      </div>

      <div className="sales-chart-card">
        <div className="sales-chart-card__head">Выручка по месяцам</div>
        <SalesTrendChart points={chartPoints} />
      </div>

      <div className="sales-attention">
        <div className="sales-attention__head">Требует внимания</div>
        {attention.length === 0 ? (
          <div className="sales-attention__empty">
            Заметных провалов по категориям год-к-году не найдено.
          </div>
        ) : (
          attention.map((item) => (
            <div key={item.categoryName} className="sales-attention__row">
              <span>{item.categoryName}</span>
              <span className="sales-view__delta sales-view__delta--down">
                ▼ {Math.abs(item.deltaPct).toFixed(1)}%
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
