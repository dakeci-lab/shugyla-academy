import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import {
  canViewPurchases,
  canEditPurchase,
  canTransferToReceiving,
} from '../../../config/permissions'
import {
  getPurchaseOrderByIdSync,
  updatePurchaseOrder,
  cancelPurchaseOrder,
  transferPurchaseToReceiving,
} from '../../../services/purchaseDataService'
import {
  formatPurchaseDate,
  formatPurchaseAmount,
  calcLineTotal,
  normalizePurchaseItem,
} from '../../../utils/purchaseData'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import { PurchaseStatusBadge } from '../../../components/procurement/PurchaseStatsCards'
import PurchaseItemsTable from '../../../components/procurement/PurchaseItemsTable'
import '../../../components/admin/admin-shared.css'
import './PurchaseDetailPage.css'

/** Детальная страница закупа — /platform/procurement/:id */
export default function PurchaseDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useSession()
  const { version, refresh } = useAdminRefresh()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [items, setItems] = useState(null)

  const canView = canViewPurchases(user)
  const canEdit = canEditPurchase(user)
  const canTransfer = canTransferToReceiving(user)

  void version

  const order = useMemo(() => getPurchaseOrderByIdSync(id), [id, version])
  const displayItems = items ?? order?.items ?? []

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Закуп»" />
  }

  if (!order) {
    return (
      <div className="purchase-detail">
        <p className="purchase-detail__not-found">Закуп не найден.</p>
        <Link to="/platform/procurement" className="btn btn--ghost">
          ← К списку закупов
        </Link>
      </div>
    )
  }

  const totalAmount = displayItems.reduce(
    (sum, item) => sum + calcLineTotal(item.orderQty, item.purchasePrice),
    0
  )

  function handleItemChange(itemId, patch) {
    setItems(
      displayItems.map((item) => {
        if (item.id !== itemId) return item
        const next = normalizePurchaseItem({ ...item, ...patch })
        return next
      })
    )
  }

  async function handleSave() {
    if (!canEdit) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await updatePurchaseOrder(order.id, { items: displayItems })
      setItems(null)
      await refresh()
      setMessage('Изменения сохранены.')
    } catch (err) {
      setError(err.message || 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  function handleExport() {
    window.alert('Экспорт Excel будет доступен после подключения логики.')
  }

  async function handleTransfer() {
    if (!canTransfer) return
    setError('')
    try {
      await transferPurchaseToReceiving(order.id)
      await refresh()
      window.alert('Документ будет передан в раздел Приёмка после подключения логики.')
    } catch (err) {
      setError(err.message || 'Не удалось передать в приёмку')
    }
  }

  async function handleCancel() {
    if (!canEdit) return
    if (!window.confirm(`Отменить закуп ${order.number}?`)) return
    setError('')
    try {
      await cancelPurchaseOrder(order.id)
      await refresh()
      navigate('/platform/procurement')
    } catch (err) {
      setError(err.message || 'Не удалось отменить закуп')
    }
  }

  return (
    <div className="purchase-detail">
      <div className="purchase-detail__back">
        <Link to="/platform/procurement" className="purchase-detail__back-link">
          ← К списку закупов
        </Link>
      </div>

      <div className="purchase-detail__header">
        <div>
          <h2 className="purchase-detail__number">{order.number}</h2>
          <PurchaseStatusBadge status={order.status} />
        </div>
        <div className="purchase-detail__actions">
          {canEdit && order.status !== 'cancelled' && order.status !== 'received' && (
            <>
              <button
                type="button"
                className="btn btn--primary"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
              <button type="button" className="btn btn--outline" onClick={handleExport}>
                Экспорт Excel
              </button>
              {canTransfer && (
                <button type="button" className="btn btn--outline" onClick={handleTransfer}>
                  Передать в приёмку
                </button>
              )}
              <button type="button" className="btn btn--ghost" onClick={handleCancel}>
                Отменить
              </button>
            </>
          )}
        </div>
      </div>

      {message && <p className="purchase-detail__message">{message}</p>}
      {error && <p className="admin-form__error">{error}</p>}

      <dl className="purchase-detail__meta">
        <div>
          <dt>Поставщик</dt>
          <dd>{order.supplierName || '—'}</dd>
        </div>
        <div>
          <dt>Дата</dt>
          <dd>{formatPurchaseDate(order.date)}</dd>
        </div>
        <div>
          <dt>Создал</dt>
          <dd>{order.createdByName || '—'}</dd>
        </div>
        <div>
          <dt>Ожидаемая доставка</dt>
          <dd>{formatPurchaseDate(order.expectedDeliveryDate)}</dd>
        </div>
        <div className="purchase-detail__meta-wide">
          <dt>Комментарий</dt>
          <dd>{order.comment || '—'}</dd>
        </div>
        <div>
          <dt>Сумма заказа</dt>
          <dd className="purchase-detail__total">{formatPurchaseAmount(totalAmount)}</dd>
        </div>
      </dl>

      <section className="purchase-detail__items">
        <h3 className="purchase-detail__items-title">Товары</h3>
        <PurchaseItemsTable
          items={displayItems}
          canEdit={canEdit && order.status !== 'cancelled' && order.status !== 'received'}
          onItemChange={handleItemChange}
        />
      </section>
    </div>
  )
}
