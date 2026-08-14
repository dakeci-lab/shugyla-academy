import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { usePlatformData } from '../../context/PlatformDataContext'
import { useToast } from '../../context/ToastContext'
import {
  can,
  canCreatePurchase,
  canTransferToReceiving,
  PERMISSION_CODES,
} from '../../config/permissions'
import { isCloudMode } from '../../lib/dataMode'
import {
  exportSnapshotItemsCsv,
  fetchLatestProcurementSnapshot,
  fetchSnapshotFilterOptions,
  fetchSnapshotItemsPage,
  fetchSnapshotAttemptItems,
  generateProcurementOrders,
  resetItemToRecommendation,
  syncProcurementPlanning,
  updateItemFinalOrderQty,
} from '../../services/procurementPlanningService'
import {
  getCachedFilterOptions,
  setCachedFilterOptions,
} from '../../services/procurementFilterOptionsCache.js'
import { invalidateProcurementNormsCache } from '../../services/procurementNormsCache'
import AdminModal from '../admin/AdminModal'
import ConfirmDialog from '../admin/ConfirmDialog'
import SearchableSupplierSelect from '../suppliers/SearchableSupplierSelect'
import PlatformSearchToolbar, {
  PlatformFilterButton,
  PlatformToolbarActionWrap,
  PlatformToolbarIconButton,
} from '../platform/PlatformSearchToolbar'
import PlatformSyncButton from '../platform/PlatformSyncButton'
import TablePagination from './TablePagination'
import {
  DownloadIcon,
  FileTextIcon,
  RotateCcwIcon,
} from '../icons/PlatformIcons'
import {
  exportProcurementPlanPdf,
  exportProcurementPlanXlsx,
} from '../../utils/procurementPlanExport'
import { getAllSuppliersSync } from '../../utils/supplierData'
import {
  EMPTY_SUPPLIER_EXPORT_MESSAGE,
  ORDER_ATTEMPT_OUTCOME,
  applyItemDeltaToFilterOptions,
  applySaveResultToFailedIds,
  buildPlannerSupplierSelectOptions,
  buildSnapshotHeadline,
  classifyGenerateOutcome,
  createOrderAttemptTracker,
  filterItemsForSupplierPlanExport,
  formatOrderHistoryLabel,
  formatOrderHistoryTitle,
  getCreateOrderDisabledReason,
  getCreateOrderTooltip,
  getExportDisabledReason,
  getExportMenuLabel,
  getExportTooltip,
  getFirstEditableItemId,
  getItemOrderHistory,
  getNextEditableItemId,
  getPlannerAlertChips,
  getSupplierWorkflowStatus,
  getSyncDisabledReason,
  getSyncTooltip,
  hasFailedSaves,
  canEditItemQuantity,
  isSnapshotQuantityEditable,
  QUANTITY_REQUIRES_SUPPLIER_HINT,
  isSupplierInTodaySchedule,
  isSupplierPlanExportOrder,
  listTodaysScheduledSuppliers,
} from '../../utils/procurementPlannerUx'
import { toProcurementUserMessage } from '../../utils/procurementErrors'
import './ProcurementPlannerView.css'

const TABLE_COL_SPAN = 9

const DEFAULT_PAGE_SIZE = 25

const EMPTY_FILTER_OPTIONS = {
  categories: [],
  categorySubcategories: [],
  suppliers: [],
  generatedSupplierCount: 0,
  pendingSupplierCount: 0,
  inconsistentSupplierCount: 0,
  unassignedOrderableCount: 0,
}

function formatNum(value, digits = 1) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('ru-KZ', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
}

function formatSyncedAt(value) {
  if (!value) return 'нет данных'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'нет данных'
  return d.toLocaleString('ru-KZ', {
    timeZone: 'Asia/Almaty',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function WeeklySpark({ values }) {
  const arr = Array.isArray(values) ? values : []
  return (
    <div className="proc-planner__weeks" title={arr.map((v) => formatNum(v, 0)).join(' · ')}>
      {arr.map((v, i) => (
        <span key={i} className={Number(v) > 0 ? 'is-hot' : ''}>
          {formatNum(v, 0)}
        </span>
      ))}
    </div>
  )
}

function PlannerTooltipButton({ tooltip, className = '', children, ...rest }) {
  return (
    <span className="proc-planner__tip-wrap" data-tooltip={tooltip}>
      <button type="button" className={className} title={tooltip} {...rest}>
        {children}
      </button>
    </span>
  )
}

/**
 * @param {{ headerSlot?: HTMLElement|null }} props
 *   headerSlot — DOM node next to the page tabs where the compact snapshot line and
 *   the action chips are portalled. Falls back to an inline strip when absent, so the
 *   component stays usable on its own.
 */
export default function ProcurementPlannerView({ headerSlot = null }) {
  const { user } = useSession()
  const { reloadProcurement, version: dataVersion } = usePlatformData()
  const { error: showError, success: showSuccess, warning: showWarning } = useToast()
  void dataVersion

  const canEditPlan = can(user, PERMISSION_CODES.PROCUREMENT_EDIT)
  const canSync = canEditPlan
  const canGenerate = canCreatePurchase(user) && canTransferToReceiving(user)

  const [snapshot, setSnapshot] = useState(null)
  const [items, setItems] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filters, setFilters] = useState({
    categoryName: '',
    subcategoryName: '',
    platformSupplierId: '',
    warningsOnly: false,
    orderableOnly: false,
    /**
     * Rows with a positive qty and no platform supplier.
     *
     * Forward-compatible: `fetchSnapshotItemsPage` destructures the filters it knows,
     * so today the flag is inert and the «Без поставщика» chip lands on the wider
     * «только к заказу» superset. It starts filtering exactly as soon as the service
     * honours it (see the contract note in docs/ and in the chip title).
     */
    unassignedOnly: false,
  })
  const [filterOptions, setFilterOptions] = useState(EMPTY_FILTER_OPTIONS)
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false)
  const [filterOptionsSnapshotId, setFilterOptionsSnapshotId] = useState('')
  const [supplierScope, setSupplierScope] = useState('today')
  const [filterOpen, setFilterOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [confirmGenerate, setConfirmGenerate] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [saveStatus, setSaveStatus] = useState('idle')
  const [pendingSaveCount, setPendingSaveCount] = useState(0)
  const [hasSaveError, setHasSaveError] = useState(false)
  const filterButtonRef = useRef(null)
  const exportMenuRef = useRef(null)
  const pendingSaveCountRef = useRef(0)
  const failedSaveIdsRef = useRef(new Set())
  const saveStatusTimerRef = useRef(null)
  const exportMenuId = 'proc-planner-export-menu'
  /** Item ids with an in-flight qty/reset save — blocks duplicate saves (Enter+blur race, rapid Enter). */
  const savingItemIdsRef = useRef(new Set())
  /**
   * Last known-committed final_order_qty per item id, refreshed from the server on every
   * loadItems() and after every successful save. Guards against a stale onBlur closure
   * (bound to the pre-save `item`) re-saving a value that Enter's onKeyDown already committed —
   * the input remounts (key includes finalOrderQty) after a save, but a lingering blur from the
   * old node would otherwise compare against the old, now-outdated item.finalOrderQty.
   */
  const lastCommittedQtyRef = useRef(new Map())
  /** Set to 'firstEditable' when Enter advances to the next page; consumed once items settle. */
  const pendingFocusRef = useRef(null)
  /**
   * One attempt key per submission, reused by a technical retry so the backend can
   * deduplicate it; a new deliberate submit after a result mints a new one.
   */
  const orderAttemptRef = useRef(null)
  if (!orderAttemptRef.current) orderAttemptRef.current = createOrderAttemptTracker()
  /**
   * Bumped after every successful order. Part of the qty input `key`, so the field is
   * remounted and ready for the next order even when the server returns the same
   * `final_order_qty` for a row that has just been ordered.
   */
  const [generationEpoch, setGenerationEpoch] = useState(0)

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (filters.categoryName) n += 1
    if (filters.subcategoryName) n += 1
    if (filters.warningsOnly) n += 1
    if (filters.orderableOnly) n += 1
    if (filters.unassignedOnly) n += 1
    return n
  }, [filters])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(t)
  }, [search])

  useEffect(
    () => () => {
      if (saveStatusTimerRef.current) window.clearTimeout(saveStatusTimerRef.current)
    },
    []
  )

  const applyFilterOptions = useCallback((snapshotId, options) => {
    setFilterOptions(options || EMPTY_FILTER_OPTIONS)
    setFilterOptionsSnapshotId(snapshotId || '')
  }, [])

  const loadFilterOptions = useCallback(
    async (snapshotId, { forceRefresh = false } = {}) => {
      if (!snapshotId) {
        applyFilterOptions('', EMPTY_FILTER_OPTIONS)
        setFilterOptionsLoading(false)
        return
      }

      const cached = getCachedFilterOptions(snapshotId)
      if (cached?.options) {
        applyFilterOptions(snapshotId, cached.options)
        setFilterOptionsLoading(false)
      } else {
        setFilterOptionsLoading(true)
      }

      try {
        await fetchSnapshotFilterOptions(snapshotId, {
          forceRefresh,
          onCached: (cachedOptions) => {
            applyFilterOptions(snapshotId, cachedOptions)
            setFilterOptionsLoading(false)
          },
          onFresh: (freshOptions) => {
            applyFilterOptions(snapshotId, freshOptions)
            setFilterOptionsLoading(false)
          },
        })
      } catch (err) {
        if (!getCachedFilterOptions(snapshotId)?.options) {
          showError(toProcurementUserMessage(err, 'Не удалось загрузить фильтры.'))
        }
      } finally {
        setFilterOptionsLoading(false)
      }
    },
    [applyFilterOptions, showError]
  )

  const loadSnapshotMeta = useCallback(async ({ forceFilterRefresh = false } = {}) => {
    if (!isCloudMode()) {
      setSnapshot(null)
      setLoading(false)
      return
    }
    try {
      const snap = await fetchLatestProcurementSnapshot()
      setSnapshot(snap)
      if (snap?.id) {
        await loadFilterOptions(snap.id, { forceRefresh: forceFilterRefresh })
      } else {
        applyFilterOptions('', EMPTY_FILTER_OPTIONS)
        setFilterOptionsLoading(false)
      }
    } catch (err) {
      showError(toProcurementUserMessage(err, 'Не удалось загрузить снимок.'))
    }
  }, [applyFilterOptions, loadFilterOptions, showError])

  const loadItems = useCallback(async () => {
    if (!snapshot?.id || snapshot.status === 'syncing' || snapshot.status === 'failed') {
      setItems([])
      setTotalCount(0)
      lastCommittedQtyRef.current = new Map()
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const result = await fetchSnapshotItemsPage({
        snapshotId: snapshot.id,
        page,
        pageSize,
        search: debouncedSearch,
        ...filters,
      })
      setItems(result.items)
      setTotalCount(result.totalCount)
      lastCommittedQtyRef.current = new Map(
        (result.items || []).map((it) => [it.id, it.finalOrderQty])
      )
    } catch (err) {
      showError(toProcurementUserMessage(err, 'Не удалось загрузить позиции.'))
    } finally {
      setLoading(false)
    }
  }, [snapshot, page, pageSize, debouncedSearch, filters, showError])

  useEffect(() => {
    void loadSnapshotMeta()
  }, [loadSnapshotMeta])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, filters, snapshot?.id])

  /**
   * An attempt key is bound to the payload it was minted for. As soon as any part of
   * that payload changes, the pending attempt is void and the next submit must mint a
   * new key — otherwise a retry would deduplicate against a different request.
   */
  useEffect(() => {
    orderAttemptRef.current.reset()
  }, [deliveryDate, filters.platformSupplierId, snapshot?.id])

  async function handleSync() {
    if (
      getSyncDisabledReason({
        canSync,
        syncing,
        pendingSaveCount: pendingSaveCountRef.current,
        hasSaveError: hasFailedSaves(failedSaveIdsRef.current),
      })
    ) {
      return
    }
    setSyncing(true)
    try {
      const result = await syncProcurementPlanning()
      if (!result.success) {
        showError(result.message)
        return
      }
      showSuccess(`Синхронизировано: ${result.itemCount} SKU`)
      invalidateProcurementNormsCache()
      await loadSnapshotMeta({ forceFilterRefresh: true })
      await loadItems()
    } catch (err) {
      showError(err?.message || 'Не удалось синхронизировать план')
    } finally {
      setSyncing(false)
    }
  }

  function beginPendingSave(_itemId) {
    pendingSaveCountRef.current += 1
    setPendingSaveCount(pendingSaveCountRef.current)
    setSaveStatus('saving')
    if (saveStatusTimerRef.current) {
      window.clearTimeout(saveStatusTimerRef.current)
      saveStatusTimerRef.current = null
    }
  }

  function endPendingSave(itemId, ok) {
    pendingSaveCountRef.current = Math.max(0, pendingSaveCountRef.current - 1)
    setPendingSaveCount(pendingSaveCountRef.current)
    failedSaveIdsRef.current = applySaveResultToFailedIds(
      failedSaveIdsRef.current,
      itemId,
      ok
    )
    const failed = hasFailedSaves(failedSaveIdsRef.current)
    setHasSaveError(failed)
    if (failed) {
      setSaveStatus('error')
      return
    }
    if (pendingSaveCountRef.current === 0) {
      setSaveStatus('saved')
      saveStatusTimerRef.current = window.setTimeout(() => {
        setSaveStatus((current) => (current === 'saved' ? 'idle' : current))
        saveStatusTimerRef.current = null
      }, 1600)
    }
  }

  /**
   * Единственный источник правды о доступности правки количества.
   * Блокируют только реальные причины: права и состояние снимка. Ранее созданный
   * заказ — не причина: повторный заказ тому же поставщику разрешён.
   */
  function canEditQuantity(item) {
    return (
      canEditPlan &&
      snapshotEditable &&
      canEditItemQuantity(item, {
        selectedSupplierId: filters.platformSupplierId,
      })
    )
  }

  /** Patch one row in place from a save response — no full-table reload/scroll/focus loss. */
  function applySavedItem(updated) {
    lastCommittedQtyRef.current.set(updated.id, updated.finalOrderQty)
    setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
  }

  /**
   * Single commit path for both blur-save and Enter-save.
   * Returns { ok, changed } — ok=false means "do not advance focus" (stale/in-flight/error).
   */
  async function commitQuantity(item, rawValue) {
    // Guard: сюда может прийти «залипшее» событие blur от input, который уже
    // не должен существовать — например, пользователь снял фильтр поставщика,
    // а браузер только теперь отдал blur. Без поставщика не сохраняем ничего.
    if (!canEditQuantity(item)) {
      if (import.meta.env.DEV) {
        console.warn('[Planner] stale qty save ignored', {
          itemId: item?.id,
          selectedSupplierId: filters.platformSupplierId,
        })
      }
      return { ok: false, changed: false, reason: 'stale' }
    }

    const knownQty = lastCommittedQtyRef.current.has(item.id)
      ? lastCommittedQtyRef.current.get(item.id)
      : item.finalOrderQty
    if (Number(rawValue) === knownQty) {
      return { ok: true, changed: false }
    }

    // Guard: Enter already started a save for this row and hasn't resolved yet —
    // a trailing blur (or a very fast repeated Enter) must not fire a second save.
    if (savingItemIdsRef.current.has(item.id)) {
      return { ok: false, changed: true, reason: 'in_flight' }
    }

    savingItemIdsRef.current.add(item.id)
    beginPendingSave(item.id)
    try {
      const updated = await updateItemFinalOrderQty(item, rawValue)
      applySavedItem(updated)
      setFilterOptions((prev) => {
        const next = applyItemDeltaToFilterOptions(prev, item, updated)
        if (snapshot?.id) setCachedFilterOptions(snapshot.id, next)
        return next
      })
      endPendingSave(item.id, true)
      return { ok: true, changed: true, updated }
    } catch (err) {
      endPendingSave(item.id, false)
      showError(toProcurementUserMessage(err, 'Не удалось сохранить количество.'))
      return { ok: false, changed: true, reason: 'error' }
    } finally {
      savingItemIdsRef.current.delete(item.id)
    }
  }

  async function handleReset(item) {
    if (!canEditQuantity(item)) return
    if (savingItemIdsRef.current.has(item.id)) return

    savingItemIdsRef.current.add(item.id)
    beginPendingSave(item.id)
    try {
      const updated = await resetItemToRecommendation(item)
      applySavedItem(updated)
      setFilterOptions((prev) => {
        const next = applyItemDeltaToFilterOptions(prev, item, updated)
        if (snapshot?.id) setCachedFilterOptions(snapshot.id, next)
        return next
      })
      endPendingSave(item.id, true)
    } catch (err) {
      endPendingSave(item.id, false)
      showError(toProcurementUserMessage(err, 'Не удалось сбросить количество.'))
    } finally {
      savingItemIdsRef.current.delete(item.id)
    }
  }

  /** Visible (not CSS-hidden by the desktop/mobile breakpoint) editable qty inputs, in DOM order. */
  function findVisibleQtyInputs() {
    return Array.from(document.querySelectorAll('[data-qty-input]')).filter(
      (node) => node.offsetParent !== null
    )
  }

  function focusQtyInputForItem(itemId) {
    const target = findVisibleQtyInputs().find((node) => node.dataset.qtyInput === String(itemId))
    if (!target) return false
    target.focus()
    target.select()
    return true
  }

  /** Enter in a qty input: commit once (if changed), then move to the next editable SKU. */
  async function handleQtyEnter(item, inputEl) {
    const result = await commitQuantity(item, inputEl.value)
    if (!result.ok) return // stale/in-flight/error — do not advance focus

    const nextId = getNextEditableItemId(items, item.id, canEditQuantity)
    if (nextId) {
      focusQtyInputForItem(nextId)
      return
    }
    if (page < totalPages) {
      pendingFocusRef.current = 'firstEditable'
      setPage((p) => p + 1)
    }
    // Last editable SKU on the last page — stay put, no wraparound.
  }

  // After Enter advances to a next page, focus the first editable qty input once it renders.
  useEffect(() => {
    if (loading) return
    if (pendingFocusRef.current !== 'firstEditable') return
    pendingFocusRef.current = null
    const id = getFirstEditableItemId(items, canEditQuantity)
    if (id) focusQtyInputForItem(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- canEditQuantity closes over per-render state intentionally; deps below are what should re-trigger this
  }, [loading, items])

  useEffect(() => {
    if (!exportMenuOpen) return undefined

    function handlePointerDown(event) {
      if (!exportMenuRef.current?.contains(event.target)) {
        setExportMenuOpen(false)
      }
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

  const subcategoryOptions = useMemo(() => {
    const pairs = filterOptions.categorySubcategories || []
    if (!filters.categoryName) return pairs
    return pairs.filter((p) => p.categoryName === filters.categoryName)
  }, [filterOptions.categorySubcategories, filters.categoryName])

  const snapshotEditable = isSnapshotQuantityEditable(snapshot?.status)

  async function runPlanExport(format) {
    if (
      getExportDisabledReason({
        snapshotId: snapshot?.id || '',
        snapshotStatus: snapshot?.status || '',
        supplierId: filters.platformSupplierId,
        exporting,
        pendingSaveCount: pendingSaveCountRef.current,
        hasSaveError: hasFailedSaves(failedSaveIdsRef.current),
        summary: selectedSupplierSummary,
      })
    ) {
      return
    }
    setExporting(true)
    setExportMenuOpen(false)
    try {
      const fetched = await exportSnapshotItemsCsv(snapshot.id, {
        platformSupplierId: filters.platformSupplierId,
        orderableOnly: true,
      })
      const rows = filterItemsForSupplierPlanExport(fetched, selectedSupplierSummary)
      if (rows.length === 0) {
        showError(EMPTY_SUPPLIER_EXPORT_MESSAGE)
        return
      }
      const meta = {
        periodFrom: snapshot.periodFrom,
        periodTo: snapshot.periodTo,
        supplierName: selectedSupplier?.name || '',
      }
      if (format === 'pdf') {
        await exportProcurementPlanPdf(rows, meta)
      } else {
        await exportProcurementPlanXlsx(rows, meta)
      }
      showSuccess(format === 'pdf' ? 'PDF экспортирован' : 'Excel экспортирован')
    } catch (err) {
      showError(toProcurementUserMessage(err, 'Не удалось выгрузить файл.'))
    } finally {
      setExporting(false)
    }
  }

  /** User consciously abandoned the submission — the next one starts a new attempt. */
  function cancelOrderAttempt() {
    orderAttemptRef.current.reset()
    setGenerateOpen(false)
    setConfirmGenerate(false)
  }

  async function runGenerate() {
    const livePending = pendingSaveCountRef.current
    const blocked = getCreateOrderDisabledReason({
      canGenerate,
      snapshotEditable,
      supplierId: filters.platformSupplierId,
      summary: selectedSupplierSummary,
      pendingSaveCount: livePending,
      hasSaveError,
      generating,
    })
    if (blocked || !snapshot?.id || !deliveryDate) return

    setGenerating(true)
    let result = null
    let thrown = null
    try {
      const pending = orderAttemptRef.current.peek()
      const attemptItems = pending
        ? []
        : await fetchSnapshotAttemptItems(snapshot.id, filters.platformSupplierId)
      const attempt = orderAttemptRef.current.begin({
        snapshotId: snapshot.id,
        supplierId: filters.platformSupplierId,
        expectedDeliveryDate: deliveryDate,
        items: attemptItems,
      })
      result = await generateProcurementOrders(snapshot.id, deliveryDate, {
        supplierId: filters.platformSupplierId,
        attemptKey: attempt.key,
        payloadFingerprint: attempt.fingerprint,
      })
    } catch (err) {
      thrown = err
    }

    const outcome = classifyGenerateOutcome({ result, error: thrown })
    orderAttemptRef.current.settle(outcome)

    try {
      if (thrown || !result?.success) {
        const message =
          thrown?.message || result?.message || 'Не удалось сформировать заказы'
        showError(
          outcome === ORDER_ATTEMPT_OUTCOME.RETRYABLE
            ? `${message} Нажмите «Создать заказ» ещё раз, чтобы повторить ту же попытку.`
            : message
        )
        return
      }

      const orderId = result.purchaseOrderIds?.[0] || null
      const itemsOrdered = result.itemsOrdered ?? 0
      const supplierLabel = selectedSupplier?.name || 'поставщик'

      if (result.nothingToOrder) {
        showWarning(`Для «${supplierLabel}» нет позиций с количеством больше 0.`)
        setGenerateOpen(false)
        setConfirmGenerate(false)
        return
      }

      if (result.idempotentReplay || result.alreadyGenerated) {
        showSuccess(`Заказ для «${supplierLabel}» уже был создан.`, {
          duration: 6000,
          action: orderId
            ? { label: 'Открыть заказ', to: `/platform/procurement/${orderId}` }
            : null,
        })
      } else {
        showSuccess(
          `Заказ для «${supplierLabel}» создан · ${itemsOrdered} позиций`,
          {
            duration: 6000,
            action: orderId
              ? { label: 'Открыть заказ', to: `/platform/procurement/${orderId}` }
              : null,
          }
        )
      }
      setGenerateOpen(false)
      setConfirmGenerate(false)
      // Next order starts from a clean field even if the row keeps its qty server-side.
      setGenerationEpoch((epoch) => epoch + 1)
      await loadSnapshotMeta({ forceFilterRefresh: true })
      await loadItems()
      await reloadProcurement()
    } finally {
      setGenerating(false)
    }
  }

  const scheduledTodaysSuppliers = useMemo(
    () => listTodaysScheduledSuppliers(getAllSuppliersSync()),
    [dataVersion]
  )

  const alertChips = useMemo(
    () =>
      getPlannerAlertChips({
        unassignedOrderableCount: filterOptions.unassignedOrderableCount || 0,
        suppliers: filterOptions.suppliers || [],
      }),
    [filterOptions.unassignedOrderableCount, filterOptions.suppliers]
  )

  const supplierSelectOptions = useMemo(
    () =>
      buildPlannerSupplierSelectOptions({
        scope: supplierScope,
        scheduledSuppliers: scheduledTodaysSuppliers,
        catalogSuppliers: getAllSuppliersSync(),
        snapshotSuppliers: filterOptions.suppliers || [],
      }),
    [supplierScope, scheduledTodaysSuppliers, filterOptions.suppliers, dataVersion]
  )

  const selectedSupplier = useMemo(() => {
    const selectedId = filters.platformSupplierId
    if (!selectedId) return null
    return (
      supplierSelectOptions.find((supplier) => supplier.id === selectedId) ||
      filterOptions.suppliers.find((supplier) => supplier.id === selectedId) ||
      null
    )
  }, [filters.platformSupplierId, supplierSelectOptions, filterOptions.suppliers])
  const selectedSupplierSummary = selectedSupplier || null

  function handleSupplierScopeChange(nextScope) {
    setSupplierScope(nextScope)
    if (nextScope !== 'today') return
    if (
      filters.platformSupplierId &&
      !isSupplierInTodaySchedule(
        filters.platformSupplierId,
        scheduledTodaysSuppliers,
        filterOptions.suppliers || []
      )
    ) {
      setFilters((current) => ({
        ...current,
        platformSupplierId: '',
      }))
    }
  }

  const workflow = useMemo(
    () =>
      getSupplierWorkflowStatus({
        supplierId: filters.platformSupplierId,
        summary: selectedSupplierSummary,
      }),
    [filters.platformSupplierId, selectedSupplierSummary]
  )

  const createDisabledReason = getCreateOrderDisabledReason({
    canGenerate,
    snapshotEditable,
    supplierId: filters.platformSupplierId,
    summary: selectedSupplierSummary,
    pendingSaveCount,
    hasSaveError,
    generating,
  })
  const createTooltip = getCreateOrderTooltip({
    disabledReason: createDisabledReason,
    supplierName: selectedSupplier?.name || '',
  })
  const orderCreatedForSupplier = isSupplierPlanExportOrder(selectedSupplierSummary)
  const exportDisabledReason = getExportDisabledReason({
    snapshotId: snapshot?.id || '',
    snapshotStatus: snapshot?.status || '',
    supplierId: filters.platformSupplierId,
    exporting,
    pendingSaveCount,
    hasSaveError,
    summary: selectedSupplierSummary,
  })
  const exportTooltip = getExportTooltip({
    disabledReason: exportDisabledReason,
    orderCreated: orderCreatedForSupplier,
  })
  const exportMenuLabel = getExportMenuLabel(orderCreatedForSupplier)
  const syncDisabledReason = getSyncDisabledReason({
    canSync,
    syncing,
    pendingSaveCount,
    hasSaveError,
  })
  const syncTooltip = getSyncTooltip({ disabledReason: syncDisabledReason })
  const syncAria = syncing
    ? 'Синхронизация UMAG выполняется'
    : `${syncTooltip}. Обновлено: ${formatSyncedAt(snapshot?.syncedAt)}`

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  const saveStatusLabel =
    saveStatus === 'saving'
      ? 'Сохраняется…'
      : saveStatus === 'saved'
        ? 'Сохранено'
        : saveStatus === 'error'
          ? 'Ошибка сохранения'
          : null

  const supplierSelectLoading =
    Boolean(snapshot?.id) &&
    (filterOptionsLoading || filterOptionsSnapshotId !== snapshot.id)

  /**
   * История заказов строки — информативная, никогда не блокирующая.
   * Порядок в столбце стабилен: сначала значение (или поле ввода), затем история.
   */
  function renderQtyHistory(item) {
    const history = getItemOrderHistory(item)
    const label = formatOrderHistoryLabel(history)
    if (!label) return null
    const title = formatOrderHistoryTitle(history)
    return history.orderId ? (
      <Link
        to={`/platform/procurement/${history.orderId}`}
        className="proc-planner__qty-history"
        title={title}
      >
        {label}
      </Link>
    ) : (
      <span className="proc-planner__qty-history" title={title}>
        {label}
      </span>
    )
  }

  function renderQtyCell(item, mobile = false) {
    if (!canEditQuantity(item)) {
      // Поставщик не выбран (или строка принадлежит другому) — поля ввода нет вовсе,
      // чтобы нельзя было отправить правку, которая никуда не попадёт.
      const history = getItemOrderHistory(item)
      const hasHistory = history.documents > 0
      const currentQty = Number(item.finalOrderQty)
      const hasCurrentQty = Number.isFinite(currentQty) && currentQty > 0
      return (
        <div className="proc-planner__final proc-planner__final--readonly">
          <span
            className={
              hasCurrentQty ? 'proc-planner__qty-value' : 'proc-planner__qty-value is-empty'
            }
            title={hasHistory ? formatOrderHistoryTitle(history) : QUANTITY_REQUIRES_SUPPLIER_HINT}
            aria-label={
              hasHistory
                ? `${formatOrderHistoryTitle(history)}: ${item.productName}`
                : `${QUANTITY_REQUIRES_SUPPLIER_HINT}: ${item.productName}`
            }
          >
            {hasCurrentQty ? formatNum(currentQty, 0) : '—'}
          </span>
          {renderQtyHistory(item)}
        </div>
      )
    }

    return (
      <div className="proc-planner__final">
        <div className="proc-planner__final-input">
          <input
            className={mobile ? undefined : 'proc-planner__input'}
            type="number"
            min={0}
            step={1}
            defaultValue={item.finalOrderQty}
            key={`${mobile ? 'm-' : ''}final-${item.id}-${item.finalOrderQty}-${item.manualOverride}-${generationEpoch}`}
            disabled={!canEditPlan || !snapshotEditable}
            data-qty-input={item.id}
            onBlur={(e) => void commitQuantity(item, e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              if (e.repeat) return
              void handleQtyEnter(item, e.target)
            }}
            aria-label={`Заказ для ${item.productName}`}
          />
          {item.manualOverride ? (
            <button
              type="button"
              className="proc-planner__reset"
              title="Сбросить к рекомендации"
              aria-label="Сбросить к рекомендации"
              disabled={!canEditPlan || !snapshotEditable}
              onClick={() => void handleReset(item)}
            >
              <RotateCcwIcon size={14} />
            </button>
          ) : null}
        </div>
        {renderQtyHistory(item)}
      </div>
    )
  }

  /** Chips navigate to the matching filter; they never just report a number. */
  function handleAlertChipClick(chip) {
    if (chip.id === 'unassigned') {
      setFilters((current) => ({
        ...current,
        platformSupplierId: '',
        orderableOnly: true,
        unassignedOnly: true,
      }))
      return
    }
    if (chip.id === 'inconsistent') {
      const supplierId = chip.supplierIds?.[0]
      if (!supplierId) return
      // Такой поставщик может быть вне сегодняшнего графика — иначе он не попадёт в список.
      setSupplierScope('all')
      setFilters((current) => ({
        ...current,
        platformSupplierId: supplierId,
        unassignedOnly: false,
      }))
    }
  }

  const snapshotHeadline = buildSnapshotHeadline({
    hasSnapshot: Boolean(snapshot),
    status: snapshot?.status || '',
    syncedAtLabel: formatSyncedAt(snapshot?.syncedAt),
    itemCount: snapshot?.itemCount || 0,
    negativeStockCount: snapshot?.negativeStockCount || 0,
  })

  const headerStrip = (
    <div className="proc-planner__topbar">
      <span className="proc-planner__snapshot" title={snapshotHeadline.title}>
        <span className="proc-planner__snapshot-label">UMAG</span>
        <span className="proc-planner__snapshot-text">{snapshotHeadline.text}</span>
        {snapshotHeadline.warnText ? (
          <span className="proc-planner__snapshot-warn">{snapshotHeadline.warnText}</span>
        ) : null}
      </span>
      {alertChips.length > 0 ? (
        <span className="proc-planner__chips">
          {alertChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="proc-planner__chip"
              title={chip.title}
              aria-label={`${chip.label}: ${chip.count}. ${chip.title}`}
              onClick={() => handleAlertChipClick(chip)}
            >
              <span className="proc-planner__chip-label">{chip.label}</span>
              <span className="proc-planner__chip-count">{chip.count}</span>
            </button>
          ))}
        </span>
      ) : null}
    </div>
  )

  if (!isCloudMode()) {
    return (
      <p className="proc-planner__empty">Планирование доступно только в облачном режиме.</p>
    )
  }

  return (
    <div className="proc-planner">
      {headerSlot ? createPortal(headerStrip, headerSlot) : headerStrip}
      <PlatformSearchToolbar
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onClear={() => setSearch('')}
        showClear
        placeholder="Товар или штрихкод…"
        ariaLabel="Поиск по плану закупок"
        flush
        actions={
          <>
            <div className="proc-planner__supplier-quick">
              <SearchableSupplierSelect
                suppliers={supplierSelectOptions}
                value={filters.platformSupplierId}
                onChange={(supplierId) =>
                  setFilters((current) => ({
                    ...current,
                    platformSupplierId: supplierId || '',
                  }))
                }
                activeOnly={false}
                placeholder={
                  supplierSelectLoading && supplierSelectOptions.length === 0
                    ? 'Загрузка поставщиков…'
                    : 'Выберите поставщика'
                }
                searchPlaceholder="Поиск поставщика…"
                loading={supplierSelectLoading && supplierSelectOptions.length === 0}
                loadingLabel="Загрузка поставщиков…"
                emptyLabel={
                  supplierScope === 'today'
                    ? 'На сегодня визитов нет'
                    : 'Поставщики не найдены'
                }
                disabled={supplierSelectLoading}
                dropdownHeader={
                  <div
                    className="proc-planner__supplier-scope"
                    role="group"
                    aria-label="Область списка поставщиков"
                  >
                    <button
                      type="button"
                      className={`proc-planner__supplier-scope-btn${supplierScope === 'today' ? ' is-active' : ''}`}
                      aria-pressed={supplierScope === 'today'}
                      onClick={() => handleSupplierScopeChange('today')}
                    >
                      {`Сегодня · ${scheduledTodaysSuppliers.length}`}
                    </button>
                    <button
                      type="button"
                      className={`proc-planner__supplier-scope-btn${supplierScope === 'all' ? ' is-active' : ''}`}
                      aria-pressed={supplierScope === 'all'}
                      onClick={() => handleSupplierScopeChange('all')}
                    >
                      Все
                    </button>
                  </div>
                }
              />
            </div>
            <PlatformToolbarActionWrap>
              <span className="proc-planner__tip-wrap" data-tooltip={syncTooltip}>
                <PlatformSyncButton
                  onClick={() => void handleSync()}
                  syncing={syncing}
                  disabled={Boolean(syncDisabledReason)}
                  title={syncTooltip}
                  aria-label={syncAria}
                />
              </span>
            </PlatformToolbarActionWrap>
            <PlatformToolbarActionWrap>
              <span
                className="proc-planner__tip-wrap"
                data-tooltip="Дополнительные фильтры"
              >
                <PlatformFilterButton
                  buttonRef={filterButtonRef}
                  active={activeFilterCount > 0}
                  count={activeFilterCount || null}
                  onClick={() => setFilterOpen((v) => !v)}
                  ariaExpanded={filterOpen}
                  ariaLabel="Дополнительные фильтры"
                  title="Дополнительные фильтры"
                />
              </span>
              {filterOpen ? (
                <div className="proc-planner__filter-pop">
                  <label>
                    Категория
                    <select
                      value={filters.categoryName}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          categoryName: e.target.value,
                          subcategoryName: '',
                        }))
                      }
                    >
                      <option value="">Все</option>
                      {filterOptions.categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Подкатегория
                    <select
                      value={filters.subcategoryName}
                      disabled={!filters.categoryName}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, subcategoryName: e.target.value }))
                      }
                    >
                      <option value="">
                        {filters.categoryName ? 'Все' : 'Сначала категория'}
                      </option>
                      {subcategoryOptions.map((p) => (
                        <option
                          key={`${p.categoryName}::${p.subcategoryName}`}
                          value={p.subcategoryName}
                        >
                          {p.subcategoryName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="proc-planner__check">
                    <input
                      type="checkbox"
                      checked={filters.warningsOnly}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, warningsOnly: e.target.checked }))
                      }
                    />
                    Только предупреждения
                  </label>
                  <label className="proc-planner__check">
                    <input
                      type="checkbox"
                      checked={filters.orderableOnly}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, orderableOnly: e.target.checked }))
                      }
                    />
                    Только к заказу
                  </label>
                  <label className="proc-planner__check">
                    <input
                      type="checkbox"
                      checked={filters.unassignedOnly}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          unassignedOnly: e.target.checked,
                          orderableOnly: e.target.checked ? true : f.orderableOnly,
                          platformSupplierId: e.target.checked ? '' : f.platformSupplierId,
                        }))
                      }
                    />
                    Только без поставщика
                  </label>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        categoryName: '',
                        subcategoryName: '',
                        warningsOnly: false,
                        orderableOnly: false,
                        unassignedOnly: false,
                      }))
                    }
                  >
                    Сбросить
                  </button>
                </div>
              ) : null}
            </PlatformToolbarActionWrap>
            <PlatformToolbarActionWrap>
              <PlannerTooltipButton
                className="proc-planner__create-btn"
                tooltip={createTooltip}
                onClick={() => {
                  if (
                    getCreateOrderDisabledReason({
                      canGenerate,
                      snapshotEditable,
                      supplierId: filters.platformSupplierId,
                      summary: selectedSupplierSummary,
                      pendingSaveCount: pendingSaveCountRef.current,
                      hasSaveError,
                      generating,
                    })
                  ) {
                    return
                  }
                  setGenerateOpen(true)
                }}
                disabled={Boolean(createDisabledReason)}
                aria-label={createTooltip}
              >
                <FileTextIcon size={18} />
                <span>Создать заказ</span>
              </PlannerTooltipButton>
            </PlatformToolbarActionWrap>
            <PlatformToolbarActionWrap>
              <div className="proc-planner__export" ref={exportMenuRef}>
                <span className="proc-planner__tip-wrap" data-tooltip={exportTooltip}>
                  <PlatformToolbarIconButton
                    onClick={() => {
                      if (exportDisabledReason) return
                      setExportMenuOpen((open) => !open)
                    }}
                    disabled={Boolean(exportDisabledReason)}
                    aria-label={exportTooltip}
                    title={exportTooltip}
                    aria-haspopup="menu"
                    aria-expanded={exportMenuOpen}
                    aria-controls={exportMenuOpen ? exportMenuId : undefined}
                    aria-busy={exporting || undefined}
                  >
                    <DownloadIcon size={20} />
                  </PlatformToolbarIconButton>
                </span>
                {exportMenuOpen ? (
                  <div
                    id={exportMenuId}
                    className="proc-planner__export-menu"
                    role="menu"
                    aria-label={exportMenuLabel}
                  >
                    <div className="proc-planner__export-heading">{exportMenuLabel}</div>
                    <button
                      type="button"
                      role="menuitem"
                      className="proc-planner__export-item"
                      disabled={exporting}
                      onClick={() => void runPlanExport('pdf')}
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="proc-planner__export-item"
                      disabled={exporting}
                      onClick={() => void runPlanExport('xlsx')}
                    >
                      Excel
                    </button>
                  </div>
                ) : null}
              </div>
            </PlatformToolbarActionWrap>
          </>
        }
      />

      <div className="proc-planner__workflow" aria-live="polite">
        {workflow.label ? (
          <span className={`proc-planner__workflow-step is-${workflow.step}`}>
            {workflow.label}
          </span>
        ) : null}
        {workflow.orderId ? (
          <Link
            to={`/platform/procurement/${workflow.orderId}`}
            className="proc-planner__workflow-link"
          >
            Открыть заказ
          </Link>
        ) : null}
        {workflow.historyLabel ? (
          <span className="proc-planner__workflow-history">{workflow.historyLabel}</span>
        ) : null}
        {saveStatusLabel ? (
          <span
            className={`proc-planner__save-status is-${saveStatus}`}
            role="status"
          >
            {saveStatusLabel}
          </span>
        ) : null}
      </div>

      {snapshot?.status === 'failed' ? (
        <p className="proc-planner__empty">{snapshot.error || 'Синхронизация не удалась.'}</p>
      ) : null}

      <div className="proc-planner__desktop">
        <div className="proc-planner__table-wrap">
          <table className="proc-planner__table">
            <thead>
              <tr>
                <th className="proc-planner__col-num">№</th>
                <th>Товар</th>
                <th>Продажи 8 нед.</th>
                <th>Остаток</th>
                <th>Ср/день</th>
                <th>Норма</th>
                <th>Рек.</th>
                <th>Заказ</th>
                <th>Поставщик</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={TABLE_COL_SPAN}>Загрузка…</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COL_SPAN}>Нет позиций</td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="proc-planner__col-num">
                      {(page - 1) * pageSize + index + 1}
                    </td>
                    <td>
                      <div className="proc-planner__product">
                        <strong>{item.productName}</strong>
                        <span>{item.barcode}</span>
                        <span className="proc-planner__cat">
                          {[item.categoryName, item.subcategoryName].filter(Boolean).join(' / ')}
                        </span>
                      </div>
                    </td>
                    <td>
                      <WeeklySpark values={item.weeklySales} />
                    </td>
                    <td>
                      <span
                        className={
                          item.negativeStock ? 'proc-planner__stock is-neg' : 'proc-planner__stock'
                        }
                        title={
                          item.negativeStock
                            ? 'Отрицательный остаток UMAG — в расчёте как 0'
                            : undefined
                        }
                      >
                        {formatNum(item.rawStock, 2)}
                      </span>
                    </td>
                    <td>{formatNum(item.avgDaily, 2)}</td>
                    <td>
                      <span
                        className="proc-planner__norm-value"
                        title="Настраивается во вкладке «Нормы»"
                      >
                        {item.normDays}
                      </span>
                    </td>
                    <td>{formatNum(item.recommendedQty, 0)}</td>
                    <td>{renderQtyCell(item)}</td>
                    <td>{item.umagSupplierName || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={page}
          totalPages={totalPages}
          from={from}
          to={to}
          totalCount={totalCount}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(nextPageSize) => {
            setPage(1)
            setPageSize(nextPageSize)
          }}
        />
      </div>

      <div className="proc-planner__mobile">
        {loading ? (
          <p className="proc-planner__empty">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="proc-planner__empty">Нет позиций</p>
        ) : (
          <ul className="proc-planner__cards">
            {items.map((item, index) => (
              <li key={item.id} className="proc-planner__card">
                <div className="proc-planner__card-top">
                  <strong>
                    <span className="proc-planner__row-num" aria-hidden="true">
                      {(page - 1) * pageSize + index + 1}.
                    </span>{' '}
                    {item.productName}
                  </strong>
                  <span>{item.barcode}</span>
                </div>
                <WeeklySpark values={item.weeklySales} />
                <div className="proc-planner__card-grid">
                  <span>
                    Остаток{' '}
                    <b className={item.negativeStock ? 'is-neg' : ''}>
                      {formatNum(item.rawStock, 2)}
                    </b>
                  </span>
                  <span>
                    Ср/день <b>{formatNum(item.avgDaily, 2)}</b>
                  </span>
                  <label>
                    Норма
                    <span
                      className="proc-planner__norm-value"
                      title="Настраивается во вкладке «Нормы»"
                    >
                      {item.normDays}
                    </span>
                  </label>
                  <label>
                    Заказ
                    {renderQtyCell(item, true)}
                  </label>
                </div>
                <div className="proc-planner__card-foot">
                  <span>{item.umagSupplierName || 'Без поставщика'}</span>
                  <span>рек. {formatNum(item.recommendedQty, 0)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <TablePagination
          page={page}
          totalPages={totalPages}
          from={from}
          to={to}
          totalCount={totalCount}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(nextPageSize) => {
            setPage(1)
            setPageSize(nextPageSize)
          }}
        />
      </div>

      {generateOpen ? (
        <AdminModal
          title="Создать заказ"
          onClose={() => {
            if (!generating) cancelOrderAttempt()
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={generating}
                onClick={() => cancelOrderAttempt()}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={
                  generating ||
                  !deliveryDate ||
                  Boolean(
                    getCreateOrderDisabledReason({
                      canGenerate,
                      snapshotEditable,
                      supplierId: filters.platformSupplierId,
                      summary: selectedSupplierSummary,
                      pendingSaveCount: pendingSaveCountRef.current,
                      hasSaveError,
                      generating,
                    })
                  )
                }
                onClick={() => setConfirmGenerate(true)}
              >
                Далее
              </button>
            </>
          }
        >
          <label className="admin-form__field">
            <span>Ожидаемая дата поставки</span>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              required
            />
          </label>
          <p className="proc-planner__hint">{selectedSupplier?.name || 'Поставщик не выбран'}</p>
        </AdminModal>
      ) : null}

      {confirmGenerate ? (
        <ConfirmDialog
          title="Создать заказ?"
          message={selectedSupplier?.name || 'Выбранный поставщик'}
          confirmLabel="Создать заказ"
          confirmVariant="primary"
          loading={generating}
          onCancel={() => !generating && setConfirmGenerate(false)}
          onConfirm={() => void runGenerate()}
        />
      ) : null}
    </div>
  )
}
