import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../../../context/SessionContext'
import { usePlatformData } from '../../../context/PlatformDataContext'
import { useToast } from '../../../context/ToastContext'
import useStableWhenReady from '../../../hooks/useStableWhenReady'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import { canViewOrders, canEditPurchase } from '../../../config/permissions'
import {
  getPurchaseOrdersSync,
  isPurchasesDataReady,
  isPurchasesDataLoading,
  getPurchasesDataError,
} from '../../../services/purchaseDataService'
import { isCloudMode } from '../../../lib/dataMode'
import { toUserErrorMessage } from '../../../utils/userErrorMessage'
import { PURCHASE_STATUS } from '../../../utils/purchaseData'
import {
  describeSettlementsPeriod,
  getSettlementsPeriodDates,
  SETTLEMENTS_PERIOD_PRESET,
} from '../../../utils/settlementsPeriod'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import PlatformFilterTrigger from '../../../components/platform/PlatformFilterTrigger'
import PeriodFilterPopover from '../../../components/platform/PeriodFilterPopover'
import PurchaseTable from '../../../components/procurement/PurchaseTable'
import TablePagination from '../../../components/procurement/TablePagination'
import { DelayedLoadingSkeleton } from '../../../components/loading/LoadingSkeleton'
import '../../../components/platform/FilterComboField.css'
import '../../../components/admin/admin-shared.css'
import '../procurement/ProcurementPage.css'
import './OrdersPage.css'

function ordersFilterDefaults() {
  const dates = getSettlementsPeriodDates(SETTLEMENTS_PERIOD_PRESET.TODAY)
  return { periodPreset: SETTLEMENTS_PERIOD_PRESET.TODAY, ...dates, showCancelled: false }
}

/**
 * «Заказы» — /platform/orders. Созданные заказы поставщикам за период
 * (по дате ожидаемой доставки), общий «Фильтр» с периодом и галочкой
 * «Показать отменённые заказы». Доступ на просмотр — procurement.view или
 * receiving.view; действия (отмена и т.п.) живут в карточке заказа и
 * закрыты правом procurement.create.
 */
export default function OrdersPage() {
  const { user } = useSession()
  const { error: showError } = useToast()
  const { loadError, reloadProcurement, ensureModules, version: dataVersion } = usePlatformData()
  const { version } = useAdminRefresh()
  const canView = canViewOrders(user)
  const canEdit = canEditPurchase(user)

  useEffect(() => {
    if (!isCloudMode()) return
    void ensureModules(['suppliers', 'procurement', 'receiving'])
  }, [ensureModules])

  const [filter, setFilter] = useState(() => {
    const { dateFrom, dateTo, showCancelled } = ordersFilterDefaults()
    return { dateFrom, dateTo, showCancelled }
  })
  const [filterDraft, setFilterDraft] = useState(ordersFilterDefaults)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterButtonRef = useRef(null)
  const todayKey = ordersFilterDefaults().dateFrom
  const { dateFrom: periodFrom, dateTo: periodTo, showCancelled } = filter

  const [procurementLoadError, setProcurementLoadError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    if (!canView || !isCloudMode()) return undefined
    let cancelled = false
    void (async () => {
      setRefreshing(true)
      try {
        await reloadProcurement()
        if (!cancelled) setProcurementLoadError(null)
      } catch (error) {
        const message = toUserErrorMessage(error, 'Не удалось загрузить заказы с сервера.')
        if (!cancelled) {
          setProcurementLoadError(message)
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
    if (loadError?.message) setProcurementLoadError(loadError.message)
  }, [loadError])

  const purchasesReady = !isCloudMode() || isPurchasesDataReady()
  const purchasesLoading =
    isCloudMode() && (isPurchasesDataLoading() || refreshing || !isPurchasesDataReady())
  const stableOrders = useStableWhenReady(getPurchaseOrdersSync(), purchasesReady)

  const hasLoadedOnce = useRef(false)
  if (purchasesReady) hasLoadedOnce.current = true
  const showInitialSkeleton = purchasesLoading && !hasLoadedOnce.current

  /** Заказы периода; отменённые — только по галочке в фильтре. */
  const orders = useMemo(() => {
    return stableOrders
      .filter((order) =>
        showCancelled
          ? order.status === PURCHASE_STATUS.CANCELLED
          : order.status !== PURCHASE_STATUS.CANCELLED
      )
      .filter(
        (order) =>
          order.expectedDeliveryDate &&
          order.expectedDeliveryDate >= periodFrom &&
          order.expectedDeliveryDate <= periodTo
      )
      .sort(
        (a, b) =>
          (b.expectedDeliveryDate || '').localeCompare(a.expectedDeliveryDate || '') ||
          (a.supplierName || '').localeCompare(b.supplierName || '', 'ru')
      )
  }, [stableOrders, showCancelled, periodFrom, periodTo, version, dataVersion])

  const totalPages = Math.max(1, Math.ceil(orders.length / pageSize))
  const visibleOrders = useMemo(() => {
    const start = (page - 1) * pageSize
    return orders.slice(start, start + pageSize)
  }, [orders, page, pageSize])
  const from = orders.length === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, orders.length)

  useEffect(() => {
    setPage(1)
  }, [periodFrom, periodTo, pageSize, showCancelled])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const periodChanged = periodFrom !== todayKey || periodTo !== todayKey
  const filterActive = periodChanged || showCancelled
  const filterCount = (periodChanged ? 1 : 0) + (showCancelled ? 1 : 0)
  const periodLabel = describeSettlementsPeriod(periodFrom, periodTo)

  function toggleFilter() {
    if (filterOpen) {
      setFilterOpen(false)
      return
    }
    setFilterDraft((current) => ({ ...current, ...filter }))
    setFilterOpen(true)
  }

  function applyFilter() {
    if (!filterDraft.dateFrom || !filterDraft.dateTo || filterDraft.dateFrom > filterDraft.dateTo) return
    setFilter({
      dateFrom: filterDraft.dateFrom,
      dateTo: filterDraft.dateTo,
      showCancelled: Boolean(filterDraft.showCancelled),
    })
    setFilterOpen(false)
  }

  function resetFilter() {
    const defaults = ordersFilterDefaults()
    setFilterDraft(defaults)
    setFilter({ dateFrom: defaults.dateFrom, dateTo: defaults.dateTo, showCancelled: false })
    setFilterOpen(false)
  }

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Заказы»" />
  }

  const errorMessage =
    procurementLoadError ||
    (getPurchasesDataError()
      ? toUserErrorMessage(getPurchasesDataError(), 'Не удалось загрузить заказы с сервера.')
      : '')

  return (
    <div className="orders-page">
      <div className="orders-page__bar">
        <div className="orders-page__tabs" role="tablist" aria-label="Раздел">
          <span role="tab" aria-selected="true" className="orders-page__tab">
            Заказы
          </span>
        </div>
        {filterActive ? (
          <div className="pf-filter-strip orders-page__strip">
            {periodChanged ? (
              <>
                <span>Период:</span>
                <span className="pf-filter-chip">
                  {periodLabel}
                  <button
                    type="button"
                    aria-label="Сбросить период"
                    onClick={() =>
                      setFilter((current) => ({ ...current, dateFrom: todayKey, dateTo: todayKey }))
                    }
                  >
                    ×
                  </button>
                </span>
              </>
            ) : null}
            {showCancelled ? (
              <span className="pf-filter-chip">
                Отменённые
                <button
                  type="button"
                  aria-label="Скрыть отменённые"
                  onClick={() => setFilter((current) => ({ ...current, showCancelled: false }))}
                >
                  ×
                </button>
              </span>
            ) : null}
            <button type="button" className="pf-filter-clear" onClick={resetFilter}>
              Очистить всё
            </button>
          </div>
        ) : null}
        <div className="pf-filter-anchor orders-page__filter">
          <PlatformFilterTrigger
            ref={filterButtonRef}
            active={filterActive}
            count={filterCount}
            open={filterOpen}
            onClick={toggleFilter}
          />
          <PeriodFilterPopover
            open={filterOpen}
            draft={filterDraft}
            onChange={setFilterDraft}
            onApply={applyFilter}
            onReset={resetFilter}
            onClose={() => setFilterOpen(false)}
            anchorRef={filterButtonRef}
            getDefaults={ordersFilterDefaults}
          >
            <label className="period-filter-popover__option">
              <input
                type="checkbox"
                checked={Boolean(filterDraft.showCancelled)}
                onChange={(event) =>
                  setFilterDraft((current) => ({ ...current, showCancelled: event.target.checked }))
                }
              />
              Показать отменённые заказы
            </label>
          </PeriodFilterPopover>
        </div>
      </div>

      {errorMessage ? (
        <p className="orders-page__error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {showInitialSkeleton ? (
        <DelayedLoadingSkeleton variant="list" count={5} />
      ) : (
        <div className="procurement-list-panel">
          <PurchaseTable orders={visibleOrders} canEdit={false} />
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
