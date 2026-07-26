import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import {
  canCreateUmagReconciliations,
  canEditUmagReconciliations,
  canResolveUmagReconciliations,
  canSyncUmagSettlements,
  canViewUmagReconciliations,
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
import {
  describeDifference,
  fetchLatestReconciliationStatuses,
  formatReconciliationPeriod,
  listSupplierReconciliations,
  reconciliationStatusLabel,
} from '../../../services/supplierReconciliationService'
import PlatformAccessDenied from '../../platform/PlatformAccessDenied'
import CreateReconciliationModal from './CreateReconciliationModal'
import ReconciliationDetailView from './ReconciliationDetailView'
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

function LatestReconBadge({ status }) {
  if (!status) {
    return <span className="umag-settlements__recon-badge umag-settlements__recon-badge--none">Нет сверки</span>
  }
  return (
    <span className={`umag-settlements__recon-badge umag-settlements__recon-badge--${status}`}>
      {reconciliationStatusLabel(status)}
    </span>
  )
}

function UmagSupplierDetail({
  supplier,
  periodDateFrom,
  periodDateTo,
  lastRun,
  canSync,
  canViewRecon,
  canCreateRecon,
  userId,
  onBack,
  onOpenReconciliation,
  onSyncComplete,
  showError,
  showSuccess,
  showWarning,
}) {
  const supplies = supplier.supplies || []
  const [createOpen, setCreateOpen] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')

  const loadHistory = useCallback(async () => {
    if (!canViewRecon) {
      setHistory([])
      return
    }
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const rows = await listSupplierReconciliations({
        supplierId: supplier.supplierId,
        umagSupplierId: supplier.umagSupplierId,
      })
      setHistory(rows)
    } catch (err) {
      setHistory([])
      setHistoryError(err.message || 'Не удалось загрузить историю сверок')
    } finally {
      setHistoryLoading(false)
    }
  }, [canViewRecon, supplier.supplierId, supplier.umagSupplierId])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  return (
    <div className="umag-settlements umag-settlements--detail">
      <button type="button" className="umag-settlements__back" onClick={onBack}>
        ← К списку взаиморасчётов
      </button>

      <div className="umag-settlements__detail-head">
        <div>
          <h2 className="umag-settlements__detail-title">{supplier.name}</h2>
          <div className="umag-settlements__source-badge" role="status">
            По данным UMAG за выбранный период
          </div>
        </div>
        {canCreateRecon ? (
          <button
            type="button"
            className="btn btn-primary umag-settlements__create-recon"
            onClick={() => setCreateOpen(true)}
          >
            Создать сверку
          </button>
        ) : null}
      </div>

      <div className="umag-settlements__totals">
        <SummaryCard label="Сумма приёмок" value={supplier.amount} />
        <SummaryCard label="Оплачено" value={supplier.paymentAmount} />
        <SummaryCard label="Задолженность" value={supplier.debt} emphasize />
        <SummaryCard label="Количество приёмок" value={supplier.supplyCount} isCount />
      </div>

      {canViewRecon ? (
        <section className="umag-settlements__recon-history" aria-label="История сверок">
          <h3 className="umag-settlements__section-title">История сверок</h3>
          {historyLoading ? (
            <div className="umag-settlements__empty">Загрузка истории…</div>
          ) : historyError ? (
            <div className="umag-settlements__error" role="alert">
              {historyError}
            </div>
          ) : history.length === 0 ? (
            <div className="umag-settlements__empty">Сверок по этому поставщику ещё нет</div>
          ) : (
            <>
              <div className="umag-settlements__table-wrap">
                <table className="umag-settlements__table">
                  <thead>
                    <tr>
                      <th>Период</th>
                      <th>Дата сверки</th>
                      <th>UMAG</th>
                      <th>Поставщик</th>
                      <th>Расхождение</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => {
                      const diff = describeDifference(row.difference)
                      return (
                        <tr key={row.id}>
                          <td>
                            <button
                              type="button"
                              className="umag-settlements__link"
                              onClick={() => onOpenReconciliation(row.id)}
                            >
                              {formatReconciliationPeriod(row.dateFrom, row.dateTo)}
                            </button>
                          </td>
                          <td>{formatUmagDate(row.createdAt)}</td>
                          <td>{formatUmagMoney(row.umagDebt)}</td>
                          <td>
                            {row.supplierReportedBalance == null
                              ? '—'
                              : formatUmagMoney(row.supplierReportedBalance)}
                          </td>
                          <td>{diff.amountLabel}</td>
                          <td>{reconciliationStatusLabel(row.status)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="umag-settlements__cards" aria-label="История сверок">
                {history.map((row) => {
                  const diff = describeDifference(row.difference)
                  return (
                    <button
                      key={row.id}
                      type="button"
                      className="umag-settlements__card"
                      onClick={() => onOpenReconciliation(row.id)}
                    >
                      <div className="umag-settlements__card-title">
                        {formatReconciliationPeriod(row.dateFrom, row.dateTo)}
                      </div>
                      <div className="umag-settlements__card-grid">
                        <span>Дата сверки</span>
                        <strong>{formatUmagDate(row.createdAt)}</strong>
                        <span>UMAG</span>
                        <strong>{formatUmagMoney(row.umagDebt)}</strong>
                        <span>Поставщик</span>
                        <strong>
                          {row.supplierReportedBalance == null
                            ? '—'
                            : formatUmagMoney(row.supplierReportedBalance)}
                        </strong>
                        <span>Расхождение</span>
                        <strong>{diff.amountLabel}</strong>
                        <span>Статус</span>
                        <strong>{reconciliationStatusLabel(row.status)}</strong>
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </section>
      ) : null}

      <h3 className="umag-settlements__section-title">Приёмки UMAG</h3>

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

      {createOpen ? (
        <CreateReconciliationModal
          supplier={supplier}
          defaultDateFrom={periodDateFrom}
          defaultDateTo={periodDateTo}
          lastRun={lastRun}
          canSync={canSync}
          createdBy={userId}
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            setCreateOpen(false)
            void loadHistory()
            onOpenReconciliation(created.id)
          }}
          onSyncComplete={onSyncComplete}
          showError={showError}
          showSuccess={showSuccess}
          showWarning={showWarning}
        />
      ) : null}
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
  const canViewRecon = canViewUmagReconciliations(user)
  const canCreateRecon = canCreateUmagReconciliations(user)
  const canEditRecon = canEditUmagReconciliations(user)
  const canResolveRecon = canResolveUmagReconciliations(user)
  const userId = Number.isFinite(Number(user?.id)) ? Number(user.id) : null

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
  const [selectedReconciliationId, setSelectedReconciliationId] = useState(null)
  const [latestReconByKey, setLatestReconByKey] = useState(() => new Map())

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const [settlements, run, latestStatuses] = await Promise.all([
      fetchUmagSettlementsBySupplier({ dateFrom, dateTo, search }),
      fetchLastUmagSyncRun(),
      canViewRecon ? fetchLatestReconciliationStatuses() : Promise.resolve(new Map()),
    ])
    setLastRun(run)
    setLatestReconByKey(latestStatuses)
    if (settlements.error) {
      setLoadError(settlements.error)
      setRows([])
      setTotals(null)
    } else {
      setRows(settlements.rows)
      setTotals(settlements.totals)
    }
    setLoading(false)
  }, [dateFrom, dateTo, search, canViewRecon])

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
    setSelectedReconciliationId(null)
    await loadData()
  }

  function applyPreset(preset) {
    setDateFrom(preset.dateFrom)
    setDateTo(preset.dateTo)
    setSelected(null)
    setSelectedReconciliationId(null)
  }

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к взаиморасчётам UMAG" />
  }

  if (selectedReconciliationId) {
    return (
      <div className="umag-settlements umag-settlements--detail">
        <ReconciliationDetailView
          reconciliationId={selectedReconciliationId}
          canEdit={canEditRecon}
          canResolve={canResolveRecon}
          userId={userId}
          onBack={() => setSelectedReconciliationId(null)}
          showError={showError}
          showSuccess={showSuccess}
        />
      </div>
    )
  }

  if (selected) {
    return (
      <UmagSupplierDetail
        supplier={selected}
        periodDateFrom={dateFrom}
        periodDateTo={dateTo}
        lastRun={lastRun}
        canSync={canSync}
        canViewRecon={canViewRecon}
        canCreateRecon={canCreateRecon}
        userId={userId}
        onBack={() => setSelected(null)}
        onOpenReconciliation={(id) => setSelectedReconciliationId(id)}
        onSyncComplete={() => {
          void loadData()
        }}
        showError={showError}
        showSuccess={showSuccess}
        showWarning={showWarning}
      />
    )
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
                  {canViewRecon ? <th>Последняя сверка</th> : null}
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
                    {canViewRecon ? (
                      <td>
                        <LatestReconBadge status={latestReconByKey.get(row.key)} />
                      </td>
                    ) : null}
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
                {canViewRecon ? (
                  <div className="umag-settlements__card-recon">
                    <LatestReconBadge status={latestReconByKey.get(row.key)} />
                  </div>
                ) : null}
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
