import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import {
  canViewReceivingDocuments,
  canReceiveGoods,
} from '../../../config/permissions'
import {
  getReceivingDocumentByIdSync,
  saveReceivingDocument,
  completeReceivingDocument,
} from '../../../services/receivingDataService'
import {
  formatReceivingDate,
  normalizeReceivingItem,
  calcDifferenceQty,
  RECEIVING_STATUS,
} from '../../../utils/receivingData'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import { ReceivingStatusBadge } from '../../../components/receiving/ReceivingStatsCards'
import ReceivingItemsTable from '../../../components/receiving/ReceivingItemsTable'
import '../../../components/admin/admin-shared.css'
import '../../../components/receiving/ReceivingItemsTable.css'
import '../procurement/PurchaseDetailPage.css'

/** Детальная страница приёмки — /platform/receiving/:id */
export default function ReceivingDetailPage() {
  const { id } = useParams()
  const { user } = useSession()
  const { version, refresh } = useAdminRefresh()
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [items, setItems] = useState(null)

  const canView = canViewReceivingDocuments(user)
  const canEdit = canReceiveGoods(user)

  void version

  const document = useMemo(() => getReceivingDocumentByIdSync(id), [id, version])
  const displayItems = items ?? document?.items ?? []
  const isFinalized =
    document?.status === RECEIVING_STATUS.RECEIVED ||
    document?.status === RECEIVING_STATUS.PARTIALLY_RECEIVED ||
    document?.status === 'received' ||
    document?.status === 'partial'

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Приёмка»" />
  }

  if (!document) {
    return (
      <div className="purchase-detail">
        <p className="purchase-detail__not-found">Документ приёмки не найден.</p>
        <Link to="/platform/receiving" className="btn btn--ghost">
          ← К списку приёмок
        </Link>
      </div>
    )
  }

  function handleItemChange(itemId, patch) {
    setItems(
      displayItems.map((item) => {
        if (item.id !== itemId) return item
        const next = normalizeReceivingItem({ ...item, ...patch })
        return {
          ...next,
          differenceQty: calcDifferenceQty(next.receivedQty, next.orderedQty),
        }
      })
    )
  }

  async function handleSave() {
    if (!canEdit) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await saveReceivingDocument(document.id, displayItems, user)
      setItems(null)
      await refresh()
      setMessage('Изменения сохранены.')
    } catch (err) {
      setError(err.message || 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  async function handleComplete() {
    if (!canEdit) return
    if (!window.confirm('Завершить приёмку? Статус документа будет обновлён.')) return
    setCompleting(true)
    setError('')
    setMessage('')
    try {
      await completeReceivingDocument(document.id, displayItems, user)
      setItems(null)
      await refresh()
      setMessage('Приёмка завершена.')
    } catch (err) {
      setError(err.message || 'Не удалось завершить приёмку')
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="purchase-detail">
      <div className="purchase-detail__back">
        <Link to="/platform/receiving" className="purchase-detail__back-link">
          ← К списку приёмок
        </Link>
      </div>

      <div className="purchase-detail__header">
        <div>
          <h2 className="purchase-detail__number">{document.number}</h2>
          <ReceivingStatusBadge status={document.status} />
        </div>
        {canEdit && !isFinalized && (
          <div className="purchase-detail__actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={saving || completing}
              onClick={handleSave}
            >
              {saving ? 'Сохранение…' : 'Сохранить приёмку'}
            </button>
            <button
              type="button"
              className="btn btn--outline"
              disabled={saving || completing}
              onClick={handleComplete}
            >
              {completing ? 'Завершение…' : 'Завершить приёмку'}
            </button>
          </div>
        )}
      </div>

      {message && <p className="receiving-detail__message">{message}</p>}
      {error && <p className="admin-form__error">{error}</p>}

      <dl className="purchase-detail__meta">
        <div>
          <dt>№ закупа</dt>
          <dd>
            {document.purchaseOrderId ? (
              <Link
                to={`/platform/procurement/${document.purchaseOrderId}`}
                className="receiving-detail__purchase-link"
              >
                {document.purchaseOrderNumber || document.purchaseOrderId}
              </Link>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>Поставщик</dt>
          <dd>{document.supplierName || '—'}</dd>
        </div>
        <div>
          <dt>Ожидаемая дата доставки</dt>
          <dd>{formatReceivingDate(document.expectedDeliveryDate)}</dd>
        </div>
        <div>
          <dt>Принял</dt>
          <dd>{document.receivedByName || '—'}</dd>
        </div>
        <div className="purchase-detail__meta-wide">
          <dt>Комментарий</dt>
          <dd>{document.comment || '—'}</dd>
        </div>
      </dl>

      <section className="purchase-detail__items">
        <h3 className="purchase-detail__items-title">Товары</h3>
        <ReceivingItemsTable
          items={displayItems}
          canEdit={canEdit && !isFinalized}
          onItemChange={handleItemChange}
        />
      </section>
    </div>
  )
}
