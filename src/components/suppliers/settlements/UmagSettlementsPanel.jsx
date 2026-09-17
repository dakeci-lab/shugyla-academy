import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import {
  canManageSupplierPayments,
  canSyncUmagSettlements,
  canViewUmagSettlements,
} from '../../../config/permissions'
import {
  fetchLastUmagSyncRun,
  fetchUmagSettlementsBySupplier,
  filterSupplierOperations,
  formatSignedUmagMoney,
  formatUmagDate,
  formatUmagMoney,
  getMonthPeriodKeys,
  supplyPaymentStatusLabel,
  syncUmagSettlements,
} from '../../../services/umagSettlementsService'
import { unmarkObligationPaid } from '../../../services/supplierPaymentObligationsService'
import PlatformAccessDenied from '../../platform/PlatformAccessDenied'
import PlatformFilterTrigger from '../../platform/PlatformFilterTrigger'
import PlatformSearchToolbar, { PlatformToolbarActionWrap } from '../../platform/PlatformSearchToolbar'
import PlatformSyncButton from '../../platform/PlatformSyncButton'
import { DelayedLoadingSkeleton } from '../../loading/LoadingSkeleton'
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

function TotalsMetaBlock() {
  // Source chip + period + "Обновлено:" used to repeat here — that's already
  // shown once at the top of the page (next to the sync button). Only the
  // totals-row label remains, now in the same bold style the period label
  // used to have.
  return (
    <div className="umag-settlements__tfoot-meta">
      <div className="umag-settlements__tfoot-period">Итого за выбранный период</div>
    </div>
  )
}

function TotalsMetricContent({ label, value, loading, isCount, tone, unavailable, unavailableTitle }) {
  const debtPositive = tone === 'debt' && Number(value) > 0
  const debtUnavailable = tone === 'debt' && (unavailable || value == null)
  const display = loading
    ? '…'
    : debtUnavailable
      ? '—'
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
        title={debtUnavailable ? unavailableTitle || 'Есть несопоставленные поставщики' : undefined}
      >
        {display}
      </strong>
    </>
  )
}

/** Desktop: true table footer aligned to column grid. */
function SettlementsTableFoot({ totals, loading }) {
  return (
    <tfoot className="umag-settlements__tfoot">
      <tr>
        <td className="umag-settlements__tfoot-meta-cell">
          <TotalsMetaBlock />
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
            label="По списку"
            value={totals?.debt}
            loading={loading}
            tone="debt"
            unavailable={totals?.debt == null}
          />
        </td>
      </tr>
    </tfoot>
  )
}

/** Mobile: compact sticky strip under card list (same aggregates). */
function SettlementsMobileTotals({ totals, loading }) {
  return (
    <div className="umag-settlements__mobile-totals" aria-label="Итоги списка">
      <TotalsMetaBlock />
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
            label="По списку"
            value={totals?.debt}
            loading={loading}
            tone="debt"
            unavailable={totals?.debt == null}
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
    // 'UMAG' is only a truthful fallback for a genuine UMAG-sourced record
    // with no recorded user/account. A native mark (external_source
    // 'platform') that's merely missing a configured payment account is not
    // "from UMAG" — show a plain dash instead of mislabeling its source.
    const isPlatformSourced = op.source?.external_source === 'platform'
    return (
      [op.source?.user_name, op.source?.account_name, op.source?.note]
        .filter(Boolean)
        .join(' · ') || (isPlatformSourced ? '—' : 'UMAG')
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
  canManagePayments,
  onBack,
  onSyncComplete,
  showError,
  showSuccess,
}) {
  const operations = supplier.operations || []
  const [opsFilter, setOpsFilter] = useState('all')
  const [selectedOperation, setSelectedOperation] = useState(null)
  const visibleOps = useMemo(
    () => filterSupplierOperations(operations, opsFilter),
    [operations, opsFilter]
  )

  // Same pattern as handleSync()/applyFilter() below: a mutation here backs
  // out to the supplier list and reloads it, rather than trying to patch
  // this drilldown's own locally-cached operations/history in place.
  async function handleUnmarkPayment(obligationId) {
    try {
      await unmarkObligationPaid(obligationId)
      showSuccess?.('Отметка оплаты снята')
      setSelectedOperation(null)
      onBack()
      onSyncComplete?.()
    } catch (err) {
      showError?.(err.message || 'Не удалось отменить отметку оплаты')
    }
  }

  return (
    <div className="umag-settlements umag-settlements--detail">
      <button type="button" className="umag-settlements__back" onClick={onBack}>
        ← К списку взаиморасчётов
      </button>

      <div className="umag-settlements__detail-head">
        <div>
          <h2 className="umag-settlements__detail-title">{supplier.name}</h2>
        </div>
      </div>

      <div className="umag-settlements__totals">
        <SummaryCard label="Сумма приёмок" value={supplier.amount} />
        <SummaryCard label="Возвраты поставщикам" value={supplier.returnAmount} />
        <SummaryCard label="Оплачено" value={supplier.paymentAmount} />
        <SummaryCard label="Текущий долг" value={supplier.debt} emphasize />
        <SummaryCard label="Количество приёмок" value={supplier.supplyCount} isCount />
      </div>

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
          canManage={canManagePayments}
          onUnmark={handleUnmarkPayment}
        />
      ) : null}
    </div>
  )
}

/**
 * @param {{ embedded?: boolean, refreshToken?: unknown }} [props]
 *   embedded — Этап 2.6: hides the standalone shell's sync button and the
 *     last-run warning banner so this can render as pure settlements content
 *     under a future shared header. Period filter, search, table, and
 *     supplier drill-down are unchanged — those are content, not shell,
 *     per Этап 2.6 item 7.
 *   refreshToken — Этап 2.7: bump this (any changed value) to make an
 *     embedded instance reload without remounting/losing local state
 *     (selected supplier, open filter, etc.). Ignored in standalone use.
 */
export default function UmagSettlementsPanel({
  embedded = false,
  refreshToken = null,
  filterSlot = null,
} = {}) {
  const { user } = useSession()
  const toast = useToast()
  const showSuccess = toast.success
  const showError = toast.error
  const showWarning = typeof toast.warning === 'function' ? toast.warning : showError

  const canView = canViewUmagSettlements(user)
  const canSync = canSyncUmagSettlements(user)
  const canManagePayments = canManageSupplierPayments(user)

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
    setFilterOpen(false)
  }

  function resetFilter() {
    const defaults = getSettlementsPeriodDefaults()
    setDraftFilter(defaults)
    setDateFrom(defaults.dateFrom)
    setDateTo(defaults.dateTo)
    setSelected(null)
    setFilterOpen(false)
  }

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к взаиморасчётам UMAG" />
  }

  if (selected) {
    return (
      <UmagSupplierDetail
        supplier={selected}
        canManagePayments={canManagePayments}
        onBack={() => setSelected(null)}
        onSyncComplete={() => {
          void loadData()
        }}
        showError={showError}
        showSuccess={showSuccess}
      />
    )
  }

  const filterTrigger = (
    <PlatformFilterTrigger
      ref={filterButtonRef}
      active={filterActive}
      open={filterOpen}
      onClick={openFilter}
      aria-label={filterActive ? `Фильтр, ${periodLabel}` : 'Фильтр периода'}
      title={filterActive ? `Фильтр · ${periodLabel}` : 'Фильтр'}
    />
  )
  const filterPopover = (
    <SettlementsFilterPopover
      open={filterOpen}
      draft={draftFilter}
      onChange={setDraftFilter}
      onApply={applyFilter}
      onReset={resetFilter}
      onClose={() => setFilterOpen(false)}
      anchorRef={filterButtonRef}
    />
  )

  return (
    <div className="umag-settlements umag-settlements--list">
      {/* Same shared filter trigger as «К оплате» — portaled next to the sync
          button in SupplierFinancePanel's shared bar when embedded there. */}
      {filterSlot
        ? createPortal(
            <div className="pf-filter-anchor">
              {filterTrigger}
              {filterPopover}
            </div>,
            filterSlot
          )
        : null}
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
            {!filterSlot ? (
              <PlatformToolbarActionWrap>
                <div className="pf-filter-anchor">
                  {filterTrigger}
                  {filterPopover}
                </div>
              </PlatformToolbarActionWrap>
            ) : null}
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
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="umag-settlements__empty-cell">
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
                    </tr>
                  ))
                )}
              </tbody>
              <SettlementsTableFoot totals={totals} loading={false} />
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

          <SettlementsMobileTotals totals={totals} loading={false} />
        </div>
      )}
    </div>
  )
}
