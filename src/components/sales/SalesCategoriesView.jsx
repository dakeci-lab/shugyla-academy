import { Fragment, useMemo, useState } from 'react'
import { buildCategoryYoyRows } from '../../utils/salesAggregation'
import { formatUmagMoney } from '../../services/umagSettlementsService'
import { exportSalesCategoriesXlsx } from '../../utils/salesExport'
import PlatformSearchToolbar from '../platform/PlatformSearchToolbar'
import { ChevronRightIcon, DownloadIcon } from '../icons/PlatformIcons'
import './SalesShared.css'

function DeltaCell({ value }) {
  if (value == null) return <span className="sales-view__delta sales-view__delta--flat">новое</span>
  const tone = value > 0.5 ? 'up' : value < -0.5 ? 'down' : 'flat'
  const sign = value > 0 ? '▲' : value < 0 ? '▼' : '—'
  return (
    <span className={`sales-view__delta sales-view__delta--${tone}`}>
      {sign} {Math.abs(value).toFixed(1)}%
    </span>
  )
}

function matchesSearch(name, query) {
  return name.toLowerCase().includes(query)
}

/** «Продажи»: категории/подкатегории год-к-году, раскрытие по клику. */
export default function SalesCategoriesView({ facts, latestMonthKey }) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())
  const [exporting, setExporting] = useState(false)

  const { currentYear, priorYear, rows } = useMemo(
    () => buildCategoryYoyRows(facts, latestMonthKey),
    [facts, latestMonthKey]
  )

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return rows
    return rows.filter(
      (row) =>
        matchesSearch(row.categoryName, query) ||
        row.subRows.some((sub) => matchesSearch(sub.subcategoryName, query))
    )
  }, [rows, search])

  function toggleRow(categoryName) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(categoryName)) next.delete(categoryName)
      else next.add(categoryName)
      return next
    })
  }

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      await exportSalesCategoriesXlsx(rows, { currentYear, priorYear })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="sales-view">
      {exporting ? <div className="sales-view__loading-bar" aria-hidden="true" /> : null}
      <div className="sales-view__head">
        <PlatformSearchToolbar
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          showClear
          placeholder="Категория или подкатегория…"
          ariaLabel="Поиск по категориям"
          flush
        />
        <button
          type="button"
          className="btn btn--outline sales-view__export-btn"
          onClick={() => void handleExport()}
          disabled={exporting || rows.length === 0}
        >
          <DownloadIcon size={18} />
          {exporting ? 'Экспорт…' : 'Скачать Excel'}
        </button>
      </div>

      <div className="sales-view__wrap">
        <table className="sales-view__table">
          <thead>
            <tr>
              <th>Категория</th>
              <th className="sales-view__col-num">Выручка {currentYear || ''}</th>
              <th className="sales-view__col-num">Маржа</th>
              <th className="sales-view__col-num">Наценка</th>
              <th className="sales-view__col-num">Δ к {priorYear || '—'}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="sales-view__empty-cell">
                  {search ? 'По вашему запросу ничего не найдено.' : 'Нет данных за период.'}
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const isOpen = expanded.has(row.categoryName)
                const markup = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0
                return (
                  <Fragment key={row.categoryName}>
                    <tr>
                      <td>
                        {row.subRows.length > 0 ? (
                          <button
                            type="button"
                            className="sales-view__row-toggle"
                            onClick={() => toggleRow(row.categoryName)}
                            aria-expanded={isOpen}
                          >
                            <span
                              className={
                                isOpen
                                  ? 'sales-view__row-chevron sales-view__row-chevron--open'
                                  : 'sales-view__row-chevron'
                              }
                            >
                              <ChevronRightIcon size={16} />
                            </span>
                            {row.categoryName}
                          </button>
                        ) : (
                          <span style={{ paddingLeft: 22 }}>{row.categoryName}</span>
                        )}
                      </td>
                      <td className="sales-view__col-num">{formatUmagMoney(row.revenue)}</td>
                      <td className="sales-view__col-num">{formatUmagMoney(row.profit)}</td>
                      <td className="sales-view__col-num">{markup.toFixed(1)}%</td>
                      <td className="sales-view__col-num">
                        <DeltaCell value={row.deltaPct} />
                      </td>
                    </tr>
                    {isOpen
                      ? row.subRows.map((sub) => {
                          const subMarkup = sub.revenue > 0 ? (sub.profit / sub.revenue) * 100 : 0
                          return (
                            <tr key={`${row.categoryName}__${sub.subcategoryName}`} className="sales-view__subrow">
                              <td>{sub.subcategoryName}</td>
                              <td className="sales-view__col-num">{formatUmagMoney(sub.revenue)}</td>
                              <td className="sales-view__col-num">{formatUmagMoney(sub.profit)}</td>
                              <td className="sales-view__col-num">{subMarkup.toFixed(1)}%</td>
                              <td className="sales-view__col-num">
                                <DeltaCell value={sub.deltaPct} />
                              </td>
                            </tr>
                          )
                        })
                      : null}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
