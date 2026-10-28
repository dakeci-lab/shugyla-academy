import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import { usePlatformPageTitle } from '../../../context/PlatformPageTitleContext'
import { getPlatformSection } from '../../../platform/platformNav'
import { canViewOrders, canEditPurchase, canMarkOrderChecked } from '../../../config/permissions'
import {
  getPurchaseOrderByIdSync,
  getPurchaseOrderById,
  savePurchaseOrder,
  cancelSavedPurchaseOrder,
  deletePurchaseOrder,
  updatePurchaseOrder,
  setPurchaseOrderChecked,
  addPurchaseOrderItem,
  updatePurchaseOrderItem,
  deletePurchaseOrderItem,
} from '../../../services/purchaseDataService'
import {
  formatPurchaseDate,
  formatPurchaseDateTime,
  formatPurchaseAmount,
  calcLineTotal,
  isOrderDraft,
  isOrderSaved,
} from '../../../utils/purchaseData'
import { toProcurementUserMessage } from '../../../utils/procurementErrors'
import {
  exportPurchaseOrderPdf,
  exportPurchaseOrderXlsx,
} from '../../../utils/purchaseOrderExport'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../../../components/admin/AdminModal'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import { PurchaseStatusBadge } from '../../../components/procurement/PurchaseStatusBadge'
import { ORDER_LABELS } from '../../../config/documentLabels'
import PurchaseItemsTable from '../../../components/procurement/PurchaseItemsTable'
import PurchaseItemForm, {
  EMPTY_PURCHASE_ITEM_FORM,
  purchaseItemToForm,
  formToPurchaseItem,
  validatePurchaseItemForm,
} from '../../../components/procurement/PurchaseItemForm'
import { DownloadIcon, TrashIcon } from '../../../components/icons/PlatformIcons'
import '../../../components/admin/admin-shared.css'
import './PurchaseDetailPage.css'

const EXPORT_MENU_ID = 'purchase-detail-export-menu'

/** Детальная страница заказа — /platform/orders/:id */
export default function PurchaseDetailPage() {
  const { id } = useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user } = useSession()
  const { version, notifyChange } = useAdminRefresh()
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
  const [statusBusy, setStatusBusy] = useState(false)
  const [markingChecked, setMarkingChecked] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef(null)

  const canView = canViewOrders(user)
  const canEdit = canEditPurchase(user)
  const canMarkChecked = canMarkOrderChecked(user)

  void version

  const cachedOrder = useMemo(() => getPurchaseOrderByIdSync(id), [id, version])
  const order = cachedOrder || loadedOrder
  const displayItems = order?.items ?? []
  const draft = isOrderDraft(order)
  const saved = isOrderSaved(order)
  // Править можно только черновик; сохранённый сначала «Отменяют» (он возвращается в черновик).
  const canEditItems = canEdit && draft
  // «Сверено» имеет смысл только у сохранённого заказа — приёмщик сверяет им поставку.
  const canShowCheckedMark = saved

  // Заказ берём из кэша списка; по прямой ссылке (кэш ещё пуст) — одна загрузка. Дальше карточку обновляют сами действия
  // (кладут свежий заказ в кэш), поэтому повторных загрузок на каждый чих нет — раньше интерфейс мигал.
  useEffect(() => {
    if (getPurchaseOrderByIdSync(id)) {
      setLoadingOrder(false)
      return undefined
    }
    let cancelled = false
    setLoadingOrder(true)
    setLoadedOrder(null)

    void getPurchaseOrderById(id)
      .then((result) => {
        if (!cancelled) setLoadedOrder(result)
      })
      .catch((err) => {
        if (!cancelled) setError(toProcurementUserMessage(err, 'Не удалось загрузить заказ.'))
      })
      .finally(() => {
        if (!cancelled) setLoadingOrder(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Меню скачивания закрывается по клику вне и по Escape.
  useEffect(() => {
    if (!exportMenuOpen) return undefined

    function handlePointerDown(event) {
      if (!exportMenuRef.current?.contains(event.target)) setExportMenuOpen(false)
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setExportMenuOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [exportMenuOpen])

  /**
   * На телефоне системный Back перехвачен и открывает drawer, поэтому карточке
   * нужна своя кнопка «Назад» в шапке — как у остальных детальных экранов.
   * Заголовок берём тем же помощником, что и layout, чтобы он не изменился.
   */
  usePlatformPageTitle(getPlatformSection(pathname).title, '', {
    showBack: true,
    backFallback: pathname.startsWith('/platform/procurement/analytics/')
      ? '/platform/procurement/analytics'
      : '/platform/orders',
  })

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Закуп»" />
  }

  if (!order && loadingOrder) {
    return <div className="purchase-detail"><p>Загрузка…</p></div>
  }

  if (!order || (isOrderDraft(order) && !canEdit)) {
    return (
      <div className="purchase-detail">
        <p className="purchase-detail__not-found">Закуп не найден.</p>
        <Link to="/platform/orders" className="btn btn--ghost">
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
      notifyChange()
    } catch (err) {
      setItemFormError(toProcurementUserMessage(err, 'Не удалось сохранить товар.'))
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
      notifyChange()
      setMessage('Товар удалён.')
    } catch (err) {
      setError(toProcurementUserMessage(err, 'Не удалось удалить товар.'))
    }
  }

  async function handleExportXlsx() {
    if (exporting) return
    setExportMenuOpen(false)
    setExporting(true)
    setError('')
    try {
      await exportPurchaseOrderXlsx(order)
      setMessage('Excel-файл скачан.')
    } catch (err) {
      setError(toProcurementUserMessage(err, 'Не удалось выгрузить Excel.'))
    } finally {
      setExporting(false)
    }
  }

  async function handleExportPdf() {
    if (exporting) return
    setExportMenuOpen(false)
    setExporting(true)
    setError('')
    try {
      await exportPurchaseOrderPdf(order)
      setMessage('PDF-файл скачан.')
    } catch (err) {
      setError(toProcurementUserMessage(err, 'Не удалось выгрузить PDF.'))
    } finally {
      setExporting(false)
    }
  }

  async function handleToggleChecked(checked) {
    if (markingChecked) return
    setError('')
    setMessage('')
    setMarkingChecked(true)
    try {
      await setPurchaseOrderChecked(order.id, checked, user)
      notifyChange()
    } catch (err) {
      setError(toProcurementUserMessage(err, 'Не удалось сохранить отметку.'))
    } finally {
      setMarkingChecked(false)
    }
  }

  async function runStatusChange(action, successMessage, failMessage) {
    if (statusBusy) return
    setError('')
    setMessage('')
    setStatusBusy(true)
    try {
      await action()
      notifyChange()
      if (successMessage) setMessage(successMessage)
    } catch (err) {
      setError(toProcurementUserMessage(err, failMessage))
    } finally {
      setStatusBusy(false)
    }
  }

  /** «Сохранить»: заказ становится «Сохранён» и появляется у приёмщика. */
  function handleSave() {
    if (!canEdit || !draft) return
    void runStatusChange(() => savePurchaseOrder(order.id), 'Заказ сохранён.', 'Не удалось сохранить заказ.')
  }

  /** «Отменить»: сохранённый заказ возвращается в черновик и пропадает из списка приёмщика. */
  function handleCancel() {
    if (!canEdit || !saved) return
    if (
      !window.confirm(
        `Отменить заказ «${order.supplierName || 'без названия'}»? Он вернётся в черновик и исчезнет из списка приёмщика, пока вы его снова не сохраните.`
      )
    ) {
      return
    }
    void runStatusChange(() => cancelSavedPurchaseOrder(order.id), 'Заказ возвращён в черновик.', 'Не удалось отменить заказ.')
  }

  /** «Удалить»: черновик удаляется безвозвратно. */
  async function handleDeleteDraft() {
    if (!canEdit || !draft || statusBusy) return
    if (
      !window.confirm(
        `Удалить черновик «${order.supplierName || 'без названия'}» безвозвратно? Это нельзя отменить.`
      )
    ) {
      return
    }
    setError('')
    setMessage('')
    setStatusBusy(true)
    try {
      await deletePurchaseOrder(order.id)
      navigate('/platform/orders', { replace: true })
    } catch (err) {
      setError(toProcurementUserMessage(err, 'Не удалось удалить черновик.'))
      setStatusBusy(false)
    }
  }

  /** Дата доставки и комментарий правятся в черновике; запись — при выходе из поля. */
  async function handleMetaChange(patch) {
    if (!canEditItems) return
    setError('')
    try {
      await updatePurchaseOrder(order.id, patch)
      notifyChange()
    } catch (err) {
      setError(toProcurementUserMessage(err, 'Не удалось сохранить изменения.'))
    }
  }

  return (
    <div className="purchase-detail">
      <div className="purchase-detail__back">
        <Link to="/platform/orders" className="purchase-detail__back-link">
          ← К заказам
        </Link>
      </div>

      <div className="purchase-detail__header">
        <div>
          <h2 className="purchase-detail__title">{order.supplierName || 'Закуп'}</h2>
          <PurchaseStatusBadge status={order.status} />
        </div>
        <div className="purchase-detail__actions">
          <div className="purchase-detail__export" ref={exportMenuRef}>
            <button
              type="button"
              className="btn btn--outline purchase-detail__icon-btn"
              onClick={() => setExportMenuOpen((open) => !open)}
              disabled={exporting || displayItems.length === 0}
              aria-label="Скачать заказ"
              title="Скачать заказ"
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              aria-controls={exportMenuOpen ? EXPORT_MENU_ID : undefined}
              aria-busy={exporting || undefined}
            >
              <DownloadIcon size={18} />
            </button>
            {exportMenuOpen ? (
              <div
                id={EXPORT_MENU_ID}
                className="purchase-detail__export-menu"
                role="menu"
                aria-label="Формат файла"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="purchase-detail__export-item"
                  disabled={exporting}
                  onClick={() => void handleExportXlsx()}
                >
                  Excel
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="purchase-detail__export-item"
                  disabled={exporting}
                  onClick={() => void handleExportPdf()}
                >
                  PDF
                </button>
              </div>
            ) : null}
          </div>
          {canEdit && saved && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleCancel}
              disabled={statusBusy}
            >
              Отменить
            </button>
          )}
          {canEdit && draft && (
            <>
              <button
                type="button"
                className="btn btn--ghost purchase-detail__icon-btn"
                onClick={() => void handleDeleteDraft()}
                disabled={statusBusy}
                aria-label="Удалить черновик"
                title="Удалить черновик безвозвратно"
              >
                <TrashIcon size={18} />
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleSave}
                disabled={statusBusy}
              >
                Сохранить
              </button>
            </>
          )}
        </div>
      </div>


      {message && <p className="purchase-detail__message">{message}</p>}
      {error && <p className="admin-form__error">{error}</p>}

      <dl className="purchase-detail__meta">
        <div>
          <dt>{ORDER_LABELS.supplier}</dt>
          <dd>{order.supplierName || '—'}</dd>
        </div>
        <div>
          <dt>{ORDER_LABELS.orderDate}</dt>
          <dd>{formatPurchaseDate(order.date)}</dd>
        </div>
        <div>
          <dt>{ORDER_LABELS.createdBy}</dt>
          <dd>{order.createdByName || '—'}</dd>
        </div>
        <div>
          <dt>{ORDER_LABELS.delivery}</dt>
          <dd>
            {canEditItems ? (
              <span className="purchase-detail__date-edit">
                <input
                  type="date"
                  lang="ru"
                  className="admin-form__input"
                  defaultValue={order.expectedDeliveryDate || ''}
                  key={`date-${order.id}-${order.expectedDeliveryDate}`}
                  onBlur={(event) => {
                    if (event.target.value !== (order.expectedDeliveryDate || '')) {
                      void handleMetaChange({ expectedDeliveryDate: event.target.value })
                    }
                  }}
                />
                <span className="purchase-detail__hint">{formatPurchaseDate(order.expectedDeliveryDate)}</span>
              </span>
            ) : (
              formatPurchaseDate(order.expectedDeliveryDate)
            )}
          </dd>
        </div>
        {canEditItems || order.comment ? (
          <div className="purchase-detail__meta-wide">
            <dt>{ORDER_LABELS.comment}</dt>
            <dd>
              {canEditItems ? (
                <input
                  type="text"
                  className="admin-form__input"
                  defaultValue={order.comment || ''}
                  key={`comment-${order.id}-${order.comment}`}
                  placeholder="Комментарий к заказу"
                  onBlur={(event) => {
                    if (event.target.value.trim() !== (order.comment || '')) {
                      void handleMetaChange({ comment: event.target.value })
                    }
                  }}
                />
              ) : (
                order.comment
              )}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>{ORDER_LABELS.totalAmount}</dt>
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
          {canShowCheckedMark && !order.checkedAt && canMarkChecked && (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => void handleToggleChecked(true)}
              disabled={markingChecked}
            >
              Всё сверено
            </button>
          )}
        </div>
        {canShowCheckedMark && order.checkedAt && (
          <p className="purchase-detail__checked">
            <span>
              ✓ Сверено{order.checkedByName ? `: ${order.checkedByName}` : ''}, {formatPurchaseDateTime(order.checkedAt)}
            </span>
            {canMarkChecked && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => void handleToggleChecked(false)}
                disabled={markingChecked}
              >
                Снять отметку
              </button>
            )}
          </p>
        )}
        <PurchaseItemsTable
          items={displayItems}
          canEditItems={canEditItems}
          onEdit={openEditItemModal}
          onDelete={handleDeleteItem}
          onAdd={openAddItemModal}
          checklistKey={order.id}
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
