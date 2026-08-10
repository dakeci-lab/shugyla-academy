import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import {
  canViewPurchases,
  canEditPurchase,
  canTransferToReceiving,
} from '../../../config/permissions'
import {
  getPurchaseOrderByIdSync,
  getPurchaseOrderById,
  cancelPurchaseOrder,
  transferPurchaseToReceiving,
  addPurchaseOrderItem,
  updatePurchaseOrderItem,
  deletePurchaseOrderItem,
} from '../../../services/purchaseDataService'
import { isSimpleWorkflow } from '../../../utils/procurementWorkflow'
import {
  formatPurchaseDate,
  formatPurchaseAmount,
  calcLineTotal,
  PURCHASE_STATUS,
} from '../../../utils/purchaseData'
import {
  exportPurchaseOrderPdf,
  exportPurchaseOrderXlsx,
} from '../../../utils/purchaseOrderExport'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../../../components/admin/AdminModal'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import { PurchaseStatusBadge } from '../../../components/procurement/PurchaseStatsCards'
import PurchaseItemsTable from '../../../components/procurement/PurchaseItemsTable'
import PurchaseItemForm, {
  EMPTY_PURCHASE_ITEM_FORM,
  purchaseItemToForm,
  formToPurchaseItem,
  validatePurchaseItemForm,
} from '../../../components/procurement/PurchaseItemForm'
import { DownloadIcon, FileTextIcon } from '../../../components/icons/PlatformIcons'
import '../../../components/admin/admin-shared.css'
import './PurchaseDetailPage.css'

/** Детальная страница закупа — /platform/procurement/:id */
export default function PurchaseDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useSession()
  const { version, refresh } = useAdminRefresh()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [itemForm, setItemForm] = useState(EMPTY_PURCHASE_ITEM_FORM)
  const [itemFormError, setItemFormError] = useState('')
  const [itemSaving, setItemSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [loadedOrder, setLoadedOrder] = useState(null)
  const [loadingOrder, setLoadingOrder] = useState(true)

  const canView = canViewPurchases(user)
  const canEdit = canEditPurchase(user)
  const canTransfer = canTransferToReceiving(user)

  void version

  const cachedOrder = useMemo(() => getPurchaseOrderByIdSync(id), [id, version])
  const order = cachedOrder || loadedOrder
  const displayItems = order?.items ?? []
  const alreadyTransferred = Boolean(order?.transferredToReceiving || order?.receivingDocumentId)
  const canEditItems = canEdit && order?.status === PURCHASE_STATUS.DRAFT

  useEffect(() => {
    let cancelled = false
    setLoadingOrder(true)
    setLoadedOrder(null)

    void getPurchaseOrderById(id)
      .then((result) => {
        if (!cancelled) setLoadedOrder(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Не удалось загрузить заказ')
      })
      .finally(() => {
        if (!cancelled) setLoadingOrder(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, version])

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Закуп»" />
  }

  if (!order && loadingOrder) {
    return <div className="purchase-detail"><p>Загрузка…</p></div>
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

  if (isSimpleWorkflow(order)) {
    return (
      <div className="purchase-detail">
        <p className="purchase-detail__not-found">
          Это простая закупка. Редактирование доступно в списке закупов.
        </p>
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

  function openAddItemModal() {
    setEditingItem(null)
    setItemForm(EMPTY_PURCHASE_ITEM_FORM)
    setItemFormError('')
    setItemModalOpen(true)
  }

  function openEditItemModal(item) {
    setEditingItem(item)
    setItemForm(purchaseItemToForm(item))
    setItemFormError('')
    setItemModalOpen(true)
  }

  function closeItemModal() {
    setItemModalOpen(false)
    setEditingItem(null)
    setItemForm(EMPTY_PURCHASE_ITEM_FORM)
    setItemFormError('')
  }

  async function handleSaveItem() {
    const validationError = validatePurchaseItemForm(itemForm)
    if (validationError) {
      setItemFormError(validationError)
      return
    }

    setItemSaving(true)
    setItemFormError('')
    setError('')
    setMessage('')

    const payload = formToPurchaseItem(itemForm, {
      supplierId: order.supplierId,
      supplierName: order.supplierName,
    })

    try {
      if (editingItem) {
        await updatePurchaseOrderItem(order.id, editingItem.id, payload)
        setMessage('Товар обновлён.')
      } else {
        await addPurchaseOrderItem(order.id, payload)
        setMessage('Товар добавлен.')
      }
      closeItemModal()
      await refresh()
    } catch (err) {
      setItemFormError(err.message || 'Не удалось сохранить товар')
    } finally {
      setItemSaving(false)
    }
  }

  async function handleDeleteItem(item) {
    if (!window.confirm(`Удалить «${item.productName}» из закупа?`)) return
    setError('')
    setMessage('')
    try {
      await deletePurchaseOrderItem(order.id, item.id)
      await refresh()
      setMessage('Товар удалён.')
    } catch (err) {
      setError(err.message || 'Не удалось удалить товар')
    }
  }

  async function handleExportXlsx() {
    if (exporting) return
    setExporting(true)
    setError('')
    try {
      await exportPurchaseOrderXlsx(order)
      setMessage('Excel-файл скачан.')
    } catch (err) {
      setError(err.message || 'Не удалось экспортировать Excel')
    } finally {
      setExporting(false)
    }
  }

  async function handleExportPdf() {
    if (exporting) return
    setExporting(true)
    setError('')
    try {
      await exportPurchaseOrderPdf(order)
      setMessage('PDF-файл скачан.')
    } catch (err) {
      setError(err.message || 'Не удалось экспортировать PDF')
    } finally {
      setExporting(false)
    }
  }

  async function handleTransfer() {
    if (!canTransfer || alreadyTransferred) return
    if (!displayItems.length) {
      setError('Нельзя передать в приёмку пустой закуп. Добавьте товары.')
      return
    }
    setError('')
    setMessage('')
    try {
      await transferPurchaseToReceiving(order.id, user)
      await refresh()
      setMessage('Закуп передан в приёмку.')
    } catch (err) {
      setError(err.message || 'Не удалось передать в приёмку')
    }
  }

  async function handleCancel() {
    if (!canEdit) return
    if (!window.confirm(`Отменить закуп «${order.supplierName || 'без названия'}»?`)) return
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
          ← К закупу
        </Link>
      </div>

      <div className="purchase-detail__header">
        <div>
          <h2 className="purchase-detail__title">{order.supplierName || 'Закуп'}</h2>
          <PurchaseStatusBadge status={order.status} />
        </div>
        <div className="purchase-detail__actions">
          <button
            type="button"
            className="btn btn--outline purchase-detail__icon-btn"
            onClick={() => void handleExportXlsx()}
            disabled={exporting || displayItems.length === 0}
            aria-label="Экспорт Excel"
            title="Экспорт Excel"
          >
            <DownloadIcon size={18} />
          </button>
          <button
            type="button"
            className="btn btn--outline purchase-detail__icon-btn"
            onClick={() => void handleExportPdf()}
            disabled={exporting || displayItems.length === 0}
            aria-label="Экспорт PDF"
            title="Экспорт PDF"
          >
            <FileTextIcon size={18} />
          </button>
          {canEdit && order.status !== 'cancelled' && order.status !== 'received' && (
            <>
              {canTransfer && !alreadyTransferred && order.status !== 'cancelled' && (
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
        {order.receivingDocumentId && (
          <div>
            <dt>Документ приёмки</dt>
            <dd>
              <Link to={`/platform/receiving/${order.receivingDocumentId}`}>
                Открыть приёмку
              </Link>
            </dd>
          </div>
        )}
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
        <div className="purchase-detail__items-header">
          <h3 className="purchase-detail__items-title">Товары</h3>
          {canEditItems && (
            <button type="button" className="btn btn--primary btn--sm" onClick={openAddItemModal}>
              + Добавить товар
            </button>
          )}
        </div>
        <PurchaseItemsTable
          items={displayItems}
          canEditItems={canEditItems}
          onEdit={openEditItemModal}
          onDelete={handleDeleteItem}
          onAdd={openAddItemModal}
        />
      </section>

      {itemModalOpen && (
        <AdminModal
          title={editingItem ? 'Редактировать товар' : 'Добавить товар в закуп'}
          onClose={closeItemModal}
          wide
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={closeItemModal}>
                Отмена
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={itemSaving}
                onClick={handleSaveItem}
              >
                {itemSaving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </>
          }
        >
          <PurchaseItemForm form={itemForm} onChange={setItemForm} error={itemFormError} />
        </AdminModal>
      )}
    </div>
  )
}
