import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../../../context/SessionContext'
import { canViewSales, canSyncSales } from '../../../config/permissions'
import { isCloudMode } from '../../../lib/dataMode'
import {
  fetchSalesCategoryMonthFacts,
  fetchSalesMonthReceiptFacts,
  fetchLatestSalesSyncRun,
  syncNextSalesMonth,
  backfillSalesReceipts,
  resyncSalesMonth,
  formatMonthLabel,
} from '../../../services/salesDataService'
import { DelayedLoadingSkeleton } from '../../../components/loading/LoadingSkeleton'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import { RefreshIcon } from '../../../components/icons/PlatformIcons'
import SalesCategoriesView from '../../../components/sales/SalesCategoriesView'
import SalesAnalysisView from '../../../components/sales/SalesAnalysisView'
import SalesDigitizationView from '../../../components/sales/SalesDigitizationView'
import './SalesPage.css'

const HISTORY_START_MONTH = '2025-01-01'

/** Продажи: Анализ (по умолчанию) / Продажи / Оцифровка — /platform/sales */
export default function SalesPage() {
  const { user } = useSession()
  const canView = canViewSales(user)
  const canSync = canSyncSales(user)

  const [mainTab, setMainTab] = useState('analysis')
  const [facts, setFacts] = useState([])
  const [receiptFacts, setReceiptFacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [syncRun, setSyncRun] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncProgressLabel, setSyncProgressLabel] = useState('')
  const [syncError, setSyncError] = useState('')
  const [resyncMonth, setResyncMonth] = useState('')
  const [resyncing, setResyncing] = useState(false)
  const [resyncError, setResyncError] = useState('')

  const requestRef = useRef(0)

  const loadFacts = useCallback(async () => {
    const requestId = ++requestRef.current
    setLoading(true)
    setLoadError('')
    try {
      const [rows, receiptRows, latestRun] = await Promise.all([
        fetchSalesCategoryMonthFacts({ monthFrom: HISTORY_START_MONTH }),
        fetchSalesMonthReceiptFacts(),
        fetchLatestSalesSyncRun(),
      ])
      if (requestId !== requestRef.current) return
      setFacts(rows)
      setReceiptFacts(receiptRows)
      setSyncRun(latestRun)
    } catch (err) {
      if (requestId !== requestRef.current) return
      setLoadError(err?.message || 'Не удалось загрузить данные продаж.')
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!canView || !isCloudMode()) {
      setLoading(false)
      return
    }
    void loadFacts()
  }, [canView, loadFacts])

  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    setSyncError('')
    try {
      let result = await syncNextSalesMonth()
      setSyncProgressLabel(result.monthSynced ? formatMonthLabel(result.monthSynced) : '')
      while (result?.success && !result.upToDate) {
        result = await syncNextSalesMonth()
        setSyncProgressLabel(result.monthSynced ? formatMonthLabel(result.monthSynced) : '')
      }
      let receiptResult = await backfillSalesReceipts()
      while (receiptResult?.success && !receiptResult.upToDate) {
        setSyncProgressLabel(
          receiptResult.monthFilled ? `Чеки: ${formatMonthLabel(receiptResult.monthFilled)}` : 'Чеки…'
        )
        receiptResult = await backfillSalesReceipts()
      }
      await loadFacts()
    } catch (err) {
      setSyncError(err?.message || 'Не удалось синхронизировать продажи из UMAG.')
    } finally {
      setSyncing(false)
      setSyncProgressLabel('')
    }
  }

  async function handleResyncMonth() {
    if (resyncing || !resyncMonth) return
    setResyncing(true)
    setResyncError('')
    try {
      await resyncSalesMonth(resyncMonth)
      await loadFacts()
    } catch (err) {
      setResyncError(err?.message || 'Не удалось пересинхронизировать месяц.')
    } finally {
      setResyncing(false)
    }
  }

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Продажи»" />
  }

  if (!isCloudMode()) {
    return <p className="sales-page__empty">Раздел «Продажи» доступен только в облачном режиме.</p>
  }

  const latestMonthKey = facts.length > 0 ? facts[facts.length - 1].monthKey : null
  const receiptsByMonth = useMemo(
    () => new Map(receiptFacts.map((row) => [row.monthKey, row.receiptCount])),
    [receiptFacts]
  )
  const availableMonths = useMemo(
    () => [...new Set(facts.map((row) => row.monthKey))].sort().reverse(),
    [facts]
  )

  useEffect(() => {
    if (!resyncMonth && availableMonths.length > 0) setResyncMonth(availableMonths[0])
  }, [availableMonths, resyncMonth])

  return (
    <div className="sales-page">
      <div className="sales-page__tabs-row">
        <div className="sales-page__tabs" role="tablist" aria-label="Разделы продаж">
          <button
            type="button"
            role="tab"
            className={mainTab === 'analysis' ? 'sales-page__tab is-active' : 'sales-page__tab'}
            aria-selected={mainTab === 'analysis'}
            onClick={() => setMainTab('analysis')}
          >
            Анализ
          </button>
          <button
            type="button"
            role="tab"
            className={mainTab === 'categories' ? 'sales-page__tab is-active' : 'sales-page__tab'}
            aria-selected={mainTab === 'categories'}
            onClick={() => setMainTab('categories')}
          >
            Продажи
          </button>
          <button
            type="button"
            role="tab"
            className={
              mainTab === 'digitization' ? 'sales-page__tab is-active' : 'sales-page__tab'
            }
            aria-selected={mainTab === 'digitization'}
            onClick={() => setMainTab('digitization')}
          >
            Оцифровка
          </button>
        </div>

        {canSync ? (
          <div className="sales-page__sync">
            {syncRun?.status === 'success' && !syncing ? (
              <span className="sales-page__sync-status">
                {syncRun.monthFrom ? `Обновлено по ${formatMonthLabel(syncRun.monthFrom)}` : ''}
              </span>
            ) : null}
            {syncing && syncProgressLabel ? (
              <span className="sales-page__sync-status">Синхронизация: {syncProgressLabel}…</span>
            ) : null}
            <button
              type="button"
              className="btn btn--outline sales-page__sync-btn"
              onClick={() => void handleSync()}
              disabled={syncing}
            >
              <span
                className={
                  syncing
                    ? 'sales-page__sync-icon sales-page__sync-icon--spinning'
                    : 'sales-page__sync-icon'
                }
                aria-hidden="true"
              >
                <RefreshIcon size={18} />
              </span>
              {syncing ? 'Синхронизация…' : 'Синхронизировать'}
            </button>
          </div>
        ) : null}
      </div>

      {syncError ? (
        <div className="sales-page__error" role="alert">
          {syncError}
        </div>
      ) : null}

      {canSync && availableMonths.length > 0 ? (
        <div className="sales-page__resync">
          <span className="sales-page__resync-label">
            Пересинхронизировать месяц (например, после исправления категорий в UMAG):
          </span>
          <select
            className="sales-page__resync-select"
            value={resyncMonth}
            onChange={(e) => setResyncMonth(e.target.value)}
            disabled={resyncing}
          >
            {availableMonths.map((monthKey) => (
              <option key={monthKey} value={monthKey}>
                {formatMonthLabel(monthKey)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn--ghost sales-page__resync-btn"
            onClick={() => void handleResyncMonth()}
            disabled={resyncing || syncing}
          >
            {resyncing ? 'Пересинхронизация…' : 'Пересинхронизировать'}
          </button>
        </div>
      ) : null}

      {resyncError ? (
        <div className="sales-page__error" role="alert">
          {resyncError}
        </div>
      ) : null}

      {loading && facts.length === 0 ? (
        <DelayedLoadingSkeleton variant="table" count={8} />
      ) : loadError ? (
        <div className="sales-page__error" role="alert">
          {loadError}
        </div>
      ) : facts.length === 0 ? (
        <p className="sales-page__empty">
          Данных пока нет.
          {canSync
            ? ' Нажмите «Синхронизировать», чтобы загрузить продажи из UMAG.'
            : ' Обратитесь к администратору для синхронизации с UMAG.'}
        </p>
      ) : mainTab === 'analysis' ? (
        <SalesAnalysisView facts={facts} latestMonthKey={latestMonthKey} receiptsByMonth={receiptsByMonth} />
      ) : mainTab === 'categories' ? (
        <SalesCategoriesView facts={facts} latestMonthKey={latestMonthKey} receiptsByMonth={receiptsByMonth} />
      ) : (
        <SalesDigitizationView facts={facts} />
      )}
    </div>
  )
}
