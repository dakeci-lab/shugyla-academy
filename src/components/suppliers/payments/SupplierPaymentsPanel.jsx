import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import {
  canEditSuppliers,
  canManageSupplierPayments,
  canSyncUmagSettlements,
  canViewSupplierPayments,
} from '../../../config/permissions'
import {
  OBLIGATION_STATUS,
  OBLIGATION_STATUS_LABELS,
  buildPaymentScheduleByReceivedDate,
  diffCalendarDays,
  formatDaysUntilDue,
  formatPaymentAccountSnapshot,
  formatPaymentTermsDaysSnapshot,
  formatPlatformPaymentMark,
  formatReceivedDateGroupLabel,
  formatReceptionCount,
  formatSyncCoverage,
  isPlatformMarkedPaid,
  pickDefaultPaymentTab,
  resolveOwedAmount,
} from '../../../utils/supplierPaymentObligations'
import {
  buildPaymentScheduleView,
  formatUmagDate,
  formatUmagDateTime,
  formatUmagMoney,
  listPaymentObligations,
  markObligationPaid,
  syncUmagForPayments,
  toAqtobeDateKey,
  unmarkObligationPaid,
} from '../../../services/supplierPaymentObligationsService'
import { fetchSupplierFinanceSummary } from '../../../services/supplierFinanceSummaryService'
import { getMonthPeriodKeys } from '../../../services/umagSettlementsService'
import {
  ensurePaymentAccountsLoaded,
  getPaymentAccountName,
  getPaymentAccountsCacheSync,
} from '../../../services/paymentAccountsService'
import PlatformAccessDenied from '../../platform/PlatformAccessDenied'
import PlatformFilterTrigger from '../../platform/PlatformFilterTrigger'
import PlatformSyncButton from '../../platform/PlatformSyncButton'
import { ChevronDownIcon, FilterIcon } from '../../icons/PlatformIcons'
import { DelayedLoadingSkeleton } from '../../loading/LoadingSkeleton'
import FilterComboField from '../../platform/FilterComboField'
import { PgtFoot, PgtHead, PgtRow, PgtSubtotal, PgtTable } from '../../platform/PlatformGridTable'
import './SupplierPaymentsPanel.css'

const TABS = [
  { id: 'overdue', label: 'Просрочено', empty: 'Просроченных оплат нет' },
  { id: 'today', label: 'Сегодня', empty: 'На сегодня оплат нет' },
  { id: 'upcoming', label: 'Предстоящие', empty: 'Предстоящих обязательств нет' },
  {
    id: 'termsMissing',
    label: 'Без срока',
    empty: 'У всех обязательств настроен срок оплаты',
  },
]

/**
 * Этап 2.8: vertical groups for embedded «К оплате» — presentation only.
 * «Без срока» is deliberately not one of these: it's a setup gap (supplier has
 * no payment terms configured), not a point on the urgency timeline.
 */
const COMPACT_SECTIONS = [
  { id: 'overdue', label: 'Просрочено', summaryKey: 'overdue' },
  { id: 'today', label: 'Сегодня', summaryKey: 'dueToday' },
  { id: 'upcoming', label: 'Предстоящие', summaryKey: 'deferredNotYetDue' },
]

/** Fixed layout — the user-configurable column gear was removed on purpose. */
const PAYMENTS_COLUMNS = [
  { key: 'receivedAt', label: 'Дата приёмки', width: 130, mobile: 'hide' },
  { key: 'supplier', label: 'Поставщик', width: 260, flex: true, mobile: 'title' },
  { key: 'status', label: 'Статус', width: 120, mobile: 'hide' },
  { key: 'dueDate', label: 'Срок', width: 96, mobile: 'hide' },
  { key: 'amount', label: 'Сумма', width: 130, align: 'end', mobile: 'end' },
]

function formatCompactDueDate(dateKey) {
  if (!dateKey) return '—'
  const parts = String(dateKey).split('-')
  if (parts.length !== 3) return '—'
  return `${parts[2]}.${parts[1]}`
}

/** Compact status label — uses group.status from buildPaymentScheduleView, not re-derived. */
function formatCompactStatusText(group, todayKey) {
  switch (group.status) {
    case OBLIGATION_STATUS.TERMS_MISSING:
      return 'Без срока'
    case OBLIGATION_STATUS.DUE_TODAY:
      return 'Сегодня'
    case OBLIGATION_STATUS.OVERDUE: {
      const days = Math.abs(diffCalendarDays(todayKey, group.dueDate))
      return `${days} дн.`
    }
    case OBLIGATION_STATUS.UPCOMING: {
      const days = diffCalendarDays(todayKey, group.dueDate)
      if (days === 1) return 'через 1 дн.'
      return `через ${days} дн.`
    }
    default:
      return '—'
  }
}

/** Reception date — a compact row can aggregate several receipts sharing one
 * due date (see the «N приёмок» sheet), so an exact date only makes sense
 * for a single-obligation group; otherwise fall back to the same count
 * label already used elsewhere (formatReceptionCount). */
function formatReceivedAt(group) {
  if (!group.count) return '—'
  if (group.count > 1) return formatReceptionCount(group.count)
  const ob = group.obligations?.[0]
  const raw = ob?.sourceDocTime || (ob?.supplyDocumentDate ? `${ob.supplyDocumentDate}T12:00:00+05:00` : null)
  return raw ? formatUmagDate(raw) : '—'
}

function renderPaymentsCells(group, todayKey) {
  const tone = statusTone(group.status)
  return {
    supplier: <span className="pgt__title">{group.name || 'Без названия'}</span>,
    receivedAt: <span className="spo-compact__received">{formatReceivedAt(group)}</span>,
    status: (
      <span className={`spo-compact__status spo-compact__status--${tone}`}>
        {formatCompactStatusText(group, todayKey)}
      </span>
    ),
    dueDate: <span className="spo-compact__due">{formatCompactDueDate(group.dueDate)}</span>,
    amount: <span className="pgt__money">{formatUmagMoney(group.amount)}</span>,
  }
}

function CompactObligationRow({ group, todayKey, canEditTerms, onOpen, onConfigure }) {
  const tone = statusTone(group.status)
  const isMissing = group.status === OBLIGATION_STATUS.TERMS_MISSING
  const mapped = Boolean(group.platformSupplierId)

  return (
    <PgtRow
      columns={PAYMENTS_COLUMNS}
      cells={renderPaymentsCells(group, todayKey)}
      className={`spo-compact__row--${tone}`}
      onClick={() => onOpen(group)}
      mobileMeta={`${formatCompactDueDate(group.dueDate)} · ${formatCompactStatusText(group, todayKey)}`}
      extra={
        isMissing && canEditTerms && mapped ? (
          <button
            type="button"
            className="spo-compact__configure"
            onClick={(e) => {
              e.stopPropagation()
              onConfigure(group)
            }}
          >
            Настроить отсрочку
          </button>
        ) : null
      }
    />
  )
}

/**
 * «К оплате» ordered by дата приёмки (newest first, UMAG-style), replacing
 * the urgency-section layout — see owner's reference screenshots of UMAG's
 * «Список приёмок». Built on the shared PlatformGridTable like «Поставщики».
 */
function ReceivedDatePaymentSchedule({
  view,
  todayKey,
  loading,
  error,
  supplierFilter,
  accountFilter,
  canEditTerms,
  onOpen,
  onConfigure,
}) {
  if (loading && !view) {
    return <DelayedLoadingSkeleton variant="cards" count={4} />
  }
  if (error && !view) {
    return (
      <div className="spo-panel__error" role="alert">
        {error}
      </div>
    )
  }

  const supplierFilterActive = supplierFilter.size > 0
  const accountFilterActive = accountFilter.size > 0
  const filterActive = supplierFilterActive || accountFilterActive

  function matchesFilters(row) {
    if (supplierFilterActive && !supplierFilter.has(row.name || 'Без названия')) return false
    if (accountFilterActive) {
      const key = accountFilterKey(row.obligations?.[0]?.supplierPaymentAccountId ?? null)
      if (!accountFilter.has(key)) return false
    }
    return true
  }

  const dateGroups = (view?.dateGroups || [])
    .map((group) => ({
      ...group,
      rows: filterActive ? group.rows.filter(matchesFilters) : group.rows,
    }))
    .filter((group) => group.rows.length > 0)

  const noDateRows = filterActive
    ? (view?.noDateRows || []).filter(matchesFilters)
    : view?.noDateRows || []

  const grandTotal =
    dateGroups.reduce(
      (sum, group) =>
        sum + (filterActive ? group.rows.reduce((s, row) => s + row.amount, 0) : group.total),
      0
    ) + noDateRows.reduce((sum, row) => sum + row.amount, 0)

  if (dateGroups.length === 0 && noDateRows.length === 0) {
    return (
      <div className="spo-compact__empty">
        {filterActive ? 'По выбранным фильтрам обязательств не найдено.' : 'Нет обязательств к оплате'}
      </div>
    )
  }

  function renderRows(rows) {
    return rows.map((row) => (
      <CompactObligationRow
        key={row.key}
        group={row}
        todayKey={todayKey}
        canEditTerms={canEditTerms}
        onOpen={onOpen}
        onConfigure={onConfigure}
      />
    ))
  }

  function subtotal(label, amount) {
    return (
      <PgtSubtotal
        columns={PAYMENTS_COLUMNS}
        cells={{
          receivedAt: <span>Итого {label}</span>,
          amount: <span className="pgt__money">{formatUmagMoney(amount)}</span>,
        }}
      />
    )
  }

  return (
    <PgtTable columns={PAYMENTS_COLUMNS}>
      <PgtHead columns={PAYMENTS_COLUMNS} />
      {dateGroups.map((group) => {
        const total = filterActive
          ? group.rows.reduce((sum, row) => sum + row.amount, 0)
          : group.total
        return (
          <section key={group.date}>
            {renderRows(group.rows)}
            {subtotal(formatReceivedDateGroupLabel(group.date), total)}
          </section>
        )
      })}
      {noDateRows.length > 0 ? (
        <section>
          {renderRows(noDateRows)}
          {subtotal('без даты приёмки', noDateRows.reduce((sum, row) => sum + row.amount, 0))}
        </section>
      ) : null}
      <PgtFoot
        columns={PAYMENTS_COLUMNS}
        cells={{
          receivedAt: <span>Итого</span>,
          amount: <span className="pgt__money">{formatUmagMoney(grandTotal)}</span>,
        }}
      />
    </PgtTable>
  )
}

function KpiCard({ label, value, tone, loading, primary }) {
  return (
    <div
      className={`spo-panel__kpi spo-panel__kpi--${tone || 'default'}${
        primary ? ' spo-panel__kpi--primary' : ''
      }`}
    >
      <div className="spo-panel__kpi-label">{label}</div>
      <div className="spo-panel__kpi-value">{loading ? '…' : formatUmagMoney(value)}</div>
    </div>
  )
}

function statusTone(status) {
  switch (status) {
    case OBLIGATION_STATUS.OVERDUE:
      return 'overdue'
    case OBLIGATION_STATUS.DUE_TODAY:
      return 'today'
    case OBLIGATION_STATUS.UPCOMING:
      return 'upcoming'
    case OBLIGATION_STATUS.TERMS_MISSING:
      return 'missing'
    default:
      return 'default'
  }
}

function ObligationCard({ group, todayKey, canEditTerms, onOpen, onConfigure }) {
  const isMissing = group.status === OBLIGATION_STATUS.TERMS_MISSING
  const dueLabel = group.dueDate
    ? formatUmagDate(`${group.dueDate}T12:00:00+05:00`)
    : null
  const daysText = formatDaysUntilDue(group.dueDate, todayKey)
  const mapped = Boolean(group.platformSupplierId)

  return (
    <div className={`spo-panel__card spo-panel__card--${statusTone(group.status)}`}>
      <button type="button" className="spo-panel__card-main" onClick={() => onOpen(group)}>
        <div className="spo-panel__card-title">{group.name || 'Без названия'}</div>
        <div className="spo-panel__card-amount">{formatUmagMoney(group.amount)}</div>
        {isMissing ? (
          <div className="spo-panel__card-meta">Срок оплаты не настроен</div>
        ) : (
          <>
            <div className="spo-panel__card-meta">
              Срок оплаты:{' '}
              {group.status === OBLIGATION_STATUS.DUE_TODAY ? 'сегодня' : dueLabel}
            </div>
            {group.status !== OBLIGATION_STATUS.DUE_TODAY ? (
              <div
                className={`spo-panel__card-days spo-panel__card-days--${statusTone(
                  group.status
                )}`}
              >
                {daysText}
              </div>
            ) : null}
          </>
        )}
        <div className="spo-panel__card-meta">{formatReceptionCount(group.count)}</div>
      </button>

      {isMissing ? (
        <div className="spo-panel__card-actions">
          {canEditTerms && mapped ? (
            <button
              type="button"
              className="btn btn-primary spo-panel__configure-btn"
              onClick={(e) => {
                e.stopPropagation()
                onConfigure(group)
              }}
            >
              Настроить отсрочку
            </button>
          ) : (
            <p className="spo-panel__card-hint" role="status">
              {mapped
                ? 'Нет прав на изменение условий поставщика'
                : 'Поставщик не сопоставлен. Сначала необходимо связать его с карточкой поставщика.'}
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Single-select account picker for the «Оплачено» row — a real dropdown
 * (open state fully our own CSS), not a native <select>: the browser's own
 * <select> popup can't be restyled at all once open, which is exactly the
 * "old browser look" the owner flagged. Reuses the same pf-field__control/
 * display/chevron/list/item classes as the «Фильтр» popover's fields, so
 * closed AND open states both match.
 *
 * The list itself is portalled to document.body and positioned with
 * getBoundingClientRect() — GroupDetail's own sheet scrolls
 * (overflow: auto, see the comment above it), which would otherwise clip an
 * absolutely-positioned dropdown the moment the row isn't near the top.
 */
function MarkPaidAccountSelect({ accounts, value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const [menuRect, setMenuRect] = useState(null)
  const rootRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect) {
      // Flip upward when the row sits near the bottom of the viewport (the
      // sheet itself can be scrolled arbitrarily far) — a fixed max-height
      // list opening downward there would render mostly off-screen.
      const estimatedMenuHeight = 46 * (accounts.length + 1) + 8
      const roomBelow = window.innerHeight - rect.bottom
      const openUpward = roomBelow < estimatedMenuHeight && rect.top > roomBelow
      setMenuRect({
        left: rect.left,
        width: rect.width,
        ...(openUpward
          ? { bottom: window.innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 }),
      })
    }

    function handlePointerDown(event) {
      if (!(event.target instanceof Node)) return
      // The list itself is portalled to document.body — a plain
      // rootRef.contains() check misses it entirely, so a real mouse click
      // (mousedown fires before click) closed the menu out from under
      // itself before the option's own onClick ever ran. Both refs must
      // count as "inside".
      if (rootRef.current?.contains(event.target)) return
      if (menuRef.current?.contains(event.target)) return
      setOpen(false)
    }
    function handleEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    // The row can move (sheet scroll, window resize) while the list is
    // open — closing on either is simpler and less error-prone than
    // continuously re-tracking the trigger's position.
    function handleClose() {
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', handleClose)
    document.addEventListener('scroll', handleClose, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', handleClose)
      document.removeEventListener('scroll', handleClose, true)
    }
  }, [open])

  const selected = accounts.find((account) => account.id === value)
  const label = selected?.name || 'Без счёта'

  function choose(nextValue) {
    onChange(nextValue)
    setOpen(false)
  }

  return (
    <div className="pf-field__control spo-panel__mark-paid-control" ref={rootRef}>
      <button
        type="button"
        className="pf-field__display"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        {label}
      </button>
      <button
        type="button"
        className="pf-field__chevron"
        aria-label="Открыть список счетов"
        disabled={disabled}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <ChevronDownIcon size={16} />
      </button>
      {open && menuRect
        ? createPortal(
            <div
              ref={menuRef}
              className="pf-field__list spo-panel__mark-paid-list"
              role="listbox"
              style={menuRect}
            >
              <div
                className="pf-field__item spo-panel__mark-paid-item"
                role="option"
                aria-selected={value == null}
                onClick={() => choose(null)}
              >
                Без счёта
              </div>
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="pf-field__item spo-panel__mark-paid-item"
                  role="option"
                  aria-selected={value === account.id}
                  onClick={() => choose(account.id)}
                >
                  {account.name}
                </div>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

function GroupDetail({
  group,
  todayKey,
  canEditTerms,
  canManagePayments,
  markingId,
  onClose,
  onConfigure,
  onMarkPaid,
  onUnmarkPaid,
}) {
  // Счёт, которым фактически оплачена ЭТА приёмка — независим от способа
  // оплаты по умолчанию у поставщика (см. Case: поставщику иногда платят
  // наличными, иногда переводом). Defaults to the supplier's usual account,
  // overridable per obligation right before marking paid.
  const [selectedAccountByObId, setSelectedAccountByObId] = useState(() => {
    const initial = {}
    for (const ob of group?.obligations || []) {
      initial[ob.id] = ob.supplierPaymentAccountId ?? null
    }
    return initial
  })

  if (!group) return null
  const isMissing = group.status === OBLIGATION_STATUS.TERMS_MISSING
  const mapped = Boolean(group.platformSupplierId)
  const activeAccounts = getPaymentAccountsCacheSync().filter((account) => account.isActive)

  // Portalled to document.body: rendered inline, this "fixed" backdrop would
  // actually be contained by PullToRefresh's always-on `will-change:
  // transform` wrapper (a page-length box), centering the sheet in the
  // middle of the whole scrollable page instead of the viewport.
  return createPortal(
    <div className="spo-panel__sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="spo-panel__sheet"
        role="dialog"
        aria-modal="true"
        aria-label={group.name}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="spo-panel__sheet-head">
          <div>
            <h3>{group.name || 'Без названия'}</h3>
            <p className="spo-panel__muted">
              {group.dueDate
                ? formatDaysUntilDue(group.dueDate, todayKey)
                : 'Срок оплаты не настроен'}
            </p>
          </div>
          <button type="button" className="spo-panel__sheet-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="spo-panel__sheet-total">{formatUmagMoney(group.amount)}</div>
        <div className="spo-panel__muted">{formatReceptionCount(group.count)}</div>

        {isMissing ? (
          mapped && canEditTerms ? (
            <button
              type="button"
              className="btn btn-primary spo-panel__configure-btn"
              onClick={() => onConfigure(group)}
            >
              Настроить отсрочку
            </button>
          ) : (
            <p className="spo-panel__card-hint" role="status">
              {mapped
                ? 'Нет прав на изменение условий поставщика'
                : 'Поставщик не сопоставлен. Сначала необходимо связать его с карточкой поставщика.'}
            </p>
          )
        ) : null}

        <ul className="spo-panel__ob-list">
          {(group.obligations || []).map((ob) => {
            const markedPaid = isPlatformMarkedPaid(ob)
            const isMarking = markingId === ob.id
            return (
              <li key={ob.id} className="spo-panel__ob-item">
                <div className="spo-panel__ob-title">
                  {formatUmagDate(ob.sourceDocTime || `${ob.supplyDocumentDate}T12:00:00+05:00`)}
                </div>
                <div className="spo-panel__ob-grid">
                  <span>Сумма приёмки</span>
                  <strong>{formatUmagMoney(ob.originalSupplyAmount)}</strong>
                  <span>К оплате</span>
                  <strong>{formatUmagMoney(resolveOwedAmount(ob))}</strong>
                  <span>Срок</span>
                  <strong>
                    {ob.dueDate
                      ? formatUmagDate(`${ob.dueDate}T12:00:00+05:00`)
                      : 'Не настроен'}
                  </strong>
                  <span>Способ</span>
                  <strong>{formatPaymentAccountSnapshot(ob)}</strong>
                  <span>Срок</span>
                  <strong>{formatPaymentTermsDaysSnapshot(ob)}</strong>
                  <span>Статус</span>
                  <strong>
                    {markedPaid ? formatPlatformPaymentMark(ob) : OBLIGATION_STATUS_LABELS[group.status] || '—'}
                  </strong>
                </div>
                {canManagePayments ? (
                  markedPaid ? (
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost spo-panel__mark-paid-btn"
                      disabled={isMarking}
                      onClick={() => onUnmarkPaid(ob)}
                    >
                      {isMarking ? 'Сохранение…' : 'Отменить оплату'}
                    </button>
                  ) : (
                    <div className="spo-panel__mark-paid-row">
                      {activeAccounts.length > 0 ? (
                        <MarkPaidAccountSelect
                          accounts={activeAccounts}
                          value={selectedAccountByObId[ob.id] ?? null}
                          onChange={(nextId) =>
                            setSelectedAccountByObId((prev) => ({
                              ...prev,
                              [ob.id]: nextId,
                            }))
                          }
                          disabled={isMarking}
                        />
                      ) : null}
                      <button
                        type="button"
                        className="btn btn--sm btn--primary spo-panel__mark-paid-btn"
                        disabled={isMarking}
                        onClick={() => onMarkPaid(ob, selectedAccountByObId[ob.id] ?? null)}
                      >
                        {isMarking ? 'Сохранение…' : 'Оплачено'}
                      </button>
                    </div>
                  )
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
    </div>,
    document.body
  )
}

const NO_ACCOUNT_FILTER_KEY = '__none__'

/** Normalizes a supplier's payment_account_id for filter-set membership (null → sentinel key). */
function accountFilterKey(accountId) {
  return accountId || NO_ACCOUNT_FILTER_KEY
}

/** Combined «Фильтр» popover: Счёт оплаты (checkbox list) + Поставщик (search + checkbox list). */
function PaymentsFilterPopover({
  open,
  accountOptions,
  accountDraft,
  onToggleAccount,
  supplierOptions,
  supplierDraft,
  onToggleSupplier,
  searchValue,
  onSearchChange,
  onApply,
  onReset,
  onClose,
  anchorRef,
}) {
  const popoverRef = useRef(null)
  const [expandedField, setExpandedField] = useState(null)

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
    if (!open) setExpandedField(null)
  }, [open])

  if (!open) return null

  const accountSummary =
    accountDraft.size === 0
      ? 'Все'
      : accountDraft.size === 1
        ? accountOptions.find((opt) => accountDraft.has(opt.id))?.label || 'Выбран 1'
        : `Выбрано: ${accountDraft.size}`

  return (
    <div ref={popoverRef} className="spo-filter-pop" role="dialog" aria-label="Фильтр">
      <FilterComboField
        label="Счёт оплаты"
        summaryText={accountSummary}
        options={accountOptions}
        draft={accountDraft}
        onToggle={onToggleAccount}
        expanded={expandedField === 'account'}
        onToggleExpanded={() => setExpandedField((f) => (f === 'account' ? null : 'account'))}
        emptyText="Счета не найдены"
      />
      <FilterComboField
        label="Поставщик"
        searchable
        placeholder="Введите название"
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        options={supplierOptions}
        draft={supplierDraft}
        onToggle={onToggleSupplier}
        expanded={expandedField === 'supplier'}
        onToggleExpanded={() => setExpandedField((f) => (f === 'supplier' ? null : 'supplier'))}
        emptyText="Поставщик не найден"
      />
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
 * @param {{ embedded?: boolean, externalSummaryProvided?: boolean, summary?: object|null, summaryLoading?: boolean, obligations?: object[]|null, refreshToken?: unknown, filterSlot?: HTMLElement|null }} [props]
 *   filterSlot — Этап 2.9: DOM node in the shared finance topbar (next to the
 *     ↻ button) where the supplier filter button + popover are portalled,
 *     replacing the old free-text search row.
 *   embedded — Этап 2.6: hides the standalone shell (title, sync status,
 *     ↻ button, global KPIs) so this can render as pure payment-schedule
 *     content under a future shared header. The content itself — tabs,
 *     groups, obligation details, "настроить отсрочку" — is unchanged.
 *   externalSummaryProvided — Этап 3.2: parent owns summary/obligations;
 *     this panel must not re-fetch financial summary or obligations.
 *   summary — parent-provided fetchSupplierFinanceSummary() result.
 *   summaryLoading — parent is still loading its owned summary/obligations.
 *   obligations — parent-provided listPaymentObligations() rows for schedule.
 *   refreshToken — Этап 2.7: bump this (any changed value) to make an
 *     embedded instance reload without remounting/losing local state.
 *     Ignored in standalone use.
 */
export default function SupplierPaymentsPanel({
  embedded = false,
  externalSummaryProvided = false,
  summary: summaryProp = null,
  summaryLoading = false,
  obligations: obligationsProp = null,
  refreshToken = null,
  filterSlot = null,
} = {}) {
  const { user } = useSession()
  const toast = useToast()
  const navigate = useNavigate()
  const canView = canViewSupplierPayments(user)
  const canSync = canSyncUmagSettlements(user)
  const canEditTerms = canEditSuppliers(user)
  const canManagePayments = canManageSupplierPayments(user)

  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(summaryProp)
  const [view, setView] = useState(null)
  const [rawObligations, setRawObligations] = useState(null)
  const [todayKey, setTodayKey] = useState(() => toAqtobeDateKey())
  const [lastRun, setLastRun] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [markingId, setMarkingId] = useState(null)
  const [activeTab, setActiveTab] = useState('overdue')
  const [tabTouched, setTabTouched] = useState(false)
  const [supplierFilter, setSupplierFilter] = useState(() => new Set())
  const [filterDraft, setFilterDraft] = useState(() => new Set())
  const [filterSearch, setFilterSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState(() => new Set())
  const [accountFilterDraft, setAccountFilterDraft] = useState(() => new Set())
  const [filterOpen, setFilterOpen] = useState(false)
  const filterButtonRef = useRef(null)
  const [accountsCacheVersion, setAccountsCacheVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    void ensurePaymentAccountsLoaded().then(() => {
      if (!cancelled) setAccountsCacheVersion((v) => v + 1)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const loadStandalone = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [summaryData, obligations] = await Promise.all([
        fetchSupplierFinanceSummary(),
        listPaymentObligations({ includePaid: false }),
      ])
      const nextView = buildPaymentScheduleView(obligations, summaryData.todayKey)
      setSummary(summaryData)
      setView(nextView)
      setRawObligations(obligations)
      setTodayKey(summaryData.todayKey)
      setLastRun(summaryData.lastSync)
    } catch (err) {
      setError(err.message || 'Не удалось загрузить оплаты поставщикам')
      setSummary(null)
      setView(null)
      setRawObligations(null)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Quiet re-fetch after marking/unmarking a payment — same data as
   * loadStandalone, but without toggling the full-page loading skeleton
   * (the action already gave instant feedback via markingId/local patch).
   * Refetches directly regardless of embedded/standalone: this panel's own
   * view must reflect the mark immediately even when a parent owns
   * obligationsProp — the parent's own cache catches up on its next refresh.
   */
  const reloadAfterMutation = useCallback(async () => {
    try {
      const [summaryData, obligations] = await Promise.all([
        fetchSupplierFinanceSummary(),
        listPaymentObligations({ includePaid: false }),
      ])
      const nextView = buildPaymentScheduleView(obligations, summaryData.todayKey)
      setSummary(summaryData)
      setView(nextView)
      setRawObligations(obligations)
      setTodayKey(summaryData.todayKey)
      setLastRun(summaryData.lastSync)
    } catch {
      // Best-effort — the mark itself already succeeded; the visible lists
      // just won't drop the row until the next natural reload.
    }
  }, [])

  function patchSelectedGroupObligation(obligationId, patch) {
    setSelectedGroup((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        obligations: (prev.obligations || []).map((item) =>
          item.id === obligationId ? { ...item, ...patch } : item
        ),
      }
    })
  }

  async function handleMarkPaid(ob, chosenAccountId) {
    if (!canManagePayments || markingId) return
    const accountId = chosenAccountId !== undefined ? chosenAccountId : ob.supplierPaymentAccountId ?? null
    setMarkingId(ob.id)
    try {
      await markObligationPaid(ob, {
        paidByEmployeeId: user?.id ?? null,
        accountId,
        employeeName: user?.name ?? null,
        accountName: getPaymentAccountName(accountId),
      })
      patchSelectedGroupObligation(ob.id, {
        platformPaidAt: new Date().toISOString(),
        platformPaymentAccountId: accountId,
      })
      toast.success?.('Отмечено оплаченным')
      void reloadAfterMutation()
    } catch (err) {
      toast.error?.(err.message || 'Не удалось отметить оплату')
    } finally {
      setMarkingId(null)
    }
  }

  async function handleUnmarkPaid(ob) {
    if (!canManagePayments || markingId) return
    setMarkingId(ob.id)
    try {
      await unmarkObligationPaid(ob.id)
      patchSelectedGroupObligation(ob.id, {
        platformPaidAt: null,
        platformPaidBy: null,
        platformPaymentAccountId: null,
      })
      toast.success?.('Отметка оплаты снята')
      void reloadAfterMutation()
    } catch (err) {
      toast.error?.(err.message || 'Не удалось отменить отметку')
    } finally {
      setMarkingId(null)
    }
  }

  const applyExternalPageData = useCallback(() => {
    if (summaryLoading) {
      setLoading(true)
      setError('')
      return
    }
    if (!summaryProp || !obligationsProp) {
      setLoading(false)
      return
    }
    const nextView = buildPaymentScheduleView(obligationsProp, summaryProp.todayKey)
    setSummary(summaryProp)
    setView(nextView)
    setRawObligations(obligationsProp)
    setTodayKey(summaryProp.todayKey)
    setLastRun(summaryProp.lastSync)
    setLoading(false)
    setError('')
  }, [summaryLoading, summaryProp, obligationsProp])

  useEffect(() => {
    if (!canView) return
    if (externalSummaryProvided) {
      applyExternalPageData()
      return
    }
    void loadStandalone()
  }, [canView, externalSummaryProvided, applyExternalPageData, loadStandalone, refreshToken])

  useEffect(() => {
    if (!view || tabTouched) return
    setActiveTab(pickDefaultPaymentTab(view.tabCounts))
  }, [view, tabTouched])

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState !== 'visible') return
      const finished = lastRun?.finished_at || lastRun?.started_at
      if (!finished) {
        if (externalSummaryProvided) return
        void loadStandalone()
        return
      }
      const ageMs = Date.now() - new Date(finished).getTime()
      if (ageMs > 30 * 60 * 1000 && !externalSummaryProvided) void loadStandalone()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [lastRun, loadStandalone, externalSummaryProvided])

  async function handleSync() {
    if (!canSync || syncing) return
    setSyncing(true)
    try {
      const period = getMonthPeriodKeys()
      const result = await syncUmagForPayments({
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
      })
      if (!result.success) {
        toast.error?.(result.message)
        return
      }
      if (result.status === 'partial' || result.warning) {
        // Message carries the next action ("press again"), warning the diagnostics.
        toast.warning?.([result.message, result.warning].filter(Boolean).join(' '))
      } else {
        toast.success?.(result.message || 'Синхронизация выполнена.')
      }
      setTabTouched(false)
      await loadStandalone()
    } catch (err) {
      toast.error?.(err?.message || 'Не удалось синхронизировать')
    } finally {
      setSyncing(false)
    }
  }

  function openConfigure(group) {
    if (!group?.platformSupplierId) {
      toast.error?.(
        'Поставщик не сопоставлен. Сначала необходимо связать его с карточкой поставщика.'
      )
      return
    }
    setSelectedGroup(null)
    navigate('/platform/suppliers', {
      state: {
        openEditId: group.platformSupplierId,
        focusSection: 'payment-terms',
        returnTo: '/platform/supplier-finance?tab=payments',
      },
    })
  }

  const tabCounts = view?.tabCounts || {}
  const visibleGroups = view?.lists?.[activeTab] || []
  const activeTabMeta = TABS.find((tab) => tab.id === activeTab) || TABS[0]

  const receivedView = useMemo(
    () => buildPaymentScheduleByReceivedDate(rawObligations || [], todayKey),
    [rawObligations, todayKey]
  )

  const allFilterableGroups = useMemo(() => {
    if (!view?.lists) return []
    const groups = []
    for (const section of COMPACT_SECTIONS) groups.push(...(view.lists[section.id] || []))
    groups.push(...(view.lists.termsMissing || []))
    return groups
  }, [view])

  const allSupplierNames = useMemo(() => {
    const names = new Set()
    for (const group of allFilterableGroups) names.add(group.name || 'Без названия')
    return [...names].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [allFilterableGroups])

  // eslint-disable-next-line no-unused-vars -- accountsCacheVersion forces recompute once the
  // payment-accounts name cache warms up, so options don't stay stuck on the id fallback.
  const accountOptions = useMemo(() => {
    const keys = new Set()
    for (const group of allFilterableGroups) {
      keys.add(accountFilterKey(group.obligations?.[0]?.supplierPaymentAccountId ?? null))
    }
    const options = [...keys].map((key) => ({
      id: key,
      label: key === NO_ACCOUNT_FILTER_KEY ? 'Без счёта' : getPaymentAccountName(key) || 'Счёт',
    }))
    options.sort((a, b) => {
      if (a.id === NO_ACCOUNT_FILTER_KEY) return 1
      if (b.id === NO_ACCOUNT_FILTER_KEY) return -1
      return a.label.localeCompare(b.label, 'ru')
    })
    return options
  }, [allFilterableGroups, accountsCacheVersion])

  function openFilterPopover() {
    setFilterDraft(new Set(supplierFilter))
    setAccountFilterDraft(new Set(accountFilter))
    setFilterSearch('')
    setFilterOpen(true)
  }
  function toggleFilterSupplier(name) {
    setFilterDraft((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }
  function toggleFilterAccount(key) {
    setAccountFilterDraft((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function applyFilter() {
    setSupplierFilter(new Set(filterDraft))
    setAccountFilter(new Set(accountFilterDraft))
    setFilterOpen(false)
  }
  function resetFilter() {
    setFilterDraft(new Set())
    setAccountFilterDraft(new Set())
    setSupplierFilter(new Set())
    setAccountFilter(new Set())
    setFilterOpen(false)
  }

  const syncCoverage = useMemo(
    () => formatSyncCoverage(lastRun?.date_from, lastRun?.date_to),
    [lastRun]
  )

  const staleWarning = useMemo(() => {
    const finished = lastRun?.finished_at || lastRun?.started_at
    if (!finished) return 'Данные ещё не синхронизировались.'
    const ageMs = Date.now() - new Date(finished).getTime()
    if (ageMs > 24 * 60 * 60 * 1000) {
      return 'Последняя синхронизация была больше суток назад.'
    }
    return null
  }, [lastRun])

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к оплатам поставщикам" />
  }

  return (
    <div className="spo-panel">
      {!embedded && (
        <div className="spo-panel__toolbar">
          <div>
            <h2 className="spo-panel__title">Оплаты поставщикам</h2>
            <p className="spo-panel__subtitle">Контроль сроков оплаты поставщикам</p>
            <div className="spo-panel__meta">
              <span className="spo-panel__source-chip" title="Источник данных">
                UMAG
              </span>
              <span>
                Обновлено:{' '}
                {lastRun?.finished_at || lastRun?.started_at
                  ? formatUmagDateTime(lastRun.finished_at || lastRun.started_at)
                  : 'ещё не выполнялась'}
              </span>
              {lastRun?.status && lastRun.status !== 'success' ? (
                <span className="spo-panel__meta-status">
                  (
                  {lastRun.status === 'partial'
                    ? 'частично'
                    : lastRun.status === 'failed'
                      ? 'ошибка'
                      : lastRun.status}
                  )
                </span>
              ) : null}
              {syncCoverage ? (
                <span title="Период, который охватила последняя синхронизация">
                  Охват: {syncCoverage}
                </span>
              ) : null}
            </div>
          </div>
          {canSync ? (
            <PlatformSyncButton
              onClick={() => void handleSync()}
              syncing={syncing}
              disabled={!canSync}
              title="Синхронизация UMAG"
              aria-label="Синхронизация UMAG"
            />
          ) : null}
        </div>
      )}

      {!embedded && lastRun?.warning_message ? (
        <div className="spo-panel__warning" role="status">
          {lastRun.warning_message}
        </div>
      ) : null}

      {!embedded && staleWarning ? (
        <div className="spo-panel__warning" role="status">
          {staleWarning}
        </div>
      ) : null}

      {!embedded && (
        <div className="spo-panel__kpis" aria-label="Сводка оплат">
          <KpiCard
            label="Общий долг поставщикам"
            value={summary?.debt}
            tone="total"
            primary
            loading={loading && !summary}
          />
          <KpiCard
            label="Просрочено"
            value={summary?.overdue?.amount}
            tone="overdue"
            loading={loading && !summary}
          />
          <KpiCard
            label="Сегодня к оплате"
            value={summary?.dueToday?.amount}
            tone="today"
            loading={loading && !summary}
          />
        </div>
      )}

      <section className="spo-panel__plan" aria-label="К оплате">
        {!embedded && (
          <div className="spo-panel__plan-head">
            <h3 className="spo-panel__section-title">К оплате</h3>
          </div>
        )}

        {embedded ? (
          <>
            {filterSlot
              ? createPortal(
                  <div className="pf-filter-anchor">
                    <PlatformFilterTrigger
                      ref={filterButtonRef}
                      active={supplierFilter.size + accountFilter.size > 0}
                      count={supplierFilter.size + accountFilter.size}
                      open={filterOpen}
                      onClick={() => (filterOpen ? setFilterOpen(false) : openFilterPopover())}
                    />
                    <PaymentsFilterPopover
                      open={filterOpen}
                      accountOptions={accountOptions}
                      accountDraft={accountFilterDraft}
                      onToggleAccount={toggleFilterAccount}
                      supplierOptions={allSupplierNames.map((name) => ({ id: name, label: name }))}
                      supplierDraft={filterDraft}
                      onToggleSupplier={toggleFilterSupplier}
                      searchValue={filterSearch}
                      onSearchChange={setFilterSearch}
                      onApply={applyFilter}
                      onReset={resetFilter}
                      onClose={() => setFilterOpen(false)}
                      anchorRef={filterButtonRef}
                    />
                  </div>,
                  filterSlot
                )
              : null}
            {supplierFilter.size > 0 || accountFilter.size > 0 ? (
              <div className="pf-filter-strip">
                {accountFilter.size > 0 ? (
                  <>
                    <span>Счета:</span>
                    {[...accountFilter].map((key) => (
                      <span key={key} className="pf-filter-chip">
                        {accountOptions.find((opt) => opt.id === key)?.label || 'Счёт'}
                        <button
                          type="button"
                          aria-label="Убрать счёт из фильтра"
                          onClick={() =>
                            setAccountFilter((current) => {
                              const next = new Set(current)
                              next.delete(key)
                              return next
                            })
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </>
                ) : null}
                {supplierFilter.size > 0 ? (
                  <>
                    <span>Поставщики:</span>
                    {[...supplierFilter].map((name) => (
                      <span key={name} className="pf-filter-chip">
                        {name}
                        <button
                          type="button"
                          aria-label={`Убрать ${name}`}
                          onClick={() =>
                            setSupplierFilter((current) => {
                              const next = new Set(current)
                              next.delete(name)
                              return next
                            })
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </>
                ) : null}
                <button
                  type="button"
                  className="spo-compact__filter-clear"
                  onClick={() => {
                    setSupplierFilter(new Set())
                    setAccountFilter(new Set())
                  }}
                >
                  Очистить всё
                </button>
              </div>
            ) : null}
            <ReceivedDatePaymentSchedule
              view={receivedView}
              todayKey={todayKey}
              loading={loading}
              error={error}
              supplierFilter={supplierFilter}
              accountFilter={accountFilter}
              canEditTerms={canEditTerms}
              onOpen={setSelectedGroup}
              onConfigure={openConfigure}
            />
          </>
        ) : (
          <>
            <div className="spo-panel__tabs" role="tablist" aria-label="Приоритет оплат">
              {TABS.map((tab) => {
                const count = tabCounts[tab.id] || 0
                const selected = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={`spo-panel__tab spo-panel__tab--${tab.id}${
                      selected ? ' spo-panel__tab--active' : ''
                    }`}
                    onClick={() => {
                      setTabTouched(true)
                      setActiveTab(tab.id)
                    }}
                  >
                    <span>{tab.label}</span>
                    <span className="spo-panel__tab-count">{count}</span>
                  </button>
                )
              })}
            </div>

            {loading && !view ? (
              <DelayedLoadingSkeleton variant="cards" count={4} />
            ) : error && !view ? (
              <div className="spo-panel__error" role="alert">
                {error}
              </div>
            ) : visibleGroups.length === 0 ? (
              <div className="spo-panel__empty spo-panel__empty--compact">{activeTabMeta.empty}</div>
            ) : (
              <div className="spo-panel__cards">
                {visibleGroups.map((group) => (
                  <ObligationCard
                    key={group.key}
                    group={group}
                    todayKey={todayKey}
                    canEditTerms={canEditTerms}
                    onOpen={setSelectedGroup}
                    onConfigure={openConfigure}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {selectedGroup ? (
        <GroupDetail
          group={selectedGroup}
          todayKey={todayKey}
          canEditTerms={canEditTerms}
          canManagePayments={canManagePayments}
          markingId={markingId}
          onClose={() => setSelectedGroup(null)}
          onConfigure={openConfigure}
          onMarkPaid={handleMarkPaid}
          onUnmarkPaid={handleUnmarkPaid}
        />
      ) : null}
    </div>
  )
}
