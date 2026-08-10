import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  RotateCcwIcon,
  SparklesIcon,
} from '../icons/PlatformIcons'
import {
  exportProcurementPlanPdf,
  exportProcurementPlanXlsx,
} from '../../utils/procurementPlanExport'
import './ProcurementPlannerView.css'

const TABLE_COL_SPAN = 9

const DEFAULT_PAGE_SIZE = 25

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

export default function ProcurementPlannerView() {
  const { user } = useSession()
  const { reloadProcurement } = usePlatformData()
  const { error: showError, success: showSuccess } = useToast()

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
  const [filterOptions, setFilterOptions] = useState({
    categories: [],
    categorySubcategories: [],
    suppliers: [],
  })
  const [filterOpen, setFilterOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [confirmGenerate, setConfirmGenerate] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const filterButtonRef = useRef(null)
  const exportMenuRef = useRef(null)
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

  const loadSnapshotMeta = useCallback(async () => {
    if (!isCloudMode()) {
      setSnapshot(null)
      setLoading(false)
      return
    }
    try {
      const snap = await fetchLatestProcurementSnapshot()
      setSnapshot(snap)
      if (snap?.id) {
        const opts = await fetchSnapshotFilterOptions(snap.id)
        setFilterOptions(opts)
      }
    } catch (err) {
      showError(err.message || 'Не удалось загрузить снимок')
    }
  }, [showError])

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
      showError(err.message || 'Не удалось загрузить позиции')
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
    if (!canSync || syncing) return
    setSyncing(true)
    try {
      const result = await syncProcurementPlanning()
      if (!result.success) {
        showError(result.message)
        return
      }
      showSuccess(`Синхронизировано: ${result.itemCount} SKU`)
      await loadSnapshotMeta()
    } catch (err) {
      showError(err?.message || 'Не удалось синхронизировать план')
    } finally {
      setSyncing(false)
    }
  }

  async function handleFinalChange(item, rawValue) {
    try {
      await updateItemFinalOrderQty(item, rawValue)
      await loadItems()
    } catch (err) {
      showError(err.message || 'Не удалось сохранить заказ')
    }
  }

  async function handleReset(item) {
    try {
      await resetItemToRecommendation(item)
      await loadItems()
    } catch (err) {
      showError(err.message || 'Не удалось сбросить')
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

  async function runPlanExport(format) {
    if (!snapshot?.id || exporting) return
    setExporting(true)
    setExportMenuOpen(false)
    try {
      const rows = await exportSnapshotItemsCsv(snapshot.id, {
        search: debouncedSearch,
        ...filters,
      })
      const meta = {
        periodFrom: snapshot.periodFrom,
        periodTo: snapshot.periodTo,
      }
      if (format === 'pdf') {
        await exportProcurementPlanPdf(rows, meta)
      } else {
        await exportProcurementPlanXlsx(rows, meta)
      }
      showSuccess(format === 'pdf' ? 'PDF экспортирован' : 'Excel экспортирован')
    } catch (err) {
      showError(err.message || 'Не удалось экспортировать')
    } finally {
      setExporting(false)
    }
  }

  async function runGenerate() {
    if (!canGenerate || !snapshot?.id || !deliveryDate || !filters.platformSupplierId) return
    setGenerating(true)
    try {
      const result = await generateProcurementOrders(snapshot.id, deliveryDate, {
        supplierId: filters.platformSupplierId,
      })
      if (!result.success) {
        showError(result.message)
        return
      }
      const skipped = result.skippedNoSupplier || 0
      const msg = result.alreadyGenerated
        ? `Заказы уже были сформированы (${result.purchaseOrderIds?.length || 0}).`
        : `Сформировано заказов: ${result.ordersCreated}.`
      showSuccess(skipped > 0 ? `${msg} Без поставщика: ${skipped}.` : msg)
      setGenerateOpen(false)
      setConfirmGenerate(false)
      await loadSnapshotMeta()
      await reloadProcurement()
    } catch (err) {
      showError(err?.message || 'Не удалось сформировать заказы')
    } finally {
      setGenerating(false)
    }
  }

  const subcategoryOptions = useMemo(() => {
    const pairs = filterOptions.categorySubcategories || []
    if (!filters.categoryName) return pairs
    return pairs.filter((p) => p.categoryName === filters.categoryName)
  }, [filterOptions.categorySubcategories, filters.categoryName])

  const selectedSupplier = useMemo(
    () => filterOptions.suppliers.find((supplier) => supplier.id === filters.platformSupplierId),
    [filterOptions.suppliers, filters.platformSupplierId]
  )
  const snapshotEditable = snapshot?.status === 'ready' || snapshot?.status === 'partially_generated'

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)
  const syncTitle = syncing
    ? 'Синхронизация UMAG выполняется'
    : `Синхронизация UMAG · ${formatSyncedAt(snapshot?.syncedAt)}`

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
                suppliers={filterOptions.suppliers}
                value={filters.platformSupplierId}
                onChange={(supplierId) =>
                  setFilters((current) => ({
                    ...current,
                    platformSupplierId: supplierId || '',
                  }))
                }
                activeOnly={false}
                placeholder="Все поставщики"
                searchPlaceholder="Поиск поставщика…"
              />
            </div>
            <PlatformToolbarActionWrap>
              <PlatformSyncButton
                onClick={() => void handleSync()}
                syncing={syncing}
                disabled={!canSync}
                title={syncTitle}
                aria-label={syncTitle}
              />
            </PlatformToolbarActionWrap>
            <PlatformToolbarActionWrap>
              <PlatformFilterButton
                buttonRef={filterButtonRef}
                active={activeFilterCount > 0}
                count={activeFilterCount || null}
                onClick={() => setFilterOpen((v) => !v)}
                ariaExpanded={filterOpen}
                ariaLabel="Фильтры плана"
                title="Фильтры"
              />
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
              <PlatformToolbarIconButton
                onClick={() => setGenerateOpen(true)}
                disabled={!canGenerate || !snapshotEditable || !filters.platformSupplierId || generating}
                aria-label="Сформировать заказ поставщику"
                title={filters.platformSupplierId ? 'Сформировать заказ' : 'Выберите поставщика'}
                create
              >
                <SparklesIcon size={20} />
              </PlatformToolbarIconButton>
            </PlatformToolbarActionWrap>
            <PlatformToolbarActionWrap>
              <div className="proc-planner__export" ref={exportMenuRef}>
                <PlatformToolbarIconButton
                  onClick={() => setExportMenuOpen((open) => !open)}
                  disabled={!snapshot?.id || snapshot.status === 'syncing' || exporting}
                  aria-label="Экспорт плана"
                  title="Экспорт плана"
                  aria-haspopup="menu"
                  aria-expanded={exportMenuOpen}
                  aria-controls={exportMenuOpen ? exportMenuId : undefined}
                  aria-busy={exporting || undefined}
                >
                  <DownloadIcon size={20} />
                </PlatformToolbarIconButton>
                {exportMenuOpen ? (
                  <div
                    id={exportMenuId}
                    className="proc-planner__export-menu"
                    role="menu"
                    aria-label="Формат экспорта плана"
                  >
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

      <div className="proc-planner__meta">
        {snapshot ? (
          <>
            <span>
              {snapshot.status === 'ready'
                ? 'Готов'
                : snapshot.status === 'partially_generated'
                  ? 'Частично сформирован'
                : snapshot.status === 'generated'
                  ? 'Заказы сформированы'
                  : snapshot.status === 'syncing'
                    ? 'Синхронизация…'
                    : snapshot.status === 'failed'
                      ? 'Ошибка'
                      : snapshot.status}
            </span>
            <span>{formatSyncedAt(snapshot.syncedAt)}</span>
            <span>{snapshot.itemCount} SKU</span>
            {snapshot.negativeStockCount > 0 ? (
              <span className="proc-planner__warn">{snapshot.negativeStockCount} отриц.</span>
            ) : null}
          </>
        ) : (
          <span>Нет снимка — нажмите синхронизацию</span>
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
                    <td><span className="proc-planner__norm-value" title="Настраивается во вкладке «Нормы»">{item.normDays}</span></td>
                    <td>{formatNum(item.recommendedQty, 0)}</td>
                    <td>
                      <div className="proc-planner__final">
                        <input
                          className="proc-planner__input"
                          type="number"
                          min={0}
                          step={1}
                          defaultValue={item.finalOrderQty}
                          key={`final-${item.id}-${item.finalOrderQty}-${item.manualOverride}`}
                          disabled={!canEditPlan || !snapshotEditable || Boolean(item.generatedPurchaseOrderId)}
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
                            disabled={!canEditPlan || !snapshotEditable || Boolean(item.generatedPurchaseOrderId)}
                            onClick={() => void handleReset(item)}
                          >
                            <RotateCcwIcon size={14} />
                          </button>
                        ) : null}
                      </div>
                    </td>
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
                    <span className="proc-planner__norm-value" title="Настраивается во вкладке «Нормы»">{item.normDays}</span>
                  </label>
                  <label>
                    Заказ
                    <input
                      type="number"
                      min={0}
                      defaultValue={item.finalOrderQty}
                      key={`m-final-${item.id}-${item.finalOrderQty}`}
                      disabled={!canEditPlan || !snapshotEditable || Boolean(item.generatedPurchaseOrderId)}
                      onBlur={(e) => {
                        if (Number(e.target.value) !== item.finalOrderQty) {
                          void handleFinalChange(item, e.target.value)
                        }
                      }}
                    />
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
          title="Сформировать заказ"
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
                disabled={generating || !deliveryDate}
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
          title="Сформировать заказ?"
          message={selectedSupplier?.name || 'Выбранный поставщик'}
          confirmLabel="Сформировать"
          confirmVariant="primary"
          loading={generating}
          onCancel={() => !generating && setConfirmGenerate(false)}
          onConfirm={() => void runGenerate()}
        />
      ) : null}
    </div>
  )
}
