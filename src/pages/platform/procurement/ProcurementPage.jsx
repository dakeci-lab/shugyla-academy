import { useMemo, useRef, useState } from 'react'
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
import {
  createSimplePurchaseOptimistic,
  deleteSimplePurchaseOptimistic,
  retrySimplePurchaseSync,
} from '../../../services/purchaseOptimisticService'
import { filterSimplePurchases } from '../../../utils/procurementWorkflow'
import { PURCHASE_STATUS } from '../../../utils/purchaseData'
import {
  createDefaultPurchaseFilters,
  PURCHASE_PAGE_SIZE,
  calcPurchaseTotals,
  filterPurchaseOrders,
  getPaginationMeta,
  hasActivePurchaseFilters,
  paginateItems,
} from '../../../utils/purchaseFilter'
import { formatPurchaseFilterSummary } from '../../../utils/purchaseFilterSummary'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../../../components/admin/AdminModal'
import ConfirmDialog from '../../../components/admin/ConfirmDialog'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import SimpleCreatePurchaseForm, {
  EMPTY_SIMPLE_PURCHASE_FORM,
} from '../../../components/procurement/SimpleCreatePurchaseForm'
import SimplePurchaseTable from '../../../components/procurement/SimplePurchaseTable'
import SimplePurchaseCardList from '../../../components/procurement/SimplePurchaseCardList'
import PurchaseFilterPopover from '../../../components/procurement/PurchaseFilterPopover'
import TablePagination from '../../../components/procurement/TablePagination'
import { FilterIcon, ChevronDownIcon } from '../../../components/icons/PlatformIcons'
import '../../../components/admin/admin-shared.css'
import './ProcurementPage.css'

/** Простая закупка — /platform/procurement */
export default function ProcurementPage() {
  const { user } = useSession()
  const { version, refresh, notifyChange } = useAdminRefresh()
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
  const [page, setPage] = useState(1)

  const canView = canViewPurchases(user)
  const canCreate = canCreatePurchase(user)
  const showActions = canEditPurchase(user)

  void version

  const simpleOrders = useMemo(() => {
    return filterSimplePurchases(getPurchaseOrdersSync())
      .filter((o) => o.status !== PURCHASE_STATUS.CANCELLED)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  }, [version])

  const filteredOrders = useMemo(
    () => filterPurchaseOrders(simpleOrders, appliedFilters),
    [simpleOrders, appliedFilters]
  )

  const totals = useMemo(
    () => calcPurchaseTotals(filteredOrders),
    [filteredOrders]
  )

  const { totalPages, safePage, from, to } = useMemo(
    () => getPaginationMeta(filteredOrders.length, page, PURCHASE_PAGE_SIZE),
    [filteredOrders.length, page]
  )

  const pagedOrders = useMemo(
    () => paginateItems(filteredOrders, safePage, PURCHASE_PAGE_SIZE),
    [filteredOrders, safePage]
  )

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

  function openCreate() {
    setEditingOrder(null)
    setForm(EMPTY_SIMPLE_PURCHASE_FORM)
    setFormError('')
    setShowCreate(true)
  }

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

  function handleSave() {
    setFormError('')
    if (!validateForm()) return

    const payload = {
      supplierId: form.supplierId || null,
      supplierName: form.supplierName,
      expectedDeliveryDate: form.expectedDeliveryDate,
      totalAmount: Number(form.totalAmount),
      comment: form.comment,
      createdBy: user?.login || user?.id || '',
      createdByName: user?.name || '',
    }

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

    closeModal()
    createSimplePurchaseOptimistic(payload, user, notifyChange)
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
    setPage(1)
    setFilterOpen(false)
  }

  function resetFilters() {
    const defaults = createDefaultPurchaseFilters()
    setDraftFilters(defaults)
    setAppliedFilters(defaults)
    setPage(1)
    setFilterOpen(false)
  }

  function getEmptyMessage() {
    if (simpleOrders.length === 0) return 'Закупы не созданы'
    if (filtersActive) return 'По выбранному фильтру закупы не найдены'
    return 'Закупы не созданы'
  }

  const modalOpen = showCreate || Boolean(editingOrder)
  const emptyMessage = getEmptyMessage()
  const listTotals = filteredOrders.length > 0 ? totals : null

  return (
    <div className="procurement-page">
      <div className="procurement-page__header">
        <div className="procurement-page__header-main">
          {canCreate && (
            <button
              type="button"
              className="btn btn--primary btn--sm procurement-page__create-btn"
              onClick={openCreate}
            >
              Создать закуп
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
            >
              <span className="procurement-page__filter-trigger-desktop">
                <FilterIcon size={16} />
                Фильтр
                {filtersActive && <span className="procurement-page__filter-badge" aria-hidden="true" />}
              </span>
              <span className="procurement-page__filter-trigger-mobile">
                <span className="procurement-page__mobile-filter-main">
                  <FilterIcon size={18} />
                  <span className="procurement-page__mobile-filter-label">Фильтр</span>
                  <ChevronDownIcon size={16} />
                </span>
                {filterSummary.length > 0 && (
                  <span className="procurement-page__mobile-filter-chips">
                    {filterSummary.map((chip) => (
                      <span key={chip} className="procurement-page__mobile-filter-chip">
                        {chip}
                      </span>
                    ))}
                  </span>
                )}
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

        <span className="admin-toolbar__info procurement-page__count">
          {filteredOrders.length} из {simpleOrders.length}
        </span>
      </div>

      <section className="procurement-page__section">
        <div className="procurement-list-panel procurement-list-panel--desktop">
          <SimplePurchaseTable
            orders={pagedOrders}
            documentsByPurchaseId={documentsByPurchaseId}
            showActions={showActions}
            canEditOrder={(order) => canEditSimplePurchase(user, order)}
            onOpenEditor={openPurchaseEditor}
            onDelete={requestDelete}
            onRetry={handleRetry}
            rowIndexOffset={(safePage - 1) * PURCHASE_PAGE_SIZE}
            totals={listTotals}
            emptyMessage={emptyMessage}
          />

          {filteredOrders.length > 0 && (
            <TablePagination
              page={safePage}
              totalPages={totalPages}
              from={from}
              to={to}
              totalCount={filteredOrders.length}
              onPageChange={setPage}
            />
          )}
        </div>

        <div className="procurement-list-panel procurement-list-panel--mobile">
          <SimplePurchaseCardList
            orders={pagedOrders}
            documentsByPurchaseId={documentsByPurchaseId}
            showActions={showActions}
            canEditOrder={(order) => canEditSimplePurchase(user, order)}
            onOpenEditor={openPurchaseEditor}
            onDelete={requestDelete}
            onRetry={handleRetry}
            totals={listTotals}
            emptyMessage={emptyMessage}
          />

          {filteredOrders.length > 0 && (
            <TablePagination
              page={safePage}
              totalPages={totalPages}
              from={from}
              to={to}
              totalCount={filteredOrders.length}
              onPageChange={setPage}
            />
          )}
        </div>
      </section>

      {canCreate && (
        <button
          type="button"
          className="procurement-page__fab"
          onClick={openCreate}
          aria-label="Создать закуп"
        >
          +
        </button>
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
