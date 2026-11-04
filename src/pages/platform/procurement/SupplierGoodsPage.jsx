import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import { usePlatformPageTitle } from '../../../context/PlatformPageTitleContext'
import { can, canEditPurchase, PERMISSION_CODES } from '../../../config/permissions'
import {
  getPurchaseOrderById,
  updatePurchaseOrder,
  addPurchaseOrderItems,
} from '../../../services/purchaseDataService'
import { catalogProductToItem } from '../../../services/purchaseCatalogService'
import {
  fetchLatestReadyProcurementSnapshot,
  fetchSnapshotItemsPage,
  fetchProcurementSupplierPlan,
  saveProcurementSupplierPlan,
  refreshSupplierStock,
} from '../../../services/procurementPlanningService'
import { buildPlannerWeekColumnLabels } from '../../../utils/procurementPlannerUx'
import { filterCatalogItems, groupCatalogItems } from '../../../utils/purchaseCatalog'
import { formatPurchaseAmount, formatPurchaseDate, calcLineTotal, isOrderDraft } from '../../../utils/purchaseData'
import useMediaQuery from '../../../hooks/useMediaQuery'
import { toProcurementUserMessage } from '../../../utils/procurementErrors'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import PlatformSyncButton from '../../../components/platform/PlatformSyncButton'
import ProcurementSupplierPlanBar from '../../../components/procurement/ProcurementSupplierPlanBar'
import CatalogTable from '../../../components/procurement/document/CatalogTable'
import '../../../components/procurement/document/SupplierGoodsModal.css'
import './SupplierGoodsPage.css'

const PAGE = 1000

/**
 * What the buyer has typed on this page is kept per document while the app is open: leaving the page
 * (back, a swipe, a tap in the menu) does not lose a long selection; adding the goods to the document clears it.
 * A row is picked by a quantity above zero — there are no ticks.
 */
const pickedByOrder = new Map()

/** «05.11» from a date: the plan line must fit on one line of a phone. */
function formatPurchaseDay(value) {
  return String(formatPurchaseDate(value) || '').replace(/\.\d{4}$/, '')
}

function formatSynced(value) {
  if (!value) return 'нет данных'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'нет данных'
  return date.toLocaleString('ru-KZ', {
    timeZone: 'Asia/Almaty',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function loadSupplierItems(snapshotId, supplierId) {
  const all = []
  for (let page = 1; page < 50; page += 1) {
    const { items } = await fetchSnapshotItemsPage({ snapshotId, page, pageSize: PAGE, platformSupplierId: supplierId })
    all.push(...items)
    if (items.length < PAGE) break
  }
  return all
}

/**
 * «Товары поставщика» — the planning table of the document's supplier on a page of its own (it is the buyer's main
 * working screen): weekly sales, stock, demand, recommendation, target days and the quantity to order. The plan bar
 * (delivery date, safety stock, skip a visit) recomputes the recommendation on the server; rows with a quantity go into the
 * document with the «Заказ» quantity. Address: /platform/procurement/documents/:id/goods.
 */
export default function SupplierGoodsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useSession()
  const { error: showError, success: showSuccess } = useToast()
  const canEdit = canEditPurchase(user)
  const canSync = can(user, PERMISSION_CODES.PROCUREMENT_EDIT)
  const isPhone = useMediaQuery('(max-width: 640px)')
  const documentPath = `/platform/procurement/documents/${id}`

  const [order, setOrder] = useState(null)
  const [orderLoading, setOrderLoading] = useState(true)
  const supplierId = order?.supplierId || null

  const [snapshot, setSnapshot] = useState(null)
  const [plan, setPlan] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [planSaving, setPlanSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())
  const [qtyEdits, setQtyEdits] = useState(() => ({ ...(pickedByOrder.get(id)?.qtyEdits || {}) }))
  const [onlyOrder, setOnlyOrder] = useState(false)
  const [openAll, setOpenAll] = useState(false)

  // Remember the selection for this document.
  useEffect(() => {
    pickedByOrder.set(id, { qtyEdits })
  }, [id, qtyEdits])

  // The document: this page works on its supplier and its delivery date.
  useEffect(() => {
    let cancelled = false
    setOrderLoading(true)
    void getPurchaseOrderById(id)
      .then((result) => {
        if (!cancelled) setOrder(result)
      })
      .catch((error) => {
        if (!cancelled) showError(toProcurementUserMessage(error, 'Не удалось загрузить заказ.'))
      })
      .finally(() => {
        if (!cancelled) setOrderLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, showError])

  const existingBarcodes = useMemo(
    () => new Set((order?.items || []).map((row) => row.barcode).filter(Boolean)),
    [order?.items]
  )
  const existingTotal = useMemo(
    () => (order?.items || []).reduce((sum, row) => sum + calcLineTotal(row.orderQty, row.purchasePrice), 0),
    [order?.items]
  )

  const reload = useCallback(
    async (snap) => {
      const [nextPlan, nextItems] = await Promise.all([
        fetchProcurementSupplierPlan(snap.id, supplierId).catch(() => null),
        loadSupplierItems(snap.id, supplierId),
      ])
      setPlan(nextPlan)
      setItems(nextItems)
      return nextPlan
    },
    [supplierId]
  )

  const saveDeliveryDate = useCallback(
    async (value) => {
      try {
        const result = await updatePurchaseOrder(id, { expectedDeliveryDate: value })
        if (result?.id) setOrder(result)
      } catch {
        /* the date is a convenience: a failed save must not break the page */
      }
    },
    [id]
  )

  const deliveryRef = useRef(null)
  deliveryRef.current = order?.expectedDeliveryDate || null

  useEffect(() => {
    if (!supplierId) return undefined
    let cancelled = false
    void (async () => {
      try {
        const snap = await fetchLatestReadyProcurementSnapshot()
        if (cancelled) return
        setSnapshot(snap)
        if (!snap?.id) return
        let current = await fetchProcurementSupplierPlan(snap.id, supplierId).catch(() => null)
        // The plan follows the document: its delivery date is the one the buyer already chose.
        if (current && deliveryRef.current && current.deliveryDate !== deliveryRef.current) {
          current = await saveProcurementSupplierPlan({
            snapshotId: snap.id,
            supplierId,
            deliveryDate: deliveryRef.current,
            safetyDays: current.safetyDays,
            skipCycles: current.skipCycles,
            updatedBy: user?.login || user?.id || '',
          }).catch(() => current)
        }
        const nextItems = await loadSupplierItems(snap.id, supplierId)
        if (cancelled) return
        setPlan(current)
        setItems(nextItems)
        if (current?.deliveryDate && current.deliveryDate !== deliveryRef.current) {
          void saveDeliveryDate(current.deliveryDate)
        }
      } catch (error) {
        if (!cancelled) showError(toProcurementUserMessage(error, 'Не удалось загрузить товары поставщика.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // The page is opened for one document and supplier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId])

  const weekLabels = useMemo(
    () => buildPlannerWeekColumnLabels(snapshot?.periodFrom, snapshot?.periodTo).labels,
    [snapshot?.periodFrom, snapshot?.periodTo]
  )
  const toOrderCount = useMemo(
    () => items.filter((item) => item.recommendedQty > 0 && !existingBarcodes.has(item.barcode)).length,
    [items, existingBarcodes]
  )
  const visible = useMemo(() => {
    const found = filterCatalogItems(items, search)
    return onlyOrder ? found.filter((item) => item.recommendedQty > 0) : found
  }, [items, search, onlyOrder])
  const searching = search.trim().length > 0
  // When the supplier's stock was last refreshed: the newest row update (a refresh touches every row), else the daily sync.
  const stockUpdatedAt = useMemo(() => {
    let latest = snapshot?.syncedAt || null
    for (const item of items) if (item.updatedAt && (!latest || item.updatedAt > latest)) latest = item.updatedAt
    return latest
  }, [items, snapshot?.syncedAt])
  const groups = useMemo(() => groupCatalogItems(visible), [visible])

  // A row is picked when it has a quantity; the recommendation is only a hint (the placeholder) until it is typed or taken.
  const quantityOf = (item) => qtyEdits[item.barcode] ?? ''
  const selected = useMemo(
    () => new Set(items.filter((item) => (Number(qtyEdits[item.barcode]) || 0) > 0).map((item) => item.barcode)),
    [items, qtyEdits]
  )

  /** One click: every row with a recommendation takes the recommended quantity. */
  function selectRecommended() {
    const rows = items.filter((item) => item.recommendedQty > 0 && !existingBarcodes.has(item.barcode))
    setQtyEdits((current) => {
      const next = { ...current }
      for (const item of rows) next[item.barcode] = String(item.recommendedQty)
      return next
    })
  }

  function toggleGroup(key) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function changeQuantity(item, value) {
    setQtyEdits((current) => ({ ...current, [item.barcode]: value }))
  }

  async function handlePlanChange(patch) {
    if (!plan || !snapshot?.id || planSaving) return
    setPlanSaving(true)
    try {
      const next = await saveProcurementSupplierPlan({
        snapshotId: snapshot.id,
        supplierId,
        deliveryDate: 'deliveryDate' in patch ? patch.deliveryDate : plan.deliveryDateIsCustom ? plan.deliveryDate : null,
        safetyDays: 'safetyDays' in patch ? patch.safetyDays : plan.safetyDays,
        skipCycles: 'skipCycles' in patch ? patch.skipCycles : plan.skipCycles,
        updatedBy: user?.login || user?.id || '',
      })
      setQtyEdits({})
      await reload(snapshot)
      setPlan(next)
      if (next?.deliveryDate) void saveDeliveryDate(next.deliveryDate)
    } catch (error) {
      showError(toProcurementUserMessage(error, 'Не удалось пересчитать план поставщика.'))
    } finally {
      setPlanSaving(false)
    }
  }

  /** One UMAG request: the stock of THIS supplier only, then its plan is recomputed (sales stay from the daily sync). */
  async function handleRefreshStock() {
    if (!canSync || syncing || !snapshot?.id) return
    setSyncing(true)
    try {
      const result = await refreshSupplierStock(supplierId)
      if (!result.success) {
        showError(result.message)
        return
      }
      showSuccess('Остатки поставщика обновлены')
      setQtyEdits({})
      await reload(snapshot)
    } catch (error) {
      showError(error?.message || 'Не удалось обновить остатки')
    } finally {
      setSyncing(false)
    }
  }

  async function handleAdd() {
    const rows = items
      .filter((item) => !existingBarcodes.has(item.barcode))
      .map((item) => ({ item, qty: Number(quantityOf(item)) || 0 }))
      .filter((row) => row.qty > 0)
    if (!rows.length) {
      showError('Укажите количество в столбце «Заказ» хотя бы у одного товара.')
      return
    }
    setAdding(true)
    try {
      const payload = rows.map(({ item, qty }) => ({
        ...catalogProductToItem(item, { orderQty: qty }),
        supplierId: order.supplierId,
        supplierName: order.supplierName,
      }))
      await addPurchaseOrderItems(order.id, payload)
      pickedByOrder.delete(id)
      showSuccess(`Добавлено товаров: ${payload.length}`)
      navigate(documentPath)
    } catch (error) {
      showError(toProcurementUserMessage(error, 'Не удалось добавить товары.'))
    } finally {
      setAdding(false)
    }
  }

  usePlatformPageTitle(order?.supplierName ? `Товары · ${order.supplierName}` : 'Товары поставщика', '', {
    showBack: true,
    backFallback: documentPath,
  })

  const chosen = items.filter((item) => !existingBarcodes.has(item.barcode) && (Number(quantityOf(item)) || 0) > 0)
  const picked = chosen.length
  const pickedSum = chosen.reduce((sum, item) => sum + calcLineTotal(Number(quantityOf(item)) || 0, item.purchasePrice), 0)
  const min = plan?.minOrderAmount > 0 ? plan.minOrderAmount : 0
  const orderSum = existingTotal + pickedSum
  const shortToMin = min > 0 && orderSum < min ? min - orderSum : 0

  if (!canEdit) return <PlatformAccessDenied title="Нет доступа к подбору товаров" />
  if (orderLoading && !order) return <p className="sgm__hint">Загрузка…</p>
  if (!order) return <p className="sgm__hint">Заказ не найден.</p>
  if (!isOrderDraft(order)) {
    return (
      <div className="sgp">
        <p className="sgm__hint">Товары можно подбирать только в черновике заказа.</p>
        <button type="button" className="btn btn--outline" onClick={() => navigate(documentPath)}>
          К заказу
        </button>
      </div>
    )
  }
  if (!supplierId) {
    return (
      <div className="sgp">
        <p className="sgm__hint">Сначала выберите поставщика в заказе.</p>
        <button type="button" className="btn btn--outline" onClick={() => navigate(documentPath)}>
          К заказу
        </button>
      </div>
    )
  }

  return (
    <div className="sgp">
      {!isPhone ? (
        <div className="sgp__head">
          <button type="button" className="btn btn--outline" onClick={() => navigate(documentPath)}>
            ← К заказу
          </button>
          <h1 className="sgp__title">Товары поставщика · {order.supplierName}</h1>
        </div>
      ) : null}

      <div className="sgm">
        <div className="sgm__top">
          <input
            type="search"
            className="sgm__search"
            placeholder="Товар или штрихкод…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoComplete="off"
          />
          <label className="sgm__toggle">
            <input type="checkbox" checked={onlyOrder} onChange={(event) => setOnlyOrder(event.target.checked)} />
            <span>{isPhone ? 'К заказу' : 'Только к заказу'} ({toOrderCount})</span>
          </label>
          <button type="button" className="btn btn--outline btn--sm" disabled={toOrderCount === 0} onClick={selectRecommended}>
            {isPhone ? 'Рекомендованные' : 'Выбрать рекомендованные'}
          </button>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => setOpenAll((value) => !value)}>
            {openAll || onlyOrder ? 'Свернуть' : 'Развернуть'}{isPhone ? '' : ' всё'}
          </button>
          <span className="sgm__spacer" />
          {snapshot ? <span className="sgm__synced">Остатки: {formatSynced(stockUpdatedAt)}</span> : null}
          {canSync ? (
            <PlatformSyncButton
              onClick={() => void handleRefreshStock()}
              syncing={syncing}
              title="Обновить остатки этого поставщика из UMAG"
              aria-label="Обновить остатки поставщика"
            />
          ) : null}
        </div>
        {isPhone && plan ? (
          <details className="sgm__plan">
            <summary>
              {plan.deliveryDate ? `Доставка ${formatPurchaseDay(plan.deliveryDate)} · ` : ''}цель {plan.targetDays} дн.
            </summary>
            <ProcurementSupplierPlanBar plan={plan} supplierName={order.supplierName} saving={planSaving} showMinimum={false} onChange={handlePlanChange} />
          </details>
        ) : (
          <ProcurementSupplierPlanBar plan={plan} supplierName={order.supplierName} saving={planSaving} showMinimum={false} onChange={handlePlanChange} />
        )}
        {loading ? (
          <p className="sgm__hint">Загрузка…</p>
        ) : !snapshot?.id ? (
          <p className="sgm__hint">Данных UMAG пока нет. Обновите их кнопкой справа.</p>
        ) : items.length === 0 ? (
          <p className="sgm__hint">
            У поставщика нет товаров в последних данных UMAG.
            {canSync ? ' Обновите остатки кнопкой справа или добавьте товары из номенклатуры в самом заказе.' : ''}
          </p>
        ) : (
          <CatalogTable
            groups={groups}
            weekLabels={weekLabels}
            expanded={expanded}
            expandAll={searching || onlyOrder || openAll}
            onToggleGroup={toggleGroup}
            selected={selected}
            showChecks={false}
            onToggleItem={() => {}}
            onToggleMany={() => {}}
            quantityOf={quantityOf}
            onQuantity={changeQuantity}
            inDocument={existingBarcodes}
          />
        )}
      </div>

      <div className="sgp__bar" role="region" aria-label="Выбранные товары">
        <div className="sgm__summary" aria-live="polite">
          {picked > 0 ? (
            <span>
              Выбрано: <b>{picked}</b> · <b>{formatPurchaseAmount(pickedSum)}</b>
            </span>
          ) : (
            <span className="sgm__summary--muted">Укажите количество у товаров, которые нужно заказать</span>
          )}
          {min > 0 ? (
            <span className={shortToMin > 0 ? 'sgm__summary--warn' : ''}>
              Минимальный заказ {formatPurchaseAmount(min)}
              {shortToMin > 0 ? ` · не хватает ${formatPurchaseAmount(shortToMin)}` : ' · набран'}
            </span>
          ) : null}
        </div>
        <button type="button" className="btn btn--primary" disabled={adding || picked === 0} onClick={() => void handleAdd()}>
          {adding ? 'Добавление…' : `Добавить в документ (${picked})`}
        </button>
      </div>
    </div>
  )
}
