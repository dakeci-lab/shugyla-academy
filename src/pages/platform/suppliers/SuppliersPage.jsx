import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  getSuppliers,
  getSupplierById,
  updateSupplier,
  deleteSupplier,
} from '../../../services/platformDataService'
import { isCloudMode } from '../../../lib/dataMode'
import { isModuleReady } from '../../../lib/cloudStore'
import { usePlatformData } from '../../../context/PlatformDataContext'
import { DelayedLoadingSkeleton } from '../../../components/loading/LoadingSkeleton'
import {
  filterSuppliers,
  SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED,
} from '../../../utils/supplierData'
import { countPendingSupplierMatchCandidates } from '../../../services/suppliersSupabaseAdapter'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import {
  canViewSuppliers,
  canEditSuppliers,
  canDeleteSuppliers,
} from '../../../config/permissions'
import useMediaQuery from '../../../hooks/useMediaQuery'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../../../components/admin/AdminModal'
import ConfirmDialog from '../../../components/admin/ConfirmDialog'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import SupplierForm, {
  EMPTY_SUPPLIER_FORM,
  supplierToForm,
  formToSupplierUpdatePayload,
  validateSupplierDeferralDays,
} from '../../../components/suppliers/SupplierForm'
import { refreshObligationTermsForSupplier } from '../../../services/supplierPaymentObligationsService'
import SupplierFilterPopover from '../../../components/suppliers/SupplierFilterPopover'
import SupplierTable from '../../../components/suppliers/SupplierTable'
import PlatformSearchToolbar, {
  PlatformFilterButton,
  PlatformToolbarActionWrap,
} from '../../../components/platform/PlatformSearchToolbar'
import '../../../components/admin/admin-shared.css'
import './SuppliersPage.css'

const NARROW_SEARCH_QUERY = '(max-width: 480px)'

/** Страница списка поставщиков — /platform/suppliers */
export function SuppliersListPage() {
  const { user } = useSession()
  const { success: showSuccess, error: showError } = useToast()
  const { version } = useAdminRefresh()
  const { version: dataVersion } = usePlatformData()
  const location = useLocation()
  const navigate = useNavigate()
  const filterButtonRef = useRef(null)
  const isNarrowSearch = useMediaQuery(NARROW_SEARCH_QUERY)
  const [search, setSearch] = useState('')
  const [appliedShowArchived, setAppliedShowArchived] = useState(SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED)
  const [draftShowArchived, setDraftShowArchived] = useState(SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED)
  const [filterOpen, setFilterOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_SUPPLIER_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [pendingMatchCount, setPendingMatchCount] = useState(0)
  const [focusSection, setFocusSection] = useState(null)
  const returnToRef = useRef(null)

  const canView = canViewSuppliers(user)
  const canEdit = canEditSuppliers(user)
  const canDelete = canDeleteSuppliers(user)

  void version
  void dataVersion

  const suppliersReady = !isCloudMode() || isModuleReady('suppliers')
  const suppliers = getSuppliers()
  const hasLoadedOnce = useRef(false)
  if (suppliersReady) hasLoadedOnce.current = true
  const showInitialSkeleton = isCloudMode() && !suppliersReady && !hasLoadedOnce.current
  const filtered = useMemo(
    () => filterSuppliers(suppliers, { search, showArchived: appliedShowArchived }),
    [suppliers, search, appliedShowArchived, version, dataVersion]
  )
  const filtersActive = appliedShowArchived !== SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED

  useEffect(() => {
    if (!canView || !canEdit) {
      setPendingMatchCount(0)
      return undefined
    }
    let cancelled = false
    void countPendingSupplierMatchCandidates()
      .then((count) => {
        if (!cancelled) setPendingMatchCount(count)
      })
      .catch(() => {
        if (!cancelled) setPendingMatchCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [canView, canEdit, version])

  useEffect(() => {
    const openEditId = location.state?.openEditId
    if (!openEditId || !canEdit) return

    const supplier = getSupplierById(openEditId)
    if (supplier) {
      setEditId(supplier.id)
      setForm(supplierToForm(supplier))
      setFormError('')
      setFocusSection(location.state?.focusSection || null)
      returnToRef.current = location.state?.returnTo || null
      setShowForm(true)
    }

    navigate(location.pathname, { replace: true, state: null })
  }, [location.state?.openEditId, canEdit, location.pathname, navigate])

  function openEdit(supplier) {
    setEditId(supplier.id)
    setForm(supplierToForm(supplier))
    setFormError('')
    setFocusSection(null)
    returnToRef.current = null
    setShowForm(true)
  }

  const closeForm = useCallback(() => {
    setShowForm(false)
    setEditId(null)
    setFormError('')
    setFocusSection(null)
    returnToRef.current = null
  }, [])

  function toggleFilter() {
    if (filterOpen) {
      closeFilter()
      return
    }
    setDraftShowArchived(appliedShowArchived)
    setFilterOpen(true)
  }

  function closeFilter() {
    setFilterOpen(false)
  }

  function applyFilter() {
    setAppliedShowArchived(draftShowArchived)
    setFilterOpen(false)
  }

  function resetFilter() {
    setDraftShowArchived(SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED)
    setAppliedShowArchived(SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED)
    setFilterOpen(false)
  }

  const handleSave = useCallback(async () => {
    setFormError('')
    if (!form.name.trim()) {
      setFormError('Укажите название поставщика')
      return
    }
    const deferralError = validateSupplierDeferralDays(form)
    if (deferralError) {
      setFormError(deferralError)
      return
    }

    setSaving(true)
    try {
      const payload = formToSupplierUpdatePayload(form)
      await updateSupplier(editId, payload)
      try {
        await refreshObligationTermsForSupplier(editId, payload)
      } catch {
        // Recomputing due dates is best-effort; supplier save already succeeded.
      }
      // updateSupplier already reloads cloud data internally — a second full
      // refresh() here would just duplicate the same fetch.
      const returnTo = returnToRef.current
      const cameFromPayments = Boolean(returnTo)
      closeForm()
      if (cameFromPayments) {
        showSuccess('Условия оплаты сохранены. Сроки обязательств обновлены.')
        navigate(returnTo)
      } else {
        showSuccess('Поставщик сохранён')
      }
    } catch (err) {
      setFormError(err.message || 'Не удалось сохранить поставщика')
    } finally {
      setSaving(false)
    }
  }, [closeForm, editId, form, navigate, showSuccess])

  const requestDelete = useCallback(() => {
    if (!editId) return
    const supplier = getSupplierById(editId)
    if (supplier) setDeleteTarget(supplier)
  }, [editId])

  const modalFooter = useMemo(
    () => (
      <div className="suppliers-modal-footer">
        {editId && canDelete && (
          <button
            type="button"
            className="btn suppliers-modal-footer__delete"
            disabled={saving || deleting}
            onClick={requestDelete}
          >
            Удалить поставщика
          </button>
        )}
        <div className="suppliers-modal-footer__actions">
          <button type="button" className="btn btn--ghost" onClick={closeForm}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving || deleting}
            onClick={handleSave}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    ),
    [editId, canDelete, saving, deleting, closeForm, requestDelete, handleSave]
  )

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteSupplier(deleteTarget.id)
      // deleteSupplier already reloads cloud data internally.
      showSuccess('Поставщик удалён')
      setDeleteTarget(null)
      closeForm()
    } catch (err) {
      showError(err.message || 'Не удалось удалить поставщика')
    } finally {
      setDeleting(false)
    }
  }

  const searchPlaceholder = isNarrowSearch
    ? 'Поиск поставщика…'
    : 'Поиск по названию, менеджеру, телефону…'

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к поставщикам" />
  }

  const emptyMessage = (() => {
    if (search.trim()) return 'По вашему запросу ничего не найдено.'
    if (appliedShowArchived) return 'Удалённых поставщиков нет.'
    return suppliers.length === 0
      ? 'Поставщики ещё не синхронизированы. Выполните синхронизацию с UMAG.'
      : 'По вашему запросу ничего не найдено.'
  })()

  return (
    <div className="suppliers-page">
      <PlatformSearchToolbar
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={searchPlaceholder}
        ariaLabel="Поиск поставщиков"
        actions={
          <PlatformToolbarActionWrap>
            <PlatformFilterButton
              buttonRef={filterButtonRef}
              active={filtersActive}
              onClick={toggleFilter}
              ariaExpanded={filterOpen}
              ariaLabel="Фильтр"
              title="Фильтр"
            />
            <SupplierFilterPopover
              open={filterOpen}
              draftShowArchived={draftShowArchived}
              onChange={setDraftShowArchived}
              onApply={applyFilter}
              onReset={resetFilter}
              onClose={closeFilter}
              anchorRef={filterButtonRef}
            />
          </PlatformToolbarActionWrap>
        }
      />

      {pendingMatchCount > 0 ? (
        <div className="suppliers-page__review-banner" role="status">
          Требует сопоставления: {pendingMatchCount}
          {pendingMatchCount === 1 ? ' поставщик' : ' поставщика'} с неоднозначным UMAG-совпадением.
        </div>
      ) : null}

      {showInitialSkeleton ? (
        <DelayedLoadingSkeleton variant="table" count={5} />
      ) : filtered.length === 0 ? (
        <div className="suppliers-page__empty">{emptyMessage}</div>
      ) : (
        <SupplierTable suppliers={filtered} canEdit={canEdit} onEdit={openEdit} />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Удалить поставщика?"
          message={`Поставщик «${deleteTarget.name}» будет удалён без возможности восстановления. Это действие нельзя отменить.`}
          confirmLabel="Удалить"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          loading={deleting}
        />
      )}

      {showForm && canEdit && (
        <AdminModal
          title="Редактировать поставщика"
          onClose={closeForm}
          wide
          autoFocusClose={false}
          footer={modalFooter}
        >
          <SupplierForm
            form={form}
            onChange={setForm}
            error={formError}
            supplierId={editId}
            focusSection={focusSection}
          />
        </AdminModal>
      )}
    </div>
  )
}

/** Редirect legacy detail URL → список с открытием редактирования */
export function SupplierDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    navigate('/platform/suppliers', { replace: true, state: { openEditId: id } })
  }, [id, navigate])

  return null
}

export default function SuppliersPage() {
  return <SuppliersListPage />
}
