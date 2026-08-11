import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  generateProcurementOrders,
  resetItemToRecommendation,
  syncProcurementPlanning,
  updateItemFinalOrderQty,
} from '../../services/procurementPlanningService'
import {
  getCachedFilterOptions,
  setCachedFilterOptions,
} from '../../services/procurementFilterOptionsCache.js'
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
  applyItemDeltaToFilterOptions,
  applySaveResultToFailedIds,
  buildPlannerSupplierSelectOptions,
  filterItemsForSupplierPlanExport,
  formatOrdersProgress,
  getCreateOrderDisabledReason,
  getCreateOrderTooltip,
  getExportDisabledReason,
  getExportMenuLabel,
  getExportTooltip,
  getLockedQuantityHint,
  getSupplierWorkflowStatus,
  getSyncDisabledReason,
  getSyncTooltip,
  hasFailedSaves,
  isItemQuantityLocked,
  canEditItemQuantity,
  QUANTITY_REQUIRES_SUPPLIER_HINT,
  isSupplierInTodaySchedule,
  isSupplierOrderCreated,
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

export default function ProcurementPlannerView() {
  const { user } = useSession()
  const { reloadProcurement, version: dataVersion } = usePlatformData()
  const { error: showError, success: showSuccess } = useToast()
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

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (filters.categoryName) n += 1
    if (filters.subcategoryName) n += 1
    if (filters.warningsOnly) n += 1
    if (filters.orderableOnly) n += 1
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

  /** Единственный источник правды о доступности правки количества. */
  function canEditQuantity(item) {
    return (
      canEditPlan &&
      snapshotEditable &&
      canEditItemQuantity(item, {
        filterOptions,
        selectedSupplierId: filters.platformSupplierId,
      })
    )
  }

  async function handleFinalChange(item, rawValue) {
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
      return
    }

    beginPendingSave(item.id)
    try {
      const updated = await updateItemFinalOrderQty(item, rawValue)
      setFilterOptions((prev) => {
        const next = applyItemDeltaToFilterOptions(prev, item, updated)
        if (snapshot?.id) setCachedFilterOptions(snapshot.id, next)
        return next
      })
      await loadItems()
      endPendingSave(item.id, true)
    } catch (err) {
      endPendingSave(item.id, false)
      showError(toProcurementUserMessage(err, 'Не удалось сохранить количество.'))
    }
  }

  async function handleReset(item) {
    if (!canEditQuantity(item)) return

    beginPendingSave(item.id)
    try {
      const updated = await resetItemToRecommendation(item)
      setFilterOptions((prev) => {
        const next = applyItemDeltaToFilterOptions(prev, item, updated)
        if (snapshot?.id) setCachedFilterOptions(snapshot.id, next)
        return next
      })
      await loadItems()
      endPendingSave(item.id, true)
    } catch (err) {
      endPendingSave(item.id, false)
      showError(toProcurementUserMessage(err, 'Не удалось сбросить количество.'))
    }
  }

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

  const snapshotEditable = snapshot?.status === 'ready' || snapshot?.status === 'partially_generated'

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
      supplierName: selectedSupplier?.name || '',
    })
    if (blocked || !snapshot?.id || !deliveryDate) return

    setGenerating(true)
    try {
      const result = await generateProcurementOrders(snapshot.id, deliveryDate, {
        supplierId: filters.platformSupplierId,
      })
      if (!result.success) {
        showError(result.message)
        return
      }
      const orderId = result.purchaseOrderIds?.[0] || null
      const itemsOrdered = result.itemsOrdered ?? 0
      const supplierLabel = selectedSupplier?.name || 'поставщик'
      const msg = result.alreadyGenerated
        ? `Заказ для «${supplierLabel}» уже был создан.`
        : `Заказ для «${supplierLabel}» создан · ${itemsOrdered || selectedSupplierSummary?.pendingPositions || 0} позиций`
      showSuccess(msg, {
        duration: 6000,
        action: orderId
          ? { label: 'Открыть заказ', to: `/platform/procurement/${orderId}` }
          : null,
      })
      setGenerateOpen(false)
      setConfirmGenerate(false)
      await loadSnapshotMeta({ forceFilterRefresh: true })
      await loadItems()
      await reloadProcurement()
    } catch (err) {
      showError(err?.message || 'Не удалось сформировать заказы')
    } finally {
      setGenerating(false)
    }
  }

  const scheduledTodaysSuppliers = useMemo(
    () => listTodaysScheduledSuppliers(getAllSuppliersSync()),
    [dataVersion]
  )

  const ordersProgress = useMemo(
    () =>
      formatOrdersProgress({
        scheduledSuppliers: scheduledTodaysSuppliers,
        snapshotSuppliers: filterOptions.suppliers || [],
        unassignedOrderableCount: filterOptions.unassignedOrderableCount || 0,
        inconsistentSupplierCount: filterOptions.inconsistentSupplierCount || 0,
      }),
    [filterOptions, scheduledTodaysSuppliers]
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
  const orderCreatedForSupplier = isSupplierOrderCreated(selectedSupplierSummary)
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

  function renderQtyCell(item, mobile = false) {
    const locked = isItemQuantityLocked(item, filterOptions)
    if (!locked && !canEditQuantity(item)) {
      // Поставщик не выбран (или строка принадлежит другому) — поля ввода нет вовсе,
      // чтобы нельзя было отправить правку, которая никуда не попадёт.
      return (
        <div className="proc-planner__final proc-planner__final--readonly">
          <span
            className="proc-planner__readonly-qty"
            title={QUANTITY_REQUIRES_SUPPLIER_HINT}
            aria-label={`${QUANTITY_REQUIRES_SUPPLIER_HINT}: ${item.productName}`}
          >
            —
          </span>
        </div>
      )
    }
    if (locked) {
      const hint = getLockedQuantityHint(item, filterOptions)
      return (
        <div className="proc-planner__final proc-planner__final--locked">
          <span className="proc-planner__locked-qty">{formatNum(item.finalOrderQty, 0)}</span>
          {hint.orderId ? (
            <Link
              to={`/platform/procurement/${hint.orderId}`}
              className="proc-planner__in-order"
              title={hint.label}
            >
              {hint.label}
            </Link>
          ) : (
            <span className="proc-planner__in-order">{hint.label}</span>
          )}
        </div>
      )
    }

    return (
      <div className="proc-planner__final">
        <input
          className={mobile ? undefined : 'proc-planner__input'}
          type="number"
          min={0}
          step={1}
          defaultValue={item.finalOrderQty}
          key={`${mobile ? 'm-' : ''}final-${item.id}-${item.finalOrderQty}-${item.manualOverride}`}
          disabled={!canEditPlan || !snapshotEditable}
          onBlur={(e) => {
            if (Number(e.target.value) !== item.finalOrderQty) {
              void handleFinalChange(item, e.target.value)
            }
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
    )
  }

  if (!isCloudMode()) {
    return (
      <p className="proc-planner__empty">Планирование доступно только в облачном режиме.</p>
    )
  }

  return (
    <div className="proc-planner">
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
        <span className={`proc-planner__workflow-step is-${workflow.step}`}>
          {workflow.label}
        </span>
        {workflow.step === 'created' && workflow.orderId ? (
          <Link
            to={`/platform/procurement/${workflow.orderId}`}
            className="proc-planner__workflow-link"
          >
            Открыть заказ
          </Link>
        ) : null}
        {workflow.inconsistent ? (
          <span className="proc-planner__warn">Есть позиции вне заказа</span>
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

      <div className="proc-planner__meta">
        {snapshot ? (
          <>
            <div className="proc-planner__meta-block">
              <span className="proc-planner__meta-label">Снимок UMAG</span>
              <span>
                {snapshot.status === 'syncing'
                  ? 'Синхронизация…'
                  : snapshot.status === 'failed'
                    ? 'Ошибка синхронизации'
                    : `Обновлён ${formatSyncedAt(snapshot.syncedAt)}`}
                {` · ${snapshot.itemCount} SKU`}
                {snapshot.negativeStockCount > 0 ? (
                  <span className="proc-planner__warn">
                    {` · ${snapshot.negativeStockCount} отриц.`}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="proc-planner__meta-block">
              <span className="proc-planner__meta-label">Прогресс заказов</span>
              <span>
                {ordersProgress.createdLabel}
                {ordersProgress.remainingLabel ? ` · ${ordersProgress.remainingLabel}` : ''}
                {ordersProgress.allDone ? ' · Все заказы созданы' : ''}
              </span>
              {ordersProgress.unscheduledLabel ? (
                <span className="proc-planner__warn">{ordersProgress.unscheduledLabel}</span>
              ) : null}
              {ordersProgress.unassignedLabel ? (
                <span className="proc-planner__warn">{ordersProgress.unassignedLabel}</span>
              ) : null}
              {ordersProgress.inconsistentLabel ? (
                <span className="proc-planner__warn">{ordersProgress.inconsistentLabel}</span>
              ) : null}
            </div>
          </>
        ) : (
          <div className="proc-planner__meta-block">
            <span className="proc-planner__meta-label">Снимок UMAG</span>
            <span>Нет снимка — нажмите синхронизацию</span>
          </div>
        )}
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
            if (!generating) setGenerateOpen(false)
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={generating}
                onClick={() => setGenerateOpen(false)}
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
