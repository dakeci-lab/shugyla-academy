import { formatSalesMoneyWithUnit } from '../../utils/salesFormat'
import './SalesShared.css'

function formatStepValue(step) {
  if (step.value == null) return 'нет данных'
  if (step.unit === '%') return `${step.value.toFixed(1)}%`
  if (step.unit === '₸') return formatSalesMoneyWithUnit(step.value)
  return step.value.toLocaleString('ru-KZ')
}

function DeltaBadge({ step }) {
  if (step.deltaPct == null) return null
  const up = step.deltaPct >= 0
  const text = step.isPoints
    ? `${up ? '+' : ''}${step.deltaPct.toFixed(1)} пп`
    : `${up ? '+' : ''}${step.deltaPct.toFixed(1)}%`
  return (
    <span className={`sales-funnel__yoy ${up ? 'sales-funnel__yoy--up' : 'sales-funnel__yoy--down'}`}>
      {up ? '▲' : '▼'} {text} <span className="sales-funnel__yoy-label">г/г</span>
    </span>
  )
}

/** 5-шаговая воронка: Чеки → Средний чек → Выручка → Маржинальность → Валовая маржа, как в эталонном дашборде. */
export default function SalesFunnelRow({ steps }) {
  if (!steps || steps.length === 0) return null

  return (
    <div className="sales-funnel">
      {steps.map((step, i) => (
        <div key={step.key} className={`sales-funnel__step${step.unavailable ? ' sales-funnel__step--unavailable' : ''}`}>
          <span className="sales-funnel__step-num">{i + 1}</span>
          <div className="sales-funnel__label">{step.label}</div>
          <div className="sales-funnel__value">{formatStepValue(step)}</div>
          <DeltaBadge step={step} />
        </div>
      ))}
    </div>
  )
}
