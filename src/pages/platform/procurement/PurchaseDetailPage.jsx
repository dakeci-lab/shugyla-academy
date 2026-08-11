import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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
  returnPurchaseOrderToDraft,
  transferPurchaseToReceiving,
  addPurchaseOrderItem,
  updatePurchaseOrderItem,
  deletePurchaseOrderItem,
} from '../../../services/purchaseDataService'
import {
  getReceivingDocumentByIdSync,
  loadReceivingDocumentById,
} from '../../../services/receivingDataService'
import { isSimpleWorkflow } from '../../../utils/procurementWorkflow'
import {
  formatPurchaseDate,
  formatPurchaseAmount,
  calcLineTotal,
  canReturnPurchaseToDraft,
  PURCHASE_STATUS,
  RECEIVING_STARTED_MESSAGE,
} from '../../../utils/purchaseData'
import { isReceivingStarted } from '../../../utils/receivingData'
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
import {
  DownloadIcon,
  FileTextIcon,
  PencilIcon,
  TrashIcon,
} from '../../../components/icons/PlatformIcons'
import '../../../components/admin/admin-shared.css'
import './PurchaseDetailPage.css'

/** Детальная страница закупа — /platform/procurement/:id */
export default function PurchaseDetailPage() {
  const { id } = useParams()
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
  const [loadedReceiving, setLoadedReceiving] = useState(null)
  const [returningToDraft, setReturningToDraft] = useState(false)

  const canView = canViewPurchases(user)
  const canEdit = canEditPurchase(user)
  const canTransfer = canTransferToReceiving(user)

  void version

  const cachedOrder = useMemo(() => getPurchaseOrderByIdSync(id), [id, version])
  const order = cachedOrder || loadedOrder
  const displayItems = order?.items ?? []
  const alreadyTransferred = Boolean(order?.transferredToReceiving || order?.receivingDocumentId)
  const canEditItems = canEdit && order?.status === PURCHASE_STATUS.DRAFT

  const receivingDocId = order?.receivingDocumentId || null
  const cachedReceiving = useMemo(
    () => (receivingDocId ? getReceivingDocumentByIdSync(receivingDocId) : null),
    [receivingDocId, version]
  )
  const linkedReceiving = cachedReceiving || loadedReceiving
  const receivingStarted = isReceivingStarted(linkedReceiving)

  // Кнопка «Редактировать» показывается, только пока склад не тронул приёмку.
  // Сервис перепроверяет это же условие на свежих данных перед записью.
  const canReturnToDraft = canEdit && canReturnPurchaseToDraft(order, { receivingStarted })
  // Приёмка уже началась: ни правки, ни отмены. Подсказка объясняет пустое место
  // там, где закупщик привык видеть кнопки.
  const editingBlockedByReceiving =
    canEdit &&
    receivingStarted &&
    order?.status !== PURCHASE_STATUS.CANCELLED &&
    order?.status !== PURCHASE_STATUS.RECEIVED
  const canCancelOrder =
    canEdit &&
    order?.status !== PURCHASE_STATUS.CANCELLED &&
    order?.status !== PURCHASE_STATUS.RECEIVED &&
    order?.status !== PURCHASE_STATUS.DRAFT &&
    !receivingStarted
  const canDiscardDraft = canEdit && order?.status === PURCHASE_STATUS.DRAFT

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

  // Состояние связанной приёмки: из кэша, иначе одна догрузка по документу.
  useEffect(() => {
    if (!receivingDocId || cachedReceiving) {
      setLoadedReceiving(null)
      return undefined
    }

    let cancelled = false
    void loadReceivingDocumentById(receivingDocId)
      .then((result) => {
        if (!cancelled) setLoadedReceiving(result)
      })
      .catch(() => {
        // Недоступность документа приёмки не должна ломать карточку заказа:
        // запись всё равно перепроверяется в сервисе.
      })

    return () => {
      cancelled = true
    }
  }, [receivingDocId, cachedReceiving, version])

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

  async function handleReturnToDraft() {
    if (!canReturnToDraft || returningToDraft) return
    if (
      !window.confirm(
        'Вернуть заказ в черновик? Ожидаемая приёмка будет снята — склад перестанет ждать поставку, пока вы не передадите заказ снова.'
      )
    ) {
      return
    }
    setError('')
    setMessage('')
    setReturningToDraft(true)
    try {
      await returnPurchaseOrderToDraft(order.id)
      await refresh()
      setMessage('Заказ возвращён в черновик, ожидаемая приёмка снята.')
    } catch (err) {
      setError(err.message || 'Не удалось вернуть заказ в черновик')
    } finally {
      setReturningToDraft(false)
    }
  }

  /**
   * Отмена заказа и мягкое удаление черновика — одно и то же действие:
   * запись остаётся в базе, из рабочего списка уходит.
   * Страница остаётся открытой, чтобы было видно: заказ не исчез.
   */
  async function handleCancel({ draft = false } = {}) {
    if (!canEdit) return
    const question = draft
      ? `Удалить черновик «${order.supplierName || 'без названия'}»? Он останется в истории как отменённый.`
      : `Отменить заказ «${order.supplierName || 'без названия'}»? Ожидаемая приёмка тоже будет отменена.`
    if (!window.confirm(question)) return
    setError('')
    setMessage('')
    try {
      await cancelPurchaseOrder(order.id)
      await refresh()
      setMessage(draft ? 'Черновик удалён — он в списке отменённых.' : 'Заказ отменён, приёмка снята.')
    } catch (err) {
      setError(err.message || 'Не удалось отменить заказ')
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
          {canReturnToDraft && (
            <button
              type="button"
              className="btn btn--outline purchase-detail__icon-btn"
              onClick={() => void handleReturnToDraft()}
              disabled={returningToDraft}
              aria-label="Редактировать заказ"
              title="Редактировать: вернуть в черновик"
            >
              <PencilIcon size={18} />
            </button>
          )}
          {canEdit &&
            canTransfer &&
            !alreadyTransferred &&
            order.status !== PURCHASE_STATUS.CANCELLED &&
            order.status !== PURCHASE_STATUS.RECEIVED && (
              <button type="button" className="btn btn--outline" onClick={handleTransfer}>
                Передать в приёмку
              </button>
            )}
          {canCancelOrder && (
            <button type="button" className="btn btn--ghost" onClick={() => void handleCancel()}>
              Отменить заказ
            </button>
          )}
          {canDiscardDraft && (
            <button
              type="button"
              className="btn btn--ghost purchase-detail__icon-btn"
              onClick={() => void handleCancel({ draft: true })}
              aria-label="Удалить черновик"
              title="Удалить черновик"
            >
              <TrashIcon size={18} />
            </button>
          )}
        </div>
      </div>

      {editingBlockedByReceiving && (
        <p className="purchase-detail__hint">{RECEIVING_STARTED_MESSAGE}</p>
      )}

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
