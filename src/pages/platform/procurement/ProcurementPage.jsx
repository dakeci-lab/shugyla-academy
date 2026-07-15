import { useMemo, useRef, useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import {
  canViewPurchases,
  canCreatePurchase,
  canEditSimplePurchase,
  canEditPurchase,
} from '../../../config/permissions'
import {
  getPurchaseOrdersSync,
  updatePurchaseOrder,
} from '../../../services/purchaseDataService'
import { getReceivingDocumentsSync } from '../../../services/receivingDataService'
import { getAllSuppliersSync, getSupplierByIdSync } from '../../../utils/supplierData'
import {
  createSimplePurchaseOptimistic,
  deleteSimplePurchaseOptimistic,
  retrySimplePurchaseSync,
} from '../../../services/purchaseOptimisticService'
import {
  buildExpectedDeliveryEntries,
  filterSimplePurchases,
} from '../../../utils/procurementWorkflow'
import { PURCHASE_STATUS } from '../../../utils/purchaseData'
import {
  createDefaultPurchaseFilters,
  calcPurchaseTotals,
  hasActivePurchaseFilters,
} from '../../../utils/purchaseFilter'
import { formatPurchaseFilterSummary } from '../../../utils/purchaseFilterSummary'
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
import PurchaseFilterPopover from '../../../components/procurement/PurchaseFilterPopover'
import WeekScheduleNav from '../../../components/procurement/WeekScheduleNav'
import ProcurementPlanDayList from '../../../components/procurement/ProcurementPlanDayList'
import { FilterIcon, PlusIcon } from '../../../components/icons/PlatformIcons'
import '../../../components/admin/admin-shared.css'
import './ProcurementPage.css'
import '../../../components/procurement/SimpleDeliveryCard.css'

/** Простая закупка — /platform/procurement */
export default function ProcurementPage() {
  const { user } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const { version, refresh, notifyChange } = useAdminRefresh()
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
  const filterButtonRef = useRef(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [form, setForm] = useState(EMPTY_SIMPLE_PURCHASE_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [appliedFilters, setAppliedFilters] = useState(createDefaultPurchaseFilters)
  const [draftFilters, setDraftFilters] = useState(createDefaultPurchaseFilters)

  const canView = canViewPurchases(user)
  const canCreate = canCreatePurchase(user)
  const showActions = canEditPurchase(user)

  void version

  const simpleOrders = useMemo(() => {
    return filterSimplePurchases(getPurchaseOrdersSync())
      .filter((o) => o.status !== PURCHASE_STATUS.CANCELLED)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  }, [version])

  /** Список закупов выбранного дня — период из фильтра не применяем (дату задаёт навигация по неделе) */
  const dayOrders = useMemo(() => {
    if (!selectedDateKey) return []

    let result = simpleOrders.filter(
      (order) => order.expectedDeliveryDate === selectedDateKey
    )

    if (appliedFilters.supplierId) {
      result = result.filter((order) => order.supplierId === appliedFilters.supplierId)
    }

    return result.sort((a, b) =>
      (a.supplierName || '').localeCompare(b.supplierName || '', 'ru')
    )
  }, [simpleOrders, selectedDateKey, appliedFilters.supplierId])

  const expectedEntriesByDate = useMemo(() => {
    const entries = buildExpectedDeliveryEntries(
      getAllSuppliersSync(),
      weekStartKey,
      getPurchaseOrdersSync()
    )
    const counts = {}
    for (const entry of entries) {
      counts[entry.dateKey] = (counts[entry.dateKey] || 0) + 1
    }
    return counts
  }, [version, weekStartKey])

  const countsByDate = useMemo(() => {
    const counts = { ...expectedEntriesByDate }
    for (const order of simpleOrders) {
      if (!order.expectedDeliveryDate) continue
      counts[order.expectedDeliveryDate] = (counts[order.expectedDeliveryDate] || 0) + 1
    }
    return counts
  }, [simpleOrders, expectedEntriesByDate])

  const totals = useMemo(() => calcPurchaseTotals(dayOrders), [dayOrders])

  const documentsByPurchaseId = useMemo(() => {
    const map = new Map()
    getReceivingDocumentsSync().forEach((doc) => {
      if (doc.purchaseOrderId) map.set(doc.purchaseOrderId, doc)
    })
    return map
  }, [version])

  const filtersActive = hasActivePurchaseFilters(appliedFilters)
  const filterSummary = useMemo(
    () => formatPurchaseFilterSummary(appliedFilters),
    [appliedFilters]
  )

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

  function toggleFilter() {
    if (!filterOpen) {
      setDraftFilters({ ...appliedFilters })
    }
    setFilterOpen((open) => !open)
  }

  function applyFilters() {
    setAppliedFilters({ ...draftFilters })
    setFilterOpen(false)
  }

  function resetFilters() {
    const defaults = createDefaultPurchaseFilters()
    setDraftFilters(defaults)
    setAppliedFilters(defaults)
    setFilterOpen(false)
  }

  function getEmptyMessage() {
    if (!selectedDateKey) return 'Выберите день недели'
    if (simpleOrders.length === 0) return 'Закупы не созданы'
    if (appliedFilters.supplierId && dayOrders.length === 0) {
      return 'По выбранному фильтру закупы не найдены'
    }
    return 'На этот день закупок нет'
  }

  const modalOpen = showCreate || Boolean(editingOrder)
  const emptyMessage = getEmptyMessage()
  const listTotals = dayOrders.length > 0 ? totals : null

  return (
    <div className="procurement-page">
      <div className="procurement-page__header">
        <div className="procurement-page__header-main">
          {canCreate && (
            <button
              type="button"
              className="procurement-page__desktop-create"
              onClick={() => openCreate()}
              aria-label="Создать закуп"
              title="Создать закуп"
            >
              <PlusIcon size={18} />
            </button>
          )}

          {canCreate && (
            <button
              type="button"
              className="procurement-page__mobile-create"
              onClick={() => openCreate()}
              aria-label="Создать закуп"
              title="Создать закуп"
            >
              <PlusIcon size={20} />
            </button>
          )}

          <div className="procurement-page__filter-wrap">
            <button
              ref={filterButtonRef}
              type="button"
              className={`procurement-page__filter-trigger${
                filtersActive ? ' procurement-page__filter-trigger--active' : ''
              }`}
              onClick={toggleFilter}
              aria-expanded={filterOpen}
              aria-label="Фильтр"
            >
              <span className="procurement-page__filter-trigger-desktop">
                <FilterIcon size={16} />
                Фильтр
                {filtersActive && <span className="procurement-page__filter-badge" aria-hidden="true" />}
              </span>
              <span className="procurement-page__filter-trigger-mobile">
                <FilterIcon size={20} />
                {filtersActive && <span className="procurement-page__filter-badge" aria-hidden="true" />}
              </span>
            </button>
            <PurchaseFilterPopover
              open={filterOpen}
              draft={draftFilters}
              onChange={setDraftFilters}
              onApply={applyFilters}
              onReset={resetFilters}
              onClose={() => setFilterOpen(false)}
              anchorRef={filterButtonRef}
            />
          </div>
        </div>

        {filtersActive && filterSummary.length > 0 && (
          <div className="procurement-page__mobile-filter-chips">
            {filterSummary.map((chip) => (
              <span key={chip} className="procurement-page__mobile-filter-chip">
                {chip}
              </span>
            ))}
          </div>
        )}

        <span className="admin-toolbar__info procurement-page__count">
          {dayOrders.length} {selectedDateKey ? 'за день' : ''}
        </span>
      </div>

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
        canCreate={canCreate}
        onCreatePurchase={openCreate}
      />

      <section className="procurement-page__section">
        <h2 className="procurement-page__section-title">Закупки</h2>

        {!selectedDateKey ? (
          <p className="procurement-page__empty">Выберите день недели, чтобы посмотреть закупки.</p>
        ) : (
          <>
            <div className="procurement-list-panel procurement-list-panel--desktop">
              <SimplePurchaseTable
                orders={dayOrders}
                documentsByPurchaseId={documentsByPurchaseId}
                showActions={showActions}
                canEditOrder={(order) => canEditSimplePurchase(user, order)}
                onOpenEditor={openPurchaseEditor}
                onDelete={requestDelete}
                onRetry={handleRetry}
                totals={listTotals}
                emptyMessage={emptyMessage}
              />
            </div>

            <div className="procurement-list-panel procurement-list-panel--mobile">
              <SimplePurchaseCardList
                orders={dayOrders}
                documentsByPurchaseId={documentsByPurchaseId}
                showActions={showActions}
                canEditOrder={(order) => canEditSimplePurchase(user, order)}
                onOpenEditor={openPurchaseEditor}
                onDelete={requestDelete}
                onRetry={handleRetry}
                totals={listTotals}
                emptyMessage={emptyMessage}
                compact
                hideDate
              />
            </div>
          </>
        )}
      </section>

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
