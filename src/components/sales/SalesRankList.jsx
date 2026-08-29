import './SalesShared.css'

/** Ranked horizontal-bar list — "Вклад в выручку/маржу" and "Маржа vs Маржинальность" cards. */
export default function SalesRankList({ title, items, formatValue, formatShare, colorForItem }) {
  return (
    <div className="sales-rank">
      <div className="sales-rank__title">{title}</div>
      {!items || items.length === 0 ? (
        <div className="sales-view__empty-cell">Нет данных за период.</div>
      ) : (
        <div className="sales-rank__list">
          {(() => {
            const maxValue = Math.max(...items.map((item) => Math.abs(item.value)), 1)
            return items.map((item, i) => {
              const pct = Math.max(2, (Math.abs(item.value) / maxValue) * 100)
              const color = colorForItem ? colorForItem(item, i, items) : 'var(--color-primary, #059669)'
              return (
                <div key={item.categoryName} className="sales-rank__row">
                  <span className="sales-rank__num">{String(i + 1).padStart(2, '0')}</span>
                  <div className="sales-rank__body">
                    <div className="sales-rank__row-head">
                      <span className="sales-rank__label">{item.categoryName}</span>
                      <span className="sales-rank__value">
                        {formatValue(item.value)}
                        {item.share != null ? (
                          <span className="sales-rank__share">{formatShare(item.share)}</span>
                        ) : null}
                      </span>
                    </div>
                    <div className="sales-rank__bar-track">
                      <div className="sales-rank__bar-fill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                </div>
              )
            })
          })()}
        </div>
      )}
    </div>
  )
}
