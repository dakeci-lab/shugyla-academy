import { useMemo } from 'react'
import { buildMonthlyTotals, buildFunnelSteps, findCategoriesNeedingAttention } from '../../utils/salesAggregation'
import SalesTrendChart from './SalesTrendChart'
import SalesFunnelRow from './SalesFunnelRow'
import './SalesShared.css'

/** «Анализ» (по умолчанию): воронка последнего месяца, график тренда, «требует внимания». */
export default function SalesAnalysisView({ facts, latestMonthKey }) {
  const monthlyTotals = useMemo(() => buildMonthlyTotals(facts), [facts])
  const funnelSteps = useMemo(() => buildFunnelSteps(facts, latestMonthKey), [facts, latestMonthKey])
  const attention = useMemo(
    () => findCategoriesNeedingAttention(facts, latestMonthKey),
    [facts, latestMonthKey]
  )

  const chartPoints = monthlyTotals.map((row) => ({ monthKey: row.monthKey, value: row.revenue }))

  return (
    <div className="sales-view">
      <SalesFunnelRow steps={funnelSteps} />

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
