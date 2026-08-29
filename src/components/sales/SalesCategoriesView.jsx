import { Fragment, useMemo, useState } from 'react'
import {
  resolveYearBandRange,
  buildSalesCategoryBands,
  buildSalesKpiBands,
  shortMonthLabel,
} from '../../utils/salesAggregation'
import { formatUmagMoney } from '../../services/umagSettlementsService'
import { exportSalesCategoriesXlsx } from '../../utils/salesExport'
import { heatCellStyle, deltaCellStyle } from '../../utils/salesHeat'
import PlatformSearchToolbar from '../platform/PlatformSearchToolbar'
import { ChevronRightIcon, DownloadIcon } from '../icons/PlatformIcons'
import './SalesShared.css'

const METRIC_OPTIONS = [
  { key: 'kpi', label: 'Ключевые показатели' },
  { key: 'revenue', label: 'Продажи, ₸' },
  { key: 'profit', label: 'Валовая маржа, ₸' },
  { key: 'marginPct', label: 'Маржинальность, %' },
  { key: 'markup', label: 'Наценка, ×' },
]

const METRIC_KIND = {
  revenue: 'money',
  profit: 'money',
  marginPct: 'percent',
  markup: 'ratio',
  checks: 'count',
  avgCheck: 'money',
  margin: 'money',
}

function formatByKind(value, kind) {
  if (value == null) return '—'
  if (kind === 'percent') return `${value.toFixed(1)}%`
  if (kind === 'ratio') return `×${value.toFixed(2)}`
  if (kind === 'count') return value.toLocaleString('ru-KZ', { maximumFractionDigits: 0 })
  return formatUmagMoney(value)
}

function formatDeltaByKind(value, kind) {
  if (value == null) return '—'
  const sign = value >= 0 ? '+' : ''
  if (kind === 'percent') return `${sign}${value.toFixed(1)} пп`
  if (kind === 'ratio') return `${sign}${value.toFixed(2)}`
  return `${sign}${value.toFixed(1)}%`
}

function matchesSearch(name, query) {
  return name.toLowerCase().includes(query)
}

function BandHeaderRow({ label, tone, description, colSpan }) {
  return (
    <tr className={`sales-bands__band sales-bands__band--${tone}`}>
      <td className="sales-bands__band-label">{label}</td>
      <td colSpan={colSpan} className="sales-bands__band-desc">
        {description}
      </td>
    </tr>
  )
}

function ValueRow({ label, series, kind, indent = false, toggle = null }) {
  return (
    <tr>
      <td>
        {toggle ? (
          <button type="button" className="sales-view__row-toggle" onClick={toggle.onClick} aria-expanded={toggle.open}>
            <span className={`sales-view__row-chevron${toggle.open ? ' sales-view__row-chevron--open' : ''}`}>
              <ChevronRightIcon size={16} />
            </span>
            {label}
          </button>
        ) : (
          <span style={indent ? { paddingLeft: 30 } : undefined}>{label}</span>
        )}
      </td>
      {series.values.map((value, i) => (
        <td key={i} className="sales-view__col-num" style={heatCellStyle(value, series.values)}>
          {formatByKind(value, kind)}
        </td>
      ))}
      <td className="sales-bands__total">{formatByKind(series.total, kind)}</td>
    </tr>
  )
}

function DeltaRow({ label, series, kind, indent = false, toggle = null }) {
  return (
    <tr>
      <td>
        {toggle ? (
          <button type="button" className="sales-view__row-toggle" onClick={toggle.onClick} aria-expanded={toggle.open}>
            <span className={`sales-view__row-chevron${toggle.open ? ' sales-view__row-chevron--open' : ''}`}>
              <ChevronRightIcon size={16} />
            </span>
            {label}
          </button>
        ) : (
          <span style={indent ? { paddingLeft: 30 } : undefined}>{label}</span>
        )}
      </td>
      {series.values.map((value, i) => (
        <td key={i} className="sales-view__col-num" style={deltaCellStyle(value)}>
          {formatDeltaByKind(value, kind)}
        </td>
      ))}
      <td className="sales-bands__total" style={deltaCellStyle(series.total)}>
        {formatDeltaByKind(series.total, kind)}
      </td>
    </tr>
  )
}

/** «Продажи»: показатель + год-к-году по месяцам, полосы 2026/2025/Δ — по образцу эталонного дашборда. */
export default function SalesCategoriesView({ facts, latestMonthKey }) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())
  const [exporting, setExporting] = useState(false)
  const [metric, setMetric] = useState('kpi')
  const [showCurrent, setShowCurrent] = useState(true)
  const [showPrior, setShowPrior] = useState(true)
  const [showDelta, setShowDelta] = useState(true)

  const { months, currentYear, priorYear } = useMemo(
    () => resolveYearBandRange(latestMonthKey),
    [latestMonthKey]
  )

  const kpiTable = useMemo(
    () => (metric === 'kpi' ? buildSalesKpiBands(facts, null, { months, currentYear, priorYear }) : null),
    [facts, months, currentYear, priorYear, metric]
  )
  const categoryTable = useMemo(
    () =>
      metric === 'kpi'
        ? null
        : buildSalesCategoryBands(facts, { metric, months, currentYear, priorYear }),
    [facts, months, currentYear, priorYear, metric]
  )

  const filteredCategoryRows = useMemo(() => {
    if (!categoryTable) return []
    const query = search.trim().toLowerCase()
    if (!query) return categoryTable.rows
    return categoryTable.rows.filter(
      (row) =>
        matchesSearch(row.categoryName, query) ||
        row.subRows.some((sub) => matchesSearch(sub.subcategoryName, query))
    )
  }, [categoryTable, search])

  function toggleRow(categoryName) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(categoryName)) next.delete(categoryName)
      else next.add(categoryName)
      return next
    })
  }

  async function handleExport() {
    if (exporting || !categoryTable) return
    setExporting(true)
    try {
      const flatRows = categoryTable.rows.map((row) => ({
        categoryName: row.categoryName,
        revenue: row.current.total || 0,
        cogs: 0,
        profit: 0,
        deltaPct: row.delta.total,
        subRows: row.subRows.map((sub) => ({
          subcategoryName: sub.subcategoryName,
          revenue: sub.current.total || 0,
          cogs: 0,
          profit: 0,
          deltaPct: sub.delta.total,
        })),
      }))
      await exportSalesCategoriesXlsx(flatRows, { currentYear, priorYear })
    } finally {
      setExporting(false)
    }
  }

  const monthCols = months.map(shortMonthLabel)
  const colSpan = monthCols.length + 1
  const kind = METRIC_KIND[metric] || 'money'

  return (
    <div className="sales-view">
      {exporting ? <div className="sales-view__loading-bar" aria-hidden="true" /> : null}

      <div className="sales-bands__controls">
        <label className="sales-bands__field">
          <span className="sales-bands__field-label">Показатель</span>
          <select className="sales-bands__select" value={metric} onChange={(e) => setMetric(e.target.value)}>
            {METRIC_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <div className="sales-bands__field">
          <span className="sales-bands__field-label">Годы и сравнение</span>
          <div className="sales-bands__checks">
            <label className="sales-bands__check">
              <input type="checkbox" checked={showCurrent} onChange={(e) => setShowCurrent(e.target.checked)} />
              {currentYear || '—'}
            </label>
            <label className="sales-bands__check">
              <input type="checkbox" checked={showPrior} onChange={(e) => setShowPrior(e.target.checked)} />
              {priorYear || '—'}
            </label>
            <label className="sales-bands__check">
              <input type="checkbox" checked={showDelta} onChange={(e) => setShowDelta(e.target.checked)} />
              Δ
            </label>
          </div>
        </div>
      </div>

      <div className="sales-view__head">
        {metric !== 'kpi' ? (
          <PlatformSearchToolbar
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
            showClear
            placeholder="Категория или подкатегория…"
            ariaLabel="Поиск по категориям"
            flush
          />
        ) : (
          <span />
        )}
        <button
          type="button"
          className="btn btn--outline sales-view__export-btn"
          onClick={() => void handleExport()}
          disabled={exporting || metric === 'kpi' || !categoryTable || categoryTable.rows.length === 0}
        >
          <DownloadIcon size={18} />
          {exporting ? 'Экспорт…' : 'Скачать Excel'}
        </button>
      </div>

      <div className="sales-view__wrap">
        <table className="sales-view__table">
          <thead>
            <tr>
              <th>{metric === 'kpi' ? 'Показатель' : 'Категория'}</th>
              {monthCols.map((m, i) => (
                <th key={i} className="sales-view__col-num">
                  {m}
                </th>
              ))}
              <th className="sales-view__col-num">Итого</th>
            </tr>
          </thead>
          <tbody>
            {months.length === 0 ? (
              <tr>
                <td colSpan={colSpan + 1} className="sales-view__empty-cell">
                  Нет данных за период.
                </td>
              </tr>
            ) : metric === 'kpi' ? (
              <>
                {showCurrent ? (
                  <>
                    <BandHeaderRow label={currentYear} tone="current" description="Ключевые показатели" colSpan={colSpan} />
                    {kpiTable.rows.map((row) => (
                      <ValueRow key={row.key} label={row.label} series={row.current} kind={METRIC_KIND[row.key]} />
                    ))}
                  </>
                ) : null}
                {showPrior ? (
                  <>
                    <BandHeaderRow label={priorYear} tone="prior" description="Ключевые показатели" colSpan={colSpan} />
                    {kpiTable.rows.map((row) => (
                      <ValueRow key={row.key} label={row.label} series={row.prior} kind={METRIC_KIND[row.key]} />
                    ))}
                  </>
                ) : null}
                {showDelta ? (
                  <>
                    <BandHeaderRow label="Δ %" tone="delta" description="Динамика год к году" colSpan={colSpan} />
                    {kpiTable.rows.map((row) => (
                      <DeltaRow key={row.key} label={row.label} series={row.delta} kind={METRIC_KIND[row.key]} />
                    ))}
                  </>
                ) : null}
              </>
            ) : filteredCategoryRows.length === 0 ? (
              <tr>
                <td colSpan={colSpan + 1} className="sales-view__empty-cell">
                  {search ? 'По вашему запросу ничего не найдено.' : 'Нет данных за период.'}
                </td>
              </tr>
            ) : (
              <>
                {showCurrent ? (
                  <>
                    <BandHeaderRow
                      label={currentYear}
                      tone="current"
                      description={`${METRIC_OPTIONS.find((m) => m.key === metric)?.label || ''}`}
                      colSpan={colSpan}
                    />
                    {filteredCategoryRows.map((row) => (
                      <Fragment key={row.categoryName}>
                        <ValueRow
                          label={row.categoryName}
                          series={row.current}
                          kind={kind}
                          toggle={
                            row.subRows.length > 0
                              ? { open: expanded.has(row.categoryName), onClick: () => toggleRow(row.categoryName) }
                              : null
                          }
                        />
                        {expanded.has(row.categoryName)
                          ? row.subRows.map((sub) => (
                              <ValueRow
                                key={sub.subcategoryName}
                                label={sub.subcategoryName}
                                series={sub.current}
                                kind={kind}
                                indent
                              />
                            ))
                          : null}
                      </Fragment>
                    ))}
                  </>
                ) : null}
                {showPrior ? (
                  <>
                    <BandHeaderRow
                      label={priorYear}
                      tone="prior"
                      description={`${METRIC_OPTIONS.find((m) => m.key === metric)?.label || ''}`}
                      colSpan={colSpan}
                    />
                    {filteredCategoryRows.map((row) => (
                      <Fragment key={row.categoryName}>
                        <ValueRow
                          label={row.categoryName}
                          series={row.prior}
                          kind={kind}
                          toggle={
                            row.subRows.length > 0
                              ? { open: expanded.has(row.categoryName), onClick: () => toggleRow(row.categoryName) }
                              : null
                          }
                        />
                        {expanded.has(row.categoryName)
                          ? row.subRows.map((sub) => (
                              <ValueRow
                                key={sub.subcategoryName}
                                label={sub.subcategoryName}
                                series={sub.prior}
                                kind={kind}
                                indent
                              />
                            ))
                          : null}
                      </Fragment>
                    ))}
                  </>
                ) : null}
                {showDelta ? (
                  <>
                    <BandHeaderRow label="Δ %" tone="delta" description="Динамика год к году" colSpan={colSpan} />
                    {filteredCategoryRows.map((row) => (
                      <Fragment key={row.categoryName}>
                        <DeltaRow
                          label={row.categoryName}
                          series={row.delta}
                          kind={kind}
                          toggle={
                            row.subRows.length > 0
                              ? { open: expanded.has(row.categoryName), onClick: () => toggleRow(row.categoryName) }
                              : null
                          }
                        />
                        {expanded.has(row.categoryName)
                          ? row.subRows.map((sub) => (
                              <DeltaRow key={sub.subcategoryName} label={sub.subcategoryName} series={sub.delta} kind={kind} indent />
                            ))
                          : null}
                      </Fragment>
                    ))}
                  </>
                ) : null}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
