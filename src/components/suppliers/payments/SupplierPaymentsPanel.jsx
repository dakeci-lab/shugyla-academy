import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
import './SupplierPaymentsPanel.css'

function SummaryCard({ label, value, tone, loading }) {
  return (
    <div className={`spo-panel__summary spo-panel__summary--${tone || 'default'}`}>
      <div className="spo-panel__summary-label">{label}</div>
      <div className="spo-panel__summary-value">{loading ? '…' : formatUmagMoney(value)}</div>
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

function formatDateHeading(dueDate, todayKey) {
  const label = formatUmagDate(`${dueDate}T12:00:00+05:00`)
  if (dueDate < todayKey) return `Просрочено · ${label}`
  if (dueDate === todayKey) return `Сегодня · ${label}`
  return label
}

function GroupDetail({ group, todayKey, canEditTerms, onClose }) {
  if (!group) return null
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
            <h3>{group.name}</h3>
            <p className="spo-panel__muted">
              {group.dueDate
                ? formatDaysUntilDue(group.dueDate, todayKey)
                : 'Срок оплаты поставщика не настроен'}
            </p>
          </div>
          <button type="button" className="spo-panel__sheet-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="spo-panel__sheet-total">{formatUmagMoney(group.amount)}</div>
        <div className="spo-panel__muted">{group.count} приёмки</div>

        {group.status === OBLIGATION_STATUS.TERMS_MISSING && canEditTerms ? (
          <Link
            className="btn btn-primary spo-panel__configure-btn"
            to={`/platform/suppliers/${group.platformSupplierId}`}
          >
            Настроить условия
          </Link>
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

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchSupplierPaymentsDashboard()
      setView(data.view)
      setTodayKey(data.todayKey)
      setLastRun(data.lastRun)
    } catch (err) {
      setError(err.message || 'Не удалось загрузить календарь оплат')
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
    await load()
  }

  const summaries = view?.summaries
  const staleWarning = useMemo(() => {
    const finished = lastRun?.finished_at || lastRun?.started_at
    if (!finished) return 'Данные ещё не синхронизировались.'
    const ageMs = Date.now() - new Date(finished).getTime()
    if (ageMs > 24 * 60 * 60 * 1000) {
      return 'Последняя синхронизация была больше суток назад. Обновите данные перед планированием оплат.'
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
          <h2 className="spo-panel__title">Календарь оплат</h2>
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
                ({lastRun.status === 'partial' ? 'частично' : lastRun.status === 'failed' ? 'ошибка' : lastRun.status})
              </span>
            ) : null}
          </div>
        </div>
        {canSync ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? 'Синхронизация…' : 'Синхронизировать'}
          </button>
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

      <div className="spo-panel__totals" aria-label="Сводка оплат">
        <SummaryCard label="Сегодня к оплате" value={summaries?.dueToday} tone="today" loading={loading} />
        <SummaryCard label="Ближайшие 7 дней" value={summaries?.next7Days} tone="upcoming" loading={loading} />
        <SummaryCard label="Просрочено" value={summaries?.overdue} tone="overdue" loading={loading} />
        <SummaryCard
          label="Отсроченная задолженность"
          value={summaries?.deferredNotYetDue}
          tone="deferred"
          loading={loading}
        />
        {(summaries?.termsMissing || 0) > 0 ? (
          <SummaryCard
            label="Требует настройки"
            value={summaries?.termsMissing}
            tone="missing"
            loading={loading}
          />
        ) : null}
      </div>

      <section className="spo-panel__forecast" aria-label="Прогноз платежей">
        <h3 className="spo-panel__section-title">Прогноз платежей</h3>
        <div className="spo-panel__forecast-grid">
          <div>
            <span>3 дня</span>
            <strong>{loading ? '…' : formatUmagMoney(summaries?.forecast3)}</strong>
          </div>
          <div>
            <span>7 дней</span>
            <strong>{loading ? '…' : formatUmagMoney(summaries?.forecast7)}</strong>
          </div>
          <div>
            <span>14 дней</span>
            <strong>{loading ? '…' : formatUmagMoney(summaries?.forecast14)}</strong>
          </div>
          <div>
            <span>30 дней</span>
            <strong>{loading ? '…' : formatUmagMoney(summaries?.forecast30)}</strong>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="spo-panel__empty">Загрузка календаря…</div>
      ) : error ? (
        <div className="spo-panel__error" role="alert">
          {error}
        </div>
      ) : (
        <>
          {view?.termsMissing?.length ? (
            <section className="spo-panel__section" aria-label="Требует настройки">
              <h3 className="spo-panel__section-title">Требует настройки</h3>
              <div className="spo-panel__cards">
                {view.termsMissing.map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    className="spo-panel__card spo-panel__card--missing"
                    onClick={() => setSelectedGroup(group)}
                  >
                    <div className="spo-panel__card-title">{group.name}</div>
                    <div className="spo-panel__card-amount">{formatUmagMoney(group.amount)}</div>
                    <div className="spo-panel__card-meta">
                      Срок оплаты поставщика не настроен · {group.count} приёмки
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="spo-panel__section" aria-label="План оплат">
            <h3 className="spo-panel__section-title">План оплат</h3>
            {!view?.dateGroups?.length ? (
              <div className="spo-panel__empty">
                Нет открытых обязательств с назначенным сроком оплаты
              </div>
            ) : (
              view.dateGroups.map((dateGroup) => (
                <div key={dateGroup.dueDate} className="spo-panel__date-block">
                  <h4 className={`spo-panel__date-title spo-panel__date-title--${dateGroup.kind}`}>
                    {formatDateHeading(dateGroup.dueDate, todayKey)}
                  </h4>
                  <div className="spo-panel__cards">
                    {dateGroup.suppliers.map((group) => (
                      <button
                        key={group.key}
                        type="button"
                        className={`spo-panel__card spo-panel__card--${statusTone(group.status)}`}
                        onClick={() => setSelectedGroup(group)}
                      >
                        <div className="spo-panel__card-title">{group.name}</div>
                        <div className="spo-panel__card-amount">
                          {formatUmagMoney(group.amount)}
                        </div>
                        <div className="spo-panel__card-meta">
                          {formatDaysUntilDue(group.dueDate, todayKey)} · {group.count}{' '}
                          {group.count === 1 ? 'приёмка' : 'приёмки'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      )}

      {selectedGroup ? (
        <GroupDetail
          group={selectedGroup}
          todayKey={todayKey}
          canEditTerms={canEditTerms}
          onClose={() => setSelectedGroup(null)}
        />
      ) : null}
    </div>
  )
}
