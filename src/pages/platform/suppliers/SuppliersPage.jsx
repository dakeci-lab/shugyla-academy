import { useEffect, useMemo, useState } from 'react'
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
  SUPPLIER_STATUS,
  formatActiveSuppliersCount,
} from '../../../utils/supplierData'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import {
  canViewSuppliers,
  canEditSuppliers,
  canDeleteSuppliers,
} from '../../../config/permissions'
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
import SupplierTable from '../../../components/suppliers/SupplierTable'
import { SearchIcon } from '../../../components/icons/PlatformIcons'
import '../../../components/admin/admin-shared.css'
import './SuppliersPage.css'

/** Страница списка поставщиков — /platform/suppliers */
export function SuppliersListPage() {
  const { user } = useSession()
  const { success: showSuccess, error: showError } = useToast()
  const { version, refresh } = useAdminRefresh()
  const location = useLocation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
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
  const activeSuppliers = useMemo(
    () => suppliers.filter((supplier) => supplier.status === SUPPLIER_STATUS.ACTIVE),
    [suppliers, version]
  )
  const filtered = useMemo(
    () => filterSuppliers(activeSuppliers, { search, status: 'all' }),
    [activeSuppliers, search, version]
  )

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

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к поставщикам" />
  }

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

  function closeForm() {
    setShowForm(false)
    setEditId(null)
    setFormError('')
  }

  async function handleSave() {
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
  }

  function requestDelete() {
    if (!editId) return
    const supplier = getSupplierById(editId)
    if (supplier) setDeleteTarget(supplier)
  }

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

  return (
    <div className="suppliers-page">
      <p className="suppliers-page__count">{formatActiveSuppliersCount(activeSuppliers.length)}</p>

      <div className="suppliers-page__toolbar">
        <label className="suppliers-page__search-wrap">
          <span className="suppliers-page__search-icon" aria-hidden="true">
            <SearchIcon size={18} />
          </span>
          <input
            type="search"
            className="suppliers-page__search"
            placeholder="Поиск по названию, менеджеру, телефону…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Поиск поставщиков"
          />
        </label>
        {canEdit && (
          <button
            type="button"
            className="btn btn--primary btn--sm suppliers-page__add-btn"
            onClick={openCreate}
          >
            + Добавить поставщика
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="suppliers-page__empty">
          {activeSuppliers.length === 0
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
          footer={
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
          }
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
