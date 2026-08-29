import { useMemo, useState } from 'react'
import { buildDigitizationMatrix } from '../../utils/salesAggregation'
import { formatUmagMoney } from '../../services/umagSettlementsService'
import { formatMonthLabel } from '../../services/salesDataService'
import './SalesShared.css'

const METRICS = [
  { key: 'revenue', label: 'Выручка' },
  { key: 'profit', label: 'Маржа' },
  { key: 'quantity', label: 'Кол-во' },
]

function heatBackground(value, max) {
  if (!max || value <= 0) return 'transparent'
  const intensity = Math.min(1, value / max)
  return `rgba(5, 150, 105, ${0.06 + intensity * 0.34})`
}

function formatCellValue(value, metric) {
  if (metric === 'quantity') return value.toLocaleString('ru-KZ', { maximumFractionDigits: 0 })
  return formatUmagMoney(value)
}

/** «Оцифровка»: категория × месяц, тепловая заливка, переключатель показателя. */
export default function SalesDigitizationView({ facts }) {
  const [metric, setMetric] = useState('revenue')
  const { months, rows, max } = useMemo(() => buildDigitizationMatrix(facts, metric), [facts, metric])

  return (
    <div className="sales-view">
      <div className="sales-view__head">
        <div className="sales-heatmap-controls" role="tablist" aria-label="Показатель оцифровки">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`btn btn--sm ${metric === m.key ? 'btn--outline' : 'btn--ghost'}`}
              aria-pressed={metric === m.key}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sales-view__wrap">
        <table className="sales-view__table">
          <thead>
            <tr>
              <th>Категория</th>
              {months.map((monthKey) => (
                <th key={monthKey} className="sales-view__col-num">
                  {formatMonthLabel(monthKey).split(' ')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={months.length + 1} className="sales-view__empty-cell">
                  Нет данных за период.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.categoryName}>
                  <td>{row.categoryName}</td>
                  {row.values.map((value, i) => (
                    <td
                      key={months[i]}
                      className="sales-heatmap-cell"
                      style={{ background: heatBackground(value, max) }}
                    >
                      {value === 0 ? '—' : formatCellValue(value, metric)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
