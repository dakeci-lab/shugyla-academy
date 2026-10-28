import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import { usePlatformData } from '../../../context/PlatformDataContext'
import { useToast } from '../../../context/ToastContext'
import useStableWhenReady from '../../../hooks/useStableWhenReady'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import { canViewOrders, canEditPurchase, canCreatePurchase } from '../../../config/permissions'
import {
  getPurchaseOrdersSync,
  createPurchaseOrder,
  isPurchasesDataReady,
  isPurchasesDataLoading,
  getPurchasesDataError,
} from '../../../services/purchaseDataService'
import { isCloudMode } from '../../../lib/dataMode'
import { toUserErrorMessage } from '../../../utils/userErrorMessage'
import {
  isOrderDraft,
  isOrderSaved,
  isOrderVisibleToRole,
} from '../../../utils/purchaseData'
import { PROCUREMENT_FRESH_MS } from '../../../lib/procurementFreshness'
import {
  describeSettlementsPeriod,
  getSettlementsPeriodDates,
  SETTLEMENTS_PERIOD_PRESET,
} from '../../../utils/settlementsPeriod'
import { describeOrdersSummary, summarizeOrders } from '../../../utils/ordersSummary'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import PlatformFilterTrigger from '../../../components/platform/PlatformFilterTrigger'
import PeriodFilterPopover from '../../../components/platform/PeriodFilterPopover'
import PurchaseTable from '../../../components/procurement/PurchaseTable'
import AdminModal from '../../../components/admin/AdminModal'
import CreatePurchaseForm, { EMPTY_PURCHASE_FORM } from '../../../components/procurement/CreatePurchaseForm'
import TablePagination from '../../../components/procurement/TablePagination'
import { DelayedLoadingSkeleton } from '../../../components/loading/LoadingSkeleton'
import '../../../components/platform/FilterComboField.css'
import '../../../components/admin/admin-shared.css'
import '../procurement/ProcurementPage.css'
import './OrdersPage.css'

function ordersFilterDefaults() {
  const dates = getSettlementsPeriodDates(SETTLEMENTS_PERIOD_PRESET.TODAY)
  return { periodPreset: SETTLEMENTS_PERIOD_PRESET.TODAY, ...dates }
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
  const canCreate = canCreatePurchase(user)
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_PURCHASE_FORM)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!isCloudMode()) return
    void ensureModules(['suppliers', 'procurement'])
  }, [ensureModules])

  const [filter, setFilter] = useState(() => {
    const { dateFrom, dateTo } = ordersFilterDefaults()
    return { dateFrom, dateTo }
  })
  const [filterDraft, setFilterDraft] = useState(ordersFilterDefaults)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterButtonRef = useRef(null)
  const todayKey = ordersFilterDefaults().dateFrom
  const { dateFrom: periodFrom, dateTo: periodTo } = filter

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
        // Skip the network when the module was loaded moments ago (e.g. bootstrap).
        await reloadProcurement({ maxAgeMs: PROCUREMENT_FRESH_MS })
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

  /**
   * Сохранённые заказы — за период (по дате ожидаемой доставки). Черновики (их видит только закупщик)
   * показываются всегда и сверху: иначе черновик с прошедшей датой доставки потерялся бы.
   */
  const orders = useMemo(() => {
    const visible = stableOrders.filter((order) => isOrderVisibleToRole(order, canEdit))
    const drafts = visible.filter(isOrderDraft).sort(
      (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')
    )
    const saved = visible
      .filter(isOrderSaved)
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
    return [...drafts, ...saved]
  }, [stableOrders, periodFrom, periodTo, canEdit, version, dataVersion])

  function closeCreate() {
    setShowCreate(false)
    setCreateForm(EMPTY_PURCHASE_FORM)
    setCreateError('')
  }

  async function handleCreateDraft() {
    setCreateError('')
    if (!createForm.supplierId && !createForm.supplierName.trim()) {
      setCreateError('Выберите поставщика')
      return
    }
    setCreating(true)
    try {
      const id = await createPurchaseOrder({
        supplierId: createForm.supplierId || null,
        supplierName: createForm.supplierName,
        date: createForm.date,
        expectedDeliveryDate: createForm.expectedDeliveryDate,
        comment: createForm.comment,
        createdBy: user?.login || user?.id || '',
        createdByName: user?.name || '',
      })
      closeCreate()
      navigate(`/platform/orders/${id}`)
    } catch (err) {
      setCreateError(err.message || 'Не удалось создать заказ')
    } finally {
      setCreating(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(orders.length / pageSize))
  const visibleOrders = useMemo(() => {
    const start = (page - 1) * pageSize
    return orders.slice(start, start + pageSize)
  }, [orders, page, pageSize])
  const from = orders.length === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, orders.length)

  useEffect(() => {
    setPage(1)
  }, [periodFrom, periodTo, pageSize])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const periodChanged = periodFrom !== todayKey || periodTo !== todayKey
  const filterActive = periodChanged
  const filterCount = periodChanged ? 1 : 0
  const periodLabel = describeSettlementsPeriod(periodFrom, periodTo)
  const summaryText = describeOrdersSummary(summarizeOrders(orders.filter(isOrderSaved)), {
    periodLabel,
    isToday: !periodChanged,
  })

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
    })
    setFilterOpen(false)
  }

  function resetFilter() {
    const defaults = ordersFilterDefaults()
    setFilterDraft(defaults)
    setFilter({ dateFrom: defaults.dateFrom, dateTo: defaults.dateTo })
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
            <button type="button" className="pf-filter-clear" onClick={resetFilter}>
              Очистить всё
            </button>
          </div>
        ) : null}
        {canCreate ? (
          <button
            type="button"
            className="btn btn--primary btn--sm orders-page__new"
            onClick={() => setShowCreate(true)}
          >
            + Новый заказ
          </button>
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
          </PeriodFilterPopover>
        </div>
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
                .then(() => setProcurementLoadError(null))
                .catch((error) =>
                  setProcurementLoadError(toUserErrorMessage(error, 'Не удалось загрузить заказы с сервера.'))
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
      {showCreate && canCreate && (
        <AdminModal
          title="Новый заказ"
          onClose={closeCreate}
          wide
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={closeCreate}>
                Отмена
              </button>
              <button type="button" className="btn btn--primary" disabled={creating} onClick={handleCreateDraft}>
                {creating ? 'Создание…' : 'Создать черновик'}
              </button>
            </>
          }
        >
          <CreatePurchaseForm form={createForm} onChange={setCreateForm} error={createError} />
        </AdminModal>
      )}
    </div>
  )
}
