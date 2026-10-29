import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../../../context/ToastContext'
import {
  fetchLatestReadyProcurementSnapshot,
  fetchSnapshotFilterOptions,
  fetchSnapshotItemsPage,
} from '../../../services/procurementPlanningService'
import { buildPlannerWeekColumnLabels } from '../../../utils/procurementPlannerUx'
import { catalogGroupKey, buildNomenclatureTree, groupCatalogItems } from '../../../utils/purchaseCatalog'
import { toProcurementUserMessage } from '../../../utils/procurementErrors'
import AdminModal from '../../admin/AdminModal'
import CatalogTable from './CatalogTable'
import './SupplierGoodsModal.css'

const SEARCH_LIMIT = 200
const GROUP_LIMIT = 1000

/**
 * «Добавить из номенклатуры» — the whole product list of the platform (the UMAG snapshot) in the same table as
 * «Товары поставщика». Groups are collapsed and load their rows when opened; a search (2+ symbols) asks the server.
 * With a supplier on the document, other suppliers' products are disabled; without one, the first ticked product
 * fixes the supplier and the rest of the list narrows to it.
 */
export default function NomenclatureModal({ order, existingBarcodes, onAdd, onClose }) {
  const { error: showError } = useToast()
  const [snapshot, setSnapshot] = useState(null)
  const [options, setOptions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState({})
  const [loadingKeys, setLoadingKeys] = useState(() => new Set())
  const [expanded, setExpanded] = useState(() => new Set())
  const [search, setSearch] = useState('')
  const [found, setFound] = useState(null)
  const [selected, setSelected] = useState(() => new Map())
  const [qtyEdits, setQtyEdits] = useState({})
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const snap = await fetchLatestReadyProcurementSnapshot()
        if (cancelled) return
        setSnapshot(snap)
        if (snap?.id) {
          const opts = await fetchSnapshotFilterOptions(snap.id)
          if (!cancelled) setOptions(opts)
        }
      } catch (error) {
        if (!cancelled) showError(toProcurementUserMessage(error, 'Не удалось загрузить номенклатуру.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showError])

  const q = search.trim()
  const searching = q.length >= 2

  useEffect(() => {
    if (!searching || !snapshot?.id) {
      setFound(null)
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(() => {
      fetchSnapshotItemsPage({ snapshotId: snapshot.id, pageSize: SEARCH_LIMIT, search: q })
        .then(({ items }) => {
          if (!cancelled) setFound(items)
        })
        .catch((error) => {
          if (!cancelled) {
            setFound([])
            showError(toProcurementUserMessage(error, 'Не удалось выполнить поиск.'))
          }
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [q, searching, snapshot?.id, showError])

  const weekLabels = useMemo(
    () => buildPlannerWeekColumnLabels(snapshot?.periodFrom, snapshot?.periodTo).labels,
    [snapshot?.periodFrom, snapshot?.periodTo]
  )

  const tree = useMemo(() => {
    if (searching) return found ? groupCatalogItems(found) : []
    return buildNomenclatureTree(options?.categorySubcategories || [], loaded)
  }, [searching, found, options, loaded])

  // The supplier the document is (or is about to be) tied to.
  const lockedSupplierId = order.supplierId || [...selected.values()][0]?.platformSupplierId || null

  function disabledReason(item) {
    if (!lockedSupplierId) return ''
    if (item.platformSupplierId === lockedSupplierId) return ''
    return order.supplierId ? 'Товар другого поставщика' : 'Товар другого поставщика, чем выбранные'
  }

  async function toggleGroup(key) {
    const opening = !expanded.has(key)
    setExpanded((current) => {
      const next = new Set(current)
      if (opening) next.add(key)
      else next.delete(key)
      return next
    })
    if (!opening || !snapshot?.id || searching || key.startsWith('c:') || loaded[key]) return
    const sub = (options?.categorySubcategories || []).find(
      (pair) => catalogGroupKey(pair.categoryName || 'Без категории', pair.subcategoryName || 'Без категории') === key
    )
    if (!sub) return
    setLoadingKeys((current) => new Set(current).add(key))
    try {
      const { items } = await fetchSnapshotItemsPage({
        snapshotId: snapshot.id,
        pageSize: GROUP_LIMIT,
        categoryName: sub.categoryName,
        subcategoryName: sub.subcategoryName,
      })
      setLoaded((current) => ({ ...current, [key]: items }))
    } catch (error) {
      showError(toProcurementUserMessage(error, 'Не удалось загрузить товары группы.'))
    } finally {
      setLoadingKeys((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }

  const quantityOf = (item) => {
    if (item.barcode in qtyEdits) return qtyEdits[item.barcode]
    return item.recommendedQty > 0 ? String(item.recommendedQty) : ''
  }

  function setPicked(item, on) {
    setSelected((current) => {
      const next = new Map(current)
      if (on) next.set(item.barcode, item)
      else next.delete(item.barcode)
      return next
    })
  }

  function toggleItem(item) {
    setPicked(item, !selected.has(item.barcode))
  }

  function toggleMany(list, on) {
    setSelected((current) => {
      const next = new Map(current)
      for (const item of list) {
        if (on) next.set(item.barcode, item)
        else next.delete(item.barcode)
      }
      return next
    })
  }

  function changeQuantity(item, value) {
    setQtyEdits((current) => ({ ...current, [item.barcode]: value }))
    setPicked(item, Number(value) > 0)
  }

  async function handleAdd() {
    const rows = [...selected.values()]
      .filter((item) => !existingBarcodes.has(item.barcode))
      .map((item) => ({ item, qty: Number(quantityOf(item)) || 0 }))
      .filter((row) => row.qty > 0)
    if (!rows.length) {
      showError('Отметьте товары и укажите количество в столбце «Заказ».')
      return
    }
    setAdding(true)
    try {
      await onAdd(rows)
      onClose()
    } catch (error) {
      showError(toProcurementUserMessage(error, 'Не удалось добавить товары.'))
    } finally {
      setAdding(false)
    }
  }

  return (
    <AdminModal
      title="Добавить из номенклатуры"
      onClose={onClose}
      huge
      footer={
        <>
          <button type="button" className="btn btn--outline" onClick={onClose}>
            Закрыть
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={adding || selected.size === 0}
            onClick={() => void handleAdd()}
          >
            {adding ? 'Добавление…' : `Добавить в документ (${selected.size})`}
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
            autoFocus
          />
          <span className="sgm__spacer" />
          {order.supplierName ? <span className="sgm__synced">Поставщик: {order.supplierName}</span> : null}
        </div>
        {loading ? (
          <p className="sgm__hint">Загрузка…</p>
        ) : !snapshot?.id ? (
          <p className="sgm__hint">Данных UMAG пока нет. Обновите их в окне «Товары поставщика».</p>
        ) : (
          <CatalogTable
            groups={tree}
            loadingKeys={loadingKeys}
            weekLabels={weekLabels}
            expanded={expanded}
            expandAll={searching}
            onToggleGroup={(key) => void toggleGroup(key)}
            selected={new Set(selected.keys())}
            onToggleItem={toggleItem}
            onToggleMany={toggleMany}
            quantityOf={quantityOf}
            onQuantity={changeQuantity}
            inDocument={existingBarcodes}
            disabledReason={disabledReason}
          />
        )}
      </div>
    </AdminModal>
  )
}
