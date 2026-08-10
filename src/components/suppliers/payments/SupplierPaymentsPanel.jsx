import { useCallback, useEffect, useMemo, useState } from 'react'
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
  formatDaysUntilDue,
  formatPaymentTermsSnapshot,
  formatReceptionCount,
  pickDefaultPaymentTab,
} from '../../../utils/supplierPaymentObligations'
import {
  fetchSupplierPaymentsDashboard,
  formatUmagDate,
  formatUmagDateTime,
  formatUmagMoney,
  syncUmagForPayments,
  toAqtobeDateKey,
} from '../../../services/supplierPaymentObligationsService'
import { getMonthPeriodKeys } from '../../../services/umagSettlementsService'
import PlatformAccessDenied from '../../platform/PlatformAccessDenied'
import PlatformSyncButton from '../../platform/PlatformSyncButton'
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

  return (
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
    </div>
  )
}

export default function SupplierPaymentsPanel() {
  const { user } = useSession()
  const toast = useToast()
  const navigate = useNavigate()
  const canView = canViewSupplierPayments(user)
  const canSync = canSyncUmagSettlements(user)
  const canEditTerms = canEditSuppliers(user)

  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState(null)
  const [todayKey, setTodayKey] = useState(() => toAqtobeDateKey())
  const [lastRun, setLastRun] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [activeTab, setActiveTab] = useState('overdue')
  const [tabTouched, setTabTouched] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchSupplierPaymentsDashboard()
      setView(data.view)
      setTodayKey(data.todayKey)
      setLastRun(data.lastRun)
    } catch (err) {
      setError(err.message || 'Не удалось загрузить оплаты поставщикам')
      setView(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!canView) return
    void load()
  }, [canView, load])

  useEffect(() => {
    if (!view || tabTouched) return
    setActiveTab(pickDefaultPaymentTab(view.tabCounts))
  }, [view, tabTouched])

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState !== 'visible') return
      const finished = lastRun?.finished_at || lastRun?.started_at
      if (!finished) {
        void load()
        return
      }
      const ageMs = Date.now() - new Date(finished).getTime()
      if (ageMs > 30 * 60 * 1000) void load()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [lastRun, load])

  async function handleSync() {
    if (!canSync || syncing) return
    setSyncing(true)
    const period = getMonthPeriodKeys()
    const result = await syncUmagForPayments({
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
    })
    setSyncing(false)
    if (!result.success) {
      toast.error?.(result.message)
      return
    }
    if (result.status === 'partial' || result.warning) {
      toast.warning?.(result.warning || result.message)
    } else {
      toast.success?.(result.message || 'Синхронизация выполнена.')
    }
    setTabTouched(false)
    await load()
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
        returnTo: '/platform/supplier-payments',
      },
    })
  }

  const summaries = view?.summaries
  const tabCounts = view?.tabCounts || {}
  const visibleGroups = view?.lists?.[activeTab] || []
  const activeTabMeta = TABS.find((tab) => tab.id === activeTab) || TABS[0]

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

      {lastRun?.warning_message ? (
        <div className="spo-panel__warning" role="status">
          {lastRun.warning_message}
        </div>
      ) : null}

      {staleWarning ? (
        <div className="spo-panel__warning" role="status">
          {staleWarning}
        </div>
      ) : null}

      <div className="spo-panel__kpis" aria-label="Сводка оплат">
        <KpiCard
          label="Общий долг поставщикам"
          value={summaries?.totalActiveDebt}
          tone="total"
          primary
          loading={loading && !view}
        />
        <KpiCard
          label="Просрочено"
          value={summaries?.overdue}
          tone="overdue"
          loading={loading && !view}
        />
        <KpiCard
          label="Сегодня к оплате"
          value={summaries?.dueToday}
          tone="today"
          loading={loading && !view}
        />
      </div>

      <section className="spo-panel__plan" aria-label="К оплате">
        <div className="spo-panel__plan-head">
          <h3 className="spo-panel__section-title">К оплате</h3>
        </div>

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
