import { useMemo, useState } from 'react'
import { buildDigitizationMatrix } from '../../utils/salesAggregation'
import { heatCellStyle, deltaCellStyle } from '../../utils/salesHeat'
import { formatUmagMoney } from '../../services/umagSettlementsService'
import { formatMonthLabel } from '../../services/salesDataService'
import './SalesShared.css'

const METRICS = [
  { key: 'revenue', label: 'Выручка' },
  { key: 'profit', label: 'Маржа' },
  { key: 'quantity', label: 'Кол-во' },
  { key: 'markup', label: 'Наценка' },
]

function formatCellValue(value, metric) {
  if (value == null) return '—'
  if (metric === 'quantity') return value.toLocaleString('ru-KZ', { maximumFractionDigits: 0 })
  if (metric === 'markup') return `×${value.toFixed(2)}`
  return formatUmagMoney(value)
}

function formatDeltaValue(value, metric) {
  if (value == null) return '—'
  const sign = value >= 0 ? '+' : ''
  if (metric === 'markup') return `${sign}${value.toFixed(1)} пп`
  return `${sign}${value.toFixed(1)}%`
}

/** «Оцифровка»: категория × месяц, тепловая заливка (как в эталонном дашборде), переключатель показателя и режима. */
export default function SalesDigitizationView({ facts }) {
  const [metric, setMetric] = useState('revenue')
  const [mode, setMode] = useState('value')
  const { months, rows } = useMemo(
    () => buildDigitizationMatrix(facts, metric, mode),
    [facts, metric, mode]
  )

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
        <div className="sales-heatmap-controls" role="tablist" aria-label="Режим отображения">
          <button
            type="button"
            className={`btn btn--sm ${mode === 'value' ? 'btn--outline' : 'btn--ghost'}`}
            aria-pressed={mode === 'value'}
            onClick={() => setMode('value')}
          >
            Значения
          </button>
          <button
            type="button"
            className={`btn btn--sm ${mode === 'delta' ? 'btn--outline' : 'btn--ghost'}`}
            aria-pressed={mode === 'delta'}
            onClick={() => setMode('delta')}
          >
            Δ год
          </button>
        </div>
      </div>

      <div className="sales-view__wrap">
        <table className="sales-view__table">
          <thead>
            <tr>
              <th>Категория</th>
              {months.map((monthKey) => (
                <th key={monthKey} className="sales-view__col-num">
                  {formatMonthLabel(monthKey)}
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
                      style={mode === 'delta' ? deltaCellStyle(value) : heatCellStyle(value, row.values)}
                    >
                      {mode === 'delta' ? formatDeltaValue(value, metric) : formatCellValue(value, metric)}
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
