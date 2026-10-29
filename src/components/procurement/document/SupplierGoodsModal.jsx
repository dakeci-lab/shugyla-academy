import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import { can, PERMISSION_CODES } from '../../../config/permissions'
import {
  fetchLatestReadyProcurementSnapshot,
  fetchSnapshotItemsPage,
  fetchProcurementSupplierPlan,
  saveProcurementSupplierPlan,
  ensureProcurementPlan,
  syncProcurementPlanning,
} from '../../../services/procurementPlanningService'
import { buildPlannerWeekColumnLabels } from '../../../utils/procurementPlannerUx'
import { filterCatalogItems, groupCatalogItems } from '../../../utils/purchaseCatalog'
import { formatPurchaseAmount, calcLineTotal } from '../../../utils/purchaseData'
import { toProcurementUserMessage } from '../../../utils/procurementErrors'
import AdminModal from '../../admin/AdminModal'
import PlatformSyncButton from '../../platform/PlatformSyncButton'
import ProcurementSupplierPlanBar from '../ProcurementSupplierPlanBar'
import CatalogTable from './CatalogTable'
import './SupplierGoodsModal.css'

const PAGE = 1000

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
 * «Товары поставщика» — the planning table of the document's supplier inside a window: weekly sales, stock,
 * demand, recommendation, target days and quantity to order. The plan bar (delivery date, safety stock, skip a visit)
 * recomputes the recommendation on the server; ticked rows go into the document with the «Заказ» quantity.
 */
export default function SupplierGoodsModal({
  order,
  existingBarcodes,
  existingTotal = 0,
  onAdd,
  onDeliveryDate,
  onClose,
}) {
  const { user } = useSession()
  const { error: showError, success: showSuccess } = useToast()
  const canSync = can(user, PERMISSION_CODES.PROCUREMENT_EDIT)
  const supplierId = order.supplierId

  const [snapshot, setSnapshot] = useState(null)
  const [plan, setPlan] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [planSaving, setPlanSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())
  const [selected, setSelected] = useState(() => new Set())
  const [qtyEdits, setQtyEdits] = useState({})
  const [onlyOrder, setOnlyOrder] = useState(false)
  const [openAll, setOpenAll] = useState(false)

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

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const snap = await fetchLatestReadyProcurementSnapshot()
        if (cancelled) return
        setSnapshot(snap)
        if (!snap?.id) return
        let current = await fetchProcurementSupplierPlan(snap.id, supplierId).catch(() => null)
        // The plan follows the document: its delivery date is the one the buyer already chose.
        if (current && order.expectedDeliveryDate && current.deliveryDate !== order.expectedDeliveryDate) {
          current = await saveProcurementSupplierPlan({
            snapshotId: snap.id,
            supplierId,
            deliveryDate: order.expectedDeliveryDate,
            safetyDays: current.safetyDays,
            skipCycles: current.skipCycles,
            updatedBy: user?.login || user?.id || '',
          }).catch(() => current)
        }
        const nextItems = await loadSupplierItems(snap.id, supplierId)
        if (cancelled) return
        setPlan(current)
        setItems(nextItems)
        if (current?.deliveryDate && current.deliveryDate !== order.expectedDeliveryDate) {
          onDeliveryDate?.(current.deliveryDate)
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
    // The window is opened for one document and supplier.
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
  const groups = useMemo(() => groupCatalogItems(visible), [visible])

  // The recommendation is only a hint until the row is ticked; ticking takes it as the quantity.
  const quantityOf = (item) => {
    if (item.barcode in qtyEdits) return qtyEdits[item.barcode]
    return selected.has(item.barcode) && item.recommendedQty > 0 ? String(item.recommendedQty) : ''
  }

  /** One click: every row with a recommendation is ticked and takes the recommended quantity. */
  function selectRecommended() {
    const rows = items.filter((item) => item.recommendedQty > 0 && !existingBarcodes.has(item.barcode))
    setQtyEdits((current) => {
      const next = { ...current }
      for (const item of rows) delete next[item.barcode]
      return next
    })
    setSelected((current) => {
      const next = new Set(current)
      for (const item of rows) next.add(item.barcode)
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

  function toggleItem(item) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(item.barcode)) next.delete(item.barcode)
      else next.add(item.barcode)
      return next
    })
  }

  function toggleMany(list, on) {
    setSelected((current) => {
      const next = new Set(current)
      for (const item of list) {
        if (on) next.add(item.barcode)
        else next.delete(item.barcode)
      }
      return next
    })
  }

  function changeQuantity(item, value) {
    setQtyEdits((current) => ({ ...current, [item.barcode]: value }))
    setSelected((current) => {
      const next = new Set(current)
      if (Number(value) > 0) next.add(item.barcode)
      else next.delete(item.barcode)
      return next
    })
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
      if (next?.deliveryDate) onDeliveryDate?.(next.deliveryDate)
    } catch (error) {
      showError(toProcurementUserMessage(error, 'Не удалось пересчитать план поставщика.'))
    } finally {
      setPlanSaving(false)
    }
  }

  async function handleSync() {
    if (!canSync || syncing) return
    setSyncing(true)
    try {
      const result = await syncProcurementPlanning()
      if (!result.success) {
        showError(result.message)
        return
      }
      showSuccess(`Синхронизировано: ${result.itemCount} SKU`)
      try {
        if (result.snapshotId) await ensureProcurementPlan(result.snapshotId)
      } catch {
        // the scheduled job computes the plan within a minute
      }
      const snap = await fetchLatestReadyProcurementSnapshot()
      setSnapshot(snap)
      setQtyEdits({})
      if (snap?.id) await reload(snap)
    } catch (error) {
      showError(error?.message || 'Не удалось обновить данные UMAG')
    } finally {
      setSyncing(false)
    }
  }

  async function handleAdd() {
    const chosen = items
      .filter((item) => selected.has(item.barcode) && !existingBarcodes.has(item.barcode))
      .map((item) => ({ item, qty: Number(quantityOf(item)) || 0 }))
    const ready = chosen.filter((row) => row.qty > 0)
    if (!ready.length) {
      showError('Отметьте товары и укажите количество в столбце «Заказ».')
      return
    }
    setAdding(true)
    try {
      await onAdd(ready)
      onClose()
    } catch (error) {
      showError(toProcurementUserMessage(error, 'Не удалось добавить товары.'))
    } finally {
      setAdding(false)
    }
  }

  const chosen = items.filter((item) => selected.has(item.barcode) && !existingBarcodes.has(item.barcode))
  const picked = chosen.length
  const pickedSum = chosen.reduce((sum, item) => sum + calcLineTotal(Number(quantityOf(item)) || 0, item.purchasePrice), 0)
  const min = plan?.minOrderAmount > 0 ? plan.minOrderAmount : 0
  const orderSum = existingTotal + pickedSum
  const shortToMin = min > 0 && orderSum < min ? min - orderSum : 0

  return (
    <AdminModal
      title={`Товары поставщика · ${order.supplierName}`}
      onClose={onClose}
      huge
      footer={
        <>
          <div className="sgm__summary" aria-live="polite">
            <span>
              Выбрано: <b>{picked}</b> · <b>{formatPurchaseAmount(pickedSum)}</b>
            </span>
            {min > 0 ? (
              <span className={shortToMin > 0 ? 'sgm__summary--warn' : ''}>
                Минимальный заказ {formatPurchaseAmount(min)}
                {shortToMin > 0 ? ` · не хватает ${formatPurchaseAmount(shortToMin)}` : ' · набран'}
              </span>
            ) : null}
          </div>
          <button type="button" className="btn btn--outline" onClick={onClose}>
            Закрыть
          </button>
          <button type="button" className="btn btn--primary" disabled={adding || picked === 0} onClick={() => void handleAdd()}>
            {adding ? 'Добавление…' : `Добавить в документ (${picked})`}
          </button>
        </>
      }
    >
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
            <span>Только к заказу ({toOrderCount})</span>
          </label>
          <button type="button" className="btn btn--outline btn--sm" disabled={toOrderCount === 0} onClick={selectRecommended}>
            Выбрать рекомендованные
          </button>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => setOpenAll((value) => !value)}>
            {openAll || onlyOrder ? 'Свернуть всё' : 'Развернуть всё'}
          </button>
          <span className="sgm__spacer" />
          {snapshot ? (
            <span className="sgm__synced">
              UMAG: {formatSynced(snapshot.syncedAt)} · {snapshot.itemCount} SKU
            </span>
          ) : null}
          {canSync ? (
            <PlatformSyncButton
              onClick={() => void handleSync()}
              syncing={syncing}
              title="Обновить остатки и продажи из UMAG"
              aria-label="Обновить данные UMAG"
            />
          ) : null}
        </div>
        <ProcurementSupplierPlanBar plan={plan} supplierName={order.supplierName} saving={planSaving} showMinimum={false} onChange={handlePlanChange} />
        {loading ? (
          <p className="sgm__hint">Загрузка…</p>
        ) : !snapshot?.id ? (
          <p className="sgm__hint">Данных UMAG пока нет. Обновите их кнопкой справа.</p>
        ) : (
          <CatalogTable
            groups={groups}
            weekLabels={weekLabels}
            expanded={expanded}
            expandAll={searching || onlyOrder || openAll}
            onToggleGroup={toggleGroup}
            selected={selected}
            onToggleItem={toggleItem}
            onToggleMany={toggleMany}
            quantityOf={quantityOf}
            onQuantity={changeQuantity}
            inDocument={existingBarcodes}
          />
        )}
      </div>
    </AdminModal>
  )
}
