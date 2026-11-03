import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { usePlatformPageTitle } from '../../../context/PlatformPageTitleContext'
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
  countOverdueOperations,
  describeDue,
  describeOpenDocuments,
  isOverdueOperation,
  matchesOperationQuery,
  operationAmountSign,
} from '../../../utils/supplierHistoryView'
import { toAqtobeDateKey } from '../../../utils/supplierPaymentObligations'
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
  markObligationsPaid,
  markReturnRefunded,
  refreshObligationTermsForSupplier,
  unmarkObligationPaid,
  unmarkReturnRefunded,
} from '../../../services/supplierPaymentObligationsService'
import PlatformAccessDenied from '../../platform/PlatformAccessDenied'
import PlatformFilterTrigger from '../../platform/PlatformFilterTrigger'
import FilterComboField from '../../platform/FilterComboField'
import PlatformFilterRow from '../../platform/PlatformFilterRow'
import PlatformFloatingSearch from '../../platform/PlatformFloatingSearch'
import { PgtFoot, PgtHead, PgtRow, PgtTable } from '../../platform/PlatformGridTable'
import PlatformSyncButton from '../../platform/PlatformSyncButton'
import { DelayedLoadingSkeleton } from '../../loading/LoadingSkeleton'
import AdminModal from '../../admin/AdminModal'
import useMediaQuery from '../../../hooks/useMediaQuery'
import { usePlatformPageRefresh } from '../../../context/PullToRefreshContext'
import { formatDocumentGroupLabel } from '../../../utils/purchaseDocumentsList'
import useInfiniteSlice from '../../../hooks/useInfiniteSlice'
import ConfirmDialog from '../../admin/ConfirmDialog'
import IconActionButton from '../../admin/IconActionButton'
import { FilterIcon, PencilIcon } from '../../icons/PlatformIcons'
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

/** Obligation payload for markObligationPaid, built from a history row. */
function obligationFromOp(op, supplier) {
  return {
    id: op.settlement.obligationId,
    originalSupplyAmount: op.source?.obligation?.original_supply_amount,
    platformSupplierId: supplier.isVirtual ? null : supplier.id,
    supplierName: supplier.isVirtual ? null : supplier.name,
    umagSupplyId: op.source?.umag_supply_id,
  }
}

/** An unpaid supply can be ticked for «Оплатить выбранные» (returns are marked one by one). */
function isBulkPayable(op, canManage) {
  return Boolean(canManage && op.settlement?.type === 'payable' && !op.settlement.settled)
}

/** Header checkbox of the selection column: checked / indeterminate / empty. */
function SelectAllCheckbox({ total, selected, onToggle }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selected > 0 && selected < total
  }, [selected, total])
  return (
    <input
      ref={ref}
      type="checkbox"
      className="umag-settlements__check"
      checked={total > 0 && selected === total}
      onChange={onToggle}
      aria-label="Выбрать все неоплаченные накладные"
    />
  )
}

/** Under the operation name: the document number (or who paid) and, for an open supply, its payment deadline. */
function OperationSubline({ op, todayKey }) {
  const base = operationSubline(op)
  const settlement = op.settlement
  const due =
    settlement && !settlement.settled && settlement.type === 'payable'
      ? describeDue(settlement.dueDate, todayKey)
      : null
  if (!base && !due) return null
  return (
    <span className="umag-settlements__op-sub">
      {base}
      {base && due ? ' · ' : ''}
      {due ? <span className={`umag-settlements__due umag-settlements__due--${due.tone}`}>{due.text}</span> : null}
    </span>
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
    return <span className="umag-settlements__done">✓ Оплачено</span>
  }
  if (canManage) {
    return (
      <button type="button" className="umag-settlements__pay-btn" onClick={() => onOpen(op)}>
        Оплатить
      </button>
    )
  }
  return <span className="umag-settlements__pending">{isPayable ? 'Не оплачено' : 'Ждём оплаты'}</span>
}

/** Second line under the operation name: the document number, or who paid and from which account. */
/** The day an operation belongs to (Aqtobe), for the day headers of the phone history. */
function operationDayKey(op) {
  const date = op?.sortAt ? new Date(op.sortAt) : null
  return date && !Number.isNaN(date.getTime()) ? toAqtobeDateKey(date) : 'none'
}

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
 * Supplier page header, built like a purchase document: the name on the left, the one number that matters
 * («К оплате») on the right, a row of buttons («Закрыть» / «Редактировать») and the details as compact cards
 * (only what is really filled in). On phones the pencil sits next to the name and the cards fold into one.
 */
function SupplierDocHeader({ supplier, canEdit, canViewFinance, debtLoading, onBack, onEdit }) {
  const isPhone = useMediaQuery('(max-width: 640px)')

  const balance = canViewFinance ? (
    <div className="umag-settlements__id-balance">
      <span className="umag-settlements__id-balance-label">К оплате</span>
      <span
        className={`umag-settlements__id-balance-amount${
          supplier.debt > 0 ? '' : ' umag-settlements__id-balance-amount--zero'
        }`}
      >
        {debtLoading ? '…' : formatUmagMoney(supplier.debt ?? 0)}
      </span>
      {!debtLoading && supplier.overdueAmount > 0 ? (
        <span className="umag-settlements__id-balance-overdue">
          из них просрочено {formatUmagMoney(supplier.overdueAmount)}
        </span>
      ) : null}
    </div>
  ) : null

  const archived = !supplier.isVirtual && isSupplierDeleted(supplier)
  const editable = canEdit && !supplier.isVirtual

  const method = supplier.isVirtual ? '' : getPaymentAccountName(supplier.paymentAccountId)
  const hasTerm = supplier.deferralDays != null && supplier.deferralDays !== ''
  const payment = [method, hasTerm ? formatDeferralDaysTerm(supplier.deferralDays) : null].filter(Boolean).join(' · ')
  // normalizeSupplier renders an empty weekday list as «—»; show only what is really filled in.
  const filled = (value) => {
    const text = String(value ?? '').trim()
    return text && text !== '—' ? text : null
  }
  const orderDays = filled(supplier.orderDays)
  const deliveryDays = filled(supplier.deliveryDays)
  const manager = [filled(supplier.managerName), filled(supplier.managerPhone)].filter(Boolean)
  const facts = [
    { key: 'pay', label: 'Оплата', value: payment || 'Не настроено' },
    { key: 'order', label: 'Дни заказа', value: orderDays || 'Не заполнены' },
    { key: 'delivery', label: 'Дни поставки', value: deliveryDays || 'Не заполнены' },
    { key: 'manager', label: 'Менеджер', value: manager.length ? manager.join(' · ') : 'Не указан' },
  ]

  // Phones: this is the «Информация» page of the card (the name and the pencil are in the page header).
  if (isPhone) {
    const rows = supplier.isVirtual
      ? []
      : [
          ...(canViewFinance
            ? [
                { key: 'debt', label: 'К оплате', value: debtLoading ? '…' : formatUmagMoney(supplier.debt ?? 0) },
                ...(!debtLoading && supplier.overdueAmount > 0
                  ? [{ key: 'overdue', label: 'Просрочено', value: formatUmagMoney(supplier.overdueAmount), tone: 'danger' }]
                  : []),
              ]
            : []),
          ...facts,
        ]
    return (
      <div className="sd-info">
        {supplier.isVirtual ? (
          <p className="umag-settlements__id-note">
            Документы UMAG, у которых не выбран поставщик (например, приёмка ещё не оформлена полностью).
            Выберите поставщика в UMAG — после синхронизации документ перейдёт к нему.
          </p>
        ) : (
          <section className="sd-info__card">
            <h3 className="sd-info__title">
              Данные поставщика
              {archived ? <span className="umag-settlements__id-badge">Архив</span> : null}
            </h3>
            {rows.map((row) => (
              <div key={row.key} className="sd-info__row">
                <span>{row.label}</span>
                <b className={row.tone === 'danger' ? 'sd-info__value--danger' : ''}>{row.value}</b>
              </div>
            ))}
          </section>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="sd-head">
        <div className="sd-head__name">
          <h2 className="sd-head__title">{supplier.name}</h2>
          {archived ? <span className="umag-settlements__id-badge">Архив</span> : null}
        </div>
        {balance}
      </div>

      {true ? (
        <div className="sd-bar">
          <button type="button" className="btn btn--outline" onClick={onBack}>
            Закрыть
          </button>
          <span className="sd-bar__spacer" />
          {editable ? (
            <button type="button" className="btn btn--outline" onClick={onEdit}>
              Редактировать
            </button>
          ) : null}
        </div>
      ) : null}

      {supplier.isVirtual ? (
        <p className="umag-settlements__id-note">
          Документы UMAG, у которых не выбран поставщик (например, приёмка ещё не оформлена полностью).
          Выберите поставщика в UMAG — после синхронизации документ перейдёт к нему. Оплатить такой
          документ можно и здесь.
        </p>
      ) : (
        <div className="sd-cards">
          {facts.map((fact) => (
            <div key={fact.key} className="sd-card">
              <span className="sd-card__label">{fact.label}</span>
              <span className="sd-card__value">{fact.value}</span>
            </div>
          ))}
        </div>
      )}
    </>
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
  const isPhoneList = useMediaQuery('(max-width: 640px)')
  const defaultPeriod = useMemo(() => getSettlementsPeriodDefaults(), [])
  const [dateFrom, setDateFrom] = useState(defaultPeriod.dateFrom)
  const [dateTo, setDateTo] = useState(defaultPeriod.dateTo)
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftFilter, setDraftFilter] = useState(defaultPeriod)
  const filterButtonRef = useRef(null)
  // Phones: the card has two pages like UMAG's customer card — «Платежи» (first) and «Информация».
  const [phoneTab, setPhoneTab] = useState('pay')
  const swipeRef = useRef(null)

  const periodLabel = useMemo(() => describeSettlementsPeriod(dateFrom, dateTo), [dateFrom, dateTo])
  const filterActive = isSettlementsFilterActive(dateFrom, dateTo)

  // Warms the payment-accounts cache so SupplierDocHeader's «Способ
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

  // Swipe-to-refresh on the supplier card: only this supplier's operations (quietly, the list stays on screen).
  usePlatformPageRefresh(async () => {
    if (!canViewFinance) return
    const result = await fetchUmagSupplierOperationHistory({
      platformSupplierId: supplier.isVirtual ? null : supplier.id,
      umagSupplierId: supplier.umagSupplierId,
      unassigned: Boolean(supplier.isVirtual),
      dateFrom,
      dateTo,
    })
    if (result.error) setDetailError(result.error)
    else setDetailError('')
    setDetail(result)
  })

  const operations = useMemo(() => detail?.operations || [], [detail])
  const [opsFilter, setOpsFilter] = useState('open')
  const [opsFilterTouched, setOpsFilterTouched] = useState(false)
  const [opsQuery, setOpsQuery] = useState('')
  const [draftOpsFilter, setDraftOpsFilter] = useState('open')
  const [selectedOperation, setSelectedOperation] = useState(null)
  const openCount = useMemo(() => countOpenOperations(operations), [operations])
  const todayKey = useMemo(() => toAqtobeDateKey(), [])
  const overdueCount = useMemo(() => countOverdueOperations(operations, todayKey), [operations, todayKey])

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
    const base = searching
      ? operations
      : opsFilter === 'overdue'
        ? operations.filter((op) => isOverdueOperation(op, todayKey))
        : filterSupplierOperations(operations, opsFilter)
    return base.filter((op) => matchesOperationQuery(op, opsQuery))
  }, [operations, opsFilter, opsQuery, searching, todayKey])

  // Phones: the first 25 operations, 25 more as you scroll to the end (UMAG's behaviour).
  const opsInfinite = useInfiniteSlice(visibleOps, {
    enabled: isPhoneList,
    resetKey: `${supplier.id}|${opsFilter}|${opsQuery}|${dateFrom}|${dateTo}`,
  })

  // ---- «Оплатить выбранные»: tick unpaid supplies, pay them with one account in one go ----
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkAccountId, setBulkAccountId] = useState('')
  const [bulkAccountTouched, setBulkAccountTouched] = useState(false)
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(null)
  const selectableOps = useMemo(
    () => visibleOps.filter((op) => isBulkPayable(op, canManagePayments)),
    [visibleOps, canManagePayments]
  )
  // Only what is on screen counts: a ticked document hidden by another filter is neither shown in the total nor paid.
  const selectedOps = useMemo(
    () => selectableOps.filter((op) => selectedIds.has(op.id)),
    [selectableOps, selectedIds]
  )
  const selectedTotal = selectedOps.reduce((sum, op) => sum + (Number(op.amount) || 0), 0)

  useEffect(() => {
    if (bulkAccountTouched) return
    const preferred = supplier.isVirtual ? null : supplier.paymentAccountId
    setBulkAccountId(preferred && paymentAccounts.some((account) => account.id === preferred) ? preferred : '')
  }, [paymentAccounts, supplier.isVirtual, supplier.paymentAccountId, bulkAccountTouched])

  function toggleSelected(id) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      const next = new Set(current)
      const allOn = selectableOps.length > 0 && selectableOps.every((op) => next.has(op.id))
      for (const op of selectableOps) {
        if (allOn) next.delete(op.id)
        else next.add(op.id)
      }
      return next
    })
  }

  const historyColumns = useMemo(
    () =>
      selectableOps.length > 0
        ? [
            {
              key: 'select',
              label: (
                <SelectAllCheckbox
                  total={selectableOps.length}
                  selected={selectedOps.length}
                  onToggle={toggleSelectAll}
                />
              ),
              width: 40,
              mobile: 'hide',
            },
            ...HISTORY_COLUMNS,
          ]
        : HISTORY_COLUMNS,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectableOps, selectedOps.length]
  )

  async function handleBulkPay() {
    const accountId = bulkAccountId || null
    const ops = selectedOps
    setBulkProgress({ done: 0, total: ops.length })
    try {
      const { paid, failed } = await markObligationsPaid(
        ops.map((op) => obligationFromOp(op, supplier)),
        {
          paidByEmployeeId: user?.id ?? null,
          accountId,
          employeeName: user?.name ?? null,
          accountName: getPaymentAccountName(accountId),
        },
        { onProgress: (done, total) => setBulkProgress({ done, total }) }
      )
      const paidOpIds = new Set(
        ops.filter((op) => paid.includes(op.settlement.obligationId)).map((op) => op.id)
      )
      setSelectedIds((current) => new Set([...current].filter((id) => !paidOpIds.has(id))))
      if (failed.length === 0) {
        showSuccess?.(`Оплачено: ${paid.length} ${paid.length === 1 ? 'накладная' : 'накладных'}`)
      } else {
        showError?.(
          `Оплачено ${paid.length} из ${ops.length}. Не удалось отметить ${failed.length}: ${failed[0].message}. Они остались выбранными.`
        )
      }
      setReloadToken((token) => token + 1)
      onSyncComplete?.()
    } finally {
      setBulkProgress(null)
      setBulkConfirmOpen(false)
    }
  }

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
        await markObligationPaid(
          obligationFromOp(op, supplier),
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
    setDraftOpsFilter(opsFilter)
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
    // Phones: the type of operations is chosen in the same sheet.
    if (isPhoneList) {
      setOpsQuery('')
      if (draftOpsFilter !== opsFilter) chooseOpsFilter(draftOpsFilter)
    }
    setFilterOpen(false)
  }

  function resetFilter() {
    const defaults = getSettlementsPeriodDefaults()
    setDraftFilter(defaults)
    setDateFrom(defaults.dateFrom)
    setDateTo(defaults.dateTo)
    if (isPhoneList) {
      // Back to what the card opens on: what needs a click, or everything when nothing is open.
      setOpsFilterTouched(false)
      setOpsFilter(openCount > 0 ? 'open' : 'all')
    }
    setFilterOpen(false)
  }

  const opsFilterOptions = [
    { id: 'open', label: 'Не закрытые', count: openCount },
    ...(overdueCount > 0 ? [{ id: 'overdue', label: 'Просрочено', count: overdueCount, tone: 'danger' }] : []),
    { id: 'all', label: 'Все' },
    { id: 'supplies', label: 'Приёмки' },
    { id: 'payments', label: 'Оплаты' },
    { id: 'returns', label: 'Возвраты' },
  ]

  const opsFilterChanged = opsFilterTouched && opsFilter !== (openCount > 0 ? 'open' : 'all')
  const filterCount = (filterActive ? 1 : 0) + (opsFilterChanged ? 1 : 0)
  const openFilterRef = useRef(null)
  openFilterRef.current = openFilter
  const editRef = useRef(null)
  editRef.current = onEdit
  const canEditHere = Boolean(canEditSupplier && !supplier.isVirtual)
  const showFilterIcon = isPhoneList && canViewFinance && phoneTab === 'pay'
  const phoneActions = useMemo(
    () =>
      isPhoneList ? (
        <>
          {showFilterIcon ? (
            <button
              type="button"
              ref={filterButtonRef}
              className="platform-mobile-header__icon-btn umag-settlements__header-edit umag-settlements__header-filter"
              aria-label="Фильтры"
              aria-haspopup="dialog"
              onClick={() => openFilterRef.current?.()}
            >
              <FilterIcon size={20} />
              {filterCount > 0 ? <span className="umag-settlements__header-badge">{filterCount}</span> : null}
            </button>
          ) : null}
          {canEditHere ? (
            <button
              type="button"
              className="platform-mobile-header__icon-btn umag-settlements__header-edit"
              aria-label="Редактировать поставщика"
              onClick={() => editRef.current?.()}
            >
              <PencilIcon size={20} />
            </button>
          ) : null}
        </>
      ) : null,
    [isPhoneList, showFilterIcon, filterCount, canEditHere]
  )
  // Phones: the supplier's name is the page title (the page above passes an empty title for a card).
  usePlatformPageTitle(isPhoneList ? supplier.name : '', '', {
    showBack: true,
    backFallback: '/platform/supplier-finance',
    actions: phoneActions,
  })
  const filterTrigger = isPhoneList ? null : (
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
    >
      {isPhoneList ? (
        <div className="period-filter-popover__section period-filter-popover__section--phone">
          <span className="period-filter-popover__label">Показать</span>
          <div className="period-filter-popover__presets period-filter-popover__presets--wrap" role="group" aria-label="Тип операций">
            {opsFilterOptions.map((option) => {
              const active = draftOpsFilter === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  className={`period-filter-popover__preset${active ? ' period-filter-popover__preset--active' : ''}`}
                  onClick={() => setDraftOpsFilter(option.id)}
                >
                  {option.label}
                  {option.count ? <span className="sfp-chip-count">{option.count}</span> : null}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </PeriodFilterPopover>
  )

  return (
    <div className="umag-settlements umag-settlements--detail">
      {canViewFinance && filterSlot && !isPhoneList
        ? createPortal(
            <div className="pf-filter-anchor">
              {filterTrigger}
              {filterPopover}
            </div>,
            filterSlot
          )
        : null}

      {isPhoneList && canViewFinance ? filterPopover : null}

      {isPhoneList ? (
        <div className="sd-tabs" role="tablist" aria-label="Разделы карточки поставщика">
          {[
            { id: 'pay', label: 'Платежи' },
            { id: 'info', label: 'Информация' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={phoneTab === tab.id}
              className={`sd-tabs__tab${phoneTab === tab.id ? ' is-active' : ''}`}
              onClick={() => setPhoneTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className="sd-pages"
        onTouchStart={(event) => {
          const t = event.touches[0]
          swipeRef.current = isPhoneList ? { x: t.clientX, y: t.clientY } : null
        }}
        onTouchEnd={(event) => {
          const start = swipeRef.current
          swipeRef.current = null
          if (!start) return
          const t = event.changedTouches[0]
          const dx = t.clientX - start.x
          const dy = t.clientY - start.y
          if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
          setPhoneTab(dx < 0 ? 'info' : 'pay')
        }}
      >
      {isPhoneList && phoneTab === 'pay' ? null : <SupplierDocHeader
        supplier={supplier}
        canEdit={canEditSupplier}
        canViewFinance={canViewFinance}
        debtLoading={debtLoading}
        onBack={onBack}
        onEdit={onEdit}
      />}

      {canViewFinance && !(isPhoneList && phoneTab === 'info') ? (
        <>
          <section className="umag-settlements__ops" aria-label="История операций">
            {isPhoneList ? null : (
              <>
            <h3 className="umag-settlements__section-title">
              История операций<span className="umag-settlements__period">{periodLabel}</span>
            </h3>

            <div className="umag-settlements__ops-controls">
              <div className="umag-settlements__ops-filters" role="tablist" aria-label="Фильтр операций">
                {opsFilterOptions.map((opt) => (
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
                    {opt.count ? (
                      <span
                        className={`umag-settlements__ops-filter-count${
                          opt.tone === 'danger' ? ' umag-settlements__ops-filter-count--danger' : ''
                        }`}
                      >
                        {opt.count}
                      </span>
                    ) : null}
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
              </>
            )}

            {isPhoneList && !detailLoading ? (
              <PlatformFloatingSearch
                value={opsQuery}
                onChange={setOpsQuery}
                placeholder="Номер или сумма"
                label="Поиск по документам"
                total={formatUmagMoney(supplier.debt ?? 0)}
              />
            ) : null}

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
                    : opsFilter === 'overdue'
                      ? 'Просроченных документов нет'
                      : 'За выбранный период операций UMAG не найдено'}
                {!searching && (opsFilter === 'open' || opsFilter === 'overdue') ? (
                  <button type="button" className="umag-settlements__empty-action" onClick={() => chooseOpsFilter('all')}>
                    Показать все
                  </button>
                ) : null}
              </div>
            ) : (
              isPhoneList ? (
                <div className="sd-ops">
                  {opsInfinite.visible.map((op) => {
                    const sign = operationAmountSign(op)
                    const title =
                      op.kind === 'payment' || op.kind === 'refund' || !op.documentNumber
                        ? op.label
                        : `${op.label} № ${op.documentNumber}`
                    const settlement = op.settlement
                    const due =
                      settlement && !settlement.settled && settlement.type === 'payable'
                        ? describeDue(settlement.dueDate, todayKey)
                        : null
                    const note = op.kind === 'payment' ? operationSubline(op) : ''
                    return (
                      <button key={op.id} type="button" className="sd-op" onClick={() => setSelectedOperation(op)}>
                        <span className="sd-op__l1">
                          <b>{title}</b>
                          <span className="sd-op__money">
                            {sign}
                            {formatUmagMoney(op.amount)}
                          </span>
                        </span>
                        <span className="sd-op__l2">
                          <span>{formatUmagDate(op.sortAt)}</span>
                          {note ? <span>{note}</span> : null}
                          {due ? (
                            due.tone === 'overdue' ? (
                              <span className="sd-pill sd-pill--overdue">
                                {due.text.charAt(0).toUpperCase() + due.text.slice(1)}
                              </span>
                            ) : (
                              <span className={`sd-due sd-due--${due.tone}`}>{due.text}</span>
                            )
                          ) : null}
                        </span>
                      </button>
                    )
                  })}
                  {opsInfinite.hasMore ? <div ref={opsInfinite.sentinelRef} className="pgt__more" aria-hidden="true" /> : null}
                </div>
              ) : (
              <PgtTable columns={historyColumns}>
                <PgtHead columns={historyColumns} />
                {visibleOps.map((op) => {
                  const sign = operationAmountSign(op)
                  const sub = operationSubline(op)
                  const statusNode = (
                    <OperationStatusCell op={op} canManage={canManagePayments} onOpen={setSelectedOperation} />
                  )
                  const selectable = isBulkPayable(op, canManagePayments)
                  const tick = selectable ? (
                    <input
                      type="checkbox"
                      className="umag-settlements__check"
                      checked={selectedIds.has(op.id)}
                      onChange={() => toggleSelected(op.id)}
                      aria-label={`Выбрать накладную № ${op.documentNumber}`}
                    />
                  ) : null
                  return (
                    <PgtRow
                      key={op.id}
                      columns={historyColumns}
                      className={selectable && selectedIds.has(op.id) ? 'umag-settlements__row--selected' : ''}
                      cells={{
                        select: tick,
                        date: <span className="umag-settlements__date">{formatUmagDate(op.sortAt)}</span>,
                        op: (
                          <span className="umag-settlements__op-wrap">
                            {tick ? <span className="umag-settlements__op-select">{tick}</span> : null}
                            <span className="umag-settlements__op">
                              <button
                                type="button"
                                className="umag-settlements__op-link"
                                onClick={() => setSelectedOperation(op)}
                              >
                                {op.label}
                              </button>
                              <OperationSubline op={op} todayKey={todayKey} />
                            </span>
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
              )
            )}

            {selectedOps.length > 0 ? (
              <div className="umag-settlements__bulk" role="region" aria-label="Оплата выбранных накладных">
                <div className="umag-settlements__bulk-sum">
                  <strong>
                    Выбрано {selectedOps.length}
                  </strong>
                  <span>{formatUmagMoney(selectedTotal)}</span>
                </div>
                <select
                  className="umag-settlements__bulk-account"
                  value={bulkAccountId}
                  onChange={(event) => {
                    setBulkAccountTouched(true)
                    setBulkAccountId(event.target.value)
                  }}
                  aria-label="Счёт оплаты"
                  disabled={bulkProgress != null}
                >
                  <option value="">Без счёта</option>
                  {paymentAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={bulkProgress != null}
                >
                  Сбросить
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setBulkConfirmOpen(true)}
                  disabled={bulkProgress != null}
                >
                  Оплатить выбранные
                </button>
              </div>
            ) : null}

            {bulkConfirmOpen ? (
              <ConfirmDialog
                title="Оплатить выбранные накладные?"
                message={`Будет отмечено оплаченными: ${selectedOps.length} ${
                  selectedOps.length === 1 ? 'накладная' : 'накладных'
                } на сумму ${formatUmagMoney(selectedTotal)}. Счёт: ${
                  bulkAccountId ? getPaymentAccountName(bulkAccountId) || 'выбранный' : 'без счёта'
                }. Каждую оплату можно отменить в окне документа.${
                  bulkProgress ? ` Оплачено ${bulkProgress.done} из ${bulkProgress.total}…` : ''
                }`}
                confirmLabel="Оплатить"
                confirmVariant="primary"
                onCancel={() => (bulkProgress ? null : setBulkConfirmOpen(false))}
                onConfirm={handleBulkPay}
                loading={bulkProgress != null}
              />
            ) : null}
          </section>
        </>
      ) : null}
      </div>

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
  viewDraft = 'all',
  onViewChange,
  viewOptions = [],
}) {
  const popoverRef = useRef(null)
  const isPhone = useMediaQuery('(max-width: 900px)')
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!open || isPhone) return undefined
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
  }, [open, isPhone, onClose, anchorRef])

  useEffect(() => {
    if (!open) setExpanded(false)
  }, [open])

  if (!open) return null

  const actions = (
    <>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onReset}>
        Сбросить
      </button>
      <button type="button" className="btn btn--primary btn--sm" onClick={onApply}>
        Применить
      </button>
    </>
  )

  const fields = (
    <>
      <FilterComboField
        label="Поставщик"
        searchable
        placeholder={isPhone ? 'Поставщик' : 'Введите название'}
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
    </>
  )

  // Phones: the same bottom sheet as every other filter («Фильтры» + «Очистить», one «Применить»); the
  // «С долгом / Просрочено / Все» choice moved here from the top bar.
  if (isPhone) {
    return (
      <AdminModal
        sheet
        title="Фильтры"
        onClose={onClose}
        returnFocusRef={anchorRef}
        headerAction={
          <button type="button" className="period-sheet__clear" onClick={onReset}>
            Очистить
          </button>
        }
        footer={
          <button type="button" className="btn btn--primary period-sheet__apply" onClick={onApply}>
            Применить
          </button>
        }
      >
        <div className="period-sheet">
          {viewOptions.length ? (
            <div className="period-filter-popover__section period-filter-popover__section--phone">
              <span className="period-filter-popover__label">Показать</span>
              <div className="period-filter-popover__presets" role="group" aria-label="Какие поставщики показывать">
                {viewOptions.map((option) => {
                  const active = viewDraft === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      className={`period-filter-popover__preset${active ? ' period-filter-popover__preset--active' : ''}`}
                      onClick={() => onViewChange?.(option.id)}
                    >
                      {option.label}
                      {option.count ? <span className="sfp-chip-count">{option.count}</span> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
          {fields}
        </div>
      </AdminModal>
    )
  }

  return (
    <div ref={popoverRef} className="spo-filter-pop" role="dialog" aria-label="Фильтр">
      {fields}
      <div className="spo-filter-pop__actions">{actions}</div>
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
  toolsSlot = null,
  headerActions = null,
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
  // The open supplier lives in the address (/platform/supplier-finance/:supplierId), not in component state.
  const { supplierId: routeSupplierId } = useParams()
  const selectedId = routeSupplierId || null
  const setSelectedId = useCallback(
    (id) => navigate(id ? `/platform/supplier-finance/${encodeURIComponent(id)}` : '/platform/supplier-finance'),
    [navigate]
  )
  const [debtSummary, setDebtSummary] = useState(new Map())
  const debtByPlatformId = useMemo(
    () => new Map([...debtSummary].map(([id, entry]) => [id, entry.amount])),
    [debtSummary]
  )
  const [listQuery, setListQuery] = useState('')
  // Phones open on the whole list (the debt / overdue choice lives in the filter sheet); the web keeps «С долгом».
  const isPhoneMain = useMediaQuery('(max-width: 640px)')
  const defaultListView = isPhoneMain ? 'all' : 'debt'
  const [listView, setListView] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches ? 'all' : 'debt'
  )
  const [draftListView, setDraftListView] = useState('all')
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
  const overdueSuppliersCount = useMemo(
    () => baseList.filter((s) => (debtSummary.get(s.id)?.overdueCount || 0) > 0).length,
    [baseList, debtSummary]
  )
  // A search looks at every supplier, with or without debt; otherwise «С долгом» hides the zero-balance tail.
  const filteredUnsorted = useMemo(() => {
    const q = listQuery.trim().toLowerCase()
    return baseList.filter((s) => {
      if (q) {
        return `${s.name || ''} ${s.legalName || ''}`.toLowerCase().includes(q)
      }
      if (listView === 'overdue') return (debtSummary.get(s.id)?.overdueCount || 0) > 0
      return listView === 'all' || (debtByPlatformId.get(s.id) || 0) !== 0
    })
  }, [baseList, listQuery, listView, debtByPlatformId, debtSummary])
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
  // Phones: the first 25 suppliers, 25 more as you scroll to the end.
  const listInfinite = useInfiniteSlice(filtered, {
    enabled: isPhoneMain,
    resetKey: `${listQuery}|${listView}`,
  })
  const selected =
    selectedId === UNASSIGNED_SUPPLIER_ID
      ? unassignedSupplier
      : selectedId
        ? allSuppliers.find((s) => s.id === selectedId) || null
        : null

  // Page header: the list has the sync icon; a supplier's card is titled with the supplier's name (phones) and carries the pencil.
  usePlatformPageTitle(
    selectedId && isPhoneMain && selected ? '' : 'Расчёты',
    '',
    selectedId
      ? { showBack: true, backFallback: '/platform/supplier-finance' }
      : { actions: headerActions }
  )
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

  // Swipe-to-refresh on the list: only the balances and the time of the last UMAG sync (suppliers change via the sync button).
  usePlatformPageRefresh(async () => {
    if (!canViewFinance) return
    await Promise.allSettled([
      fetchNativeSupplierDebtSummary({ includeUnassigned: true }).then(setDebtSummary),
      fetchLastUmagSyncRun().then(setLastRun),
    ])
  })

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
            className="btn btn--danger suppliers-modal-footer__status-action"
            disabled={saving || deleting}
            onClick={requestDelete}
          >
            Удалить
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
    setDraftListView(listView)
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
    if (isPhoneMain) {
      setListQuery('')
      setListView(draftListView)
    }
    setFilterOpen(false)
  }

  function resetListFilter() {
    setDraftShowArchived(SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED)
    setAppliedShowArchived(SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED)
    setSupplierFilterDraft(new Set())
    setSupplierFilter(new Set())
    setFilterSearch('')
    if (isPhoneMain) {
      setListView(defaultListView)
      setDraftListView(defaultListView)
    }
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
    ...(canEdit ? [{ key: 'edit', label: '', width: 44, align: 'end', mobile: 'hide' }] : []),
  ]

  const emptyMessage = (() => {
    if (supplierFilter.size > 0) return 'По вашему запросу ничего не найдено.'
    if (appliedShowArchived) return 'Удалённых поставщиков нет.'
    if (searchingList) return 'Поставщик не найден.'
    if (listView === 'overdue') return 'Просроченных оплат нет.'
    if (listView === 'debt' && allSuppliers.length > 0) return 'Долгов нет — всё оплачено.'
    return allSuppliers.length === 0
      ? 'Поставщики ещё не синхронизированы. Выполните синхронизацию с UMAG.'
      : 'По вашему запросу ничего не найдено.'
  })()

  const listFilterTrigger = isPhoneMain ? (
    <PlatformFilterRow
      ref={filterButtonRef}
      count={supplierFilter.size + (appliedShowArchived ? 1 : 0) + (listView !== defaultListView ? 1 : 0)}
      open={filterOpen}
      onClick={toggleFilter}
      hint="Показать, Поставщик, Удалённые"
    />
  ) : (
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
      viewDraft={draftListView}
      onViewChange={setDraftListView}
      viewOptions={[
        { id: 'debt', label: 'С долгом', count: withDebtCount },
        ...(overdueSuppliersCount > 0
          ? [{ id: 'overdue', label: 'Просрочено', count: overdueSuppliersCount }]
          : []),
        { id: 'all', label: 'Все', count: 0 },
      ]}
    />
  )

  // Phones: no chips and no search box in the top bar — the chips are in the filter sheet, the search floats at the bottom.
  const listTools =
    suppliersReady && debtsSettled && !isPhoneMain ? (
            <div className="umag-settlements__list-tools">
        <div className="umag-settlements__ops-filters" role="tablist" aria-label="Какие поставщики показывать">
                {[
                  { id: 'debt', label: 'С долгом', count: withDebtCount },
                  ...(overdueSuppliersCount > 0
                    ? [{ id: 'overdue', label: 'Просрочено', count: overdueSuppliersCount, tone: 'danger' }]
                    : []),
                  { id: 'all', label: 'Все', count: 0 },
                ].map((opt) => {
                  const active = !searchingList && opt.id === listView
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`umag-settlements__ops-filter${active ? ' umag-settlements__ops-filter--active' : ''}`}
                      onClick={() => {
                        setListQuery('')
                        setListView(opt.id)
                      }}
                    >
                      {opt.label}
                      {opt.count ? (
                        <span
                          className={`umag-settlements__ops-filter-count${
                            opt.tone === 'danger' ? ' umag-settlements__ops-filter-count--danger' : ''
                          }`}
                        >
                          {opt.count}
                        </span>
                      ) : null}
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
    ) : null

  // A supplier address opened directly (reload / link): wait for the list instead of flashing the list page.
  const waitingForSupplier = Boolean(selectedId) && !selected && (!suppliersReady || !debtsSettled)

  return (
    <>
      {waitingForSupplier ? <DelayedLoadingSkeleton variant="table" count={5} /> : null}
      {waitingForSupplier ? null : selected ? (
        <UmagSupplierDetail
          supplier={{
            ...selected,
            debt: debtByPlatformId.get(selected.id) ?? null,
            overdueAmount: debtSummary.get(selected.id)?.overdueAmount ?? 0,
          }}
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

          {toolsSlot && listTools ? createPortal(listTools, toolsSlot) : listTools}

          {isPhoneMain && suppliersReady && debtsSettled ? (
            <PlatformFloatingSearch
              value={listQuery}
              onChange={setListQuery}
              placeholder="Поиск по поставщику"
              label="Поиск поставщика"
              total={canViewFinance ? (debtLoading ? '…' : formatUmagMoney(totalDebt)) : null}
            />
          ) : null}

          {(!suppliersReady && filtered.length === 0) || !debtsSettled ? (
            <DelayedLoadingSkeleton variant="table" count={5} />
          ) : filtered.length === 0 ? (
            <div className="pgt__empty">{emptyMessage}</div>
          ) : (
            <PgtTable columns={listColumns}>
              <PgtHead columns={listColumns} />
              {listInfinite.visible.map((s) => {
                const debt = debtByPlatformId.get(s.id) ?? null
                const entry = debtSummary.get(s.id)
                // Phones: only the number of unpaid documents (no «since» date, no overdue count).
                const meta = isPhoneMain
                  ? describeOpenDocuments({ count: entry?.count || 0 })
                  : describeOpenDocuments(entry)
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
                          {meta ? (
                            <span className="umag-settlements__supplier-meta">
                              {meta}
                              {entry?.overdueCount && !isPhoneMain ? (
                                <>
                                  {' · '}
                                  <span className="umag-settlements__due umag-settlements__due--overdue">
                                    просрочено {entry.overdueCount}
                                  </span>
                                </>
                              ) : null}
                            </span>
                          ) : null}
                        </span>
                      ),
                      balance: (
                        <span className={`pgt__money${debt > 0 ? '' : ' umag-settlements__zero'}`}>
                          {debtLoading ? '…' : formatUmagMoney(debt ?? 0)}
                        </span>
                      ),
                      // The virtual «Поставщик не выбран» row has no supplier record to edit.
                      edit:
                        canEdit && s.id !== UNASSIGNED_SUPPLIER_ID ? (
                          <IconActionButton
                            variant="edit"
                            label="Редактировать поставщика"
                            onClick={() => openEdit(s)}
                          >
                            <PencilIcon size={16} />
                          </IconActionButton>
                        ) : null,
                    }}
                  />
                )
              })}
              {listInfinite.hasMore ? <div ref={listInfinite.sentinelRef} className="pgt__more" aria-hidden="true" /> : null}
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
          sheet
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
