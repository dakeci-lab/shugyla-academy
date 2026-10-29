import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../../../context/SessionContext'
import { usePlatformData } from '../../../context/PlatformDataContext'
import { useToast } from '../../../context/ToastContext'
import useStableWhenReady from '../../../hooks/useStableWhenReady'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import { canViewOrders } from '../../../config/permissions'
import {
  getPurchaseOrdersSync,
  isPurchasesDataReady,
  isPurchasesDataLoading,
  getPurchasesDataError,
} from '../../../services/purchaseDataService'
import { isCloudMode } from '../../../lib/dataMode'
import { toUserErrorMessage } from '../../../utils/userErrorMessage'
import { selectReceiverOrders } from '../../../utils/purchaseDocumentsList'
import { PROCUREMENT_FRESH_MS } from '../../../lib/procurementFreshness'
import {
  describeSettlementsPeriod,
  getSettlementsPeriodDates,
  SETTLEMENTS_PERIOD_PRESET,
  SETTLEMENTS_PERIOD_PRESET_OPTIONS,
} from '../../../utils/settlementsPeriod'
import { describeOrdersSummary, summarizeOrders } from '../../../utils/ordersSummary'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import PurchaseTable from '../../../components/procurement/PurchaseTable'
import TablePagination from '../../../components/procurement/TablePagination'
import { DelayedLoadingSkeleton } from '../../../components/loading/LoadingSkeleton'
import '../../../components/admin/admin-shared.css'
import '../procurement/ProcurementPage.css'
import './OrdersPage.css'

/**
 * «Заказы» — /platform/orders: what the receiver sees. Saved orders only (drafts belong to the buyer's «Закуп»),
 * period by delivery date with quick presets, a one-line summary and the list. The document opens read-only.
 */
export default function OrdersPage() {
  const { user } = useSession()
  const { error: showError } = useToast()
  const { loadError, reloadProcurement, ensureModules, version: dataVersion } = usePlatformData()
  const { version } = useAdminRefresh()
  const canView = canViewOrders(user)

  useEffect(() => {
    if (!isCloudMode()) return
    void ensureModules(['suppliers', 'procurement'])
  }, [ensureModules])

  const [preset, setPreset] = useState(SETTLEMENTS_PERIOD_PRESET.TODAY)
  const period = useMemo(() => getSettlementsPeriodDates(preset), [preset])
  const [loadErrorText, setLoadErrorText] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  useEffect(() => {
    if (!canView || !isCloudMode()) return undefined
    let cancelled = false
    void (async () => {
      setRefreshing(true)
      try {
        await reloadProcurement({ maxAgeMs: PROCUREMENT_FRESH_MS })
        if (!cancelled) setLoadErrorText(null)
      } catch (error) {
        const message = toUserErrorMessage(error, 'Не удалось загрузить заказы с сервера.')
        if (!cancelled) {
          setLoadErrorText(message)
          showError(message)
        }
      } finally {
        if (!cancelled) setRefreshing(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canView, reloadProcurement, showError])

  useEffect(() => {
    if (loadError?.message) setLoadErrorText(loadError.message)
  }, [loadError])

  const purchasesReady = !isCloudMode() || isPurchasesDataReady()
  const purchasesLoading =
    isCloudMode() && (isPurchasesDataLoading() || refreshing || !isPurchasesDataReady())
  const stableOrders = useStableWhenReady(getPurchaseOrdersSync(), purchasesReady)
  const hasLoadedOnce = useRef(false)
  if (purchasesReady) hasLoadedOnce.current = true
  const showInitialSkeleton = purchasesLoading && !hasLoadedOnce.current

  const orders = useMemo(
    () => selectReceiverOrders(stableOrders, period),
    [stableOrders, period, version, dataVersion]
  )

  const totalPages = Math.max(1, Math.ceil(orders.length / pageSize))
  const visibleOrders = useMemo(
    () => orders.slice((page - 1) * pageSize, page * pageSize),
    [orders, page, pageSize]
  )
  const from = orders.length === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, orders.length)

  useEffect(() => {
    setPage(1)
  }, [preset, pageSize])
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const isToday = preset === SETTLEMENTS_PERIOD_PRESET.TODAY
  const summaryText = describeOrdersSummary(summarizeOrders(orders), {
    periodLabel: describeSettlementsPeriod(period.dateFrom, period.dateTo),
    isToday,
  })

  if (!canView) return <PlatformAccessDenied title="Нет доступа к разделу «Заказы»" />

  const errorMessage =
    loadErrorText ||
    (getPurchasesDataError()
      ? toUserErrorMessage(getPurchasesDataError(), 'Не удалось загрузить заказы с сервера.')
      : '')

  return (
    <div className="orders-page">
      <div className="orders-page__presets" role="group" aria-label="Период доставки">
        {SETTLEMENTS_PERIOD_PRESET_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={preset === option.id}
            className={`orders-page__preset${preset === option.id ? ' is-on' : ''}`}
            onClick={() => setPreset(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {errorMessage ? (
        <p className="orders-page__error" role="alert">
          {errorMessage}{' '}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true)
              reloadProcurement()
                .then(() => setLoadErrorText(null))
                .catch((error) =>
                  setLoadErrorText(toUserErrorMessage(error, 'Не удалось загрузить заказы с сервера.'))
                )
                .finally(() => setRefreshing(false))
            }}
          >
            Повторить
          </button>
        </p>
      ) : null}

      {showInitialSkeleton ? (
        <DelayedLoadingSkeleton variant="list" count={5} />
      ) : (
        <div className="procurement-list-panel">
          {summaryText ? <p className="orders-page__summary">{summaryText}</p> : null}
          <PurchaseTable orders={visibleOrders} />
          <TablePagination
            page={page}
            totalPages={totalPages}
            from={from}
            to={to}
            totalCount={orders.length}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}
    </div>
  )
}
