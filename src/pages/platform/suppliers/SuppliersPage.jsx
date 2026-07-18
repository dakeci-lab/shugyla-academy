import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '../../../services/academyDataService'
import {
  filterSuppliers,
  SUPPLIER_LIST_DEFAULT_STATUS,
} from '../../../utils/supplierData'
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
  formToSupplierCreatePayload,
  formToSupplierUpdatePayload,
} from '../../../components/suppliers/SupplierForm'
import SupplierFilterPopover from '../../../components/suppliers/SupplierFilterPopover'
import SupplierTable from '../../../components/suppliers/SupplierTable'
import { PlusIcon } from '../../../components/icons/PlatformIcons'
import PlatformSearchToolbar, {
  PlatformFilterButton,
  PlatformToolbarActionWrap,
  PlatformToolbarIconButton,
} from '../../../components/platform/PlatformSearchToolbar'
import '../../../components/admin/admin-shared.css'
import './SuppliersPage.css'

const NARROW_SEARCH_QUERY = '(max-width: 480px)'

/** Страница списка поставщиков — /platform/suppliers */
export function SuppliersListPage() {
  const { user } = useSession()
  const { success: showSuccess, error: showError } = useToast()
  const { version, refresh } = useAdminRefresh()
  const location = useLocation()
  const navigate = useNavigate()
  const filterButtonRef = useRef(null)
  const isNarrowSearch = useMediaQuery(NARROW_SEARCH_QUERY)
  const [search, setSearch] = useState('')
  const [appliedStatus, setAppliedStatus] = useState(SUPPLIER_LIST_DEFAULT_STATUS)
  const [draftStatus, setDraftStatus] = useState(SUPPLIER_LIST_DEFAULT_STATUS)
  const [filterOpen, setFilterOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_SUPPLIER_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const canView = canViewSuppliers(user)
  const canEdit = canEditSuppliers(user)
  const canDelete = canDeleteSuppliers(user)

  void version

  const suppliers = getSuppliers()
  const filtered = useMemo(
    () => filterSuppliers(suppliers, { search, status: appliedStatus }),
    [suppliers, search, appliedStatus, version]
  )
  const filterPreviewCount = useMemo(
    () => filterSuppliers(suppliers, { search, status: draftStatus }).length,
    [suppliers, search, draftStatus, version]
  )
  const filtersActive = appliedStatus !== SUPPLIER_LIST_DEFAULT_STATUS

  useEffect(() => {
    const openEditId = location.state?.openEditId
    if (!openEditId || !canEdit) return

    const supplier = getSupplierById(openEditId)
    if (supplier) {
      setEditId(supplier.id)
      setForm(supplierToForm(supplier))
      setFormError('')
      setShowForm(true)
    }

    navigate(location.pathname, { replace: true, state: null })
  }, [location.state?.openEditId, canEdit, location.pathname, navigate])

  function openCreate() {
    setEditId(null)
    setForm(EMPTY_SUPPLIER_FORM)
    setFormError('')
    setShowForm(true)
  }

  function openEdit(supplier) {
    setEditId(supplier.id)
    setForm(supplierToForm(supplier))
    setFormError('')
    setShowForm(true)
  }

  const closeForm = useCallback(() => {
    setShowForm(false)
    setEditId(null)
    setFormError('')
  }, [])

  function toggleFilter() {
    if (filterOpen) {
      closeFilter()
      return
    }
    setDraftStatus(appliedStatus)
    setFilterOpen(true)
  }

  function closeFilter() {
    setFilterOpen(false)
  }

  function applyFilter() {
    setAppliedStatus(draftStatus)
    setFilterOpen(false)
  }

  function resetFilter() {
    setDraftStatus(SUPPLIER_LIST_DEFAULT_STATUS)
    setAppliedStatus(SUPPLIER_LIST_DEFAULT_STATUS)
    setFilterOpen(false)
  }

  const handleSave = useCallback(async () => {
    setFormError('')
    if (!form.name.trim()) {
      setFormError('Укажите название поставщика')
      return
    }

    setSaving(true)
    try {
      if (editId) {
        await updateSupplier(editId, formToSupplierUpdatePayload(form))
      } else {
        await createSupplier(formToSupplierCreatePayload(form))
      }
      await refresh()
      closeForm()
    } catch (err) {
      setFormError(err.message || 'Не удалось сохранить поставщика')
    } finally {
      setSaving(false)
    }
  }, [closeForm, editId, form, refresh])

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
      await refresh()
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

  return (
    <div className="suppliers-page">
      <PlatformSearchToolbar
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={searchPlaceholder}
        ariaLabel="Поиск поставщиков"
        actions={
          <>
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
                draftStatus={draftStatus}
                onChange={setDraftStatus}
                resultCount={filterPreviewCount}
                onApply={applyFilter}
                onReset={resetFilter}
                onClose={closeFilter}
                anchorRef={filterButtonRef}
              />
            </PlatformToolbarActionWrap>
            {canEdit && (
              <PlatformToolbarIconButton
                create
                onClick={openCreate}
                aria-label="Добавить поставщика"
                title="Добавить поставщика"
              >
                <PlusIcon size={20} />
              </PlatformToolbarIconButton>
            )}
          </>
        }
      />

      {filtered.length === 0 ? (
        <div className="suppliers-page__empty">
          {suppliers.length === 0
            ? 'Поставщики ещё не добавлены.'
            : 'По вашему запросу ничего не найдено.'}
        </div>
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
          title={editId ? 'Редактировать поставщика' : 'Добавить поставщика'}
          onClose={closeForm}
          wide
          autoFocusClose={false}
          footer={modalFooter}
        >
          <SupplierForm form={form} onChange={setForm} error={formError} />
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
