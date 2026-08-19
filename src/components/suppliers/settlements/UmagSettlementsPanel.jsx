import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  filterSupplierOperations,
  formatSignedUmagMoney,
  formatUmagDate,
  formatUmagDateTime,
  formatUmagMoney,
  getMonthPeriodKeys,
  supplyPaymentStatusLabel,
  syncUmagSettlements,
} from '../../../services/umagSettlementsService'
import {
  describeDifference,
  fetchLatestReconciliationStatuses,
  formatReconciliationPeriod,
  listSupplierReconciliations,
  reconciliationStatusLabel,
} from '../../../services/supplierReconciliationService'
import PlatformAccessDenied from '../../platform/PlatformAccessDenied'
import PlatformSearchToolbar, {
  PlatformFilterButton,
  PlatformToolbarActionWrap,
} from '../../platform/PlatformSearchToolbar'
import PlatformSyncButton from '../../platform/PlatformSyncButton'
import { DelayedLoadingSkeleton } from '../../loading/LoadingSkeleton'
import CreateReconciliationModal from './CreateReconciliationModal'
import ReconciliationDetailView from './ReconciliationDetailView'
import OperationDetailSheet from './OperationDetailSheet'
import SettlementsFilterPopover, {
  getSettlementsPeriodDefaults,
  resolveSettlementsPeriodPreset,
} from './SettlementsFilterPopover'
import {
  describeSettlementsPeriod,
  isSettlementsFilterActive,
} from '../../../utils/settlementsPeriod'
import './UmagSettlementsPanel.css'

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

function formatLastUpdated(lastRun) {
  const at = lastRun?.finished_at || lastRun?.started_at
  if (!at) return 'ещё не выполнялась'
  const base = formatUmagDateTime(at)
  if (lastRun?.status && lastRun.status !== 'success') {
    return `${base} (${statusLabel(lastRun.status)})`
  }
  return base
}

function TotalsMetaBlock({ periodLabel, lastRun }) {
  return (
    <div className="umag-settlements__tfoot-meta">
      <div className="umag-settlements__tfoot-meta-line">
        <span className="umag-settlements__source-chip" title="Источник данных">
          UMAG
        </span>
        <span className="umag-settlements__tfoot-period">{periodLabel}</span>
      </div>
      <div className="umag-settlements__tfoot-updated">
        Обновлено: {formatLastUpdated(lastRun)}
      </div>
      <div className="umag-settlements__tfoot-hint">Итого за выбранный период</div>
    </div>
  )
}

function TotalsMetricContent({ label, value, loading, isCount, tone }) {
  const debtPositive = tone === 'debt' && Number(value) > 0
  const display = loading
    ? '…'
    : isCount
      ? String(value ?? 0)
      : formatUmagMoney(value)

  return (
    <>
      <span className="umag-settlements__tfoot-label">{label}</span>
      <strong
        className={`umag-settlements__tfoot-value${
          tone === 'paid'
            ? ' umag-settlements__tfoot-value--paid'
            : tone === 'returns'
              ? ' umag-settlements__tfoot-value--returns'
              : debtPositive
                ? ' umag-settlements__tfoot-value--debt'
                : ''
        }`}
      >
        {display}
      </strong>
    </>
  )
}

/** Desktop: true table footer aligned to column grid. */
function SettlementsTableFoot({
  totals,
  loading,
  periodLabel,
  lastRun,
  canViewRecon,
}) {
  return (
    <tfoot className="umag-settlements__tfoot">
      <tr>
        <td className="umag-settlements__tfoot-meta-cell">
          <TotalsMetaBlock periodLabel={periodLabel} lastRun={lastRun} />
        </td>
        <td className="umag-settlements__tfoot-metric-cell">
          <TotalsMetricContent
            label="Приёмок"
            value={totals?.supplyCount}
            loading={loading}
            isCount
          />
        </td>
        <td className="umag-settlements__tfoot-metric-cell">
          <TotalsMetricContent
            label="Сумма приёмок"
            value={totals?.amount}
            loading={loading}
            tone="neutral"
          />
        </td>
        <td className="umag-settlements__tfoot-metric-cell">
          <TotalsMetricContent
            label="Возвраты поставщикам"
            value={totals?.returnAmount}
            loading={loading}
            tone="returns"
          />
        </td>
        <td className="umag-settlements__tfoot-metric-cell">
          <TotalsMetricContent
            label="Оплачено"
            value={totals?.paymentAmount}
            loading={loading}
            tone="paid"
          />
        </td>
        <td className="umag-settlements__tfoot-metric-cell">
          <TotalsMetricContent
            label="Текущий долг"
            value={totals?.debt}
            loading={loading}
            tone="debt"
          />
        </td>
        {canViewRecon ? <td className="umag-settlements__tfoot-empty-cell" /> : null}
      </tr>
    </tfoot>
  )
}

/** Mobile: compact sticky strip under card list (same aggregates). */
function SettlementsMobileTotals({ totals, loading, periodLabel, lastRun }) {
  return (
    <div className="umag-settlements__mobile-totals" aria-label="Итоги периода">
      <TotalsMetaBlock periodLabel={periodLabel} lastRun={lastRun} />
      <div className="umag-settlements__mobile-totals-grid">
        <div className="umag-settlements__mobile-totals-cell">
          <TotalsMetricContent
            label="Сумма приёмок"
            value={totals?.amount}
            loading={loading}
          />
        </div>
        <div className="umag-settlements__mobile-totals-cell">
          <TotalsMetricContent
            label="Возвраты"
            value={totals?.returnAmount}
            loading={loading}
            tone="returns"
          />
        </div>
        <div className="umag-settlements__mobile-totals-cell">
          <TotalsMetricContent
            label="Оплачено"
            value={totals?.paymentAmount}
            loading={loading}
            tone="paid"
          />
        </div>
        <div className="umag-settlements__mobile-totals-cell">
          <TotalsMetricContent
            label="Текущий долг"
            value={totals?.debt}
            loading={loading}
            tone="debt"
          />
        </div>
      </div>
    </div>
  )
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

function PaymentStatusBadge({ status }) {
  if (!status) {
    return <span className="umag-settlements__pay-status umag-settlements__pay-status--na">—</span>
  }
  return (
    <span className={`umag-settlements__pay-status umag-settlements__pay-status--${status}`}>
      {supplyPaymentStatusLabel(status)}
    </span>
  )
}

function operationDetailsLabel(op) {
  if (op.details) return op.details
  if (op.kind === 'return' || op.kind === 'refund') {
    return (
      [op.source?.user_name, op.source?.account_name, formatAccountNames(op.source?.account_names)]
        .filter((part) => part && part !== '—')
        .join(' · ') || 'UMAG'
    )
  }
  if (op.kind === 'payment') {
    return (
      [op.source?.user_name, op.source?.account_name, op.source?.note]
        .filter(Boolean)
        .join(' · ') || 'UMAG'
    )
  }
  return (
    [op.source?.umag_user_name, op.source?.account].filter(Boolean).join(' · ') || 'UMAG'
  )
}

function operationStatusNode(op) {
  if (op.kind === 'supply' && op.paymentStatus) {
    return <PaymentStatusBadge status={op.paymentStatus} />
  }
  return (
    <span className="umag-settlements__pay-status umag-settlements__pay-status--posted">
      {op.statusLabel || 'Проведено'}
    </span>
  )
}

function formatAccountNames(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean).join(', ') || '—'
  }
  if (value == null || value === '') return '—'
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item)).filter(Boolean).join(', ') || '—'
      }
    } catch {
      /* plain string */
    }
    return value
  }
  return String(value)
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
  const operations = supplier.operations || []
  const [opsFilter, setOpsFilter] = useState('all')
  const [selectedOperation, setSelectedOperation] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const visibleOps = useMemo(
    () => filterSupplierOperations(operations, opsFilter),
    [operations, opsFilter]
  )

  const loadHistory = useCallback(async () => {
    if (!canViewRecon) {
      setHistory([])
      return
    }
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const rows = await listSupplierReconciliations({
        platformSupplierId: supplier.platformSupplierId || supplier.supplierId,
        umagSupplierId: supplier.umagSupplierId,
      })
      setHistory(rows)
    } catch (err) {
      setHistory([])
      setHistoryError(err.message || 'Не удалось загрузить историю сверок')
    } finally {
      setHistoryLoading(false)
    }
  }, [
    canViewRecon,
    supplier.platformSupplierId,
    supplier.supplierId,
    supplier.umagSupplierId,
  ])

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
        <SummaryCard label="Возвраты поставщикам" value={supplier.returnAmount} />
        <SummaryCard label="Оплачено" value={supplier.paymentAmount} />
        <SummaryCard label="Текущий долг" value={supplier.debt} emphasize />
        <SummaryCard label="Количество приёмок" value={supplier.supplyCount} isCount />
      </div>

      {canViewRecon ? (
        <section className="umag-settlements__recon-history" aria-label="История сверок">
          <h3 className="umag-settlements__section-title">История сверок</h3>
          {historyLoading && history.length === 0 ? (
            <DelayedLoadingSkeleton variant="table" count={3} />
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

      <section className="umag-settlements__ops" aria-label="История операций">
        <div className="umag-settlements__ops-head">
          <h3 className="umag-settlements__section-title">История операций</h3>
          <div className="umag-settlements__ops-filters" role="tablist" aria-label="Фильтр операций">
            {[
              { id: 'all', label: 'Все' },
              { id: 'supplies', label: 'Приёмки' },
              { id: 'payments', label: 'Оплаты' },
              { id: 'returns', label: 'Возвраты' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={opsFilter === opt.id}
                className={`umag-settlements__ops-filter${
                  opsFilter === opt.id ? ' umag-settlements__ops-filter--active' : ''
                }`}
                onClick={() => setOpsFilter(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {visibleOps.length === 0 ? (
          <div className="umag-settlements__empty">
            За выбранный период операций UMAG не найдено
          </div>
        ) : (
          <>
            <div className="umag-settlements__table-wrap">
              <table className="umag-settlements__table umag-settlements__table--ops">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Операция</th>
                    <th>Документ</th>
                    <th className="umag-settlements__money-col">Увеличение</th>
                    <th className="umag-settlements__money-col">Уменьшение</th>
                    <th className="umag-settlements__money-col">Сальдо</th>
                    <th>Статус</th>
                    <th>Детали</th>
                  </tr>
                </thead>
                <tbody>
                  {Number(supplier.openingBalance) !== 0 && (
                    <tr className="umag-settlements__ops-row umag-settlements__ops-row--opening">
                      <td colSpan={2}>Начальное сальдо</td>
                      <td>—</td>
                      <td className="umag-settlements__money-col">—</td>
                      <td className="umag-settlements__money-col">—</td>
                      <td className="umag-settlements__money-col">
                        {formatUmagMoney(supplier.openingBalance)}
                      </td>
                      <td>
                        <span className="umag-settlements__pay-status umag-settlements__pay-status--posted">
                          Сальдо
                        </span>
                      </td>
                      <td className="umag-settlements__ops-meta">На начало периода</td>
                    </tr>
                  )}
                  {visibleOps.map((op) => {
                    const increase = Number(op.debtIncrease) || 0
                    const decrease = Number(op.debtDecrease) || 0
                    return (
                      <tr
                        key={op.id}
                        className="umag-settlements__ops-row"
                        onClick={() => setSelectedOperation(op)}
                      >
                        <td>{formatUmagDate(op.sortAt)}</td>
                        <td>
                          <button
                            type="button"
                            className={`umag-settlements__op-badge umag-settlements__op-badge--button umag-settlements__op-badge--${op.kind}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedOperation(op)
                            }}
                          >
                            {op.label}
                          </button>
                        </td>
                        <td>{op.documentNumber ? `№ ${op.documentNumber}` : '—'}</td>
                        <td className="umag-settlements__money-col umag-settlements__amount-pos">
                          {increase > 0 ? formatUmagMoney(increase) : '—'}
                        </td>
                        <td className="umag-settlements__money-col umag-settlements__amount-neg">
                          {decrease > 0 ? formatUmagMoney(decrease) : '—'}
                        </td>
                        <td className="umag-settlements__money-col">
                          {formatUmagMoney(op.runningBalance)}
                        </td>
                        <td>{operationStatusNode(op)}</td>
                        <td className="umag-settlements__ops-meta">{operationDetailsLabel(op)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="umag-settlements__cards" aria-label="История операций">
              {visibleOps.map((op) => {
                const increase = Number(op.debtIncrease) || 0
                const decrease = Number(op.debtDecrease) || 0
                return (
                  <button
                    key={op.id}
                    type="button"
                    className="umag-settlements__card"
                    onClick={() => setSelectedOperation(op)}
                  >
                    <div className="umag-settlements__card-title">
                      <span
                        className={`umag-settlements__op-badge umag-settlements__op-badge--${op.kind}`}
                      >
                        {op.label}
                      </span>
                      <span className="umag-settlements__card-date">
                        {formatUmagDate(op.sortAt)}
                      </span>
                    </div>
                    <div className="umag-settlements__card-finance">
                      <div>
                        <span>Документ</span>
                        <strong>{op.documentNumber ? `№ ${op.documentNumber}` : '—'}</strong>
                      </div>
                      <div>
                        <span>Увеличение</span>
                        <strong className="umag-settlements__amount-pos">
                          {increase > 0 ? formatUmagMoney(increase) : '—'}
                        </strong>
                      </div>
                      <div>
                        <span>Уменьшение</span>
                        <strong className="umag-settlements__amount-neg">
                          {decrease > 0 ? formatUmagMoney(decrease) : '—'}
                        </strong>
                      </div>
                      <div>
                        <span>Сальдо</span>
                        <strong>{formatUmagMoney(op.runningBalance)}</strong>
                      </div>
                    </div>
                    <div className="umag-settlements__card-status">{operationStatusNode(op)}</div>
                    <div className="umag-settlements__card-meta">{operationDetailsLabel(op)}</div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </section>

      {selectedOperation ? (
        <OperationDetailSheet
          operation={selectedOperation}
          supplierName={supplier.name}
          onClose={() => setSelectedOperation(null)}
        />
      ) : null}

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

/**
 * @param {{ embedded?: boolean, refreshToken?: unknown }} [props]
 *   embedded — Этап 2.6: hides the standalone shell's sync button and the
 *     last-run warning banner so this can render as pure settlements content
 *     under a future shared header. Period filter, search, table, supplier
 *     drill-down, and reconciliation flow are unchanged — those are content,
 *     not shell, per Этап 2.6 item 7.
 *   refreshToken — Этап 2.7: bump this (any changed value) to make an
 *     embedded instance reload without remounting/losing local state
 *     (selected supplier, open filter, etc.). Ignored in standalone use.
 */
export default function UmagSettlementsPanel({ embedded = false, refreshToken = null } = {}) {
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
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftFilter, setDraftFilter] = useState(() => getSettlementsPeriodDefaults())
  const filterButtonRef = useRef(null)

  const periodLabel = useMemo(
    () => describeSettlementsPeriod(dateFrom, dateTo),
    [dateFrom, dateTo]
  )
  const filterActive = isSettlementsFilterActive(dateFrom, dateTo)

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
    // refreshToken has no direct effect on loadData()'s own inputs — a parent
    // (Этап 2.7 shared shell) bumps it to force a reload without remounting.
  }, [canView, loadData, refreshToken])

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

  function openFilter() {
    setDraftFilter({
      periodPreset: resolveSettlementsPeriodPreset(dateFrom, dateTo),
      dateFrom,
      dateTo,
    })
    setFilterOpen((open) => !open)
  }

  function applyFilter() {
    const nextFrom = draftFilter.dateFrom
    const nextTo = draftFilter.dateTo
    if (!nextFrom || !nextTo) {
      showError('Укажите даты периода')
      return
    }
    if (nextFrom > nextTo) {
      showError('Дата «С» не может быть позже даты «По»')
      return
    }
    setDateFrom(nextFrom)
    setDateTo(nextTo)
    setSelected(null)
    setSelectedReconciliationId(null)
    setFilterOpen(false)
  }

  function resetFilter() {
    const defaults = getSettlementsPeriodDefaults()
    setDraftFilter(defaults)
    setDateFrom(defaults.dateFrom)
    setDateTo(defaults.dateTo)
    setSelected(null)
    setSelectedReconciliationId(null)
    setFilterOpen(false)
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
    <div className="umag-settlements umag-settlements--list">
      <PlatformSearchToolbar
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onClear={() => setSearch('')}
        showClear
        placeholder="Поиск по поставщику"
        ariaLabel="Поиск по поставщику"
        flush
        className="umag-settlements__search-toolbar"
        actions={
          <>
            <PlatformToolbarActionWrap>
              <PlatformFilterButton
                buttonRef={filterButtonRef}
                active={filterActive || filterOpen}
                onClick={openFilter}
                ariaExpanded={filterOpen}
                ariaLabel={
                  filterActive ? `Фильтр, ${periodLabel}` : 'Фильтр периода'
                }
                title={filterActive ? `Фильтр · ${periodLabel}` : 'Фильтр'}
              />
              <SettlementsFilterPopover
                open={filterOpen}
                draft={draftFilter}
                onChange={setDraftFilter}
                onApply={applyFilter}
                onReset={resetFilter}
                onClose={() => setFilterOpen(false)}
                anchorRef={filterButtonRef}
              />
            </PlatformToolbarActionWrap>
            {canSync && !embedded ? (
              <PlatformToolbarActionWrap>
                <PlatformSyncButton
                  onClick={() => void handleSync()}
                  syncing={syncing}
                  disabled={!canSync}
                  title="Синхронизация UMAG"
                  aria-label="Синхронизация UMAG"
                />
              </PlatformToolbarActionWrap>
            ) : null}
          </>
        }
      />

      {!embedded && lastRun?.warning_message && (
        <div className="umag-settlements__warning" role="alert">
          {lastRun.warning_message}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <DelayedLoadingSkeleton variant="table" count={5} />
      ) : loadError && rows.length === 0 ? (
        <div className="umag-settlements__error" role="alert">
          {loadError}
        </div>
      ) : (
        <div className="umag-settlements__list-body">
          <div className="umag-settlements__table-wrap">
            <table className="umag-settlements__table umag-settlements__table--with-totals">
              <thead>
                <tr>
                  <th>Поставщик</th>
                  <th>Приёмок</th>
                  <th>Сумма приёмок</th>
                  <th>Возвраты поставщикам</th>
                  <th>Оплачено</th>
                  <th>Текущий долг</th>
                  {canViewRecon ? <th>Последняя сверка</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={canViewRecon ? 7 : 6} className="umag-settlements__empty-cell">
                      За выбранный период операций UMAG не найдено
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
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
                      <td>{formatUmagMoney(row.returnAmount)}</td>
                      <td>{formatUmagMoney(row.paymentAmount)}</td>
                      <td className={row.debt > 0 ? 'umag-settlements__debt' : undefined}>
                        {formatUmagMoney(row.debt)}
                      </td>
                      {canViewRecon ? (
                        <td>
                          <LatestReconBadge status={latestReconByKey.get(row.key)} />
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
              <SettlementsTableFoot
                totals={totals}
                loading={false}
                periodLabel={periodLabel}
                lastRun={lastRun}
                canViewRecon={canViewRecon}
              />
            </table>
          </div>

          {rows.length === 0 ? (
            <div className="umag-settlements__empty umag-settlements__empty--mobile">
              За выбранный период операций UMAG не найдено
            </div>
          ) : (
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
                    <span>Сумма приёмок</span>
                    <strong>{formatUmagMoney(row.amount)}</strong>
                    <span>Возвраты поставщику</span>
                    <strong>{formatUmagMoney(row.returnAmount)}</strong>
                    <span>Оплачено</span>
                    <strong>{formatUmagMoney(row.paymentAmount)}</strong>
                    <span>Текущий долг</span>
                    <strong className={row.debt > 0 ? 'umag-settlements__debt' : undefined}>
                      {formatUmagMoney(row.debt)}
                    </strong>
                  </div>
                </button>
              ))}
            </div>
          )}

          <SettlementsMobileTotals
            totals={totals}
            loading={false}
            periodLabel={periodLabel}
            lastRun={lastRun}
          />
        </div>
      )}
    </div>
  )
}
