import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import {
  canEditSuppliers,
  canSyncUmagSettlements,
  canViewSupplierPayments,
} from '../../../config/permissions'
import {
  OBLIGATION_STATUS,
  OBLIGATION_STATUS_LABELS,
  diffCalendarDays,
  formatDaysUntilDue,
  formatPaymentTermsSnapshot,
  formatReceptionCount,
  formatSyncCoverage,
  pickDefaultPaymentTab,
} from '../../../utils/supplierPaymentObligations'
import {
  buildPaymentScheduleView,
  formatUmagDate,
  formatUmagDateTime,
  formatUmagMoney,
  listPaymentObligations,
  syncUmagForPayments,
  toAqtobeDateKey,
} from '../../../services/supplierPaymentObligationsService'
import { fetchSupplierFinanceSummary } from '../../../services/supplierFinanceSummaryService'
import { getMonthPeriodKeys } from '../../../services/umagSettlementsService'
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

function CompactObligationRow({ group, todayKey, canEditTerms, onOpen, onConfigure }) {
  const tone = statusTone(group.status)
  const isMissing = group.status === OBLIGATION_STATUS.TERMS_MISSING
  const mapped = Boolean(group.platformSupplierId)
  const statusText = formatCompactStatusText(group, todayKey)

  return (
    <div className={`spo-compact__row spo-compact__row--${tone}`}>
      <button type="button" className="spo-compact__row-main" onClick={() => onOpen(group)}>
        <span className="spo-compact__supplier">{group.name || 'Без названия'}</span>
        <span className="spo-compact__due">{formatCompactDueDate(group.dueDate)}</span>
        <span className={`spo-compact__status spo-compact__status--${tone}`}>{statusText}</span>
        <span className="spo-compact__amount">{formatUmagMoney(group.amount)}</span>
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
function MissingTermsBanner({ groups, amount, expanded, onToggle, todayKey, canEditTerms, onOpen, onConfigure }) {
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
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function CompactColumnsHead() {
  return (
    <div className="spo-compact__head" role="row">
      <span role="columnheader">Поставщик</span>
      <span role="columnheader">Срок</span>
      <span role="columnheader">Статус</span>
      <span role="columnheader">Сумма</span>
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
      />

      {filteredSections.length > 0 ? (
        <div className="spo-compact__wrap">
          <CompactColumnsHead />
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

function GroupDetail({ group, todayKey, canEditTerms, onClose, onConfigure }) {
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
          {(group.obligations || []).map((ob) => (
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
                <span>Условия</span>
                <strong>{formatPaymentTermsSnapshot(ob)}</strong>
                <span>Статус</span>
                <strong>{OBLIGATION_STATUS_LABELS[group.status] || '—'}</strong>
              </div>
            </li>
          ))}
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

  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(summaryProp)
  const [view, setView] = useState(null)
  const [todayKey, setTodayKey] = useState(() => toAqtobeDateKey())
  const [lastRun, setLastRun] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [activeTab, setActiveTab] = useState('overdue')
  const [tabTouched, setTabTouched] = useState(false)
  const [supplierFilter, setSupplierFilter] = useState(() => new Set())
  const [filterDraft, setFilterDraft] = useState(() => new Set())
  const [filterSearch, setFilterSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const filterButtonRef = useRef(null)

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
        returnTo: embedded
          ? '/platform/supplier-finance?tab=payments'
          : '/platform/supplier-payments',
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
          onClose={() => setSelectedGroup(null)}
          onConfigure={openConfigure}
        />
      ) : null}
    </div>
  )
}
