import { useMemo, useState } from 'react'
import { buildDigitizationMatrix, buildDigitizationKpiRows, shortMonthLabel } from '../../utils/salesAggregation'
import { heatCellStyle } from '../../utils/salesHeat'
import { formatUmagMoney } from '../../services/umagSettlementsService'
import './SalesShared.css'

const METRIC_OPTIONS = [
  { key: 'revenue', label: 'Выручка' },
  { key: 'profit', label: 'Маржа' },
  { key: 'quantity', label: 'Количество' },
  { key: 'markup', label: 'Наценка' },
]

const KPI_KIND = {
  checks: 'count',
  avgCheck: 'money',
  revenue: 'money',
  marginPct: 'percent',
  margin: 'money',
}

function formatCellValue(value, metric) {
  if (value == null) return '—'
  if (metric === 'quantity') return value.toLocaleString('ru-KZ', { maximumFractionDigits: 0 })
  if (metric === 'markup') return `×${value.toFixed(2)}`
  return formatUmagMoney(value)
}

function formatKpiValue(value, kind) {
  if (value == null) return '—'
  if (kind === 'percent') return `${value.toFixed(1)}%`
  if (kind === 'count') return value.toLocaleString('ru-KZ', { maximumFractionDigits: 0 })
  return formatUmagMoney(value)
}

function shortMonthYearLabel(monthKey) {
  const [y, m] = monthKey.split('-')
  return `${shortMonthLabel(Number(m))} ${y.slice(2)}`
}

/** «Оцифровка»: показатели воронки + категория × месяц за весь период, тепловая заливка, обычным текстом. */
export default function SalesDigitizationView({ facts, receiptsByMonth }) {
  const [metric, setMetric] = useState('revenue')
  const { months, rows } = useMemo(() => buildDigitizationMatrix(facts, metric), [facts, metric])
  const kpiRows = useMemo(
    () => buildDigitizationKpiRows(facts, receiptsByMonth, months),
    [facts, receiptsByMonth, months]
  )
  const monthCols = months.map(shortMonthYearLabel)

  return (
    <div className="sales-view">
      <div className="sales-view__wrap">
        <table className="sales-view__table">
          <thead>
            <tr>
              <th>Показатель воронки</th>
              {monthCols.map((m, i) => (
                <th key={i} className="sales-view__col-num">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kpiRows.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                {row.values.map((value, i) => (
                  <td
                    key={months[i]}
                    className="sales-heatmap-cell"
                    style={heatCellStyle(value, row.values, { bold: false })}
                  >
                    {formatKpiValue(value, KPI_KIND[row.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sales-view__head">
        <label className="sales-bands__field">
          <span className="sales-bands__field-label">Показатель</span>
          <select
            className="sales-bands__select"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            {METRIC_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="sales-view__wrap">
        <table className="sales-view__table">
          <thead>
            <tr>
              <th>Категория</th>
              {monthCols.map((m, i) => (
                <th key={i} className="sales-view__col-num">
                  {m}
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
                      style={heatCellStyle(value, row.values, { bold: false })}
                    >
                      {formatCellValue(value, metric)}
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
