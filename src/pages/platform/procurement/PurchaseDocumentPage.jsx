import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import { usePlatformData } from '../../../context/PlatformDataContext'
import { usePlatformPageTitle } from '../../../context/PlatformPageTitleContext'
import { usePlatformPageRefresh } from '../../../context/PullToRefreshContext'
import { useToast } from '../../../context/ToastContext'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import useMediaQuery from '../../../hooks/useMediaQuery'
import PurchaseDocumentPhoneActions from './PurchaseDocumentPhoneActions'
import { ChevronDownIcon } from '../../../components/icons/PlatformIcons'
import { getPlatformSection } from '../../../platform/platformNav'
import {
  canViewOrders,
  canEditPurchase,
  canMarkOrderChecked,
  canViewUmagSettlements,
} from '../../../config/permissions'
import { fetchNativeSupplierDebtSummary } from '../../../services/supplierDebtService'
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
  setPurchaseOrderDiscount,
} from '../../../services/purchaseDataService'
import { getSuppliers } from '../../../services/platformDataService'
import { searchCatalogProducts, catalogProductToItem } from '../../../services/purchaseCatalogService'
import { isCloudMode } from '../../../lib/dataMode'
import {
  formatPurchaseAmount,
  formatPurchaseDateTime,
  calcLineTotal,
  calcBonusFromPromo,
  clampDiscountPct,
  discountedPrice,
  formatPromo,
  isOrderDraft,
  isOrderSaved,
  itemReceiveQty,
  parsePromo,
} from '../../../utils/purchaseData'
import { loadOrderChecklist, saveOrderChecklist } from '../../../utils/orderChecklistStorage'
import {
  documentListPath,
  documentTitle,
  documentTotals,
  validateDocumentForSave,
} from '../../../utils/purchaseDocument'
import { toProcurementUserMessage } from '../../../utils/procurementErrors'
import { exportPurchaseOrderPdf, exportPurchaseOrderXlsx } from '../../../utils/purchaseOrderExport'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import AdminModal from '../../../components/admin/AdminModal'
import ConfirmDialog from '../../../components/admin/ConfirmDialog'
import DocumentDateBox from '../../../components/procurement/document/DocumentDateBox'
import NomenclatureModal from '../../../components/procurement/document/NomenclatureModal'
import ItemDetailSheet from '../../../components/procurement/document/ItemDetailSheet'
import DocumentSupplierPicker from '../../../components/procurement/document/DocumentSupplierPicker'
import { ORDER_LABELS } from '../../../config/documentLabels'
import '../../../components/admin/admin-shared.css'
import './PurchaseDocumentPage.css'


/**
 * Документ закупа — /platform/procurement/documents/:id. Черновик правится целиком и сохраняет каждое
 * изменение сразу (отдельного «сохранить как черновик» нет); «Сохранить» присваивает номер и отдаёт заказ приёмщику.
 * Сохранённый заказ только читается: «Отменить» возвращает его в черновик (номер остаётся).
 * Из «Заказов» (/platform/orders/:id) документ открывается ВСЕМ ролям одинаково, только для чтения (вид приёмки):
 * цены и суммы видны, галочки по строкам (помнятся в браузере) и общая отметка «Сверено», кнопка «Скачать»;
 * без «Отменить» и без правки — это есть только в «Закупе».
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
  // The view follows the ADDRESS, not the role: «Заказы» (/platform/orders/:id) is the receiving view for everyone who
  // reaches it (the director and the buyer too) — read only, a tick per row and «Сверено»; the buyer's editing document
  // lives under «Закуп» (/platform/procurement/documents/:id).
  const receivingView = documentListPath(pathname) === '/platform/orders'
  const canEdit = canEditPurchase(user) && !receivingView
  const canMarkChecked = canMarkOrderChecked(user)
  // Back goes to the list the document was opened from (by the address), not by the user's rights:
  // a director opening an order from «Заказы» must return to «Заказы», not to «Закуп».
  const LIST_PATH = documentListPath(pathname)

  const [fullOrder, setFullOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [commentOpen, setCommentOpen] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentBlockOpen, setCommentBlockOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [ticks, setTicks] = useState(() => new Set())
  // «Поиск по таблице» above the product table (web): by name or barcode; the numbers and the totals stay those of the whole document.
  const [tableQuery, setTableQuery] = useState('')
  const [nomenclatureOpen, setNomenclatureOpen] = useState(false)
  const [qtyDraft, setQtyDraft] = useState({})
  // Typed-but-not-saved values of the promo / bonus / discount cells and of the invoice discount.
  const [fieldDraft, setFieldDraft] = useState({})
  const [orderDiscountDraft, setOrderDiscountDraft] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [supplierDebt, setSupplierDebt] = useState(null)
  const isPhone = useMediaQuery('(max-width: 640px)')
  const exportRef = useRef(null)
  const phoneHandlersRef = useRef({})

  const cachedOrder = useMemo(() => getPurchaseOrderByIdSync(id), [id, version, dataVersion])
  const itemsReady = fullOrder?.id === id
  const order = itemsReady ? fullOrder : cachedOrder
  const items = itemsReady ? fullOrder.items ?? [] : []
  const draft = isOrderDraft(order)
  const saved = isOrderSaved(order)
  const editable = canEdit && draft
  // Приёмщик сверяет сохранённый заказ с накладной: галочки по строкам и общая отметка «Сверено».
  const showChecklist = saved && !canEdit && canMarkChecked
  // «Скачать»: only a saved document; in «Приёмка» — only once the receiving itself is saved («Сохранить»).
  // The tick column is only for checking: once the receiving is saved it goes away completely.
  const showTicks = showChecklist && !order?.checkedAt
  const canDownload = saved && (!showChecklist || Boolean(order?.checkedAt))
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

  // What we owe the supplier (open invoices) — shown next to the supplier like UMAG's «Баланс», for whoever sees payments.
  const canSeeDebt = canViewUmagSettlements(user) && isCloudMode()
  const debtSupplierId = order?.supplierId || null
  useEffect(() => {
    if (!canSeeDebt || !debtSupplierId) {
      setSupplierDebt(null)
      return undefined
    }
    let cancelled = false
    fetchNativeSupplierDebtSummary({ platformSupplierIds: [debtSupplierId] })
      .then((map) => {
        if (!cancelled) setSupplierDebt(map.get(debtSupplierId)?.amount ?? 0)
      })
      .catch(() => {
        if (!cancelled) setSupplierDebt(null)
      })
    return () => {
      cancelled = true
    }
  }, [canSeeDebt, debtSupplierId])

  // Swipe-to-refresh: only this order (and the supplier balance next to it), not the whole platform.
  usePlatformPageRefresh(async () => {
    if (busy) return
    const tasks = [reloadOrder()]
    if (canSeeDebt && debtSupplierId) {
      tasks.push(
        fetchNativeSupplierDebtSummary({ platformSupplierIds: [debtSupplierId] }).then((map) =>
          setSupplierDebt(map.get(debtSupplierId)?.amount ?? 0)
        )
      )
    }
    const results = await Promise.allSettled(tasks)
    if (results[0].status === 'rejected') {
      showError(toProcurementUserMessage(results[0].reason, 'Не удалось обновить заказ.'))
    }
  })

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

  // On phones the document actions live in the header as icons (trash, check, «⋯»); the node is memoized, handlers go through a ref.
  const phoneActions = useMemo(
    () =>
      isPhone && order ? (
        <PurchaseDocumentPhoneActions
          handlersRef={phoneHandlersRef}
          busy={busy}
          showSave={editable || Boolean(showChecklist && !order?.checkedAt)}
          showDelete={canEdit && draft}
          showCancel={(canEdit && saved) || Boolean(showChecklist && order?.checkedAt)}
          cancelLabel={showChecklist ? 'Отменить приёмку' : 'Отменить заказ'}
        />
      ) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPhone, Boolean(order), busy, editable, canEdit, draft, saved, showChecklist, order?.checkedAt]
  )

  usePlatformPageTitle(getPlatformSection(pathname).title, '', {
    showBack: true,
    backFallback: LIST_PATH,
    actions: phoneActions,
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

  async function handleSelectSupplier(supplier) {
    const result = await saveMeta({ supplierId: supplier.id, supplierName: supplier.name })
    if (result?.id) showSuccess('Поставщик успешно выбран')
  }

  /** One row field: the row changes at once, the server answer keeps the totals; a failure restores the document. */
  async function patchItem(item, patch, failMessage = 'Не удалось сохранить изменения.') {
    setFullOrder((prev) =>
      prev ? { ...prev, items: prev.items.map((row) => (row.id === item.id ? { ...row, ...patch } : row)) } : prev
    )
    try {
      await updatePurchaseOrderItem(order.id, item.id, patch)
    } catch (error) {
      showError(toProcurementUserMessage(error, failMessage))
      await reloadOrder()
    }
  }

  async function handleQtyCommit(item) {
    const raw = qtyDraft[item.id]
    if (raw === undefined) return
    const next = Math.max(0, Number(raw) || 0)
    setQtyDraft(({ [item.id]: _drop, ...rest }) => rest)
    if (next === item.orderQty) return
    const patch = { orderQty: next }
    // A row with a promo («5+1») keeps its bonus in step with the quantity (whole parts only).
    if (item.promoBuy) patch.bonusQty = calcBonusFromPromo(next, item.promoBuy, item.promoFree)
    await patchItem(item, patch, 'Не удалось сохранить количество.')
  }

  function setDraftField(itemId, key, value) {
    setFieldDraft((cur) => ({ ...cur, [`${itemId}:${key}`]: value }))
  }
  function takeDraftField(itemId, key) {
    const name = `${itemId}:${key}`
    const value = fieldDraft[name]
    if (value === undefined) return undefined
    setFieldDraft(({ [name]: _drop, ...rest }) => rest)
    return value
  }
  function draftField(itemId, key, fallback) {
    const value = fieldDraft[`${itemId}:${key}`]
    return value === undefined ? fallback : value
  }

  /** «Акция» text («5+1»): the bonus is recalculated by whole parts; an empty field clears the promo and the bonus. */
  async function handlePromoCommit(item) {
    const raw = takeDraftField(item.id, 'promo')
    if (raw === undefined) return
    const text = String(raw).trim()
    if (!text) {
      if (item.promoBuy) await patchItem(item, { promoBuy: null, promoFree: null, bonusQty: 0 })
      return
    }
    const promo = parsePromo(text)
    if (!promo) {
      showError('Акция записывается как «5+1»: купи 5, получи 1.')
      return
    }
    if (promo.buy === item.promoBuy && promo.free === item.promoFree) return
    // The quantity typed in the same breath counts (the sheet commits the quantity and the promo together).
    const qty = qtyDraft[item.id] !== undefined ? Math.max(0, Number(qtyDraft[item.id]) || 0) : item.orderQty
    await patchItem(item, {
      promoBuy: promo.buy,
      promoFree: promo.free,
      bonusQty: calcBonusFromPromo(qty, promo.buy, promo.free),
    })
  }

  /** The bonus typed by hand: the promo rule is dropped (it would overwrite the number at the next quantity change). */
  async function handleBonusCommit(item) {
    const raw = takeDraftField(item.id, 'bonus')
    if (raw === undefined) return
    const next = Math.max(0, Number(raw) || 0)
    if (next === item.bonusQty) return
    await patchItem(item, { bonusQty: next, promoBuy: null, promoFree: null })
  }

  async function handleDiscountCommit(item) {
    const raw = takeDraftField(item.id, 'discount')
    if (raw === undefined) return
    const next = clampDiscountPct(raw)
    if (next === item.discountPct) return
    await patchItem(item, { discountPct: next }, 'Не удалось сохранить скидку.')
  }

  /** The invoice discount: the order and the rows that still carry the previous invoice discount take the new one. */
  async function handleOrderDiscountCommit() {
    if (orderDiscountDraft === null) return
    const next = clampDiscountPct(orderDiscountDraft)
    setOrderDiscountDraft(null)
    const previous = Number(order.discountPct) || 0
    if (next === previous) return
    const fresh = await run(() => setPurchaseOrderDiscount(order.id, next, previous), 'Не удалось сохранить скидку.')
    if (fresh?.id) setFullOrder(fresh)
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
          ...catalogProductToItem(product, { discountPct: order.discountPct || 0 }),
          supplierId: current.supplierId,
          supplierName: current.supplierName,
        },
      ])
    }, 'Не удалось добавить товар.')
    if (fresh?.id) setFullOrder(fresh)
  }

  /** Rows ticked in «Товары поставщика»: one request, the totals are recalculated once. */
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
      ...catalogProductToItem(item, { orderQty: qty, discountPct: order.discountPct || 0 }),
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
    if (result?.id) {
      setFullOrder(result)
      showSuccess(checked ? 'Приёмка сохранена.' : 'Приёмка отменена: заказ можно сверять заново.')
    }
  }

  /** «Сохранить» of the receiving view: the order becomes checked on the name of whoever saved it; an incomplete tick list asks first. */
  async function handleReceive() {
    if (!showChecklist || order.checkedAt || busy) return
    if (doneCount < items.length) {
      setConfirm('receive')
      return
    }
    await handleChecked(true)
  }

  /** The «all rows» tick of the table head: ticks everything, or clears everything when everything is ticked. */
  function toggleAllTicks() {
    const everything = items.length > 0 && items.every((item) => ticks.has(item.id))
    const next = everything ? new Set() : new Set(items.map((item) => item.id))
    saveOrderChecklist(id, next)
    setTicks(next)
  }

  async function handleSaveComment() {
    const result = await saveMeta({ comment: commentText }, 'Не удалось сохранить комментарий.')
    if (result) setCommentOpen(false)
  }

  if (!canView) return <PlatformAccessDenied title="Нет доступа к разделу «Закуп»" />
  phoneHandlersRef.current = {
    save: showChecklist ? handleReceive : handleSave,
    remove: () => setConfirm('delete'),
    cancel: () => setConfirm(showChecklist ? 'unreceive' : 'cancel'),
    export: (kind) => void handleExport(kind),
  }

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

  const totals = documentTotals(items)
  const total = totals.discounted
  const hasBonus = items.some((item) => Number(item.bonusQty) > 0)
  const hasDiscount = items.some((item) => Number(item.discountPct) > 0) || Number(order.discountPct) > 0
  // The bonus and discount columns are always there for the buyer; the receiver sees them only when the order has any.
  const showBonusCols = editable || hasBonus
  const showDiscountCols = editable || hasDiscount
  const colCount =
    (showTicks ? 1 : 0) + 6 + (readerView ? 0 : 2) + (editable ? 2 : 0) + (showBonusCols ? 1 : 0) + (showBonusCols && !editable ? 1 : 0) + (showDiscountCols ? 2 : 0)
  const commentLabel = readerView ? '' : order.comment ? 'Комментарий' : editable ? 'Добавить комментарий' : ''
  const doneCount = items.filter((item) => ticks.has(item.id)).length
  const tableText = tableQuery.trim().toLowerCase()
  const shownRows = items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        !tableText ||
        (isPhone && editable) ||
        String(item.productName || '').toLowerCase().includes(tableText) ||
        String(item.barcode || '').includes(tableText)
    )
  // The quantity total of the footer: what is ordered in the whole document (the draft being typed counts as typed).
  const totalQty = items.reduce(
    (sum, item) => sum + (Number(qtyDraft[item.id] !== undefined ? qtyDraft[item.id] : item.orderQty) || 0),
    0
  )

  return (
    <div className={`pdoc${editable ? ' pdoc--editable' : ''}${isPhone && canDownload && itemsReady && items.length > 0 ? ' pdoc--has-download-bar' : ''}`}>
      <div className="pdoc__head">
        <h1 className="pdoc__title">{documentTitle(order)}</h1>
        {/* The receiving view tells who ACCEPTED the goods (only once it is saved), not who created the order. */}
        <span className="pdoc__meta">
          {showChecklist ? (order.checkedAt ? order.checkedByName || '' : '') : order.createdByName || ''}
        </span>
        <span className="pdoc__status">
          {showChecklist ? (order.checkedAt ? 'Принят' : 'Не сверен') : draft ? 'Черновик' : 'Сохранён'}
        </span>
        <span className="pdoc__spacer" />
        {commentLabel && !isPhone ? (
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

      {!isPhone ? (
      <div className="pdoc__bar">
        {editable ? (
          <button type="button" className="btn btn--primary pdoc__bar-save" disabled={busy} onClick={handleSave}>
            Сохранить
          </button>
        ) : null}
        {showChecklist && !order.checkedAt ? (
          <button type="button" className="btn btn--primary pdoc__bar-save" disabled={busy} onClick={() => void handleReceive()}>
            Сохранить
          </button>
        ) : null}
        <button type="button" className="btn btn--outline pdoc__bar-close" onClick={() => navigate(LIST_PATH)}>
          Закрыть
        </button>
        <span className="pdoc__spacer" />
        {canEdit && draft ? (
          <button type="button" className="btn btn--danger" disabled={busy} onClick={() => setConfirm('delete')}>
            Удалить
          </button>
        ) : null}
        {canEdit && saved ? (
          <button type="button" className="btn btn--outline pdoc__danger" disabled={busy} onClick={() => setConfirm('cancel')}>
            Отменить
          </button>
        ) : null}
        {showChecklist && order.checkedAt ? (
          <button type="button" className="btn btn--outline pdoc__danger" disabled={busy} onClick={() => setConfirm('unreceive')}>
            Отменить приёмку
          </button>
        ) : null}
        {canDownload ? (
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
        ) : null}
      </div>
      ) : null}

      <div className="pdoc__cards">
        <div className="pdoc__card">
          <span className="pdoc__label">{ORDER_LABELS.orderDate}</span>
          <DocumentDateBox value={(order.date || order.createdAt || '').slice(0, 10)} disabled label={ORDER_LABELS.orderDate} />
        </div>
        <div className="pdoc__group">
        <div className="pdoc__card pdoc__card--supplier">
          <span className="pdoc__label pdoc__label--row">
            <span>
              {ORDER_LABELS.supplier}
              {editable ? ' *' : ''}
            </span>
            {supplierDebt != null ? (
              <span className="pdoc__balance" title="Сколько мы должны поставщику по неоплаченным накладным">
                Баланс: <b className="num">{formatPurchaseAmount(supplierDebt)}</b>
              </span>
            ) : null}
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
        </div>
        {editable && order.supplierId && isCloudMode() ? (
          <div className="pdoc__goods-block">
            <button type="button" className="pdoc__goods-btn" onClick={() => navigate(`/platform/procurement/documents/${id}/goods`)}>
              ＋ Товары поставщика
            </button>
          </div>
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

      {editable || order.discountPct > 0 ? (
        <div className="pdoc__discount">
          <label className="pdoc__discount-label" htmlFor="pdoc-order-discount">
            Скидка на накладную, %
          </label>
          {editable ? (
            <input
              id="pdoc-order-discount"
              type="number"
              min="0"
              max="100"
              step="any"
              className="pdoc__qty num"
              placeholder="0"
              disabled={busy || !itemsReady}
              value={orderDiscountDraft !== null ? orderDiscountDraft : order.discountPct || ''}
              onChange={(event) => setOrderDiscountDraft(event.target.value)}
              onBlur={() => void handleOrderDiscountCommit()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
          ) : (
            <b className="num">{order.discountPct}%</b>
          )}
          {editable ? (
            <span className="pdoc__discount-hint">применится к строкам, у которых нет своей скидки</span>
          ) : null}
        </div>
      ) : null}

      {readerView && order.comment && !isPhone ? <div className="pdoc__banner">Комментарий: {order.comment}</div> : null}

      {isPhone ? (
        <section className="pdoc__mcomment">
          <button
            type="button"
            className="pdoc__mcomment-head"
            aria-expanded={commentBlockOpen}
            onClick={() => {
              if (!commentBlockOpen) setCommentText(order.comment || '')
              setCommentBlockOpen((open) => !open)
            }}
          >
            <span>Комментарий</span>
            {order.comment ? <i className="pdoc__mcomment-dot" aria-hidden="true" /> : null}
            <ChevronDownIcon size={20} />
          </button>
          {commentBlockOpen ? (
            editable ? (
              <textarea
                className="admin-form__input pdoc__mcomment-field"
                rows={3}
                value={commentText}
                placeholder="Комментарий к заказу"
                disabled={busy}
                onChange={(event) => setCommentText(event.target.value)}
                onBlur={() => {
                  if (commentText !== (order.comment || '')) {
                    void saveMeta({ comment: commentText }, 'Не удалось сохранить комментарий.')
                  }
                }}
              />
            ) : (
              <p className="pdoc__mcomment-text">{order.comment || 'Комментария нет'}</p>
            )
          ) : null}
        </section>
      ) : null}

      <section className="pdoc__items">
        <div className="pdoc__items-head">
          <h2 className="pdoc__items-title">{itemsReady ? `Товары (${items.length})` : 'Товары'}</h2>
          {showChecklist && !order.checkedAt ? (
            <span className="pdoc__counter" aria-live="polite">
              Сверено: {doneCount} из {items.length}
            </span>
          ) : null}
          {totals.saved > 0 ? (
            <span className="pdoc__saving" title="Сумма по базовым ценам и скидка">
              Без скидки {formatPurchaseAmount(totals.base)} · скидка −{formatPurchaseAmount(totals.saved)}
            </span>
          ) : null}
          {/* On phones only where the row of «add a product» is not there (a draft already has its own search field). */}
          {itemsReady && items.length > 0 && (!isPhone || !editable) ? (
            <input
              type="search"
              className="pdoc__table-search"
              placeholder="Поиск по таблице"
              aria-label="Поиск по таблице"
              value={tableQuery}
              onChange={(event) => setTableQuery(event.target.value)}
              autoComplete="off"
            />
          ) : null}
        </div>
        {!itemsReady ? (
          <p className="pdoc__hint">Загрузка товаров…</p>
        ) : (
          <div className="pdoc__table-wrap">
            <table className="pdoc__table">
              <thead>
                <tr>
                  {showTicks ? (
                    <th className="pdoc__c-check">
                      <input
                        type="checkbox"
                        aria-label="Отметить все строки"
                        checked={items.length > 0 && doneCount === items.length}
                        ref={(node) => {
                          if (node) node.indeterminate = doneCount > 0 && doneCount < items.length
                        }}
                        disabled={items.length === 0}
                        onChange={toggleAllTicks}
                      />
                    </th>
                  ) : null}
                  <th>№</th>
                  <th>Название товара</th>
                  <th>{ORDER_LABELS.barcode}</th>
                  {readerView ? null : <th className="r">Остаток</th>}
                  {readerView ? null : <th className="r">Продажи/день</th>}
                  <th className="r">{readerView ? 'Заказано' : 'Заказать'}</th>
                  {editable ? <th className="r pdoc__c-promo">Акция</th> : null}
                  {showBonusCols ? <th className="r pdoc__c-bonus">Бонус</th> : null}
                  {showBonusCols && !editable ? <th className="r pdoc__c-receive">Привезут</th> : null}
                  <th className="r">Закупочная цена</th>
                  {showDiscountCols ? <th className="r pdoc__c-disc">Скидка, %</th> : null}
                  {showDiscountCols ? <th className="r pdoc__c-dprice">Цена со скидкой</th> : null}
                  <th className="r">{ORDER_LABELS.amount}</th>
                  {editable ? <th aria-label="Удалить" /> : null}
                </tr>
              </thead>
              <tbody>
                {/* On phones «Товары (0)» already says it; the extra line is only for the desktop table. */}
                {items.length === 0 && !isPhone ? (
                  <tr>
                    <td colSpan={colCount} className="pdoc__empty">
                      Товаров пока нет.
                    </td>
                  </tr>
                ) : null}
                {items.length > 0 && shownRows.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="pdoc__empty">
                      Ничего не найдено.
                    </td>
                  </tr>
                ) : null}
                {shownRows.map(({ item, index }) => (
                  <tr key={item.id} className={showTicks && ticks.has(item.id) ? 'is-done' : ''}>
                    {showTicks ? (
                      <td className="pdoc__c-check">
                        <input
                          type="checkbox"
                          aria-label={`Сверено: ${item.productName}`}
                          checked={ticks.has(item.id)}
                          onChange={() => toggleTick(item.id)}
                        />
                      </td>
                    ) : null}
                    <td className="num pdoc__c-index">{index + 1}</td>
                    <td
                      className="pdoc__c-name"
                      onClick={isPhone ? () => setDetailId(item.id) : undefined}
                    >
                      {item.productName}
                      {isPhone && (item.bonusQty > 0 || item.discountPct > 0) ? (
                        <span className="pdoc__c-note">
                          {item.bonusQty > 0 ? `+${item.bonusQty} бонус` : ''}
                          {item.bonusQty > 0 && item.discountPct > 0 ? ' · ' : ''}
                          {item.discountPct > 0 ? `скидка ${item.discountPct}%` : ''}
                        </span>
                      ) : null}
                    </td>
                    <td className="num pdoc__c-code">{item.barcode}</td>
                    {readerView ? null : (
                      <td className="pdoc__c-meta">
                        Остаток {item.stock} · {Number(item.salesPerDay || 0).toFixed(1)}/дн
                      </td>
                    )}
                    {readerView ? null : (
                      <td className="r num pdoc__c-stock" data-label="Остаток">
                        {item.stock}
                      </td>
                    )}
                    {readerView ? null : (
                      <td className="r num pdoc__c-sales" data-label="Продажи/день">
                        {Number(item.salesPerDay || 0).toFixed(2)}
                      </td>
                    )}
                    <td className="r pdoc__c-qty">
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
                        <span className="num">
                          {item.orderQty}
                          <span className="pdoc__unit"> {item.unit || 'шт.'}</span>
                          {isPhone && item.bonusQty > 0 ? <span className="pdoc__bonus-inline"> +{item.bonusQty}</span> : null}
                        </span>
                      )}
                    </td>
                    {editable ? (
                      <td className="r pdoc__c-promo">
                        <input
                          type="text"
                          inputMode="text"
                          className="pdoc__qty pdoc__promo num"
                          aria-label="Акция"
                          placeholder="—"
                          value={draftField(item.id, 'promo', formatPromo(item.promoBuy, item.promoFree))}
                          onChange={(event) => setDraftField(item.id, 'promo', event.target.value)}
                          onBlur={() => void handlePromoCommit(item)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur()
                          }}
                        />
                      </td>
                    ) : null}
                    {showBonusCols ? (
                      <td className="r pdoc__c-bonus">
                        {editable ? (
                          <input
                            type="number"
                            min="0"
                            className="pdoc__qty num"
                            aria-label="Бонус"
                            value={draftField(item.id, 'bonus', item.bonusQty || '')}
                            placeholder="0"
                            onChange={(event) => setDraftField(item.id, 'bonus', event.target.value)}
                            onBlur={() => void handleBonusCommit(item)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') event.currentTarget.blur()
                            }}
                          />
                        ) : (
                          <span className="num">{item.bonusQty > 0 ? `+${item.bonusQty}` : ''}</span>
                        )}
                      </td>
                    ) : null}
                    {showBonusCols && !editable ? (
                      <td className="r num pdoc__c-receive">{itemReceiveQty(item)}</td>
                    ) : null}
                    <td className="r num pdoc__c-price">
                      {formatPurchaseAmount(isPhone ? discountedPrice(item.purchasePrice, item.discountPct) : item.purchasePrice)}
                    </td>
                    {showDiscountCols ? (
                      <td className="r pdoc__c-disc">
                        {editable ? (
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="any"
                            className="pdoc__qty num"
                            aria-label="Скидка, %"
                            value={draftField(item.id, 'discount', item.discountPct || '')}
                            placeholder="0"
                            onChange={(event) => setDraftField(item.id, 'discount', event.target.value)}
                            onBlur={() => void handleDiscountCommit(item)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') event.currentTarget.blur()
                            }}
                          />
                        ) : (
                          <span className="num">{item.discountPct > 0 ? `${item.discountPct}%` : ''}</span>
                        )}
                      </td>
                    ) : null}
                    {showDiscountCols ? (
                      <td className="r num pdoc__c-dprice">
                        {formatPurchaseAmount(
                          discountedPrice(
                            item.purchasePrice,
                            fieldDraft[`${item.id}:discount`] !== undefined
                              ? clampDiscountPct(fieldDraft[`${item.id}:discount`])
                              : item.discountPct
                          )
                        )}
                      </td>
                    ) : null}
                    <td className="r num pdoc__c-sum">
                      {formatPurchaseAmount(
                        calcLineTotal(
                          qtyDraft[item.id] !== undefined ? qtyDraft[item.id] : item.orderQty,
                          item.purchasePrice,
                          fieldDraft[`${item.id}:discount`] !== undefined
                            ? clampDiscountPct(fieldDraft[`${item.id}:discount`])
                            : item.discountPct
                        )
                      )}
                    </td>
                    {editable ? (
                      <td className="pdoc__c-del">
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
                <tr className="pdoc__total-row">
                  <td colSpan={(showTicks ? 1 : 0) + 3 + (readerView ? 0 : 2)}>Итого</td>
                  <td className="r num pdoc__total-qty">{totalQty.toLocaleString('ru-RU', { maximumFractionDigits: 3 })}</td>
                  {editable ? <td className="pdoc__total-extra" /> : null}
                  {showBonusCols ? (
                    <td className="r num pdoc__total-extra">
                      {totals.bonus > 0 ? `+${totals.bonus.toLocaleString('ru-RU', { maximumFractionDigits: 3 })}` : ''}
                    </td>
                  ) : null}
                  {showBonusCols && !editable ? (
                    <td className="r num pdoc__total-extra">
                      {(totalQty + totals.bonus).toLocaleString('ru-RU', { maximumFractionDigits: 3 })}
                    </td>
                  ) : null}
                  <td className="pdoc__total-gap" />
                  {showDiscountCols ? <td className="pdoc__total-extra" /> : null}
                  {showDiscountCols ? <td className="pdoc__total-extra" /> : null}
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

      {editable && itemsReady ? (
        <div className="pdoc__mbar">
          <div className="pdoc__mbar-total">
            <span>Итого</span>
            <strong className="num">{formatPurchaseAmount(total)}</strong>
          </div>
        </div>
      ) : null}

      {isPhone && canDownload && itemsReady && items.length > 0 ? (
        <div className="pdoc__mbar pdoc__mbar--download">
          <div className="pdoc__mbar-total">
            <span>Итого</span>
            <strong className="num">{formatPurchaseAmount(total)}</strong>
          </div>
          <div className="pdoc__mexport" ref={exportRef}>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((open) => !open)}
            >
              Скачать
            </button>
            {exportOpen ? (
              <div className="pdoc__mexport-list" role="menu">
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
      ) : null}

      {detailId && items.some((row) => row.id === detailId) ? (
        <ItemDetailSheet
          item={items.find((row) => row.id === detailId)}
          editable={editable}
          busy={busy}
          qtyValue={qtyDraft[detailId]}
          onQtyChange={(itemId, value) => setQtyDraft((cur) => ({ ...cur, [itemId]: value }))}
          onQtyCommit={(row) => void handleQtyCommit(row)}
          onPromoCommit={(row) => void handlePromoCommit(row)}
          onBonusCommit={(row) => void handleBonusCommit(row)}
          onDiscountCommit={(row) => void handleDiscountCommit(row)}
          fieldValue={draftField}
          onFieldChange={setDraftField}
          onRemove={(row) => void handleDeleteItem(row)}
          onClose={() => setDetailId(null)}
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
      {confirm === 'receive' ? (
        <ConfirmDialog
          title="Сохранить приёмку?"
          message={`Отмечено ${doneCount} из ${items.length} строк. Заказ будет сохранён как принятый на ваше имя.`}
          confirmLabel="Сохранить"
          confirmVariant="primary"
          cancelLabel="Вернуться"
          onConfirm={() => {
            setConfirm(null)
            void handleChecked(true)
          }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
      {confirm === 'unreceive' ? (
        <ConfirmDialog
          title="Отменить приёмку?"
          message="Заказ снова станет несверенным: отметки по строкам можно будет менять, а имя принявшего исчезнет, пока вы не сохраните заново."
          confirmLabel="Отменить приёмку"
          cancelLabel="Не отменять"
          onConfirm={() => {
            setConfirm(null)
            void handleChecked(false)
          }}
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
  const isPhone = useMediaQuery('(max-width: 640px)')
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
          placeholder={isPhone ? 'Название или штрихкод' : 'Поиск по названию'}
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
