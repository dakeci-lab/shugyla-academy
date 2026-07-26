import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import {
  canSyncUmagSettlements,
  canViewUmagSettlements,
} from '../../../config/permissions'
import {
  fetchLastUmagSyncRun,
  fetchUmagSettlementsBySupplier,
  formatUmagDate,
  formatUmagDateTime,
  formatUmagMoney,
  getMonthPeriodKeys,
  getPreviousMonthPeriodKeys,
  syncUmagSettlements,
  toAqtobeDateKey,
} from '../../../services/umagSettlementsService'
import PlatformAccessDenied from '../../platform/PlatformAccessDenied'
import './UmagSettlementsPanel.css'

function periodPresets() {
  const today = toAqtobeDateKey()
  const current = getMonthPeriodKeys()
  const previous = getPreviousMonthPeriodKeys()
  return [
    { id: 'current_month', label: 'Текущий месяц', ...current },
    { id: 'previous_month', label: 'Прошлый месяц', ...previous },
    { id: 'today', label: 'Сегодня', dateFrom: today, dateTo: today },
  ]
}

function statusLabel(status) {
  switch (status) {
    case 'success':
      return 'успешно'
    case 'partial':
      return 'частично'
    case 'failed':
      return 'ошибка'
    case 'running':
      return 'выполняется'
    default:
      return status
  }
}

function SummaryCard({ label, value, loading, emphasize, isCount }) {
  const display = loading
    ? '…'
    : isCount
      ? String(value ?? 0)
      : formatUmagMoney(value)

  return (
    <div className={`umag-settlements__summary${emphasize ? ' umag-settlements__summary--debt' : ''}`}>
      <div className="umag-settlements__summary-label">{label}</div>
      <div className="umag-settlements__summary-value">{display}</div>
    </div>
  )
}

function UmagSupplierDetail({ supplier, onBack }) {
  const supplies = supplier.supplies || []

  return (
    <div className="umag-settlements umag-settlements--detail">
      <button type="button" className="umag-settlements__back" onClick={onBack}>
        ← К списку поставщиков
      </button>

      <h2 className="umag-settlements__detail-title">{supplier.name}</h2>
      <div className="umag-settlements__source-badge" role="status">
        По данным UMAG
      </div>

      <div className="umag-settlements__totals">
        <SummaryCard label="Сумма приёмок" value={supplier.amount} />
        <SummaryCard label="Оплачено" value={supplier.paymentAmount} />
        <SummaryCard label="Задолженность" value={supplier.debt} emphasize />
        <SummaryCard label="Количество приёмок" value={supplier.supplyCount} isCount />
      </div>

      {supplies.length === 0 ? (
        <div className="umag-settlements__empty">
          За выбранный период приёмок UMAG не найдено
        </div>
      ) : (
        <>
          <div className="umag-settlements__table-wrap">
            <table className="umag-settlements__table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>ID</th>
                  <th>Сумма</th>
                  <th>Оплачено</th>
                  <th>Возврат</th>
                  <th>Задолженность</th>
                  <th>Счёт</th>
                  <th>Кто провёл</th>
                </tr>
              </thead>
              <tbody>
                {supplies.map((supply) => (
                  <tr key={supply.id}>
                    <td>{formatUmagDate(supply.doc_time)}</td>
                    <td>{supply.umag_supply_id}</td>
                    <td>{formatUmagMoney(supply.amount)}</td>
                    <td>{formatUmagMoney(supply.payment_amount)}</td>
                    <td>{formatUmagMoney(supply.payment_refund_amount)}</td>
                    <td>{formatUmagMoney(supply.debt)}</td>
                    <td>{supply.account || '—'}</td>
                    <td>{supply.umag_user_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="umag-settlements__cards">
            {supplies.map((supply) => (
              <div key={supply.id} className="umag-settlements__card umag-settlements__card--static">
                <div className="umag-settlements__card-title">
                  {formatUmagDate(supply.doc_time)} · #{supply.umag_supply_id}
                </div>
                <div className="umag-settlements__card-grid">
                  <span>Сумма</span>
                  <strong>{formatUmagMoney(supply.amount)}</strong>
                  <span>Оплачено</span>
                  <strong>{formatUmagMoney(supply.payment_amount)}</strong>
                  <span>Возврат</span>
                  <strong>{formatUmagMoney(supply.payment_refund_amount)}</strong>
                  <span>Задолженность</span>
                  <strong>{formatUmagMoney(supply.debt)}</strong>
                  <span>Счёт</span>
                  <strong>{supply.account || '—'}</strong>
                  <span>Кто провёл</span>
                  <strong>{supply.umag_user_name || '—'}</strong>
                </div>
                {supply.comment ? (
                  <p className="umag-settlements__comment">{supply.comment}</p>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function UmagSettlementsPanel() {
  const { user } = useSession()
  const toast = useToast()
  const showSuccess = toast.success
  const showError = toast.error
  const showWarning = typeof toast.warning === 'function' ? toast.warning : showError

  const canView = canViewUmagSettlements(user)
  const canSync = canSyncUmagSettlements(user)

  const currentMonth = useMemo(() => getMonthPeriodKeys(), [])
  const [dateFrom, setDateFrom] = useState(currentMonth.dateFrom)
  const [dateTo, setDateTo] = useState(currentMonth.dateTo)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [rows, setRows] = useState([])
  const [totals, setTotals] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [lastRun, setLastRun] = useState(null)
  const [selected, setSelected] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const [settlements, run] = await Promise.all([
      fetchUmagSettlementsBySupplier({ dateFrom, dateTo, search }),
      fetchLastUmagSyncRun(),
    ])
    setLastRun(run)
    if (settlements.error) {
      setLoadError(settlements.error)
      setRows([])
      setTotals(null)
    } else {
      setRows(settlements.rows)
      setTotals(settlements.totals)
    }
    setLoading(false)
  }, [dateFrom, dateTo, search])

  useEffect(() => {
    if (!canView) return
    void loadData()
  }, [canView, loadData])

  async function handleSync() {
    if (!canSync || syncing) return
    setSyncing(true)
    const result = await syncUmagSettlements({ dateFrom, dateTo, syncSuppliers: true })
    setSyncing(false)

    if (!result.success) {
      showError(result.message)
      return
    }

    if (result.status === 'partial' || result.warning) {
      showWarning(result.warning || result.message)
    } else {
      showSuccess(result.message)
    }
    setSelected(null)
    await loadData()
  }

  function applyPreset(preset) {
    setDateFrom(preset.dateFrom)
    setDateTo(preset.dateTo)
    setSelected(null)
  }

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к взаиморасчётам UMAG" />
  }

  if (selected) {
    return <UmagSupplierDetail supplier={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="umag-settlements">
      <div className="umag-settlements__source-badge" role="status">
        По данным UMAG
      </div>

      <div className="umag-settlements__toolbar">
        <div className="umag-settlements__period">
          <label className="umag-settlements__field">
            <span>С</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="umag-settlements__field">
            <span>По</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <div className="umag-settlements__presets">
            {periodPresets().map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="umag-settlements__preset"
                onClick={() => applyPreset(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {canSync && (
          <button
            type="button"
            className="btn btn-primary umag-settlements__sync-btn"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? 'Синхронизация…' : 'Синхронизировать с UMAG'}
          </button>
        )}
      </div>

      <div className="umag-settlements__meta">
        <span>
          Период: {dateFrom} — {dateTo}
        </span>
        <span>
          Последняя синхронизация:{' '}
          {lastRun?.finished_at || lastRun?.started_at
            ? formatUmagDateTime(lastRun.finished_at || lastRun.started_at)
            : 'ещё не выполнялась'}
          {lastRun?.status ? ` (${statusLabel(lastRun.status)})` : ''}
        </span>
      </div>

      {lastRun?.warning_message && (
        <div className="umag-settlements__warning" role="alert">
          {lastRun.warning_message}
        </div>
      )}

      <div className="umag-settlements__totals" aria-label="Итоги по данным UMAG">
        <SummaryCard label="Сумма приёмок" value={totals?.amount} loading={loading} />
        <SummaryCard label="Оплачено" value={totals?.paymentAmount} loading={loading} />
        <SummaryCard label="Возвраты оплаты" value={totals?.paymentRefundAmount} loading={loading} />
        <SummaryCard label="Задолженность" value={totals?.debt} loading={loading} emphasize />
      </div>

      <div className="umag-settlements__search-row">
        <input
          type="search"
          className="umag-settlements__search"
          placeholder="Поиск по поставщику…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Поиск по поставщику"
        />
      </div>

      {loading ? (
        <div className="umag-settlements__skeleton" aria-busy="true">
          <div className="umag-settlements__skeleton-row" />
          <div className="umag-settlements__skeleton-row" />
          <div className="umag-settlements__skeleton-row" />
        </div>
      ) : loadError ? (
        <div className="umag-settlements__error" role="alert">
          {loadError}
        </div>
      ) : rows.length === 0 ? (
        <div className="umag-settlements__empty">
          За выбранный период приёмок UMAG не найдено
        </div>
      ) : (
        <>
          <div className="umag-settlements__table-wrap">
            <table className="umag-settlements__table">
              <thead>
                <tr>
                  <th>Поставщик</th>
                  <th>Приёмок</th>
                  <th>Сумма</th>
                  <th>Оплачено</th>
                  <th>Возвраты</th>
                  <th>Задолженность</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <button
                        type="button"
                        className="umag-settlements__link"
                        onClick={() => setSelected(row)}
                      >
                        {row.name}
                      </button>
                    </td>
                    <td>{row.supplyCount}</td>
                    <td>{formatUmagMoney(row.amount)}</td>
                    <td>{formatUmagMoney(row.paymentAmount)}</td>
                    <td>{formatUmagMoney(row.paymentRefundAmount)}</td>
                    <td className={row.debt > 0 ? 'umag-settlements__debt' : undefined}>
                      {formatUmagMoney(row.debt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="umag-settlements__cards" aria-label="Поставщики">
            {rows.map((row) => (
              <button
                key={row.key}
                type="button"
                className="umag-settlements__card"
                onClick={() => setSelected(row)}
              >
                <div className="umag-settlements__card-title">{row.name}</div>
                <div className="umag-settlements__card-grid">
                  <span>Приёмок</span>
                  <strong>{row.supplyCount}</strong>
                  <span>Сумма</span>
                  <strong>{formatUmagMoney(row.amount)}</strong>
                  <span>Оплачено</span>
                  <strong>{formatUmagMoney(row.paymentAmount)}</strong>
                  <span>Задолженность</span>
                  <strong className={row.debt > 0 ? 'umag-settlements__debt' : undefined}>
                    {formatUmagMoney(row.debt)}
                  </strong>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
