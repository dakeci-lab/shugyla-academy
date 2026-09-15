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
  diffCalendarDays,
  formatDaysUntilDue,
  formatPaymentAccountSnapshot,
  formatPaymentTermsDaysSnapshot,
  formatPlatformPaymentMark,
  formatReceptionCount,
  formatSyncCoverage,
  isPlatformMarkedPaid,
  pickDefaultPaymentTab,
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
import { getTableSettings, saveTableSettings } from '../../../services/tableSettingsService'
import {
  PAYMENTS_COLUMN_RESIZE_MIN_WIDTH,
  SUPPLIER_PAYMENTS_TABLE_NAME,
  getDefaultPaymentsColumnSettings,
  getPaymentsColumnDef,
  isPaymentsColumnReorderable,
  getTogglablePaymentsColumnNames,
} from '../../../utils/paymentsColumnRegistry'
import {
  getVisiblePaymentsColumns,
  mergePaymentsColumnSettings,
  normalizePaymentsColumnSettingsForSave,
  reorderTogglablePaymentsColumns,
} from '../../../utils/paymentsColumnSettingsMerge'
import PlatformAccessDenied from '../../platform/PlatformAccessDenied'
import PlatformSyncButton from '../../platform/PlatformSyncButton'
import { PlatformFilterButton } from '../../platform/PlatformSearchToolbar'
import { ChevronDownIcon, SearchIcon } from '../../icons/PlatformIcons'
import { DelayedLoadingSkeleton } from '../../loading/LoadingSkeleton'
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
 * no payment terms configured), not a point on the urgency timeline, so it
 * renders as a separate banner instead of a same-tier section — see
 * MissingTermsBanner.
 */
const COMPACT_SECTIONS = [
  { id: 'overdue', label: 'Просрочено', summaryKey: 'overdue' },
  { id: 'today', label: 'Сегодня', summaryKey: 'dueToday' },
  { id: 'upcoming', label: 'Предстоящие', summaryKey: 'deferredNotYetDue' },
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

function renderPaymentsCell(columnName, group, todayKey) {
  switch (columnName) {
    case 'supplier':
      return <span className="spo-compact__supplier">{group.name || 'Без названия'}</span>
    case 'receivedAt':
      return <span className="spo-compact__received">{formatReceivedAt(group)}</span>
    case 'status': {
      const tone = statusTone(group.status)
      return (
        <span className={`spo-compact__status spo-compact__status--${tone}`}>
          {formatCompactStatusText(group, todayKey)}
        </span>
      )
    }
    case 'dueDate':
      return <span className="spo-compact__due">{formatCompactDueDate(group.dueDate)}</span>
    case 'amount':
      return <span className="spo-compact__amount">{formatUmagMoney(group.amount)}</span>
    default:
      return null
  }
}

function CompactObligationRow({ group, todayKey, canEditTerms, onOpen, onConfigure, visibleColumns, gridStyle }) {
  const tone = statusTone(group.status)
  const isMissing = group.status === OBLIGATION_STATUS.TERMS_MISSING
  const mapped = Boolean(group.platformSupplierId)
  const statusText = formatCompactStatusText(group, todayKey)

  return (
    <div className={`spo-compact__row spo-compact__row--${tone}`}>
      <button type="button" className="spo-compact__row-main" style={gridStyle} onClick={() => onOpen(group)}>
        {visibleColumns.map((col) => (
          <Fragment key={col.columnName}>{renderPaymentsCell(col.columnName, group, todayKey)}</Fragment>
        ))}
        <span className="spo-compact__mobile-meta">
          {formatCompactDueDate(group.dueDate)} · {statusText}
        </span>
      </button>
      {isMissing && canEditTerms && mapped ? (
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
      ) : null}
    </div>
  )
}

function pluralizeSupplier(count) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return 'поставщик'
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'поставщика'
  return 'поставщиков'
}

/**
 * Setup-gap banner, not an urgency section: suppliers with no configured
 * payment terms don't belong on the same timeline as Просрочено/Сегодня/
 * Предстоящие — collapsed by default, expands to the same row list.
 */
function MissingTermsBanner({
  groups,
  amount,
  expanded,
  onToggle,
  todayKey,
  canEditTerms,
  onOpen,
  onConfigure,
  visibleColumns,
  gridStyle,
}) {
  if (!groups.length) return null
  return (
    <div className="spo-compact__missing-banner-wrap">
      <button
        type="button"
        className="spo-compact__missing-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="spo-compact__missing-text">
          {groups.length} {pluralizeSupplier(groups.length)} без срока оплаты — настройте условия
        </span>
        <span className="spo-compact__missing-amount">{formatUmagMoney(amount)}</span>
        <span
          className={`spo-compact__missing-chevron${expanded ? ' spo-compact__missing-chevron--open' : ''}`}
          aria-hidden="true"
        >
          <ChevronDownIcon size={16} />
        </span>
      </button>
      {expanded ? (
        <div className="spo-compact__missing-rows">
          {groups.map((group) => (
            <CompactObligationRow
              key={group.key}
              group={group}
              todayKey={todayKey}
              canEditTerms={canEditTerms}
              onOpen={onOpen}
              onConfigure={onConfigure}
              visibleColumns={visibleColumns}
              gridStyle={gridStyle}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function PaymentsColumnSettingsIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61
        l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81
        c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33
        c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12
        s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96
        c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54
        c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61
        L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"
      />
    </svg>
  )
}

function CompactColumnsHead({
  visibleColumns,
  gridStyle,
  dragColumnName,
  dropColumnName,
  onColumnDragStart,
  onColumnDragOver,
  onColumnDrop,
  onColumnDragEnd,
  onColumnResizePointerDown,
}) {
  return (
    <div className="spo-compact__head" role="row" style={gridStyle}>
      {visibleColumns.map((col) => {
        const def = getPaymentsColumnDef(col.columnName)
        const reorderable = isPaymentsColumnReorderable(col.columnName)
        const resizable = col.columnName !== 'supplier'
        const headClassName = [
          'spo-compact__col',
          dragColumnName === col.columnName ? 'is-dragging' : '',
          dropColumnName === col.columnName && dragColumnName ? 'is-drag-over' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <span
            key={col.columnName}
            role="columnheader"
            data-col={col.columnName}
            className={headClassName}
            onDragOver={(event) => onColumnDragOver(event, col.columnName)}
            onDrop={(event) => onColumnDrop(event, col.columnName)}
          >
            <span
              className={`spo-compact__col-drag-handle${reorderable ? ' is-reorderable' : ''}`}
              draggable={reorderable || undefined}
              onDragStart={(event) => onColumnDragStart(event, col.columnName)}
              onDragEnd={onColumnDragEnd}
            >
              {def?.label || col.columnName}
            </span>
            {resizable ? (
              <span
                className="spo-compact__col-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label={`Изменить ширину столбца ${def?.label || col.columnName}`}
                onPointerDown={(event) => onColumnResizePointerDown(event, col.columnName)}
              />
            ) : null}
          </span>
        )
      })}
    </div>
  )
}

function CompactPaymentSchedule({
  view,
  todayKey,
  tabCounts,
  loading,
  error,
  supplierFilter,
  canEditTerms,
  onOpen,
  onConfigure,
  visibleColumns,
  gridStyle,
  dragColumnName,
  dropColumnName,
  onColumnDragStart,
  onColumnDragOver,
  onColumnDrop,
  onColumnDragEnd,
  onColumnResizePointerDown,
  columnSettingsGear,
}) {
  const [missingExpanded, setMissingExpanded] = useState(false)

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

  const summaries = view?.summaries || {}
  const lists = view?.lists || {}
  const filterActive = supplierFilter.size > 0
  const filteredSections = COMPACT_SECTIONS.map((section) => {
    const groups = lists[section.id] || []
    const filtered = filterActive
      ? groups.filter((group) => supplierFilter.has(group.name || 'Без названия'))
      : groups
    return { section, groups: filtered }
  }).filter(({ groups }) => groups.length > 0)

  const missingGroups = lists.termsMissing || []
  const filteredMissingGroups = filterActive
    ? missingGroups.filter((group) => supplierFilter.has(group.name || 'Без названия'))
    : missingGroups
  const missingAmount = filterActive
    ? filteredMissingGroups.reduce((sum, group) => sum + (group.amount || 0), 0)
    : summaries.termsMissing || 0

  if (filteredSections.length === 0 && filteredMissingGroups.length === 0) {
    return (
      <div className="spo-compact__empty">
        {filterActive ? 'По выбранным поставщикам обязательств не найдено.' : 'Нет обязательств к оплате'}
      </div>
    )
  }

  return (
    <div className="spo-compact__stack">
      <MissingTermsBanner
        groups={filteredMissingGroups}
        amount={missingAmount}
        expanded={missingExpanded}
        onToggle={() => setMissingExpanded((open) => !open)}
        todayKey={todayKey}
        canEditTerms={canEditTerms}
        onOpen={onOpen}
        onConfigure={onConfigure}
        visibleColumns={visibleColumns}
        gridStyle={gridStyle}
      />

      {filteredSections.length > 0 ? (
        <div className="spo-compact__wrap">
          <div className="spo-compact__head-row">
            <CompactColumnsHead
              visibleColumns={visibleColumns}
              gridStyle={gridStyle}
              dragColumnName={dragColumnName}
              dropColumnName={dropColumnName}
              onColumnDragStart={onColumnDragStart}
              onColumnDragOver={onColumnDragOver}
              onColumnDrop={onColumnDrop}
              onColumnDragEnd={onColumnDragEnd}
              onColumnResizePointerDown={onColumnResizePointerDown}
            />
            {columnSettingsGear}
          </div>
          <div className="spo-compact">
            {filteredSections.map(({ section, groups }) => {
              const count = filterActive ? groups.length : tabCounts[section.id] || 0
              const amount = filterActive
                ? groups.reduce((sum, group) => sum + (group.amount || 0), 0)
                : summaries[section.summaryKey] || 0
              return (
                <section key={section.id} className="spo-compact__section">
                  <h3 className={`spo-compact__section-head spo-compact__section-head--${section.id}`}>
                    <span className="spo-compact__section-left">
                      <span className="spo-compact__section-label">{section.label}</span>
                      <span className="spo-compact__section-count">· {count}</span>
                    </span>
                    <span className="spo-compact__section-amount">{formatUmagMoney(amount)}</span>
                  </h3>
                  <div className="spo-compact__rows">
                    {groups.map((group) => (
                      <CompactObligationRow
                        key={group.key}
                        group={group}
                        todayKey={todayKey}
                        canEditTerms={canEditTerms}
                        onOpen={onOpen}
                        onConfigure={onConfigure}
                        visibleColumns={visibleColumns}
                        gridStyle={gridStyle}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
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
  if (!group) return null
  const isMissing = group.status === OBLIGATION_STATUS.TERMS_MISSING
  const mapped = Boolean(group.platformSupplierId)

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
                  <span>Оплачено</span>
                  <strong>{formatUmagMoney(ob.currentPaymentAmount)}</strong>
                  <span>Остаток</span>
                  <strong>{formatUmagMoney(ob.currentDebt)}</strong>
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
                  <button
                    type="button"
                    className={`btn btn--sm spo-panel__mark-paid-btn${markedPaid ? ' btn--ghost' : ' btn--primary'}`}
                    disabled={isMarking}
                    onClick={() => (markedPaid ? onUnmarkPaid(ob) : onMarkPaid(ob))}
                  >
                    {isMarking ? 'Сохранение…' : markedPaid ? 'Отменить оплату' : 'Оплачено'}
                  </button>
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

/** Popover: search + checkbox list of suppliers, «Применить» commits the filter. */
function SupplierFilterPopover({
  open,
  suppliers,
  draft,
  onToggleSupplier,
  onSearchChange,
  searchValue,
  onApply,
  onReset,
  onClose,
  anchorRef,
}) {
  const popoverRef = useRef(null)

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

  if (!open) return null

  const query = searchValue.trim().toLowerCase()
  const matches = query
    ? suppliers.filter((name) => name.toLowerCase().includes(query))
    : suppliers

  return (
    <div ref={popoverRef} className="spo-filter-pop" role="dialog" aria-label="Фильтр по поставщику">
      <div className="spo-filter-pop__head">Фильтр по поставщику</div>
      <label className="spo-filter-pop__search">
        <SearchIcon size={15} />
        <input
          type="text"
          placeholder="Поиск поставщика…"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          autoComplete="off"
        />
      </label>
      <div className="spo-filter-pop__list">
        {matches.length === 0 ? (
          <div className="spo-filter-pop__empty">Поставщик не найден</div>
        ) : (
          matches.map((name) => (
            <label key={name} className="spo-filter-pop__item">
              <input
                type="checkbox"
                checked={draft.has(name)}
                onChange={() => onToggleSupplier(name)}
              />
              <span>{name}</span>
            </label>
          ))
        )}
      </div>
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
  const [todayKey, setTodayKey] = useState(() => toAqtobeDateKey())
  const [lastRun, setLastRun] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [markingId, setMarkingId] = useState(null)
  const [activeTab, setActiveTab] = useState('overdue')
  const [tabTouched, setTabTouched] = useState(false)
  const [supplierFilter, setSupplierFilter] = useState(() => new Set())
  const [filterDraft, setFilterDraft] = useState(() => new Set())
  const [filterSearch, setFilterSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const filterButtonRef = useRef(null)

  const [columnSettings, setColumnSettings] = useState(() => getDefaultPaymentsColumnSettings())
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false)
  const [dragColumnName, setDragColumnName] = useState(null)
  const [dropColumnName, setDropColumnName] = useState(null)
  const columnSettingsRefState = useRef(columnSettings)
  const columnSettingsPopoverRef = useRef(null)
  const resizeStateRef = useRef(null)

  useEffect(() => {
    columnSettingsRefState.current = columnSettings
  }, [columnSettings])

  useEffect(() => {
    if (!embedded) return undefined
    let cancelled = false
    void (async () => {
      try {
        const saved = await getTableSettings(SUPPLIER_PAYMENTS_TABLE_NAME)
        if (cancelled) return
        setColumnSettings(mergePaymentsColumnSettings(saved, getDefaultPaymentsColumnSettings()))
      } catch {
        if (!cancelled) setColumnSettings(getDefaultPaymentsColumnSettings())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [embedded])

  useEffect(() => {
    if (!columnSettingsOpen) return undefined
    function handlePointerDown(event) {
      if (!(event.target instanceof Node)) return
      if (columnSettingsPopoverRef.current?.contains(event.target)) return
      setColumnSettingsOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [columnSettingsOpen])

  const persistColumnSettings = useCallback(async (nextSettings) => {
    const normalized = normalizePaymentsColumnSettingsForSave(nextSettings)
    setColumnSettings(normalized)
    try {
      await saveTableSettings(normalized)
    } catch {
      // best-effort persistence — local state already reflects the change
    }
  }, [])

  const handleColumnResizePointerMove = useCallback((event) => {
    const state = resizeStateRef.current
    if (!state) return
    const delta = event.clientX - state.startX
    const minWidth = getPaymentsColumnDef(state.columnName)?.minWidth ?? PAYMENTS_COLUMN_RESIZE_MIN_WIDTH
    const nextWidth = Math.max(minWidth, Math.round(state.startWidth + delta))
    setColumnSettings((current) => ({
      ...current,
      columns: current.columns.map((col) =>
        col.columnName === state.columnName ? { ...col, width: nextWidth } : col
      ),
    }))
  }, [])

  const handleColumnResizePointerUp = useCallback(() => {
    window.removeEventListener('pointermove', handleColumnResizePointerMove)
    window.removeEventListener('pointerup', handleColumnResizePointerUp)
    if (!resizeStateRef.current) return
    resizeStateRef.current = null
    void persistColumnSettings(columnSettingsRefState.current)
  }, [handleColumnResizePointerMove, persistColumnSettings])

  const handleColumnResizePointerDown = useCallback(
    (event, columnName) => {
      event.preventDefault()
      event.stopPropagation()
      const col = columnSettingsRefState.current.columns.find((item) => item.columnName === columnName)
      if (!col) return
      const headerCell = event.currentTarget.closest('.spo-compact__col')
      const measuredWidth = headerCell ? headerCell.getBoundingClientRect().width : col.width
      resizeStateRef.current = { columnName, startX: event.clientX, startWidth: measuredWidth }
      window.addEventListener('pointermove', handleColumnResizePointerMove)
      window.addEventListener('pointerup', handleColumnResizePointerUp)
    },
    [handleColumnResizePointerMove, handleColumnResizePointerUp]
  )

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', handleColumnResizePointerMove)
      window.removeEventListener('pointerup', handleColumnResizePointerUp)
    },
    [handleColumnResizePointerMove, handleColumnResizePointerUp]
  )

  const handleColumnDragStart = useCallback((event, columnName) => {
    if (!isPaymentsColumnReorderable(columnName)) {
      event.preventDefault()
      return
    }
    setDragColumnName(columnName)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', columnName)
  }, [])

  const handleColumnDragOver = useCallback(
    (event, columnName) => {
      if (!isPaymentsColumnReorderable(columnName) || !dragColumnName) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      setDropColumnName(columnName)
    },
    [dragColumnName]
  )

  const handleColumnDrop = useCallback(
    (event, columnName) => {
      event.preventDefault()
      if (!dragColumnName || !isPaymentsColumnReorderable(columnName)) return
      if (dragColumnName === columnName) return
      const reordered = reorderTogglablePaymentsColumns(
        columnSettingsRefState.current,
        dragColumnName,
        columnName
      )
      void persistColumnSettings(reordered)
      setDragColumnName(null)
      setDropColumnName(null)
    },
    [dragColumnName, persistColumnSettings]
  )

  const handleColumnDragEnd = useCallback(() => {
    setDragColumnName(null)
    setDropColumnName(null)
  }, [])

  const handleColumnVisibilityToggle = useCallback(
    (columnName) => {
      const current = columnSettingsRefState.current.columns.find((col) => col.columnName === columnName)
      const willHide = current?.visible !== false
      void persistColumnSettings({
        ...columnSettingsRefState.current,
        columns: columnSettingsRefState.current.columns.map((col) =>
          col.columnName === columnName ? { ...col, visible: !willHide } : col
        ),
      })
    },
    [persistColumnSettings]
  )

  const handleResetColumnSettings = useCallback(() => {
    void persistColumnSettings(getDefaultPaymentsColumnSettings())
    setColumnSettingsOpen(false)
  }, [persistColumnSettings])

  const visiblePaymentsColumns = useMemo(
    () => getVisiblePaymentsColumns(columnSettings),
    [columnSettings]
  )
  const paymentsGridStyle = useMemo(
    () => ({
      '--spo-compact-cols': visiblePaymentsColumns
        .map((col) => (col.columnName === 'supplier' ? 'minmax(0, 1fr)' : `${col.width}px`))
        .join(' '),
    }),
    [visiblePaymentsColumns]
  )

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
      setTodayKey(summaryData.todayKey)
      setLastRun(summaryData.lastSync)
    } catch (err) {
      setError(err.message || 'Не удалось загрузить оплаты поставщикам')
      setSummary(null)
      setView(null)
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

  async function handleMarkPaid(ob) {
    if (!canManagePayments || markingId) return
    setMarkingId(ob.id)
    try {
      await markObligationPaid(ob.id, {
        paidByEmployeeId: user?.id ?? null,
        accountId: ob.supplierPaymentAccountId ?? null,
      })
      patchSelectedGroupObligation(ob.id, {
        platformPaidAt: new Date().toISOString(),
        platformPaymentAccountId: ob.supplierPaymentAccountId ?? null,
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

  const allSupplierNames = useMemo(() => {
    if (!view?.lists) return []
    const names = new Set()
    for (const section of COMPACT_SECTIONS) {
      for (const group of view.lists[section.id] || []) names.add(group.name || 'Без названия')
    }
    for (const group of view.lists.termsMissing || []) names.add(group.name || 'Без названия')
    return [...names].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [view])

  function openFilterPopover() {
    setFilterDraft(new Set(supplierFilter))
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
  function applyFilter() {
    setSupplierFilter(new Set(filterDraft))
    setFilterOpen(false)
  }
  function resetFilter() {
    setFilterDraft(new Set())
    setSupplierFilter(new Set())
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
                  <div className="spo-filter-anchor">
                    <PlatformFilterButton
                      buttonRef={filterButtonRef}
                      active={supplierFilter.size > 0}
                      count={supplierFilter.size > 0 ? supplierFilter.size : null}
                      ariaLabel="Фильтр по поставщику"
                      title="Фильтр по поставщику"
                      ariaExpanded={filterOpen}
                      onClick={() => (filterOpen ? setFilterOpen(false) : openFilterPopover())}
                    />
                    <SupplierFilterPopover
                      open={filterOpen}
                      suppliers={allSupplierNames}
                      draft={filterDraft}
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
            {supplierFilter.size > 0 ? (
              <div className="spo-compact__filter-strip">
                <span>Поставщики:</span>
                {[...supplierFilter].map((name) => (
                  <span key={name} className="spo-compact__filter-chip">
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
                <button
                  type="button"
                  className="spo-compact__filter-clear"
                  onClick={() => setSupplierFilter(new Set())}
                >
                  Очистить всё
                </button>
              </div>
            ) : null}
            <CompactPaymentSchedule
              view={view}
              todayKey={todayKey}
              tabCounts={tabCounts}
              loading={loading}
              error={error}
              supplierFilter={supplierFilter}
              canEditTerms={canEditTerms}
              onOpen={setSelectedGroup}
              onConfigure={openConfigure}
              visibleColumns={visiblePaymentsColumns}
              gridStyle={paymentsGridStyle}
              dragColumnName={dragColumnName}
              dropColumnName={dropColumnName}
              onColumnDragStart={handleColumnDragStart}
              onColumnDragOver={handleColumnDragOver}
              onColumnDrop={handleColumnDrop}
              onColumnDragEnd={handleColumnDragEnd}
              onColumnResizePointerDown={handleColumnResizePointerDown}
              columnSettingsGear={
                <div className="spo-compact__column-settings" ref={columnSettingsPopoverRef}>
                  <button
                    type="button"
                    className="spo-compact__column-settings-btn"
                    aria-expanded={columnSettingsOpen}
                    aria-controls="spo-compact-column-settings-panel"
                    aria-label="Настройки столбцов таблицы"
                    title="Настройки столбцов"
                    onClick={() => setColumnSettingsOpen((open) => !open)}
                  >
                    <PaymentsColumnSettingsIcon size={18} />
                  </button>
                  {columnSettingsOpen ? (
                    <div
                      id="spo-compact-column-settings-panel"
                      className="spo-compact__column-settings-popover"
                      role="dialog"
                      aria-label="Видимость столбцов"
                    >
                      <div className="spo-compact__column-settings-head">
                        <strong>Видимость столбцов</strong>
                        <p>Настройте таблицу под себя — выбор сохранится</p>
                      </div>
                      <div className="spo-compact__column-settings-list">
                        {[...columnSettings.columns]
                          .sort((a, b) => a.columnOrdinalNumber - b.columnOrdinalNumber)
                          .filter((col) => getTogglablePaymentsColumnNames().includes(col.columnName))
                          .map((col) => (
                            <label key={col.columnName} className="spo-compact__column-settings-item">
                              <input
                                type="checkbox"
                                checked={col.visible !== false}
                                onChange={() => handleColumnVisibilityToggle(col.columnName)}
                              />
                              <span>{getPaymentsColumnDef(col.columnName)?.label || col.columnName}</span>
                            </label>
                          ))}
                      </div>
                      <button
                        type="button"
                        className="spo-compact__column-settings-reset btn btn--ghost"
                        onClick={handleResetColumnSettings}
                      >
                        По умолчанию
                      </button>
                    </div>
                  ) : null}
                </div>
              }
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
