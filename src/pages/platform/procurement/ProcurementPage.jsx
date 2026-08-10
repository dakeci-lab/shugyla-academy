import { useMemo, useRef, useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import { usePlatformData } from '../../../context/PlatformDataContext'
import { useToast } from '../../../context/ToastContext'
import useStableWhenReady from '../../../hooks/useStableWhenReady'
import { DelayedLoadingSkeleton } from '../../../components/loading/LoadingSkeleton'
import {
  canViewPurchases,
  canCreatePurchase,
  canEditSimplePurchase,
  canEditPurchase,
} from '../../../config/permissions'
import {
  getPurchaseOrdersSync,
  updatePurchaseOrder,
  isPurchasesDataReady,
  isPurchasesDataLoading,
  getPurchasesDataError,
} from '../../../services/purchaseDataService'
import {
  getReceivingDocumentsSync,
  isReceivingDataReady,
} from '../../../services/receivingDataService'
import { getAllSuppliersSync, getSupplierByIdSync } from '../../../utils/supplierData'
import {
  createSimplePurchaseOptimistic,
  deleteSimplePurchaseOptimistic,
  retrySimplePurchaseSync,
} from '../../../services/purchaseOptimisticService'
import { isCloudMode } from '../../../lib/dataMode'
import { toUserErrorMessage } from '../../../utils/userErrorMessage'
import {
  buildExpectedDeliveryEntries,
  filterSimplePurchases,
} from '../../../utils/procurementWorkflow'
import { PURCHASE_STATUS } from '../../../utils/purchaseData'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import { useWeekScheduleState } from '../../../hooks/useWeekScheduleState'
import AdminModal from '../../../components/admin/AdminModal'
import ConfirmDialog from '../../../components/admin/ConfirmDialog'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import SimpleCreatePurchaseForm, {
  EMPTY_SIMPLE_PURCHASE_FORM,
} from '../../../components/procurement/SimpleCreatePurchaseForm'
import SimplePurchaseTable from '../../../components/procurement/SimplePurchaseTable'
import SimplePurchaseCardList from '../../../components/procurement/SimplePurchaseCardList'
import PurchaseTable from '../../../components/procurement/PurchaseTable'
import WeekScheduleNav from '../../../components/procurement/WeekScheduleNav'
import ProcurementPlanDayList from '../../../components/procurement/ProcurementPlanDayList'
import ProcurementPlannerView from '../../../components/procurement/ProcurementPlannerView'
import ProcurementNormsView from '../../../components/procurement/ProcurementNormsView'
import TablePagination from '../../../components/procurement/TablePagination'
import '../../../components/admin/admin-shared.css'
import './ProcurementPage.css'
import '../../../components/procurement/SimpleDeliveryCard.css'

/** Закуп: планирование (по умолчанию) + простые заказы — /platform/procurement */
export default function ProcurementPage() {
  const { user } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const { error: showError } = useToast()
  const { loadError, reloadProcurement, ensureModules, version: dataVersion } = usePlatformData()
  const { version, refresh, notifyChange } = useAdminRefresh()
  const [mainTab, setMainTab] = useState('planning')

  useEffect(() => {
    if (!isCloudMode()) return
    void ensureModules(['suppliers', 'procurement', 'receiving'])
  }, [ensureModules])
  const {
    weekStartKey,
    selectedDateKey,
    setSelectedDateKey,
    weekDates,
    weekTitle,
    todayKey,
    changeWeek,
    goToday,
    selectWeekContaining,
  } = useWeekScheduleState()
  const [showCreate, setShowCreate] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [form, setForm] = useState(EMPTY_SIMPLE_PURCHASE_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState(null)
  const [procurementLoadError, setProcurementLoadError] = useState(null)
  const [procurementRefreshing, setProcurementRefreshing] = useState(false)
  const [ordersPage, setOrdersPage] = useState(1)
  const [ordersPageSize, setOrdersPageSize] = useState(25)

  const canView = canViewPurchases(user)
  const canCreate = canCreatePurchase(user)
  const showActions = canEditPurchase(user)

  void version

  useEffect(() => {
    if (!canView || !isCloudMode()) return undefined

    let cancelled = false

    async function syncFromServer() {
      setProcurementRefreshing(true)
      try {
        await reloadProcurement()
        if (!cancelled) setProcurementLoadError(null)
      } catch (error) {
        const message = toUserErrorMessage(
          error,
          'Не удалось загрузить закупы с сервера.'
        )
        if (!cancelled) {
          setProcurementLoadError(message)
          showError(message)
        }
        if (import.meta.env.DEV) {
          console.error('[ProcurementPage] reload failed', {
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code,
          })
        }
      } finally {
        if (!cancelled) setProcurementRefreshing(false)
      }
    }

    void syncFromServer()
    return () => {
      cancelled = true
    }
  }, [canView, reloadProcurement, showError])

  useEffect(() => {
    if (loadError?.message) {
      setProcurementLoadError(loadError.message)
    }
  }, [loadError])

  const purchasesReady = !isCloudMode() || isPurchasesDataReady()
  const receivingReady = !isCloudMode() || isReceivingDataReady()
  const purchasesLoading =
    isCloudMode() &&
    (isPurchasesDataLoading() || procurementRefreshing || !isPurchasesDataReady())
  const liveOrders = getPurchaseOrdersSync()
  const stableOrders = useStableWhenReady(liveOrders, purchasesReady)
  const liveDocuments = getReceivingDocumentsSync()
  const stableDocuments = useStableWhenReady(liveDocuments, receivingReady)

  const hasLoadedPurchasesOnce = useRef(false)
  if (purchasesReady) hasLoadedPurchasesOnce.current = true
  const showInitialSkeleton = purchasesLoading && !hasLoadedPurchasesOnce.current

  const simpleOrders = useMemo(() => {
    return filterSimplePurchases(stableOrders)
      .filter((o) => o.status !== PURCHASE_STATUS.CANCELLED)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  }, [stableOrders, version, dataVersion])

  const activeOrders = useMemo(() => {
    return stableOrders
      .filter((order) => order.status !== PURCHASE_STATUS.CANCELLED)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  }, [stableOrders, version, dataVersion])

  /** Список закупов выбранного дня — период из фильтра не применяем (дату задаёт навигация по неделе) */
  const dayOrders = useMemo(() => {
    if (!selectedDateKey) return []

    const result = activeOrders.filter(
      (order) => order.expectedDeliveryDate === selectedDateKey
    )

    return result.sort((a, b) =>
      (a.supplierName || '').localeCompare(b.supplierName || '', 'ru')
    )
  }, [activeOrders, selectedDateKey])

  const ordersTotalPages = Math.max(1, Math.ceil(dayOrders.length / ordersPageSize))
  const visibleDayOrders = useMemo(() => {
    const start = (ordersPage - 1) * ordersPageSize
    return dayOrders.slice(start, start + ordersPageSize)
  }, [dayOrders, ordersPage, ordersPageSize])
  const ordersFrom = dayOrders.length === 0 ? 0 : (ordersPage - 1) * ordersPageSize + 1
  const ordersTo = Math.min(ordersPage * ordersPageSize, dayOrders.length)

  useEffect(() => {
    setOrdersPage(1)
  }, [selectedDateKey, ordersPageSize])

  useEffect(() => {
    if (ordersPage > ordersTotalPages) setOrdersPage(ordersTotalPages)
  }, [ordersPage, ordersTotalPages])

  const expectedEntriesByDate = useMemo(() => {
    const entries = buildExpectedDeliveryEntries(
      getAllSuppliersSync(),
      weekStartKey,
      stableOrders
    )
    const counts = {}
    for (const entry of entries) {
      counts[entry.dateKey] = (counts[entry.dateKey] || 0) + 1
    }
    return counts
  }, [stableOrders, weekStartKey, version, dataVersion])

  const countsByDate = useMemo(() => {
    const counts = { ...expectedEntriesByDate }
    for (const order of activeOrders) {
      if (!order.expectedDeliveryDate) continue
      counts[order.expectedDeliveryDate] = (counts[order.expectedDeliveryDate] || 0) + 1
    }
    return counts
  }, [activeOrders, expectedEntriesByDate])

  const documentsByPurchaseId = useMemo(() => {
    const map = new Map()
    stableDocuments.forEach((doc) => {
      if (doc.purchaseOrderId) map.set(doc.purchaseOrderId, doc)
    })
    return map
  }, [stableDocuments, version, dataVersion])

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Закуп»" />
  }

  function closeModal() {
    setShowCreate(false)
    setEditingOrder(null)
    setForm(EMPTY_SIMPLE_PURCHASE_FORM)
    setFormError('')
  }

  function openCreate(prefill = null) {
    setEditingOrder(null)

    const supplierId = prefill?.supplierId || ''
    const supplierName = prefill?.supplierName || ''
    const resolvedSupplier =
      (supplierId && getSupplierByIdSync(supplierId)) ||
      getAllSuppliersSync().find(
        (supplier) =>
          supplier.name.trim().toLowerCase() === supplierName.trim().toLowerCase()
      ) ||
      null

    setForm(
      prefill
        ? {
            ...EMPTY_SIMPLE_PURCHASE_FORM,
            supplierId: resolvedSupplier?.id || supplierId || '',
            supplierName: resolvedSupplier?.name || supplierName,
            expectedDeliveryDate: prefill.expectedDeliveryDate || selectedDateKey || '',
          }
        : {
            ...EMPTY_SIMPLE_PURCHASE_FORM,
            expectedDeliveryDate: selectedDateKey || '',
          }
    )
    setFormError('')
    setShowCreate(true)
  }

  useEffect(() => {
    const prefill = location.state?.createPurchase
    if (!prefill || !canCreate) return

    if (prefill.expectedDeliveryDate) {
      selectWeekContaining(prefill.expectedDeliveryDate)
    }
    setMainTab('orders')
    openCreate(prefill)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state, canCreate, location.pathname, navigate])

  function openPurchaseEditor(orderId) {
    const order = simpleOrders.find((item) => item.id === orderId)
    if (!order || !canEditSimplePurchase(user, order)) return

    setEditingOrder(order)
    setForm({
      supplierId: order.supplierId || '',
      supplierName: order.supplierName || '',
      expectedDeliveryDate: order.expectedDeliveryDate || '',
      totalAmount: String(order.totalAmount ?? ''),
      comment: order.comment || '',
    })
    setFormError('')
    setShowCreate(true)
  }

  function validateForm() {
    if (!form.supplierId && !form.supplierName.trim()) {
      setFormError('Выберите поставщика')
      return false
    }
    if (!form.expectedDeliveryDate) {
      setFormError('Укажите дату поставки')
      return false
    }
    const amount = Number(form.totalAmount)
    if (!Number.isFinite(amount) || amount < 0) {
      setFormError('Укажите корректную сумму закупа')
      return false
    }
    return true
  }

  function buildCreatePayload() {
    return {
      supplierId: form.supplierId || null,
      supplierName: form.supplierName,
      expectedDeliveryDate: form.expectedDeliveryDate,
      totalAmount: Number(form.totalAmount),
      comment: form.comment,
      createdBy: user?.login || user?.id || '',
      createdByName: user?.name || '',
    }
  }

  function handleSave() {
    setFormError('')
    if (!validateForm()) return

    const payload = buildCreatePayload()

    if (editingOrder) {
      setSaving(true)
      updatePurchaseOrder(editingOrder.id, payload)
        .then(() => refresh())
        .then(() => closeModal())
        .catch((err) => {
          setFormError(err.message || 'Не удалось сохранить закуп')
        })
        .finally(() => setSaving(false))
      return
    }

    const deliveryDate = payload.expectedDeliveryDate
    closeModal()
    createSimplePurchaseOptimistic(payload, user, notifyChange)

    if (deliveryDate && deliveryDate !== selectedDateKey) {
      selectWeekContaining(deliveryDate)
    }
  }

  function requestDelete(orderId) {
    const order = simpleOrders.find((item) => item.id === orderId)
    if (!order || !canEditSimplePurchase(user, order)) return
    setDeleteTargetId(orderId)
  }

  function confirmDelete() {
    if (!deleteTargetId) return
    const orderId = deleteTargetId
    setDeleteTargetId(null)
    deleteSimplePurchaseOptimistic(orderId, notifyChange)
  }

  function handleRetry(order) {
    retrySimplePurchaseSync(order.id, user, notifyChange)
  }

  function getEmptyMessage() {
    if (procurementLoadError) return procurementLoadError
    const moduleError = getPurchasesDataError()
    if (moduleError) {
      return toUserErrorMessage(moduleError, 'Не удалось загрузить закупы с сервера.')
    }
    if (!selectedDateKey) return 'Выберите день недели'
    if (activeOrders.length === 0) return 'Заказы не созданы'
    return 'На этот день закупок нет'
  }

  const modalOpen = showCreate || Boolean(editingOrder)
  const emptyMessage = getEmptyMessage()
  return (
    <div className="procurement-page">
      <div className="procurement-page__tabs" role="tablist" aria-label="Разделы закупа">
        <button
          type="button"
          role="tab"
          className={
            mainTab === 'planning'
              ? 'procurement-page__tab is-active'
              : 'procurement-page__tab'
          }
          aria-selected={mainTab === 'planning'}
          onClick={() => setMainTab('planning')}
        >
          Планирование
        </button>
        <button
          type="button"
          role="tab"
          className={
            mainTab === 'norms' ? 'procurement-page__tab is-active' : 'procurement-page__tab'
          }
          aria-selected={mainTab === 'norms'}
          onClick={() => setMainTab('norms')}
        >
          Нормы
        </button>
        <button
          type="button"
          role="tab"
          className={
            mainTab === 'orders' ? 'procurement-page__tab is-active' : 'procurement-page__tab'
          }
          aria-selected={mainTab === 'orders'}
          onClick={() => setMainTab('orders')}
        >
          Заказы
        </button>
      </div>

      {mainTab === 'planning' ? (
        <ProcurementPlannerView />
      ) : mainTab === 'norms' ? (
        <ProcurementNormsView />
      ) : (
        <>
      <WeekScheduleNav
        weekTitle={weekTitle}
        weekDates={weekDates}
        selectedDateKey={selectedDateKey}
        todayKey={todayKey}
        countsByDate={countsByDate}
        onPrevWeek={() => changeWeek(-1)}
        onNextWeek={() => changeWeek(1)}
        onToday={goToday}
        onSelectDate={setSelectedDateKey}
      />

      <ProcurementPlanDayList
        weekStartKey={weekStartKey}
        selectedDateKey={selectedDateKey}
        version={version}
        dataVersion={dataVersion}
        orders={stableOrders}
        canCreate={false}
        onCreatePurchase={openCreate}
      />

      <section className="procurement-page__section">
        <h2 className="procurement-page__section-title">Заказы</h2>

        {showInitialSkeleton ? (
          <DelayedLoadingSkeleton variant="list" count={5} />
        ) : !selectedDateKey ? (
          <p className="procurement-page__empty">Выберите день недели, чтобы посмотреть закупки.</p>
        ) : (
          <>
            <div className="procurement-list-panel">
              <PurchaseTable
                orders={visibleDayOrders}
                canEdit={false}
              />
              <TablePagination
                page={ordersPage}
                totalPages={ordersTotalPages}
                from={ordersFrom}
                to={ordersTo}
                totalCount={dayOrders.length}
                onPageChange={setOrdersPage}
                pageSize={ordersPageSize}
                onPageSizeChange={setOrdersPageSize}
              />
            </div>
          </>
        )}
      </section>
        </>
      )}

      {deleteTargetId && (
        <ConfirmDialog
          title="Удалить закупку?"
          message="Закупка будет удалена без возможности восстановления."
          confirmLabel="Удалить"
          onCancel={() => setDeleteTargetId(null)}
          onConfirm={confirmDelete}
        />
      )}

      {modalOpen && canCreate && (
        <AdminModal
          title={editingOrder ? 'Редактировать закуп' : 'Создать закуп'}
          onClose={closeModal}
          wide
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={closeModal}>
                Отмена
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? 'Сохранение…' : editingOrder ? 'Сохранить' : 'Создать'}
              </button>
            </>
          }
        >
          <SimpleCreatePurchaseForm form={form} onChange={setForm} error={formError} />
        </AdminModal>
      )}
    </div>
  )
}
