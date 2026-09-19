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
import { fetchNativeSupplierDebts } from '../../../services/supplierDebtService'
import { ensurePaymentAccountsLoaded, getPaymentAccountName } from '../../../services/paymentAccountsService'
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
  supplyPaymentStatusLabel,
  syncUmagSettlements,
} from '../../../services/umagSettlementsService'
import {
  refreshObligationTermsForSupplier,
  unmarkObligationPaid,
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
import SettlementsFilterPopover, {
  getSettlementsPeriodDefaults,
  resolveSettlementsPeriodPreset,
} from './SettlementsFilterPopover'
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

/**
 * Supplier identity + edit entry point, structured like the employee profile
 * header (top identity block, edit action) — the piece that used to live only
 * in the standalone «Поставщики» directory, now inside the supplier card.
 * 2026-09-19: absorbed the period-independent «Баланс» (ex-«Текущий долг»)
 * plus legal name/BIN/payment method/payment term — the owner found the
 * separate 5-tile summary block redundant with the operation history below
 * and asked for one denser identity card instead.
 */
function SupplierIdentityCard({ supplier, canEdit, canViewFinance, debtLoading, onEdit }) {
  const archived = isSupplierDeleted(supplier)
  const paymentMethodLabel = getPaymentAccountName(supplier.paymentAccountId) || 'Не настроено'
  const paymentTermLabel = formatDeferralDaysTerm(supplier.deferralDays)
  return (
    <div className="umag-settlements__identity">
      <div className="umag-settlements__identity-main">
        <h2 className="umag-settlements__detail-title">{supplier.name}</h2>
        {archived ? <span className="umag-settlements__identity-badge">Архив</span> : null}
      </div>
      <dl className="umag-settlements__identity-grid">
        <div>
          <dt>Юр. название</dt>
          <dd>{supplier.legalName || '—'}</dd>
        </div>
        <div>
          <dt>БИН</dt>
          <dd>{supplier.bin || '—'}</dd>
        </div>
        <div>
          <dt>Менеджер</dt>
          <dd>{supplier.managerName || '—'}</dd>
        </div>
        <div>
          <dt>Телефон</dt>
          <dd>{supplier.managerPhone || '—'}</dd>
        </div>
        <div>
          <dt>Дни заказа</dt>
          <dd>{supplier.orderDays || '—'}</dd>
        </div>
        <div>
          <dt>Дни доставки</dt>
          <dd>{supplier.deliveryDays || '—'}</dd>
        </div>
        <div>
          <dt>Способ оплаты</dt>
          <dd>{paymentMethodLabel}</dd>
        </div>
        <div>
          <dt>Срок оплаты</dt>
          <dd>{paymentTermLabel}</dd>
        </div>
        {canViewFinance ? (
          <div>
            <dt>Баланс</dt>
            <dd className={supplier.debt > 0 ? 'umag-settlements__debt' : undefined}>
              {debtLoading ? '…' : formatUmagMoney(supplier.debt ?? 0)}
            </dd>
          </div>
        ) : null}
      </dl>
      {canEdit ? (
        <IconActionButton label="Редактировать" variant="primary" onClick={onEdit}>
          <PencilIcon />
        </IconActionButton>
      ) : null}
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
  // the setState-on-resolve forces the one re-render needed to show it
  // (same pattern as SupplierPaymentsPanel's accountsCacheVersion).
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

  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(canViewFinance)
  const [detailError, setDetailError] = useState('')

  useEffect(() => {
    if (!canViewFinance) return undefined
    let cancelled = false
    setDetailLoading(true)
    setDetailError('')
    void fetchUmagSupplierOperationHistory({
      platformSupplierId: supplier.id,
      umagSupplierId: supplier.umagSupplierId,
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
  }, [canViewFinance, supplier.id, supplier.umagSupplierId, dateFrom, dateTo])

  const operations = detail?.operations || []
  const openingBalance = detail?.openingBalance || 0
  const [opsFilter, setOpsFilter] = useState('all')
  const [selectedOperation, setSelectedOperation] = useState(null)
  const visibleOps = useMemo(
    () => filterSupplierOperations(operations, opsFilter),
    [operations, opsFilter]
  )

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
            <div className="umag-settlements__ops-head">
              <h3 className="umag-settlements__section-title">История операций · {periodLabel}</h3>
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

            {detailLoading ? (
              <DelayedLoadingSkeleton variant="table" count={5} />
            ) : detailError ? (
              <div className="umag-settlements__error" role="alert">
                {detailError}
              </div>
            ) : visibleOps.length === 0 ? (
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
                      {Number(openingBalance) !== 0 && (
                        <tr className="umag-settlements__ops-row umag-settlements__ops-row--opening">
                          <td colSpan={2}>Начальное сальдо</td>
                          <td>—</td>
                          <td className="umag-settlements__money-col">—</td>
                          <td className="umag-settlements__money-col">—</td>
                          <td className="umag-settlements__money-col">
                            {formatUmagMoney(openingBalance)}
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
        </>
      ) : null}

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
  const [debtByPlatformId, setDebtByPlatformId] = useState(new Map())
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
  const filteredUnsorted = useMemo(() => {
    const base = filterSuppliers(allSuppliers, { search: '', showArchived: appliedShowArchived })
    return supplierFilter.size > 0 ? base.filter((s) => supplierFilter.has(s.id)) : base
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSuppliers, supplierFilter, appliedShowArchived, version, dataVersion])
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
  const selected = selectedId ? allSuppliers.find((s) => s.id === selectedId) || null : null
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
    if (!suppliersReady) return
    setDebtLoading(true)
    void fetchNativeSupplierDebts({ platformSupplierIds: allSuppliers.map((s) => s.id) })
      .then((map) => {
        setDebtByPlatformId(map)
        setDebtLoading(false)
        setDebtsSettled(true)
      })
      .catch((err) => {
        showError(err.message || 'Не удалось рассчитать текущую задолженность поставщиков')
        setDebtLoading(false)
        setDebtsSettled(true)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewFinance, suppliersReady, allSuppliers.length, version, dataVersion, refreshToken])

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
      ? [{ key: 'balance', label: 'Баланс', width: 160, align: 'end', mobile: 'end' }]
      : []),
    ...(canEdit ? [{ key: 'actions', label: '', width: 44, align: 'end', mobile: 'hide' }] : []),
  ]

  const emptyMessage = (() => {
    if (supplierFilter.size > 0) return 'По вашему запросу ничего не найдено.'
    if (appliedShowArchived) return 'Удалённых поставщиков нет.'
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

          {(!suppliersReady && filtered.length === 0) || !debtsSettled ? (
            <DelayedLoadingSkeleton variant="table" count={5} />
          ) : filtered.length === 0 ? (
            <div className="pgt__empty">{emptyMessage}</div>
          ) : (
            <PgtTable columns={listColumns}>
              <PgtHead columns={listColumns} />
              {filtered.map((s) => {
                const debt = debtByPlatformId.get(s.id) ?? null
                return (
                  <PgtRow
                    key={s.id}
                    columns={listColumns}
                    cells={{
                      name: (
                        <button
                          type="button"
                          className="pgt__link"
                          onClick={() => setSelectedId(s.id)}
                        >
                          {s.name}
                        </button>
                      ),
                      balance: (
                        <span className={`pgt__money${debt > 0 ? ' pgt__money--debt' : ''}`}>
                          {debtLoading ? '…' : formatUmagMoney(debt ?? 0)}
                        </span>
                      ),
                      actions: (
                        <IconActionButton
                          label="Редактировать"
                          variant="primary"
                          onClick={() => openEdit(s)}
                        >
                          <PencilIcon />
                        </IconActionButton>
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
