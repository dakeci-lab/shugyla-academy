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
  SUPPLIER_STATUS_FILTER_OPTIONS,
} from '../../../utils/supplierData'
import { useSession } from '../../../context/SessionContext'
import {
  canViewSuppliers,
  canEditSuppliers,
  canArchiveSuppliers,
  canDeleteSuppliers,
} from '../../../platform/supplierAccess'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../../../components/admin/AdminModal'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import SupplierForm, {
  EMPTY_SUPPLIER_FORM,
  supplierToForm,
  formToSupplierPayload,
} from '../../../components/suppliers/SupplierForm'
import SupplierTable from '../../../components/suppliers/SupplierTable'
import SupplierDetails from '../../../components/suppliers/SupplierDetails'
import '../../../components/admin/admin-shared.css'
import './SuppliersPage.css'

/** Страница списка поставщиков — /platform/suppliers */
export function SuppliersListPage() {
  const { user } = useSession()
  const { version, refresh } = useAdminRefresh()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_SUPPLIER_FORM)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)

  const canView = canViewSuppliers(user)
  const canEdit = canEditSuppliers(user)

  void version

  const suppliers = getSuppliers()
  const filtered = useMemo(
    () => filterSuppliers(suppliers, { search, status: statusFilter }),
    [suppliers, search, statusFilter, version]
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

  return (
    <div className="suppliers-page">
      <div className="suppliers-page__toolbar admin-toolbar">
        <div>
          <h2 className="suppliers-page__heading">Поставщики</h2>
          <p className="admin-toolbar__info">{filtered.length} из {suppliers.length}</p>
        </div>
        {canEdit && (
          <button type="button" className="btn btn--primary" onClick={openCreate}>
            Добавить поставщика
          </button>
        )}
      </div>

      <div className="suppliers-page__filters">
        <input
          type="search"
          className="admin-form__input suppliers-page__search"
          placeholder="Поиск по названию, менеджеру или телефону…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="admin-form__input suppliers-page__status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {SUPPLIER_STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {actionError && <p className="admin-form__error">{actionError}</p>}

      {filtered.length === 0 ? (
        <div className="suppliers-page__empty">
          {suppliers.length === 0
            ? 'Поставщики ещё не добавлены.'
            : 'По вашему запросу ничего не найдено.'}
        </div>
      ) : (
        <SupplierTable
          suppliers={filtered}
          canEdit={canEdit}
          onEdit={openEdit}
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
