import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import { usePlatformData } from '../../../context/PlatformDataContext'
import { usePlatformPageTitle } from '../../../context/PlatformPageTitleContext'
import { useToast } from '../../../context/ToastContext'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import { getPlatformSection } from '../../../platform/platformNav'
import { canViewOrders, canEditPurchase, canMarkOrderChecked } from '../../../config/permissions'
import {
  getPurchaseOrderByIdSync,
  getPurchaseOrderById,
  savePurchaseOrder,
  setPurchaseOrderChecked,
  cancelSavedPurchaseOrder,
  deletePurchaseOrder,
  updatePurchaseOrder,
  addPurchaseOrderItems,
  updatePurchaseOrderItem,
  deletePurchaseOrderItem,
} from '../../../services/purchaseDataService'
import { getSuppliers } from '../../../services/platformDataService'
import { searchCatalogProducts, catalogProductToItem } from '../../../services/purchaseCatalogService'
import { isCloudMode } from '../../../lib/dataMode'
import {
  formatPurchaseAmount,
  formatPurchaseDateTime,
  calcLineTotal,
  isOrderDraft,
  isOrderSaved,
} from '../../../utils/purchaseData'
import { loadOrderChecklist, saveOrderChecklist } from '../../../utils/orderChecklistStorage'
import {
  documentTitle,
  documentTotal,
  validateDocumentForSave,
} from '../../../utils/purchaseDocument'
import { toProcurementUserMessage } from '../../../utils/procurementErrors'
import { exportPurchaseOrderPdf, exportPurchaseOrderXlsx } from '../../../utils/purchaseOrderExport'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import AdminModal from '../../../components/admin/AdminModal'
import ConfirmDialog from '../../../components/admin/ConfirmDialog'
import DocumentDateBox from '../../../components/procurement/document/DocumentDateBox'
import NomenclatureModal from '../../../components/procurement/document/NomenclatureModal'
import SupplierGoodsModal from '../../../components/procurement/document/SupplierGoodsModal'
import DocumentSupplierPicker from '../../../components/procurement/document/DocumentSupplierPicker'
import { ORDER_LABELS } from '../../../config/documentLabels'
import '../../../components/admin/admin-shared.css'
import './PurchaseDocumentPage.css'

const BUYER_LIST_PATH = '/platform/procurement'
const RECEIVER_LIST_PATH = '/platform/orders'

/**
 * Документ закупа — /platform/procurement/documents/:id. Черновик правится целиком и сохраняет каждое
 * изменение сразу (отдельного «сохранить как черновик» нет); «Сохранить» присваивает номер и отдаёт заказ приёмщику.
 * Сохранённый заказ только читается: «Отменить» возвращает его в черновик (номер остаётся).
 * Приёмщик (/platform/orders/:id) видит тот же документ только для чтения: галочки по строкам (помнятся в браузере)
 * и общая отметка «Сверено».
 */
export default function PurchaseDocumentPage() {
  const { id } = useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user } = useSession()
  const { version: dataVersion } = usePlatformData()
  const { version } = useAdminRefresh()
  const { success: showSuccess, error: showError } = useToast()

  const canView = canViewOrders(user)
  const canEdit = canEditPurchase(user)
  const canMarkChecked = canMarkOrderChecked(user)
  const LIST_PATH = canEdit ? BUYER_LIST_PATH : RECEIVER_LIST_PATH

  const [fullOrder, setFullOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [commentOpen, setCommentOpen] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [goodsOpen, setGoodsOpen] = useState(false)
  const [ticks, setTicks] = useState(() => new Set())
  const [nomenclatureOpen, setNomenclatureOpen] = useState(false)
  const [qtyDraft, setQtyDraft] = useState({})
  const exportRef = useRef(null)

  const cachedOrder = useMemo(() => getPurchaseOrderByIdSync(id), [id, version, dataVersion])
  const itemsReady = fullOrder?.id === id
  const order = itemsReady ? fullOrder : cachedOrder
  const items = itemsReady ? fullOrder.items ?? [] : []
  const draft = isOrderDraft(order)
  const saved = isOrderSaved(order)
  const editable = canEdit && draft
  // Приёмщик сверяет сохранённый заказ с накладной: галочки по строкам и общая отметка «Сверено».
  const showChecklist = saved && !canEdit && canMarkChecked
  const readerView = !canEdit

  useEffect(() => {
    setTicks(loadOrderChecklist(id))
  }, [id])

  function toggleTick(itemId) {
    setTicks((current) => {
      const next = new Set(current)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      saveOrderChecklist(id, next)
      return next
    })
  }

  useEffect(() => {
    let cancelled = false
    if (!getPurchaseOrderByIdSync(id)) setLoading(true)
    void getPurchaseOrderById(id)
      .then((result) => {
        if (cancelled) return
        setFullOrder((prev) =>
          prev && result && prev.id === result.id && prev.updatedAt === result.updatedAt ? prev : result
        )
      })
      .catch((error) => {
        if (!cancelled) showError(toProcurementUserMessage(error, 'Не удалось загрузить заказ.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, version, showError])

  useEffect(() => {
    if (!exportOpen) return undefined
    const onPointer = (event) => {
      if (!exportRef.current?.contains(event.target)) setExportOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setExportOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [exportOpen])

  usePlatformPageTitle(getPlatformSection(pathname).title, '', {
    showBack: true,
    backFallback: LIST_PATH,
  })

  const suppliers = useMemo(
    () =>
      getSuppliers()
        .filter((supplier) => supplier?.id && supplier.name && !supplier.isMerged)
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [dataVersion, version]
  )

  async function run(action, failMessage) {
    if (busy) return null
    setBusy(true)
    try {
      return await action()
    } catch (error) {
      showError(toProcurementUserMessage(error, failMessage))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function reloadOrder() {
    const result = await getPurchaseOrderById(id)
    if (result) setFullOrder(result)
    return result
  }

  async function saveMeta(patch, failMessage = 'Не удалось сохранить изменения.') {
    const result = await run(() => updatePurchaseOrder(order.id, patch), failMessage)
    if (result?.id) setFullOrder(result)
    return result
  }

  function handleSelectSupplier(supplier) {
    void saveMeta({ supplierId: supplier.id, supplierName: supplier.name })
  }

  async function handleQtyCommit(item) {
    const raw = qtyDraft[item.id]
    if (raw === undefined) return
    const next = Math.max(0, Number(raw) || 0)
    setQtyDraft(({ [item.id]: _drop, ...rest }) => rest)
    if (next === item.orderQty) return
    setFullOrder((prev) =>
      prev ? { ...prev, items: prev.items.map((row) => (row.id === item.id ? { ...row, orderQty: next } : row)) } : prev
    )
    try {
      await updatePurchaseOrderItem(order.id, item.id, { orderQty: next })
    } catch (error) {
      showError(toProcurementUserMessage(error, 'Не удалось сохранить количество.'))
      await reloadOrder()
    }
  }

  /** The row disappears at once; the server answer (the fresh order) replaces the list, a failure restores it. */
  async function handleDeleteItem(item) {
    const before = fullOrder
    setFullOrder((prev) => (prev ? { ...prev, items: prev.items.filter((row) => row.id !== item.id) } : prev))
    const fresh = await run(async () => {
      try {
        return await deletePurchaseOrderItem(order.id, item.id)
      } catch (error) {
        setFullOrder(before)
        throw error
      }
    }, 'Не удалось удалить товар.')
    if (fresh?.id) setFullOrder(fresh)
  }

  /** Adds one catalog product; the first item also fixes the supplier of an empty document. */
  async function addProduct(product) {
    if (!editable) return
    if (items.some((row) => row.barcode && row.barcode === product.barcode)) {
      showError('Этот товар уже есть в заказе.')
      return
    }
    const fresh = await run(async () => {
      let current = order
      if (!current.supplierId && product.platformSupplierId) {
        const supplier = suppliers.find((row) => row.id === product.platformSupplierId)
        if (supplier) {
          current =
            (await updatePurchaseOrder(order.id, { supplierId: supplier.id, supplierName: supplier.name })) ||
            current
        }
      } else if (current.supplierId && product.platformSupplierId && product.platformSupplierId !== current.supplierId) {
        throw new Error('Товар другого поставщика. Выберите товар выбранного поставщика.')
      }
      return addPurchaseOrderItems(order.id, [
        {
          ...catalogProductToItem(product),
          supplierId: current.supplierId,
          supplierName: current.supplierName,
        },
      ])
    }, 'Не удалось добавить товар.')
    if (fresh?.id) setFullOrder(fresh)
  }

  /** Rows ticked in «Товары поставщика»: one request, the totals are recalculated once. */
  async function addPlannedItems(rows) {
    const payload = rows.map(({ item, qty }) => ({
      ...catalogProductToItem(item, { orderQty: qty }),
      supplierId: order.supplierId,
      supplierName: order.supplierName,
    }))
    const fresh = await addPurchaseOrderItems(order.id, payload)
    if (fresh?.id) setFullOrder(fresh)
    else await reloadOrder()
    showSuccess(`Добавлено товаров: ${payload.length}`)
  }

  /** Rows ticked in «Добавить из номенклатуры»: the first product fixes the supplier of an empty document. */
  async function addNomenclatureItems(rows) {
    let current = order
    if (!current.supplierId) {
      const ids = new Set(rows.map(({ item }) => item.platformSupplierId || null))
      if (ids.size !== 1 || ids.has(null)) {
        throw new Error('Выберите товары одного поставщика (у поставщика товара должна быть привязка).')
      }
      const supplier = suppliers.find((row) => row.id === [...ids][0])
      if (!supplier) throw new Error('Поставщик товара не найден в справочнике.')
      current =
        (await updatePurchaseOrder(order.id, { supplierId: supplier.id, supplierName: supplier.name })) || current
    }
    const payload = rows.map(({ item, qty }) => ({
      ...catalogProductToItem(item, { orderQty: qty }),
      supplierId: current.supplierId,
      supplierName: current.supplierName,
    }))
    const fresh = await addPurchaseOrderItems(order.id, payload)
    if (fresh?.id) setFullOrder(fresh)
    else await reloadOrder()
    showSuccess(`Добавлено товаров: ${payload.length}`)
  }

  async function handleSave() {
    if (!editable || busy) return
    const problem = validateDocumentForSave(order, items)
    if (problem) {
      showError(problem)
      return
    }
    const result = await run(() => savePurchaseOrder(order.id), 'Не удалось сохранить заказ.')
    if (result?.id) {
      setFullOrder(result)
      showSuccess(result.number ? `Заказ №${result.number} сохранён.` : 'Заказ сохранён.')
    }
  }

  async function handleCancelSaved() {
    setConfirm(null)
    const result = await run(() => cancelSavedPurchaseOrder(order.id), 'Не удалось отменить заказ.')
    if (result?.id) {
      setFullOrder(result)
      showSuccess('Заказ возвращён в черновик.')
    }
  }

  async function handleDeleteDraft() {
    setConfirm(null)
    const ok = await run(async () => {
      await deletePurchaseOrder(order.id)
      return true
    }, 'Не удалось удалить черновик.')
    if (ok) navigate(LIST_PATH, { replace: true })
  }

  async function handleExport(kind) {
    setExportOpen(false)
    await run(
      () => (kind === 'pdf' ? exportPurchaseOrderPdf({ ...order, items }) : exportPurchaseOrderXlsx({ ...order, items })),
      kind === 'pdf' ? 'Не удалось выгрузить PDF.' : 'Не удалось выгрузить Excel.'
    )
  }

  async function handleChecked(checked) {
    const result = await run(() => setPurchaseOrderChecked(order.id, checked, user), 'Не удалось сохранить отметку.')
    if (result?.id) setFullOrder(result)
  }

  async function handleSaveComment() {
    const result = await saveMeta({ comment: commentText }, 'Не удалось сохранить комментарий.')
    if (result) setCommentOpen(false)
  }

  if (!canView) return <PlatformAccessDenied title="Нет доступа к разделу «Закуп»" />
  if (!order && loading) return <div className="pdoc"><p>Загрузка…</p></div>
  if (!order || (isOrderDraft(order) && !canEdit)) {
    return (
      <div className="pdoc">
        <p>Заказ не найден.</p>
        <Link to={LIST_PATH} className="btn btn--ghost">
          ← К списку
        </Link>
      </div>
    )
  }

  const total = documentTotal(items)
  const commentLabel = readerView ? '' : order.comment ? 'Комментарий' : editable ? 'Добавить комментарий' : ''
  const doneCount = items.filter((item) => ticks.has(item.id)).length

  return (
    <div className="pdoc">
      <div className="pdoc__head">
        <h1 className="pdoc__title">{documentTitle(order)}</h1>
        <span className="pdoc__meta">{order.createdByName || ''}</span>
        <span className="pdoc__status">{draft ? 'Черновик' : 'Сохранён'}</span>
        <span className="pdoc__spacer" />
        {commentLabel ? (
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => {
              setCommentText(order.comment || '')
              setCommentOpen(true)
            }}
          >
            {commentLabel}
          </button>
        ) : null}
      </div>

      <div className="pdoc__bar">
        {editable ? (
          <button type="button" className="btn btn--primary" disabled={busy} onClick={handleSave}>
            Сохранить
          </button>
        ) : null}
        <button type="button" className="btn btn--outline" onClick={() => navigate(LIST_PATH)}>
          Закрыть
        </button>
        <span className="pdoc__spacer" />
        {canEdit && draft ? (
          <button type="button" className="btn btn--outline pdoc__danger" disabled={busy} onClick={() => setConfirm('delete')}>
            Удалить
          </button>
        ) : null}
        {canEdit && saved ? (
          <button type="button" className="btn btn--outline pdoc__danger" disabled={busy} onClick={() => setConfirm('cancel')}>
            Отменить
          </button>
        ) : null}
        <div className="pdoc__menu" ref={exportRef}>
          <button
            type="button"
            className="btn btn--outline"
            disabled={busy || items.length === 0}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
            onClick={() => setExportOpen((open) => !open)}
          >
            Скачать ▾
          </button>
          {exportOpen ? (
            <div className="pdoc__menu-list" role="menu">
              <button type="button" role="menuitem" onClick={() => void handleExport('xlsx')}>
                Excel
              </button>
              <button type="button" role="menuitem" onClick={() => void handleExport('pdf')}>
                PDF
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="pdoc__cards">
        <div className="pdoc__card">
          <span className="pdoc__label">{ORDER_LABELS.orderDate}</span>
          <DocumentDateBox value={(order.date || order.createdAt || '').slice(0, 10)} disabled label={ORDER_LABELS.orderDate} />
        </div>
        <div className="pdoc__card">
          <span className="pdoc__label">
            {ORDER_LABELS.supplier}
            {editable ? ' *' : ''}
          </span>
          {editable ? (
            <DocumentSupplierPicker
              suppliers={suppliers}
              valueId={order.supplierId}
              valueName={order.supplierName}
              disabled={!itemsReady || items.length > 0}
              onSelect={handleSelectSupplier}
            />
          ) : (
            <span className="pdoc__value">{order.supplierName || '—'}</span>
          )}
          {editable && order.supplierId && isCloudMode() ? (
            <button type="button" className="pdoc__link" onClick={() => setGoodsOpen(true)}>
              ＋ Товары поставщика
            </button>
          ) : null}
        </div>
        <div className="pdoc__card">
          <span className="pdoc__label">
            {ORDER_LABELS.delivery}
            {editable ? ' *' : ''}
          </span>
          <DocumentDateBox
            value={order.expectedDeliveryDate || ''}
            disabled={!editable}
            label={ORDER_LABELS.delivery}
            onChange={(value) => void saveMeta({ expectedDeliveryDate: value })}
          />
        </div>
      </div>

      {readerView && order.comment ? <div className="pdoc__banner">Комментарий: {order.comment}</div> : null}

      <section className="pdoc__items">
        <div className="pdoc__items-head">
          <h2 className="pdoc__items-title">{itemsReady ? `Товары (${items.length})` : 'Товары'}</h2>
          {showChecklist ? (
            <>
              <span className="pdoc__spacer" />
              {order.checkedAt ? (
                <span className="pdoc__checked">
                  ✓ Сверено{order.checkedByName ? `: ${order.checkedByName}` : ''}, {formatPurchaseDateTime(order.checkedAt)}
                </span>
              ) : (
                <span className="pdoc__meta">
                  Сверено: {doneCount} из {items.length}
                </span>
              )}
              {order.checkedAt ? (
                <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => void handleChecked(false)}>
                  Снять отметку
                </button>
              ) : (
                <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => void handleChecked(true)}>
                  Всё сверено
                </button>
              )}
            </>
          ) : null}
        </div>
        {!itemsReady ? (
          <p className="pdoc__hint">Загрузка товаров…</p>
        ) : (
          <div className="pdoc__table-wrap">
            <table className="pdoc__table">
              <thead>
                <tr>
                  {showChecklist ? <th aria-label="Сверено" /> : null}
                  <th>№</th>
                  <th>Название товара</th>
                  <th>{ORDER_LABELS.barcode}</th>
                  {readerView ? null : <th className="r">Остаток</th>}
                  {readerView ? null : <th className="r">Продажи/день</th>}
                  <th className="r">{readerView ? 'Заказано' : 'Заказать'}</th>
                  <th className="r">Закупочная цена</th>
                  <th className="r">{ORDER_LABELS.amount}</th>
                  {editable ? <th aria-label="Удалить" /> : null}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="pdoc__empty">
                      Товаров пока нет.
                    </td>
                  </tr>
                ) : null}
                {items.map((item, index) => (
                  <tr key={item.id} className={showChecklist && ticks.has(item.id) ? 'is-done' : ''}>
                    {showChecklist ? (
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Сверено: ${item.productName}`}
                          checked={ticks.has(item.id)}
                          onChange={() => toggleTick(item.id)}
                        />
                      </td>
                    ) : null}
                    <td className="num">{index + 1}</td>
                    <td>{item.productName}</td>
                    <td className="num">{item.barcode}</td>
                    {readerView ? null : <td className="r num">{item.stock}</td>}
                    {readerView ? null : <td className="r num">{Number(item.salesPerDay || 0).toFixed(2)}</td>}
                    <td className="r">
                      {editable ? (
                        <input
                          type="number"
                          min="0"
                          className="pdoc__qty num"
                          aria-label="Заказать"
                          value={qtyDraft[item.id] ?? item.orderQty}
                          onChange={(event) => setQtyDraft((cur) => ({ ...cur, [item.id]: event.target.value }))}
                          onBlur={() => void handleQtyCommit(item)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur()
                          }}
                        />
                      ) : (
                        <span className="num">{item.orderQty}</span>
                      )}
                    </td>
                    <td className="r num">{formatPurchaseAmount(item.purchasePrice)}</td>
                    <td className="r num">
                      {formatPurchaseAmount(
                        calcLineTotal(qtyDraft[item.id] !== undefined ? qtyDraft[item.id] : item.orderQty, item.purchasePrice)
                      )}
                    </td>
                    {editable ? (
                      <td>
                        <button
                          type="button"
                          className="pdoc__remove"
                          aria-label={`Убрать «${item.productName}»`}
                          disabled={busy}
                          onClick={() => void handleDeleteItem(item)}
                        >
                          ×
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={(showChecklist ? 1 : 0) + (readerView ? 5 : 7)}>Итого</td>
                  <td className="r num">{formatPurchaseAmount(total)}</td>
                  {editable ? <td /> : null}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {editable && itemsReady ? (
          <AddItemRow
            supplierId={order.supplierId}
            disabled={busy}
            onPick={addProduct}
            onOpenNomenclature={isCloudMode() ? () => setNomenclatureOpen(true) : null}
          />
        ) : null}
      </section>

      {goodsOpen ? (
        <SupplierGoodsModal
          order={order}
          existingBarcodes={new Set(items.map((row) => row.barcode).filter(Boolean))}
          existingTotal={total}
          onAdd={addPlannedItems}
          onDeliveryDate={(value) => void saveMeta({ expectedDeliveryDate: value })}
          onClose={() => setGoodsOpen(false)}
        />
      ) : null}

      {nomenclatureOpen ? (
        <NomenclatureModal
          order={order}
          existingBarcodes={new Set(items.map((row) => row.barcode).filter(Boolean))}
          onAdd={addNomenclatureItems}
          onClose={() => setNomenclatureOpen(false)}
        />
      ) : null}

      {commentOpen ? (
        <AdminModal
          title="Комментарий"
          onClose={() => setCommentOpen(false)}
          footer={
            editable ? (
              <>
                <button type="button" className="btn btn--outline" onClick={() => setCommentOpen(false)}>
                  Отмена
                </button>
                <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void handleSaveComment()}>
                  Сохранить
                </button>
              </>
            ) : (
              <button type="button" className="btn btn--outline" onClick={() => setCommentOpen(false)}>
                Закрыть
              </button>
            )
          }
        >
          {editable ? (
            <textarea
              className="admin-form__input pdoc__comment"
              rows={4}
              value={commentText}
              placeholder="Комментарий к заказу"
              onChange={(event) => setCommentText(event.target.value)}
              autoFocus
            />
          ) : (
            <p style={{ whiteSpace: 'pre-line' }}>{order.comment}</p>
          )}
        </AdminModal>
      ) : null}

      {confirm === 'delete' ? (
        <ConfirmDialog
          title="Удалить черновик?"
          message="Черновик будет удалён безвозвратно."
          confirmLabel="Удалить"
          onConfirm={() => void handleDeleteDraft()}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
      {confirm === 'cancel' ? (
        <ConfirmDialog
          title="Отменить заказ?"
          message={`Заказ №${order.number} вернётся в черновик и исчезнет из списка приёмщика, пока вы его снова не сохраните. Номер останется прежним.`}
          confirmLabel="Отменить заказ"
          cancelLabel="Не отменять"
          onConfirm={() => void handleCancelSaved()}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </div>
  )
}

/** Add-row under the table: search by name or barcode in the platform's nomenclature (the UMAG snapshot). */
function AddItemRow({ supplierId, disabled, onPick, onOpenNomenclature }) {
  const { error: showError } = useToast()
  const [text, setText] = useState('')
  const [barcode, setBarcode] = useState('')
  const [found, setFound] = useState([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const q = text.trim()
    if (q.length < 2 || !isCloudMode()) {
      setFound([])
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(() => {
      setSearching(true)
      searchCatalogProducts({ search: q, platformSupplierId: supplierId || '' })
        .then((rows) => {
          if (!cancelled) setFound(rows)
        })
        .catch(() => {
          if (!cancelled) setFound([])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [text, supplierId])

  async function addByBarcode() {
    const code = barcode.trim()
    if (!code) return
    try {
      const rows = await searchCatalogProducts({ search: code, platformSupplierId: supplierId || '', limit: 20 })
      const exact = rows.find((row) => row.barcode === code)
      if (!exact) {
        showError(supplierId ? 'Такого штрихкода нет у этого поставщика.' : 'Товар с таким штрихкодом не найден.')
        return
      }
      setBarcode('')
      onPick(exact)
    } catch (error) {
      showError(toProcurementUserMessage(error, 'Не удалось найти товар.'))
    }
  }

  return (
    <div className="pdoc__add">
      <div className="pdoc__add-field">
        <label htmlFor="pdoc-add-name">Добавление товара</label>
        <input
          id="pdoc-add-name"
          className="pdoc__input"
          placeholder="Поиск по названию"
          value={text}
          autoComplete="off"
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
        />
        {text.trim().length >= 2 ? (
          <div className="pdoc__suggest" role="listbox">
            {found.length === 0 ? (
              <div className="pdoc__suggest-empty">{searching ? 'Поиск…' : 'Ничего не найдено'}</div>
            ) : null}
            {found.map((product) => (
              <button
                key={product.id}
                type="button"
                role="option"
                onClick={() => {
                  setText('')
                  setFound([])
                  onPick(product)
                }}
              >
                <span>{product.productName}</span>
                <span className="num">{product.barcode}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="pdoc__add-field">
        <label htmlFor="pdoc-add-barcode">Штрихкод</label>
        <input
          id="pdoc-add-barcode"
          className="pdoc__input"
          placeholder="Штрихкод"
          inputMode="numeric"
          value={barcode}
          disabled={disabled}
          onChange={(event) => setBarcode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void addByBarcode()
          }}
        />
      </div>
      {onOpenNomenclature ? (
        <button type="button" className="btn btn--outline" disabled={disabled} onClick={onOpenNomenclature}>
          Добавить из номенклатуры
        </button>
      ) : null}
    </div>
  )
}
