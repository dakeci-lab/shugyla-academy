import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import {
  canViewPurchases,
  canEditPurchases,
  canCreatePurchase,
} from '../../../platform/purchaseAccess'
import {
  getPurchaseOrdersSync,
  createPurchaseOrder,
  cancelPurchaseOrder,
} from '../../../services/purchaseDataService'
import { filterActivePurchases } from '../../../utils/purchaseData'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../../../components/admin/AdminModal'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import PurchaseStatsCards from '../../../components/procurement/PurchaseStatsCards'
import PurchaseTable from '../../../components/procurement/PurchaseTable'
import CreatePurchaseForm, { EMPTY_PURCHASE_FORM } from '../../../components/procurement/CreatePurchaseForm'
import UmagImportModal from '../../../components/procurement/UmagImportModal'
import PurchaseHistoryModal from '../../../components/procurement/PurchaseHistoryModal'
import '../../../components/admin/admin-shared.css'
import './ProcurementPage.css'

/** Страница «Закуп» — /platform/procurement */
export default function ProcurementPage() {
  const { user } = useSession()
  const navigate = useNavigate()
  const { version, refresh } = useAdminRefresh()
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [form, setForm] = useState(EMPTY_PURCHASE_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')

  const canView = canViewPurchases(user)
  const canEdit = canEditPurchases(user)
  const canCreate = canCreatePurchase(user)

  void version

  const allOrders = getPurchaseOrdersSync()
  const activeOrders = useMemo(
    () => filterActivePurchases(allOrders),
    [allOrders, version]
  )

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Закуп»" />
  }

  function closeCreate() {
    setShowCreate(false)
    setForm(EMPTY_PURCHASE_FORM)
    setFormError('')
  }

  async function handleSaveDraft() {
    setFormError('')
    if (!form.supplierId && !form.supplierName.trim()) {
      setFormError('Выберите поставщика')
      return
    }

    setSaving(true)
    try {
      const id = await createPurchaseOrder({
        supplierId: form.supplierId || null,
        supplierName: form.supplierName,
        date: form.date,
        expectedDeliveryDate: form.expectedDeliveryDate,
        comment: form.comment,
        createdBy: user?.login || user?.id || '',
        createdByName: user?.name || '',
      })
      await refresh()
      closeCreate()
      navigate(`/platform/procurement/${id}`)
    } catch (err) {
      setFormError(err.message || 'Не удалось сохранить черновик')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel(order) {
    if (!window.confirm(`Отменить закуп ${order.number}?`)) return
    setActionError('')
    try {
      await cancelPurchaseOrder(order.id)
      await refresh()
    } catch (err) {
      setActionError(err.message || 'Не удалось отменить закуп')
    }
  }

  return (
    <div className="procurement-page">
      <div className="procurement-page__actions">
        {canCreate && (
          <button type="button" className="btn btn--primary" onClick={() => setShowCreate(true)}>
            Создать закуп
          </button>
        )}
        {canEdit && (
          <button type="button" className="btn btn--outline" onClick={() => setShowImport(true)}>
            Импорт из Umag
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => setShowHistory(true)}>
          История закупов
        </button>
      </div>

      <PurchaseStatsCards orders={allOrders} />

      {actionError && <p className="admin-form__error">{actionError}</p>}

      <section className="procurement-page__section">
        <h2 className="procurement-page__section-title">Активные закупы</h2>
        <PurchaseTable
          orders={activeOrders}
          canEdit={canEdit}
          onCancel={handleCancel}
        />
      </section>

      {showCreate && canCreate && (
        <AdminModal
          title="Создать закуп"
          onClose={closeCreate}
          wide
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={closeCreate}>
                Отмена
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={saving}
                onClick={handleSaveDraft}
              >
                {saving ? 'Сохранение…' : 'Сохранить черновик'}
              </button>
            </>
          }
        >
          <CreatePurchaseForm form={form} onChange={setForm} error={formError} />
        </AdminModal>
      )}

      {showImport && canEdit && (
        <UmagImportModal onClose={() => setShowImport(false)} />
      )}

      {showHistory && (
        <PurchaseHistoryModal orders={allOrders} onClose={() => setShowHistory(false)} />
      )}
    </div>
  )
}
