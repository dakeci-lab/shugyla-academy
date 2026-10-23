import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import { usePlatformData } from '../../../context/PlatformDataContext'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import { isCloudMode } from '../../../lib/dataMode'
import { isModuleReady } from '../../../lib/cloudStore'
import {
  canDeleteSuppliers,
  canEditSuppliers,
  canManageSupplierPayments,
  canSyncUmagSettlements,
  canViewSuppliers,
  canViewUmagSettlements,
} from '../../../config/permissions'
import {
  getSuppliers,
  getSupplierById,
  updateSupplier,
  deleteSupplier,
  ensureModuleLoaded,
} from '../../../services/platformDataService'
import {
  fetchNativeSupplierDebtSummary,
  UNASSIGNED_SUPPLIER_ID,
  UNASSIGNED_SUPPLIER_NAME,
} from '../../../services/supplierDebtService'
import {
  countOpenOperations,
  describeOpenDocuments,
  isOpenOperation,
  matchesOperationQuery,
  operationAmountSign,
} from '../../../utils/supplierHistoryView'
import {
  ensurePaymentAccountsLoaded,
  getPaymentAccountName,
  getPaymentAccountsForAssignment,
} from '../../../services/paymentAccountsService'
import {
  filterSuppliers,
  formatDeferralDaysTerm,
  matchesSupplierArchiveFilter as matchesArchive,
  isSupplierDeleted,
  SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED,
} from '../../../utils/supplierData'
import {
  fetchLastUmagSyncRun,
  fetchUmagSupplierOperationHistory,
  filterSupplierOperations,
  formatUmagDate,
  formatUmagMoney,
  getMonthPeriodKeys,
  syncUmagSettlements,
} from '../../../services/umagSettlementsService'
import {
  markObligationPaid,
  markReturnRefunded,
  refreshObligationTermsForSupplier,
  unmarkObligationPaid,
  unmarkReturnRefunded,
} from '../../../services/supplierPaymentObligationsService'
import PlatformAccessDenied from '../../platform/PlatformAccessDenied'
import PlatformFilterTrigger from '../../platform/PlatformFilterTrigger'
import FilterComboField from '../../platform/FilterComboField'
import { PgtFoot, PgtHead, PgtRow, PgtTable } from '../../platform/PlatformGridTable'
import PlatformSyncButton from '../../platform/PlatformSyncButton'
import { DelayedLoadingSkeleton } from '../../loading/LoadingSkeleton'
import AdminModal from '../../admin/AdminModal'
import ConfirmDialog from '../../admin/ConfirmDialog'
import IconActionButton from '../../admin/IconActionButton'
import { PencilIcon } from '../../icons/PlatformIcons'
import '../../admin/IconActionButton.css'
import OperationDetailSheet from './OperationDetailSheet'
import PeriodFilterPopover, {
  getSettlementsPeriodDefaults,
  resolveSettlementsPeriodPreset,
} from '../../platform/PeriodFilterPopover'
import SupplierForm, {
  EMPTY_SUPPLIER_FORM,
  formToSupplierUpdatePayload,
  supplierToForm,
  validateSupplierDeferralDays,
} from '../SupplierForm'
import {
  describeSettlementsPeriod,
  isSettlementsFilterActive,
} from '../../../utils/settlementsPeriod'
import './UmagSettlementsPanel.css'

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

const HISTORY_COLUMNS = [
  { key: 'date', label: 'Дата', width: 110, mobile: 'hide' },
  { key: 'op', label: 'Операция', width: 260, flex: true, mobile: 'title' },
  { key: 'amount', label: 'Сумма', width: 150, align: 'end', mobile: 'end' },
  { key: 'status', label: 'Статус', width: 200, align: 'end', mobile: 'hide' },
]

/**
 * Status column of a history row. Colour is for action only: an open document gets one outlined button
 * («Оплатить» / «Получили возврат»), a closed one a quiet check mark, UMAG payments nothing at all.
 */
function OperationStatusCell({ op, canManage, onOpen }) {
  const settlement = op.settlement
  if (!settlement) return null
  const isPayable = settlement.type === 'payable'
  if (settlement.settled) {
    return <span className="umag-settlements__done">✓ {isPayable ? 'Оплачено' : 'Возврат получен'}</span>
  }
  if (canManage) {
    return (
      <button type="button" className="umag-settlements__pay-btn" onClick={() => onOpen(op)}>
        {isPayable ? 'Оплатить' : 'Получили возврат'}
      </button>
    )
  }
  return <span className="umag-settlements__pending">{isPayable ? 'Не оплачено' : 'Ждём возврат'}</span>
}

/** Second line under the operation name: the document number, or who paid and from which account. */
function operationSubline(op) {
  if (op.kind === 'payment') {
    const details = operationDetailsLabel(op)
    return details && details !== '—' && details !== 'UMAG' ? details : ''
  }
  return op.documentNumber ? `№ ${op.documentNumber}` : ''
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

/**
 * Supplier card header: the name, the one number that matters («К оплате») and the details as quiet
 * text — only the ones that are actually filled in (no rows of «—»).
 */
function SupplierIdentityCard({ supplier, canEdit, canViewFinance, debtLoading, onEdit }) {
  const balance = (
    canViewFinance ? (
      <div className="umag-settlements__id-balance">
        <span className="umag-settlements__id-balance-label">К оплате</span>
        <span
          className={`umag-settlements__id-balance-amount${
            supplier.debt > 0 ? '' : ' umag-settlements__id-balance-amount--zero'
          }`}
        >
          {debtLoading ? '…' : formatUmagMoney(supplier.debt ?? 0)}
        </span>
      </div>
    ) : null
  )

  if (supplier.isVirtual) {
    return (
      <div className="umag-settlements__id">
        <div className="umag-settlements__id-top">
          <div className="umag-settlements__id-name">
            <h2 className="umag-settlements__detail-title">{supplier.name}</h2>
          </div>
          <div className="umag-settlements__id-side">{balance}</div>
        </div>
        <p className="umag-settlements__id-note">
          Документы UMAG, у которых не выбран поставщик (например, приёмка ещё не оформлена полностью).
          Выберите поставщика в UMAG — после синхронизации документ перейдёт к нему. Оплатить такой
          документ можно и здесь.
        </p>
      </div>
    )
  }

  const archived = isSupplierDeleted(supplier)
  const method = getPaymentAccountName(supplier.paymentAccountId)
  const hasTerm = supplier.deferralDays != null && supplier.deferralDays !== ''
  const payment = [method, hasTerm ? formatDeferralDaysTerm(supplier.deferralDays) : null].filter(Boolean)
  // normalizeSupplier renders an empty weekday list as «—»; quiet text shows only what is really filled in.
  const filled = (value) => {
    const text = String(value ?? '').trim()
    return text && text !== '—' ? text : null
  }
  const contacts = [
    filled(supplier.legalName),
    filled(supplier.bin) ? `БИН ${filled(supplier.bin)}` : null,
    filled(supplier.managerName),
    filled(supplier.managerPhone),
    filled(supplier.orderDays) ? `Заказ: ${filled(supplier.orderDays)}` : null,
    filled(supplier.deliveryDays) ? `Доставка: ${filled(supplier.deliveryDays)}` : null,
  ].filter(Boolean)

  return (
    <div className="umag-settlements__id">
      <div className="umag-settlements__id-top">
        <div className="umag-settlements__id-name">
          <h2 className="umag-settlements__detail-title">{supplier.name}</h2>
          {archived ? <span className="umag-settlements__id-badge">Архив</span> : null}
        </div>
        <div className="umag-settlements__id-side">
          {balance}
          {canEdit ? (
            <IconActionButton label="Редактировать поставщика" variant="primary" onClick={onEdit}>
              <PencilIcon />
            </IconActionButton>
          ) : null}
        </div>
      </div>
      <p className="umag-settlements__id-meta">
        {payment.length > 0 ? `Оплата: ${payment.join(' · ')}` : 'Способ оплаты не настроен'}
      </p>
      {contacts.length > 0 ? <p className="umag-settlements__id-meta">{contacts.join(' · ')}</p> : null}
    </div>
  )
}

/**
 * Supplier card: identity (always, if canViewIdentity) + financial summary
 * and operation history for a period picked HERE, inside the card — the
 * list above never carries a period any more (owner decision 2026-09-19:
 * the list is «the» supplier list, not a period report).
 */
function UmagSupplierDetail({
  supplier,
  filterSlot,
  canViewFinance,
  canEditSupplier,
  canManagePayments,
  debtLoading,
  onBack,
  onEdit,
  onSyncComplete,
  showError,
  showSuccess,
}) {
  const defaultPeriod = useMemo(() => getSettlementsPeriodDefaults(), [])
  const [dateFrom, setDateFrom] = useState(defaultPeriod.dateFrom)
  const [dateTo, setDateTo] = useState(defaultPeriod.dateTo)
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftFilter, setDraftFilter] = useState(defaultPeriod)
  const filterButtonRef = useRef(null)

  const periodLabel = useMemo(() => describeSettlementsPeriod(dateFrom, dateTo), [dateFrom, dateTo])
  const filterActive = isSettlementsFilterActive(dateFrom, dateTo)

  // Warms the payment-accounts cache so SupplierIdentityCard's «Способ
  // оплаты» resolves even when nothing else on the page has loaded it yet;
  // the setState-on-resolve forces the one re-render needed to show it.
  const [, setAccountsCacheVersion] = useState(0)
  useEffect(() => {
    let cancelled = false
    void ensurePaymentAccountsLoaded().then(() => {
      if (!cancelled) setAccountsCacheVersion((v) => v + 1)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const { user } = useSession()
  const [reloadToken, setReloadToken] = useState(0)
  const [paymentAccounts, setPaymentAccounts] = useState([])
  useEffect(() => {
    if (!canManagePayments) return undefined
    let cancelled = false
    void getPaymentAccountsForAssignment().then((list) => {
      if (!cancelled) setPaymentAccounts(list || [])
    })
    return () => {
      cancelled = true
    }
  }, [canManagePayments])

  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(canViewFinance)
  const [detailError, setDetailError] = useState('')

  useEffect(() => {
    if (!canViewFinance) return undefined
    let cancelled = false
    setDetailLoading(true)
    setDetailError('')
    void fetchUmagSupplierOperationHistory({
      platformSupplierId: supplier.isVirtual ? null : supplier.id,
      umagSupplierId: supplier.umagSupplierId,
      unassigned: Boolean(supplier.isVirtual),
      dateFrom,
      dateTo,
    }).then((result) => {
      if (cancelled) return
      if (result.error) setDetailError(result.error)
      setDetail(result)
      setDetailLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [canViewFinance, supplier.id, supplier.umagSupplierId, supplier.isVirtual, dateFrom, dateTo, reloadToken])

  const operations = useMemo(() => detail?.operations || [], [detail])
  const [opsFilter, setOpsFilter] = useState('open')
  const [opsFilterTouched, setOpsFilterTouched] = useState(false)
  const [opsQuery, setOpsQuery] = useState('')
  const [selectedOperation, setSelectedOperation] = useState(null)
  const openCount = useMemo(() => countOpenOperations(operations), [operations])

  // The card opens on what needs a click («Не закрытые»); with nothing open it opens on everything, and
  // right after the last document is paid it switches to the full list so the result is visible.
  useEffect(() => {
    if (detailLoading || opsFilterTouched) return
    setOpsFilter(openCount > 0 ? 'open' : 'all')
  }, [detailLoading, openCount, opsFilterTouched])

  function chooseOpsFilter(id) {
    setOpsFilterTouched(true)
    setOpsFilter(id)
  }

  // A search looks through every operation of the period, whatever chip is active.
  const searching = opsQuery.trim() !== ''
  const visibleOps = useMemo(() => {
    const base = searching ? operations : filterSupplierOperations(operations, opsFilter)
    return base.filter((op) => matchesOperationQuery(op, opsQuery))
  }, [operations, opsFilter, opsQuery, searching])

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

  async function handleSettle(op, accountId) {
    try {
      if (op.settlement?.type === 'payable') {
        const obligation = op.source?.obligation
        await markObligationPaid(
          {
            id: op.settlement.obligationId,
            originalSupplyAmount: obligation?.original_supply_amount,
            platformSupplierId: supplier.isVirtual ? null : supplier.id,
            supplierName: supplier.isVirtual ? null : supplier.name,
            umagSupplyId: op.source?.umag_supply_id,
          },
          {
            paidByEmployeeId: user?.id ?? null,
            accountId,
            employeeName: user?.name ?? null,
            accountName: getPaymentAccountName(accountId),
          }
        )
        showSuccess?.('Отмечено оплаченным')
      } else {
        await markReturnRefunded(op.source?.id, {
          refundedByEmployeeId: user?.id ?? null,
          accountId,
        })
        showSuccess?.('Возврат отмечен полученным')
      }
      setSelectedOperation(null)
      setReloadToken((token) => token + 1)
      onSyncComplete?.()
    } catch (err) {
      showError?.(err.message || 'Не удалось сохранить отметку')
    }
  }

  async function handleUnsettle(op) {
    try {
      if (op.settlement?.type === 'payable') {
        await unmarkObligationPaid(op.settlement.obligationId)
        showSuccess?.('Отметка оплаты снята')
      } else {
        await unmarkReturnRefunded(op.source?.id)
        showSuccess?.('Отметка получения возврата снята')
      }
      setSelectedOperation(null)
      setReloadToken((token) => token + 1)
      onSyncComplete?.()
    } catch (err) {
      showError?.(err.message || 'Не удалось снять отметку')
    }
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
      showError?.('Укажите даты периода')
      return
    }
    if (nextFrom > nextTo) {
      showError?.('Дата «С» не может быть позже даты «По»')
      return
    }
    setDateFrom(nextFrom)
    setDateTo(nextTo)
    setFilterOpen(false)
  }

  function resetFilter() {
    const defaults = getSettlementsPeriodDefaults()
    setDraftFilter(defaults)
    setDateFrom(defaults.dateFrom)
    setDateTo(defaults.dateTo)
    setFilterOpen(false)
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
    <PeriodFilterPopover
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
    <div className="umag-settlements umag-settlements--detail">
      {canViewFinance && filterSlot
        ? createPortal(
            <div className="pf-filter-anchor">
              {filterTrigger}
              {filterPopover}
            </div>,
            filterSlot
          )
        : null}

      <button type="button" className="umag-settlements__back" onClick={onBack}>
        ← К списку поставщиков
      </button>

      <SupplierIdentityCard
        supplier={supplier}
        canEdit={canEditSupplier}
        canViewFinance={canViewFinance}
        debtLoading={debtLoading}
        onEdit={onEdit}
      />

      {canViewFinance ? (
        <>
          <section className="umag-settlements__ops" aria-label="История операций">
            <h3 className="umag-settlements__section-title">
              История операций<span className="umag-settlements__period">{periodLabel}</span>
            </h3>

            <div className="umag-settlements__ops-controls">
              <div className="umag-settlements__ops-filters" role="tablist" aria-label="Фильтр операций">
                {[
                  { id: 'open', label: 'Не закрытые', count: openCount },
                  { id: 'all', label: 'Все' },
                  { id: 'supplies', label: 'Приёмки' },
                  { id: 'payments', label: 'Оплаты' },
                  { id: 'returns', label: 'Возвраты' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={!searching && opsFilter === opt.id}
                    className={`umag-settlements__ops-filter${
                      !searching && opsFilter === opt.id ? ' umag-settlements__ops-filter--active' : ''
                    }`}
                    onClick={() => {
                      setOpsQuery('')
                      chooseOpsFilter(opt.id)
                    }}
                  >
                    {opt.label}
                    {opt.count ? <span className="umag-settlements__ops-filter-count">{opt.count}</span> : null}
                  </button>
                ))}
              </div>
              <input
                type="search"
                className="umag-settlements__search"
                value={opsQuery}
                onChange={(event) => setOpsQuery(event.target.value)}
                placeholder="Номер документа или сумма"
                aria-label="Поиск по документам"
              />
            </div>

            {detailLoading ? (
              <DelayedLoadingSkeleton variant="table" count={5} />
            ) : detailError ? (
              <div className="umag-settlements__error" role="alert">
                {detailError}
              </div>
            ) : visibleOps.length === 0 ? (
              <div className="umag-settlements__empty">
                {searching
                  ? 'Ничего не найдено за выбранный период'
                  : opsFilter === 'open'
                    ? 'Неоплаченных документов нет'
                    : 'За выбранный период операций UMAG не найдено'}
                {!searching && opsFilter === 'open' ? (
                  <button type="button" className="umag-settlements__empty-action" onClick={() => chooseOpsFilter('all')}>
                    Показать все
                  </button>
                ) : null}
              </div>
            ) : (
              <PgtTable columns={HISTORY_COLUMNS}>
                <PgtHead columns={HISTORY_COLUMNS} />
                {visibleOps.map((op) => {
                  const sign = operationAmountSign(op)
                  const sub = operationSubline(op)
                  const statusNode = (
                    <OperationStatusCell op={op} canManage={canManagePayments} onOpen={setSelectedOperation} />
                  )
                  return (
                    <PgtRow
                      key={op.id}
                      columns={HISTORY_COLUMNS}
                      cells={{
                        date: <span className="umag-settlements__date">{formatUmagDate(op.sortAt)}</span>,
                        op: (
                          <span className="umag-settlements__op">
                            <button
                              type="button"
                              className="umag-settlements__op-link"
                              onClick={() => setSelectedOperation(op)}
                            >
                              {op.label}
                            </button>
                            {sub ? <span className="umag-settlements__op-sub">{sub}</span> : null}
                          </span>
                        ),
                        amount: (
                          <span className="pgt__money">
                            {sign}
                            {formatUmagMoney(op.amount)}
                          </span>
                        ),
                        status: statusNode,
                      }}
                      mobileMeta={
                        <>
                          {formatUmagDate(op.sortAt)}
                          {sub && op.kind === 'payment' ? ` · ${sub}` : ''}
                          {op.settlement ? <> · {statusNode}</> : null}
                        </>
                      }
                    />
                  )
                })}
              </PgtTable>
            )}
          </section>
        </>
      ) : null}

      {selectedOperation ? (
        <OperationDetailSheet
          operation={selectedOperation}
          supplierName={supplier.name}
          onClose={() => setSelectedOperation(null)}
          canManage={canManagePayments}
          onUnmark={handleUnmarkPayment}
          paymentAccounts={paymentAccounts}
          defaultAccountId={supplier.isVirtual ? null : supplier.paymentAccountId ?? null}
          onSettle={(accountId) => handleSettle(selectedOperation, accountId)}
          onUnsettle={() => handleUnsettle(selectedOperation)}
        />
      ) : null}
    </div>
  )
}

/**
 * «Фильтр» popover for the supplier list — the same combobox design as
 * «К оплате» (FilterComboField): a searchable supplier checkbox list. The
 * old standalone search box lives here now. Also carries the archived toggle.
 */
function SuppliersFilterPopover({
  open,
  supplierOptions,
  supplierDraft,
  onToggleSupplier,
  searchValue,
  onSearchChange,
  showArchivedDraft,
  onShowArchivedChange,
  onApply,
  onReset,
  onClose,
  anchorRef,
}) {
  const popoverRef = useRef(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    function handlePointerDown(event) {
      if (popoverRef.current?.contains(event.target)) return
      if (anchorRef.current?.contains(event.target)) return
      onClose()
    }
    function handleEscape(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, onClose, anchorRef])

  useEffect(() => {
    if (!open) setExpanded(false)
  }, [open])

  if (!open) return null

  return (
    <div ref={popoverRef} className="spo-filter-pop" role="dialog" aria-label="Фильтр">
      <FilterComboField
        label="Поставщик"
        searchable
        placeholder="Введите название"
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        options={supplierOptions}
        draft={supplierDraft}
        onToggle={onToggleSupplier}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((value) => !value)}
        emptyText="Поставщик не найден"
      />
      <label className="pf-field pf-field__item umag-settlements__archived-toggle">
        <input
          type="checkbox"
          checked={showArchivedDraft}
          onChange={(event) => onShowArchivedChange(event.target.checked)}
        />
        <span>Показать удалённых поставщиков</span>
      </label>
      <div className="spo-filter-pop__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onReset}>
          Сбросить
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={onApply}>
          Применить
        </button>
      </div>
    </div>
  )
}

/**
 * @param {{ embedded?: boolean, refreshToken?: unknown }} [props]
 *   embedded — hides the standalone shell's sync button and the last-run
 *     warning banner so this can render as pure content under
 *     SupplierFinancePanel's shared header.
 *   refreshToken — bump this (any changed value) to make an embedded
 *     instance reload without remounting/losing local state (selected
 *     supplier, open filter, etc.). Ignored in standalone use.
 *
 * 2026-09-19: merged with the old standalone «Поставщики» directory
 * (SuppliersPage) per the owner's request — this is now THE supplier list
 * (no period at list level), with each supplier's card carrying its own
 * period for the financial summary/history, identity fields, and edit
 * action. The list itself never filters by date any more.
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
  const location = useLocation()
  const navigate = useNavigate()

  const canViewDirectory = canViewSuppliers(user)
  const canViewFinance = canViewUmagSettlements(user)
  const canView = canViewDirectory || canViewFinance
  const canSync = canSyncUmagSettlements(user)
  const canManagePayments = canManageSupplierPayments(user)
  const canEdit = canEditSuppliers(user)
  const canDelete = canDeleteSuppliers(user)

  const { version: dataVersion } = usePlatformData()
  const { version } = useAdminRefresh()

  const suppliersReady = !isCloudMode() || isModuleReady('suppliers')
  useEffect(() => {
    if (!canView) return
    void ensureModuleLoaded('suppliers')
  }, [canView])

  const [supplierFilter, setSupplierFilter] = useState(() => new Set())
  const [supplierFilterDraft, setSupplierFilterDraft] = useState(() => new Set())
  const [filterSearch, setFilterSearch] = useState('')
  const [appliedShowArchived, setAppliedShowArchived] = useState(SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED)
  const [draftShowArchived, setDraftShowArchived] = useState(SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterButtonRef = useRef(null)
  const filtersActive =
    appliedShowArchived !== SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED || supplierFilter.size > 0

  const [lastRun, setLastRun] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [debtSummary, setDebtSummary] = useState(new Map())
  const debtByPlatformId = useMemo(
    () => new Map([...debtSummary].map(([id, entry]) => [id, entry.amount])),
    [debtSummary]
  )
  const [listQuery, setListQuery] = useState('')
  const [debtOnly, setDebtOnly] = useState(true)
  const [debtLoading, setDebtLoading] = useState(true)
  const [debtsSettled, setDebtsSettled] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_SUPPLIER_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [focusSection, setFocusSection] = useState(null)
  const returnToRef = useRef(null)

  const allSuppliers = suppliersReady ? getSuppliers() : []
  const unassignedDebt = debtByPlatformId.get(UNASSIGNED_SUPPLIER_ID) ?? 0
  const unassignedSupplier = useMemo(
    () => ({
      id: UNASSIGNED_SUPPLIER_ID,
      name: UNASSIGNED_SUPPLIER_NAME,
      isVirtual: true,
    }),
    []
  )
  const baseList = useMemo(() => {
    const base = filterSuppliers(allSuppliers, { search: '', showArchived: appliedShowArchived })
    const list = supplierFilter.size > 0 ? base.filter((s) => supplierFilter.has(s.id)) : base
    // Shown only while there is something unassigned, and only in the default
    // (non-archive, unfiltered) view, so it never sits in an empty list.
    return unassignedDebt !== 0 && supplierFilter.size === 0 && !appliedShowArchived
      ? [...list, unassignedSupplier]
      : list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSuppliers, supplierFilter, appliedShowArchived, unassignedDebt, unassignedSupplier, version, dataVersion])
  const searchingList = listQuery.trim() !== ''
  const withDebtCount = useMemo(
    () => baseList.filter((s) => (debtByPlatformId.get(s.id) || 0) !== 0).length,
    [baseList, debtByPlatformId]
  )
  // A search looks at every supplier, with or without debt; otherwise «С долгом» hides the zero-balance tail.
  const filteredUnsorted = useMemo(() => {
    const q = listQuery.trim().toLowerCase()
    return baseList.filter((s) => {
      if (q) {
        return `${s.name || ''} ${s.legalName || ''}`.toLowerCase().includes(q)
      }
      return !debtOnly || (debtByPlatformId.get(s.id) || 0) !== 0
    })
  }, [baseList, listQuery, debtOnly, debtByPlatformId])
  // Biggest balance first so the largest debts stand out; name breaks ties
  // (and orders the all-zero tail) so the list stays stable.
  const filtered = useMemo(
    () =>
      [...filteredUnsorted].sort(
        (a, b) =>
          (debtByPlatformId.get(b.id) || 0) - (debtByPlatformId.get(a.id) || 0) ||
          a.name.localeCompare(b.name, 'ru')
      ),
    [filteredUnsorted, debtByPlatformId]
  )
  const selected =
    selectedId === UNASSIGNED_SUPPLIER_ID
      ? unassignedSupplier
      : selectedId
        ? allSuppliers.find((s) => s.id === selectedId) || null
        : null
  const totalDebt = useMemo(
    () => filtered.reduce((sum, s) => sum + (debtByPlatformId.get(s.id) || 0), 0),
    [filtered, debtByPlatformId]
  )

  const loadDebts = useCallback(() => {
    if (!canViewFinance) {
      setDebtLoading(false)
      setDebtsSettled(true)
      return
    }
    setDebtLoading(true)
    // Needs no supplier ids: every open obligation with a supplier plus the unassigned bucket, so the
    // query starts together with the suppliers load instead of waiting for it.
    void fetchNativeSupplierDebtSummary({ includeUnassigned: true })
      .then((map) => {
        setDebtSummary(map)
        setDebtLoading(false)
        setDebtsSettled(true)
      })
      .catch((err) => {
        showError(err.message || 'Не удалось рассчитать текущую задолженность поставщиков')
        setDebtLoading(false)
        setDebtsSettled(true)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewFinance, version, dataVersion, refreshToken])

  useEffect(() => {
    loadDebts()
  }, [loadDebts])

  useEffect(() => {
    if (!canView) return
    void fetchLastUmagSyncRun().then(setLastRun)
  }, [canView, refreshToken])

  // Legacy deep link from «К оплате»: open the edit modal directly (payment
  // terms focus), same as the old standalone directory used to.
  useEffect(() => {
    const openEditId = location.state?.openEditId
    if (!openEditId || !canEdit) return

    const supplier = getSupplierById(openEditId)
    if (supplier) {
      setEditId(supplier.id)
      setForm(supplierToForm(supplier))
      setFormError('')
      setFocusSection(location.state?.focusSection || null)
      returnToRef.current = location.state?.returnTo || null
      setShowForm(true)
    }

    navigate(location.pathname + location.search, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.openEditId, canEdit])

  async function handleSync() {
    if (!canSync || syncing) return
    setSyncing(true)
    const { dateFrom, dateTo } = getMonthPeriodKeys()
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
    setLastRun(await fetchLastUmagSyncRun())
    loadDebts()
  }

  function openEdit(supplier) {
    setEditId(supplier.id)
    setForm(supplierToForm(supplier))
    setFormError('')
    setFocusSection(null)
    returnToRef.current = null
    setShowForm(true)
  }

  const closeForm = useCallback(() => {
    setShowForm(false)
    setEditId(null)
    setFormError('')
    setFocusSection(null)
    returnToRef.current = null
  }, [])

  const handleSave = useCallback(async () => {
    setFormError('')
    if (!form.name.trim()) {
      setFormError('Укажите название поставщика')
      return
    }
    const deferralError = validateSupplierDeferralDays(form)
    if (deferralError) {
      setFormError(deferralError)
      return
    }

    setSaving(true)
    try {
      const payload = formToSupplierUpdatePayload(form)
      await updateSupplier(editId, payload)
      try {
        await refreshObligationTermsForSupplier(editId, payload)
      } catch {
        // Recomputing due dates is best-effort; supplier save already succeeded.
      }
      const returnTo = returnToRef.current
      const cameFromPayments = Boolean(returnTo)
      closeForm()
      if (cameFromPayments) {
        showSuccess('Условия оплаты сохранены. Сроки обязательств обновлены.')
        navigate(returnTo)
      } else {
        showSuccess('Поставщик сохранён')
      }
    } catch (err) {
      setFormError(err.message || 'Не удалось сохранить поставщика')
    } finally {
      setSaving(false)
    }
  }, [closeForm, editId, form, navigate, showSuccess])

  const requestDelete = useCallback(() => {
    if (!editId) return
    const supplier = getSupplierById(editId)
    if (supplier) setDeleteTarget(supplier)
  }, [editId])

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteSupplier(deleteTarget.id)
      showSuccess('Поставщик удалён')
      if (selectedId === deleteTarget.id) setSelectedId(null)
      setDeleteTarget(null)
      closeForm()
    } catch (err) {
      showError(err.message || 'Не удалось удалить поставщика')
    } finally {
      setDeleting(false)
    }
  }

  const modalFooter = useMemo(
    () => (
      <div className="suppliers-modal-footer">
        {editId && canDelete && (
          <button
            type="button"
            className="btn suppliers-modal-footer__status-action suppliers-modal-footer__status-action--danger"
            disabled={saving || deleting}
            onClick={requestDelete}
          >
            Удалить поставщика
          </button>
        )}
        <div className="suppliers-modal-footer__actions">
          <button type="button" className="btn btn--outline" onClick={closeForm}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving || deleting}
            onClick={handleSave}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    ),
    [editId, canDelete, saving, deleting, closeForm, requestDelete, handleSave]
  )

  function toggleFilter() {
    if (filterOpen) {
      setFilterOpen(false)
      return
    }
    setDraftShowArchived(appliedShowArchived)
    setSupplierFilterDraft(new Set(supplierFilter))
    setFilterSearch('')
    setFilterOpen(true)
  }

  function toggleFilterSupplier(id) {
    setSupplierFilterDraft((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function applyListFilter() {
    setAppliedShowArchived(draftShowArchived)
    setSupplierFilter(new Set(supplierFilterDraft))
    setFilterOpen(false)
  }

  function resetListFilter() {
    setDraftShowArchived(SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED)
    setAppliedShowArchived(SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED)
    setSupplierFilterDraft(new Set())
    setSupplierFilter(new Set())
    setFilterSearch('')
    setFilterOpen(false)
  }

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к поставщикам" />
  }

  const listColumns = [
    { key: 'name', label: 'Поставщик', width: 240, flex: true, mobile: 'title' },
    ...(canViewFinance
      ? [{ key: 'balance', label: 'К оплате', width: 170, align: 'end', mobile: 'end' }]
      : []),
  ]

  const emptyMessage = (() => {
    if (supplierFilter.size > 0) return 'По вашему запросу ничего не найдено.'
    if (appliedShowArchived) return 'Удалённых поставщиков нет.'
    if (searchingList) return 'Поставщик не найден.'
    if (debtOnly && allSuppliers.length > 0) return 'Долгов нет — всё оплачено.'
    return allSuppliers.length === 0
      ? 'Поставщики ещё не синхронизированы. Выполните синхронизацию с UMAG.'
      : 'По вашему запросу ничего не найдено.'
  })()

  const listFilterTrigger = (
    <PlatformFilterTrigger
      ref={filterButtonRef}
      active={filtersActive}
      count={supplierFilter.size + (appliedShowArchived ? 1 : 0)}
      open={filterOpen}
      onClick={toggleFilter}
      aria-label="Фильтр"
      title="Фильтр"
    />
  )
  const listFilterPopover = (
    <SuppliersFilterPopover
      open={filterOpen}
      supplierOptions={allSuppliers
        .filter((sup) => matchesArchive(sup, draftShowArchived))
        .map((sup) => ({ id: sup.id, label: sup.name }))}
      supplierDraft={supplierFilterDraft}
      onToggleSupplier={toggleFilterSupplier}
      searchValue={filterSearch}
      onSearchChange={setFilterSearch}
      showArchivedDraft={draftShowArchived}
      onShowArchivedChange={setDraftShowArchived}
      onApply={applyListFilter}
      onReset={resetListFilter}
      onClose={() => setFilterOpen(false)}
      anchorRef={filterButtonRef}
    />
  )

  return (
    <>
      {selected ? (
        <UmagSupplierDetail
          supplier={{ ...selected, debt: debtByPlatformId.get(selected.id) ?? null }}
          filterSlot={filterSlot}
          canViewFinance={canViewFinance}
          canEditSupplier={canEdit}
          canManagePayments={canManagePayments}
          debtLoading={debtLoading}
          onBack={() => setSelectedId(null)}
          onEdit={() => openEdit(selected)}
          onSyncComplete={loadDebts}
          showError={showError}
          showSuccess={showSuccess}
        />
      ) : (
        <div className="umag-settlements umag-settlements--list">
          {filterSlot
            ? createPortal(
                <div className="pf-filter-anchor">
                  {listFilterTrigger}
                  {listFilterPopover}
                </div>,
                filterSlot
              )
            : null}
          {!filterSlot || (canSync && !embedded) ? (
            <div className="umag-settlements__topbar">
              {!filterSlot ? (
                <div className="pf-filter-anchor">
                  {listFilterTrigger}
                  {listFilterPopover}
                </div>
              ) : null}
              {canSync && !embedded ? (
                <PlatformSyncButton
                  onClick={() => void handleSync()}
                  syncing={syncing}
                  disabled={!canSync}
                  title="Синхронизация UMAG"
                  aria-label="Синхронизация UMAG"
                />
              ) : null}
            </div>
          ) : null}

          {supplierFilter.size > 0 ? (
            <div className="pf-filter-strip">
              <span>Поставщики:</span>
              {[...supplierFilter].map((id) => (
                <span key={id} className="pf-filter-chip">
                  {allSuppliers.find((sup) => sup.id === id)?.name || 'Поставщик'}
                  <button
                    type="button"
                    aria-label="Убрать поставщика из фильтра"
                    onClick={() =>
                      setSupplierFilter((current) => {
                        const next = new Set(current)
                        next.delete(id)
                        return next
                      })
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {!embedded && lastRun?.warning_message && (
            <div className="umag-settlements__warning" role="alert">
              {lastRun.warning_message}
            </div>
          )}

          {suppliersReady && debtsSettled ? (
            <div className="umag-settlements__list-tools">
              <div className="umag-settlements__ops-filters" role="tablist" aria-label="Какие поставщики показывать">
                {[
                  { id: 'debt', label: 'С долгом', count: withDebtCount },
                  { id: 'all', label: 'Все', count: 0 },
                ].map((opt) => {
                  const active = !searchingList && (opt.id === 'debt') === debtOnly
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`umag-settlements__ops-filter${active ? ' umag-settlements__ops-filter--active' : ''}`}
                      onClick={() => {
                        setListQuery('')
                        setDebtOnly(opt.id === 'debt')
                      }}
                    >
                      {opt.label}
                      {opt.count ? <span className="umag-settlements__ops-filter-count">{opt.count}</span> : null}
                    </button>
                  )
                })}
              </div>
              <input
                type="search"
                className="umag-settlements__search"
                value={listQuery}
                onChange={(event) => setListQuery(event.target.value)}
                placeholder="Найти поставщика"
                aria-label="Поиск поставщика"
              />
            </div>
          ) : null}

          {(!suppliersReady && filtered.length === 0) || !debtsSettled ? (
            <DelayedLoadingSkeleton variant="table" count={5} />
          ) : filtered.length === 0 ? (
            <div className="pgt__empty">{emptyMessage}</div>
          ) : (
            <PgtTable columns={listColumns}>
              <PgtHead columns={listColumns} />
              {filtered.map((s) => {
                const debt = debtByPlatformId.get(s.id) ?? null
                const meta = describeOpenDocuments(debtSummary.get(s.id))
                return (
                  <PgtRow
                    key={s.id}
                    columns={listColumns}
                    cells={{
                      name: (
                        <span className="umag-settlements__supplier">
                          <button
                            type="button"
                            className="pgt__link"
                            onClick={() => setSelectedId(s.id)}
                          >
                            {s.name}
                          </button>
                          {meta ? <span className="umag-settlements__supplier-meta">{meta}</span> : null}
                        </span>
                      ),
                      balance: (
                        <span className={`pgt__money${debt > 0 ? '' : ' umag-settlements__zero'}`}>
                          {debtLoading ? '…' : formatUmagMoney(debt ?? 0)}
                        </span>
                      ),
                    }}
                  />
                )
              })}
              {canViewFinance ? (
                <PgtFoot
                  columns={listColumns}
                  cells={{
                    name: <span>Итого</span>,
                    balance: (
                      <span className="pgt__money">
                        {debtLoading ? '…' : formatUmagMoney(totalDebt)}
                      </span>
                    ),
                  }}
                />
              ) : null}
            </PgtTable>
          )}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Удалить поставщика?"
          message={`Поставщик «${deleteTarget.name}» будет удалён без возможности восстановления. Это действие нельзя отменить.`}
          confirmLabel="Удалить"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          loading={deleting}
        />
      )}

      {showForm && canEdit && (
        <AdminModal
          title="Редактировать поставщика"
          onClose={closeForm}
          wide
          autoFocusClose={false}
          footer={modalFooter}
        >
          <SupplierForm
            form={form}
            onChange={setForm}
            error={formError}
            supplierId={editId}
            focusSection={focusSection}
          />
        </AdminModal>
      )}
    </>
  )
}
