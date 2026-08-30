/**
 * Расчёты — Этап 2.7: hidden unified shell over the existing embedded panels.
 *
 * Owns exactly what the future page needs to own once: the 4 KPIs + lastSync
 * (fetchSupplierFinanceSummary(), Этап 2.4 — not reinvented), the tab/URL
 * state, and the single ↻ action (existing syncUmagSettlements() pipeline).
 * Everything else is delegated to the already-embeddable panels (Этап 2.6).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import {
  canSyncUmagSettlements,
  canViewSupplierPayments,
  canViewUmagSettlements,
} from '../../../config/permissions'
import {
  UMAG_SETTLEMENTS_ERROR_CODES,
  fetchLastUmagSyncRun,
  formatUmagMoney,
  syncUmagSettlements,
} from '../../../services/umagSettlementsService'
import { fetchSupplierFinancePageData } from '../../../services/supplierFinanceSummaryService'
import { toAqtobeDateKey } from '../../../utils/supplierPaymentObligations'
import { getMonthRangeKeys } from '../../../utils/settlementsPeriod'
import {
  describeSyncStatus,
  monthLabelFromDateKey,
  resolveActiveTab,
} from '../../../utils/supplierFinancePagePresentation'
import PlatformSyncButton from '../../platform/PlatformSyncButton'
import SupplierPaymentsPanel from '../payments/SupplierPaymentsPanel'
import UmagSettlementsPanel from '../settlements/UmagSettlementsPanel'
import './SupplierFinancePanel.css'

const TABS = [
  { id: 'payments', label: 'К оплате' },
  { id: 'settlements', label: 'Взаиморасчёты' },
]

function KpiTile({ label, value, tone, loading, unavailable }) {
  const display = loading ? '…' : unavailable ? '—' : formatUmagMoney(value)
  return (
    <div className={`sfp-panel__kpi${tone ? ` sfp-panel__kpi--${tone}` : ''}`}>
      <div className="sfp-panel__kpi-label">{label}</div>
      <div className="sfp-panel__kpi-value">{display}</div>
    </div>
  )
}

export default function SupplierFinancePanel() {
  const { user } = useSession()
  const toast = useToast()
  const showSuccess = toast.success
  const showError = toast.error
  const showWarning = typeof toast.warning === 'function' ? toast.warning : showError

  const canViewPayments = canViewSupplierPayments(user)
  const canViewSettlements = canViewUmagSettlements(user)
  const canSync = canSyncUmagSettlements(user)

  const allowedTabs = useMemo(() => {
    const list = []
    if (canViewPayments) list.push('payments')
    if (canViewSettlements) list.push('settlements')
    return list
  }, [canViewPayments, canViewSettlements])

  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeTab = resolveActiveTab(rawTab, allowedTabs)

  // Item 14/9 (Case 9): normalize/replace an invalid or forbidden ?tab= to
  // the first allowed tab, without adding a history entry.
  useEffect(() => {
    if (!activeTab) return
    if (rawTab === activeTab) return
    const params = new URLSearchParams(searchParams)
    params.set('tab', activeTab)
    setSearchParams(params, { replace: true })
  }, [activeTab, rawTab, searchParams, setSearchParams])

  function handleTabChange(tabId) {
    if (tabId === activeTab || !allowedTabs.includes(tabId)) return
    const params = new URLSearchParams(searchParams)
    params.set('tab', tabId)
    setSearchParams(params, { replace: false })
  }

  const [summary, setSummary] = useState(null)
  const [obligations, setObligations] = useState(null)
  const [lastSync, setLastSync] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true)
    setSummaryError('')
    try {
      // Item 16: fetchSupplierFinanceSummary() reads supplier_payment_obligations,
      // gated by supplier_payments.view/suppliers.view RLS — a settlements-only
      // user would silently get 0 rows there (RLS filters, it doesn't error),
      // which would show as a fabricated "Долг = 0". Only call it when the
      // user actually has the permission that makes it safe to trust.
      if (canViewPayments) {
        const pageData = await fetchSupplierFinancePageData()
        setSummary(pageData.summary)
        setObligations(pageData.obligations)
        setLastSync(pageData.summary.lastSync)
      } else {
        setSummary(null)
        setObligations(null)
        if (canViewSettlements) {
          setLastSync(await fetchLastUmagSyncRun())
        }
      }
    } catch (err) {
      setSummaryError(err.message || 'Не удалось загрузить сводку')
      setSummary(null)
      setObligations(null)
    } finally {
      setSummaryLoading(false)
    }
  }, [canViewPayments, canViewSettlements])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  async function handleSync() {
    if (!canSync || syncing) return
    setSyncing(true)
    try {
      // Item 23/24: a neutral current-month range, never the Settlements VIEW
      // PERIOD (SettlementsFilterPopover's dateFrom/dateTo never reach here —
      // this component doesn't even import that period state). The Этап 2.2
      // backend independently widens this to the real effective sync scope.
      const todayKey = summary?.todayKey || toAqtobeDateKey()
      const [year, month] = todayKey.split('-').map(Number)
      const { dateFrom } = getMonthRangeKeys(year, month)

      const result = await syncUmagSettlements({ dateFrom, dateTo: todayKey, syncSuppliers: true })

      if (!result.success) {
        if (result.code === UMAG_SETTLEMENTS_ERROR_CODES.SYNC_ALREADY_RUNNING) {
          showWarning(result.message)
          await loadSummary()
        } else {
          showError(result.message)
        }
        return
      }

      if (result.status === 'partial' || result.warning) {
        showWarning(result.warning || result.message)
      } else {
        showSuccess(result.message)
      }

      await loadSummary()
      setRefreshToken((token) => token + 1)
    } catch (err) {
      showError(err?.message || 'Не удалось синхронизировать')
    } finally {
      setSyncing(false)
    }
  }

  if (!canViewPayments && !canViewSettlements) {
    return null
  }

  const monthLabel = monthLabelFromDateKey(summary?.todayKey)
  const paidUnavailable = summary?.paidThisMonth?.status === 'unavailable'
  const syncStatus = describeSyncStatus(lastSync)
  const activeTabMeta = TABS.find((tab) => tab.id === activeTab)

  const showKpis = canViewPayments && activeTabMeta?.id === 'payments'

  return (
    <div className="sfp-panel">
      <h1 className="sfp-panel__title">Расчёты</h1>

      <div className="sfp-panel__bar">
        <div className="sfp-panel__tabs" role="tablist" aria-label="Раздел">
          {TABS.filter((tab) => allowedTabs.includes(tab.id)).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`sfp-panel__tab${activeTab === tab.id ? ' sfp-panel__tab--active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="sfp-panel__sync">
          <span
            className={`sfp-panel__sync-status sfp-panel__sync-status--${syncStatus.tone}`}
            title={syncStatus.title || undefined}
          >
            {syncStatus.text}
          </span>
          {canSync ? (
            <PlatformSyncButton
              onClick={() => void handleSync()}
              syncing={syncing}
              disabled={!canSync || syncing}
              title="Синхронизация UMAG"
              aria-label="Синхронизация UMAG"
            />
          ) : null}
        </div>
      </div>

      {/* Item: КПИ и её ошибка загрузки относятся к сводке «К оплате»
          (fetchSupplierFinancePageData) — «Взаиморасчёты» её не использует
          и самостоятельно тянет свои итоги, поэтому обе привязаны к
          активной вкладке, а не показываются на обеих постоянно. */}
      {showKpis && summaryError && !summary ? (
        <div className="sfp-panel__error" role="alert">
          {summaryError}
        </div>
      ) : null}

      {showKpis ? (
        <div className="sfp-panel__kpis" aria-label="Сводные показатели">
          <KpiTile label="Долг" value={summary?.debt} loading={summaryLoading && !summary} />
          <KpiTile
            label="Просрочено"
            value={summary?.overdue?.amount}
            tone="overdue"
            loading={summaryLoading && !summary}
          />
          <KpiTile
            label="Сегодня"
            value={summary?.dueToday?.amount}
            tone="today"
            loading={summaryLoading && !summary}
          />
          <KpiTile
            label={monthLabel ? `Оплачено · ${monthLabel}` : 'Оплачено'}
            value={summary?.paidThisMonth?.amount}
            loading={summaryLoading && !summary}
            unavailable={paidUnavailable}
          />
        </div>
      ) : null}

      {activeTabMeta?.id === 'payments' ? (
        <SupplierPaymentsPanel
          embedded
          externalSummaryProvided
          summary={summary}
          summaryLoading={summaryLoading}
          obligations={obligations}
          refreshToken={refreshToken}
        />
      ) : null}

      {activeTabMeta?.id === 'settlements' ? (
        <UmagSettlementsPanel embedded refreshToken={refreshToken} />
      ) : null}
    </div>
  )
}
