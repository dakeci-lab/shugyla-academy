import { buildStockHealthSummary } from '../../utils/procurementPlannerUx'

function formatPct(value) {
  return `${Number(value).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`
}

/**
 * Skeleton with the same markup/classes as the real widget, so its box
 * height matches exactly — swapping it for real content causes no reflow
 * of the toolbar/table below.
 */
function StockHealthSkeleton() {
  return (
    <div className="proc-stock-health proc-stock-health--skeleton" aria-hidden="true">
      <div className="proc-stock-health__head">
        <span className="proc-stock-health__title">
          <span className="proc-stock-health__skeleton-block" style={{ width: '13rem' }} />
        </span>
      </div>

      <div className="proc-stock-health__bar" />

      <div className="proc-stock-health__legend">
        {[0, 1, 2].map((key) => (
          <div key={key} className="proc-stock-health__legend-item">
            <div className="proc-stock-health__legend-label">
              <span className="proc-stock-health__skeleton-block" style={{ width: '70%' }} />
            </div>
            <div className="proc-stock-health__legend-value">
              <span className="proc-stock-health__skeleton-block" style={{ width: '2.5rem' }} />
            </div>
            <div className="proc-stock-health__legend-meta">
              <span className="proc-stock-health__skeleton-block" style={{ width: '60%' }} />
            </div>
            <div className="proc-stock-health__legend-meta">
              <span className="proc-stock-health__skeleton-block" style={{ width: '45%' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Stock-health widget for the planner header: what share of the rated SKUs is
 * «Точно / Перезатарка / Недостаток» right now. The three shares always add up
 * to 100%. SKUs with no sales in 8 weeks and SKUs with a negative stock stay
 * outside the calculation; they are reachable through the planner toolbar «Фильтр».
 * While `stockHealth` is still loading, renders a same-sized skeleton
 * instead of nothing, so the toolbar/table below don't jump once the data
 * (and the widget's real content) lands.
 *
 * Every group (bar segment + legend card) is clickable —
 * `onBucketClick(key)` where key is 'onNorm' | 'overNorm' | 'underNorm'.
 * `activeBucket` highlights the currently
 * filtered-to group and dims the rest of the bar.
 */
export default function ProcurementStockHealthWidget({
  stockHealth,
  asOfLabel,
  loading = false,
  activeBucket = null,
  onBucketClick = null,
}) {
  const summary = buildStockHealthSummary(stockHealth)
  if (!summary) return loading ? <StockHealthSkeleton /> : null

  const clickable = typeof onBucketClick === 'function'

  function handleClick(key) {
    if (clickable) onBucketClick(key)
  }

  const [onNorm, overNorm, underNorm] = summary.buckets

  return (
    <div className="proc-stock-health">
      <div className="proc-stock-health__head">
        <span className="proc-stock-health__title">
          Соответствие норме запаса
          <span className="proc-stock-health__standard">
            от {summary.rated.toLocaleString('ru-RU')} SKU с продажами
          </span>
        </span>
        {asOfLabel ? (
          <span className="proc-stock-health__asof">по снимку от {asOfLabel}</span>
        ) : null}
      </div>

      <div
        className="proc-stock-health__bar"
        role="img"
        aria-label={`Точно ${formatPct(onNorm.pct)}, перезатарка ${formatPct(overNorm.pct)}, недостаток ${formatPct(underNorm.pct)}`}
      >
        {summary.buckets.map((bucket) => (
          <button
            key={bucket.key}
            type="button"
            className={`proc-stock-health__bar-seg is-${bucket.key}${
              activeBucket === bucket.key ? ' is-active' : ''
            }${activeBucket && activeBucket !== bucket.key ? ' is-dimmed' : ''}`}
            style={{ width: `${bucket.pct}%` }}
            disabled={!clickable}
            aria-pressed={activeBucket === bucket.key}
            title={`${bucket.label} — нажмите, чтобы показать эти позиции в таблице`}
            onClick={() => handleClick(bucket.key)}
          />
        ))}
      </div>

      {/* Each card sits under its own bar segment: same proportions as the bar. */}
      <div
        className="proc-stock-health__legend"
        style={{
          '--legend-cols': summary.buckets
            .map((bucket) => `minmax(6.5rem, ${Math.max(bucket.pct, 0.1)}fr)`)
            .join(' '),
        }}
      >
        {summary.buckets.map((bucket) => (
          <button
            key={bucket.key}
            type="button"
            className={`proc-stock-health__legend-item${
              activeBucket === bucket.key ? ' is-active' : ''
            }`}
            disabled={!clickable}
            aria-pressed={activeBucket === bucket.key}
            onClick={() => handleClick(bucket.key)}
          >
            <div className="proc-stock-health__legend-label">
              <span className={`proc-stock-health__dot is-${bucket.key}`} aria-hidden="true" />
              {bucket.label}
            </div>
            <div className="proc-stock-health__legend-value">{formatPct(bucket.pct)}</div>
            <div className="proc-stock-health__legend-meta">
              {bucket.count.toLocaleString('ru-RU')} SKU
            </div>
          </button>
        ))}

      </div>
    </div>
  )
}
