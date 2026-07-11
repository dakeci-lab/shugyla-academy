import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  archiveSupplier,
} from '../../../services/academyDataService'
import {
  filterSuppliers,
  SUPPLIER_STATUS,
  formatActiveSuppliersCount,
} from '../../../utils/supplierData'
import { useSession } from '../../../context/SessionContext'
import {
  canViewSuppliers,
  canEditSuppliers,
  canArchiveSuppliers,
  canDeleteSuppliers,
} from '../../../config/permissions'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../../../components/admin/AdminModal'
import ConfirmDialog from '../../../components/admin/ConfirmDialog'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import SupplierForm, {
  EMPTY_SUPPLIER_FORM,
  supplierToForm,
  formToSupplierPayload,
} from '../../../components/suppliers/SupplierForm'
import SupplierTable from '../../../components/suppliers/SupplierTable'
import SupplierDetails from '../../../components/suppliers/SupplierDetails'
import { SearchIcon } from '../../../components/icons/PlatformIcons'
import '../../../components/admin/admin-shared.css'
import './SuppliersPage.css'

/** Страница списка поставщиков — /platform/suppliers */
export function SuppliersListPage() {
  const { user } = useSession()
  const { version, refresh } = useAdminRefresh()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_SUPPLIER_FORM)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState(null)
  const [deactivating, setDeactivating] = useState(false)

  const canView = canViewSuppliers(user)
  const canEdit = canEditSuppliers(user)

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
      const payload = formToSupplierPayload(form)
      if (editId) {
        await updateSupplier(editId, payload)
      } else {
        await createSupplier(payload)
      }
      await refresh()
      closeForm()
    } catch (err) {
      setFormError(err.message || 'Не удалось сохранить поставщика')
    } finally {
      setSaving(false)
    }
  }

  function requestDeactivate(supplier) {
    setDeactivateTarget(supplier)
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return
    setDeactivating(true)
    setActionError('')
    try {
      await updateSupplier(deactivateTarget.id, { status: SUPPLIER_STATUS.INACTIVE })
      setDeactivateTarget(null)
      await refresh()
    } catch (err) {
      setActionError(err.message || 'Не удалось деактивировать поставщика')
    } finally {
      setDeactivating(false)
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

      {actionError && <p className="admin-form__error">{actionError}</p>}

      {filtered.length === 0 ? (
        <div className="suppliers-page__empty">
          {activeSuppliers.length === 0
            ? 'Поставщики ещё не добавлены.'
            : 'По вашему запросу ничего не найдено.'}
        </div>
      ) : (
        <SupplierTable
          suppliers={filtered}
          canEdit={canEdit}
          onEdit={openEdit}
          onDeactivate={canEdit ? requestDeactivate : null}
        />
      )}

      {deactivateTarget && (
        <ConfirmDialog
          title="Деактивировать поставщика?"
          message="Поставщик будет скрыт из списка активных. Все старые закупы сохранятся."
          confirmLabel="Деактивировать"
          onCancel={() => setDeactivateTarget(null)}
          onConfirm={confirmDeactivate}
          loading={deactivating}
        />
      )}

      {showForm && canEdit && (
        <AdminModal
          title={editId ? 'Редактировать поставщика' : 'Добавить поставщика'}
          onClose={closeForm}
          wide
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={closeForm}>
                Отмена
              </button>
              <button type="button" className="btn btn--primary" disabled={saving} onClick={handleSave}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </>
          }
        >
          <SupplierForm form={form} onChange={setForm} error={formError} />
        </AdminModal>
      )}
    </div>
  )
}

/** Детальная страница — /platform/suppliers/:id */
export function SupplierDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useSession()
  const { version, refresh } = useAdminRefresh()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_SUPPLIER_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const canView = canViewSuppliers(user)
  const canEdit = canEditSuppliers(user)
  const canArchive = canArchiveSuppliers(user)
  const canDelete = canDeleteSuppliers(user)

  void version

  const supplier = id ? getSupplierById(id) : null

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к поставщикам" />
  }

  function openEdit(item) {
    setForm(supplierToForm(item))
    setFormError('')
    setShowForm(true)
  }

  async function handleSave() {
    if (!supplier) return
    setFormError('')
    if (!form.name.trim()) {
      setFormError('Укажите название поставщика')
      return
    }
    setSaving(true)
    try {
      await updateSupplier(supplier.id, formToSupplierPayload(form))
      await refresh()
      setShowForm(false)
    } catch (err) {
      setFormError(err.message || 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(item) {
    if (!window.confirm(`Архивировать поставщика «${item.name}»?`)) return
    await archiveSupplier(item.id)
    await refresh()
    navigate('/platform/suppliers')
  }

  async function handleDelete(item) {
    if (!window.confirm(`Удалить поставщика «${item.name}» без возможности восстановления?`)) return
    await deleteSupplier(item.id)
    await refresh()
    navigate('/platform/suppliers')
  }

  return (
    <>
      <SupplierDetails
        supplier={supplier}
        canEdit={canEdit}
        canArchive={canArchive}
        canDelete={canDelete}
        onEdit={openEdit}
        onArchive={handleArchive}
        onDelete={handleDelete}
      />

      {showForm && canEdit && (
        <AdminModal
          title="Редактировать поставщика"
          onClose={() => setShowForm(false)}
          wide
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setShowForm(false)}>
                Отмена
              </button>
              <button type="button" className="btn btn--primary" disabled={saving} onClick={handleSave}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </>
          }
        >
          <SupplierForm form={form} onChange={setForm} error={formError} />
        </AdminModal>
      )}
    </>
  )
}

export default function SuppliersPage() {
  return <SuppliersListPage />
}
