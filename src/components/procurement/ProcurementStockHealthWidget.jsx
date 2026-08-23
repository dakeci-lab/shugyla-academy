import { buildStockHealthSummary, STOCK_HEALTH_TARGET } from '../../utils/procurementPlannerUx'

const STANDARD_TITLE =
  'Стандарт ритейла: 80% позиций — точно по норме, до 10% — перезатарка, до 10% — недостаток. Не входит в 80/10/10: позиции без данных о спросе.'

function DeviationLabel({ bucket }) {
  if (!bucket.isOffTarget) return <span>в пределах стандарта</span>
  const sign = bucket.deviation > 0 ? '+' : ''
  return (
    <span className="proc-stock-health__legend-meta is-off-target">
      {sign}
      {bucket.deviation}% от стандарта
    </span>
  )
}

/**
 * Retail 80/10/10 stock-health KPI widget for the planner header.
 * Renders nothing until stockHealth has loaded (no layout shift once it does
 * — see the min-height reserved in CSS for the legend grid).
 */
export default function ProcurementStockHealthWidget({ stockHealth, asOfLabel }) {
  const summary = buildStockHealthSummary(stockHealth)
  if (!summary) return null

  return (
    <div className="proc-stock-health">
      <div className="proc-stock-health__head">
        <span className="proc-stock-health__title">
          Соответствие норме запаса
          <span className="proc-stock-health__standard" title={STANDARD_TITLE}>
            стандарт {STOCK_HEALTH_TARGET.onNorm} / {STOCK_HEALTH_TARGET.overNorm} /{' '}
            {STOCK_HEALTH_TARGET.underNorm}
          </span>
        </span>
        {asOfLabel ? (
          <span className="proc-stock-health__asof">по снимку от {asOfLabel}</span>
        ) : null}
      </div>

      <div className="proc-stock-health__bar" role="img" aria-label={`Точно ${summary.buckets[0].pct}%, перезатарка ${summary.buckets[1].pct}%, недостаток ${summary.buckets[2].pct}%, нет данных ${summary.noDemand.pct}%`}>
        {summary.buckets.map((bucket) => (
          <span
            key={bucket.key}
            className={`proc-stock-health__bar-seg is-${bucket.key}`}
            style={{ width: `${bucket.pct}%` }}
          />
        ))}
        <span
          className="proc-stock-health__bar-seg is-no-demand"
          style={{ width: `${summary.noDemand.pct}%` }}
        />
      </div>

      <div className="proc-stock-health__legend">
        {summary.buckets.map((bucket) => (
          <div key={bucket.key} className="proc-stock-health__legend-item">
            <div className="proc-stock-health__legend-label">
              <span className={`proc-stock-health__dot is-${bucket.key}`} aria-hidden="true" />
              {bucket.label}
            </div>
            <div
              className={`proc-stock-health__legend-value${bucket.isOffTarget ? ' is-off-target' : ''}`}
            >
              {bucket.pct}%
            </div>
            <div className="proc-stock-health__legend-meta">
              {bucket.count.toLocaleString('ru-RU')} SKU
            </div>
            <DeviationLabel bucket={bucket} />
          </div>
        ))}
        <div className="proc-stock-health__legend-item is-muted">
          <div className="proc-stock-health__legend-label">
            <span className="proc-stock-health__dot is-no-demand" aria-hidden="true" />
            Нет данных
          </div>
          <div className="proc-stock-health__legend-value">{summary.noDemand.pct}%</div>
          <div className="proc-stock-health__legend-meta">
            {summary.noDemand.count.toLocaleString('ru-RU')} SKU
          </div>
          <span className="proc-stock-health__legend-meta">не входит в 80/10/10</span>
        </div>
      </div>
    </div>
  )
}
