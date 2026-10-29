import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import { usePlatformData } from '../../../context/PlatformDataContext'
import { useToast } from '../../../context/ToastContext'
import useStableWhenReady from '../../../hooks/useStableWhenReady'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import { canViewPurchases, canCreatePurchase } from '../../../config/permissions'
import {
  getPurchaseOrdersSync,
  createPurchaseOrder,
  findPurchaseOrderIdsByItemText,
  isPurchasesDataReady,
  isPurchasesDataLoading,
  getPurchasesDataError,
} from '../../../services/purchaseDataService'
import { getSuppliers } from '../../../services/platformDataService'
import { isCloudMode } from '../../../lib/dataMode'
import { toUserErrorMessage } from '../../../utils/userErrorMessage'
import { PROCUREMENT_FRESH_MS } from '../../../lib/procurementFreshness'
import {
  formatPurchaseAmount,
  formatPurchaseDate,
  isOrderDraft,
  PURCHASE_STATUS,
} from '../../../utils/purchaseData'
import {
  getSettlementsPeriodDates,
  SETTLEMENTS_PERIOD_PRESET,
  toSettlementsDateKey,
} from '../../../utils/settlementsPeriod'
import {
  DEFAULT_DOCUMENTS_FILTER,
  selectPurchaseDocuments,
} from '../../../utils/purchaseDocumentsList'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import PlatformFilterTrigger from '../../../components/platform/PlatformFilterTrigger'
import PeriodFilterPopover, {
  resolveSettlementsPeriodPreset,
} from '../../../components/platform/PeriodFilterPopover'
import FilterComboField from '../../../components/platform/FilterComboField'
import { PgtFoot, PgtHead, PgtRow, PgtTable } from '../../../components/platform/PlatformGridTable'
import TablePagination from '../../../components/procurement/TablePagination'
import { DelayedLoadingSkeleton } from '../../../components/loading/LoadingSkeleton'
import '../../../components/platform/FilterComboField.css'
import '../../../components/admin/admin-shared.css'
import './ProcurementPage.css'
import './PurchaseDocumentsPage.css'

/** Where a document opens. Stage 4 moves this to the new document page. */
const DOCUMENT_PATH_PREFIX = '/platform/procurement/documents'

function defaultPeriod() {
  return {
    periodPreset: SETTLEMENTS_PERIOD_PRESET.WEEK,
    ...getSettlementsPeriodDates(SETTLEMENTS_PERIOD_PRESET.WEEK),
  }
}

/**
 * «Закуп» — список документов закупа (/platform/procurement/documents): заказы поставщикам, созданные
 * вручную. Черновики сверху, период — по дате создания, «+ Создать» открывает новый документ.
 */
export default function PurchaseDocumentsPage() {
  const { user } = useSession()
  const { error: showError } = useToast()
  const { loadError, reloadProcurement, ensureModules, version: dataVersion } = usePlatformData()
  const { version } = useAdminRefresh()
  const navigate = useNavigate()
  const canView = canViewPurchases(user)
  const canCreate = canCreatePurchase(user)

  useEffect(() => {
    if (!isCloudMode()) return
    void ensureModules(['suppliers', 'procurement'])
  }, [ensureModules])

  const [filter, setFilter] = useState(() => {
    const { dateFrom, dateTo } = defaultPeriod()
    return { ...DEFAULT_DOCUMENTS_FILTER, dateFrom, dateTo }
  })
  const [draft, setDraft] = useState(() => ({ ...defaultPeriod(), ...DEFAULT_DOCUMENTS_FILTER }))
  const [filterOpen, setFilterOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [supplierSearch, setSupplierSearch] = useState('')
  const filterButtonRef = useRef(null)

  const [loadErrorText, setLoadErrorText] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [itemOrderIds, setItemOrderIds] = useState(null)

  useEffect(() => {
    if (!canView || !isCloudMode()) return undefined
    let cancelled = false
    void (async () => {
      setRefreshing(true)
      try {
        await reloadProcurement({ maxAgeMs: PROCUREMENT_FRESH_MS })
        if (!cancelled) setLoadErrorText(null)
      } catch (error) {
        const message = toUserErrorMessage(error, 'Не удалось загрузить документы с сервера.')
        if (!cancelled) {
          setLoadErrorText(message)
          showError(message)
        }
      } finally {
        if (!cancelled) setRefreshing(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canView, reloadProcurement, showError])

  useEffect(() => {
    if (loadError?.message) setLoadErrorText(loadError.message)
  }, [loadError])

  // Search by item name / barcode is done on the server: the list holds headers only.
  useEffect(() => {
    const text = filter.q.trim()
    if (!text) {
      setItemOrderIds(null)
      return undefined
    }
    let cancelled = false
    findPurchaseOrderIdsByItemText(text)
      .then((ids) => {
        if (!cancelled) setItemOrderIds(new Set(ids))
      })
      .catch((error) => {
        if (cancelled) return
        setItemOrderIds(new Set())
        showError(toUserErrorMessage(error, 'Не удалось выполнить поиск по товарам.'))
      })
    return () => {
      cancelled = true
    }
  }, [filter.q, showError])

  const purchasesReady = !isCloudMode() || isPurchasesDataReady()
  const purchasesLoading =
    isCloudMode() && (isPurchasesDataLoading() || refreshing || !isPurchasesDataReady())
  const stableOrders = useStableWhenReady(getPurchaseOrdersSync(), purchasesReady)
  const hasLoadedOnce = useRef(false)
  if (purchasesReady) hasLoadedOnce.current = true
  const showInitialSkeleton = purchasesLoading && !hasLoadedOnce.current

  const documents = useMemo(
    () => selectPurchaseDocuments(stableOrders, filter, itemOrderIds),
    [stableOrders, filter, itemOrderIds, version, dataVersion]
  )
  const grandTotal = useMemo(
    () => documents.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
    [documents]
  )

  const totalPages = Math.max(1, Math.ceil(documents.length / pageSize))
  const visible = useMemo(
    () => documents.slice((page - 1) * pageSize, page * pageSize),
    [documents, page, pageSize]
  )
  const from = documents.length === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, documents.length)

  useEffect(() => {
    setPage(1)
  }, [filter, pageSize])
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const supplierOptions = useMemo(
    () =>
      getSuppliers()
        .filter((supplier) => supplier?.id && supplier.name)
        .map((supplier) => ({ id: supplier.id, label: supplier.name }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
    [dataVersion, version]
  )

  const defaults = defaultPeriod()
  const periodChanged = filter.dateFrom !== defaults.dateFrom || filter.dateTo !== defaults.dateTo
  const otherCount =
    (filter.supplierIds.length ? 1 : 0) + (filter.status ? 1 : 0) + (filter.q.trim() ? 1 : 0)
  const filterCount = (periodChanged ? 1 : 0) + otherCount

  function toggleFilter() {
    if (filterOpen) {
      setFilterOpen(false)
      return
    }
    setDraft({
      ...filter,
      periodPreset: resolveSettlementsPeriodPreset(filter.dateFrom, filter.dateTo),
    })
    setSupplierSearch('')
    setSupplierOpen(false)
    setFilterOpen(true)
  }

  function applyFilter() {
    if (!draft.dateFrom || !draft.dateTo || draft.dateFrom > draft.dateTo) return
    setFilter({
      dateFrom: draft.dateFrom,
      dateTo: draft.dateTo,
      supplierIds: draft.supplierIds,
      status: draft.status,
      q: draft.q,
    })
    setFilterOpen(false)
  }

  function resetFilter() {
    const fresh = { ...defaultPeriod(), ...DEFAULT_DOCUMENTS_FILTER }
    setDraft(fresh)
    setFilter({
      dateFrom: fresh.dateFrom,
      dateTo: fresh.dateTo,
      supplierIds: [],
      status: '',
      q: '',
    })
    setFilterOpen(false)
  }

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    try {
      const id = await createPurchaseOrder({
        supplierId: null,
        supplierName: '',
        date: toSettlementsDateKey(),
        expectedDeliveryDate: '',
        comment: '',
        createdBy: user?.login || user?.id || '',
        createdByName: user?.name || '',
      })
      navigate(`${DOCUMENT_PATH_PREFIX}/${id}`)
    } catch (error) {
      showError(toUserErrorMessage(error, 'Не удалось создать документ.'))
    } finally {
      setCreating(false)
    }
  }

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Закуп»" />
  }

  const errorMessage =
    loadErrorText ||
    (getPurchasesDataError()
      ? toUserErrorMessage(getPurchasesDataError(), 'Не удалось загрузить документы с сервера.')
      : '')

  const columns = [
    { key: 'number', label: 'Номер', width: 130, mobile: 'hide' },
    { key: 'created', label: 'Создан', width: 110, mobile: 'hide' },
    { key: 'supplier', label: 'Поставщик', width: 200, flex: true, mobile: 'title' },
    { key: 'delivery', label: 'Доставка', width: 110, mobile: 'hide' },
    { key: 'items', label: 'Позиций', width: 80, align: 'end', mobile: 'hide' },
    { key: 'amount', label: 'Сумма', width: 130, align: 'end', mobile: 'end' },
    { key: 'creator', label: 'Создал', width: 160, mobile: 'hide' },
    { key: 'comment', label: 'Комментарий', width: 220, mobile: 'hide' },
  ]

  return (
    <div className="pdl-page">
      <div className="pdl-bar">
        {canCreate ? (
          <button
            type="button"
            className="btn btn--primary"
            disabled={creating}
            onClick={handleCreate}
          >
            ＋ Создать
          </button>
        ) : null}
        <div className="pf-filter-anchor">
          <PlatformFilterTrigger
            ref={filterButtonRef}
            active={filterCount > 0}
            count={filterCount}
            open={filterOpen}
            onClick={toggleFilter}
          />
          <PeriodFilterPopover
            open={filterOpen}
            draft={draft}
            onChange={setDraft}
            onApply={applyFilter}
            onReset={resetFilter}
            onClose={() => setFilterOpen(false)}
            anchorRef={filterButtonRef}
            getDefaults={() => ({ ...defaultPeriod(), ...DEFAULT_DOCUMENTS_FILTER })}
          >
            <div className="pf-field">
              <label className="pf-field__label" htmlFor="pdl-q">
                Название, штрихкод или номер:
              </label>
              <div className="pf-field__control">
                <input
                  id="pdl-q"
                  type="text"
                  className="pf-field__input"
                  placeholder="Введите название или штрихкод"
                  value={draft.q}
                  onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
                  autoComplete="off"
                />
              </div>
            </div>
            <FilterComboField
              label="Поставщик"
              searchable
              placeholder="Введите название"
              searchValue={supplierSearch}
              onSearchChange={setSupplierSearch}
              options={supplierOptions}
              draft={new Set(draft.supplierIds)}
              onToggle={(id) =>
                setDraft((current) => ({
                  ...current,
                  supplierIds: current.supplierIds.includes(id)
                    ? current.supplierIds.filter((value) => value !== id)
                    : [...current.supplierIds, id],
                }))
              }
              expanded={supplierOpen}
              onToggleExpanded={() => setSupplierOpen((value) => !value)}
              emptyText="Поставщик не найден"
            />
            <div className="pf-field">
              <label className="pf-field__label" htmlFor="pdl-status">
                Статус:
              </label>
              <div className="pf-field__control">
                <select
                  id="pdl-status"
                  className="pf-field__input"
                  value={draft.status}
                  onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
                >
                  <option value="">Все</option>
                  <option value={PURCHASE_STATUS.DRAFT}>Черновик</option>
                  <option value={PURCHASE_STATUS.SAVED}>Сохранён</option>
                </select>
              </div>
            </div>
          </PeriodFilterPopover>
        </div>
        <span className="pf-filter-chip pdl-bar__chip">
          С {formatPurchaseDate(filter.dateFrom)} по {formatPurchaseDate(filter.dateTo)}
          <button
            type="button"
            aria-label="Показать за три месяца"
            onClick={() => {
              const dates = getSettlementsPeriodDates(SETTLEMENTS_PERIOD_PRESET.THREE_MONTHS)
              setFilter((current) => ({ ...current, ...dates }))
            }}
          >
            ×
          </button>
        </span>
      </div>

      {errorMessage ? (
        <p className="pdl-error" role="alert">
          {errorMessage}{' '}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true)
              reloadProcurement()
                .then(() => setLoadErrorText(null))
                .catch((error) =>
                  setLoadErrorText(toUserErrorMessage(error, 'Не удалось загрузить документы с сервера.'))
                )
                .finally(() => setRefreshing(false))
            }}
          >
            Повторить
          </button>
        </p>
      ) : null}

      {showInitialSkeleton ? (
        <DelayedLoadingSkeleton variant="list" count={5} />
      ) : (
        <div className="procurement-list-panel">
          <PgtTable columns={columns} className="pdl-table">
            <PgtHead columns={columns} />
            {documents.length === 0 ? (
              <p className="pgt__empty">Документов за этот период нет.</p>
            ) : null}
            {visible.map((order) => {
              const isDraft = isOrderDraft(order)
              const count = order.itemsCount ?? order.items?.length ?? 0
              return (
                <PgtRow
                  key={order.id}
                  columns={columns}
                  className={isDraft ? 'pdl-row pdl-row--draft' : 'pdl-row'}
                  onClick={() => navigate(`${DOCUMENT_PATH_PREFIX}/${order.id}`)}
                  cells={{
                    number: order.number ? (
                      <span className="num pdl-number">{order.number}</span>
                    ) : (
                      <span className="pdl-nonumber">Без номера</span>
                    ),
                    created: <span className="num">{formatPurchaseDate(order.createdAt || order.date)}</span>,
                    supplier: order.supplierName ? (
                      <span className="pgt__title">{order.supplierName}</span>
                    ) : (
                      <span className="pdl-nonumber">Поставщик не выбран</span>
                    ),
                    delivery: <span className="num">{order.expectedDeliveryDate ? formatPurchaseDate(order.expectedDeliveryDate) : '—'}</span>,
                    items: <span className="num">{count}</span>,
                    amount: (
                      <span
                        className={`pgt__money pdl-sum ${isDraft ? 'pdl-sum--draft' : 'pdl-sum--saved'}`}
                      >
                        {formatPurchaseAmount(order.totalAmount)}
                      </span>
                    ),
                    creator: <span>{order.createdByName || '—'}</span>,
                    comment: <span className="pdl-comment">{order.comment || ''}</span>,
                  }}
                  mobileMeta={[
                    isDraft ? 'Черновик' : order.number ? `№${order.number}` : '',
                    `${count} поз.`,
                    order.expectedDeliveryDate ? formatPurchaseDate(order.expectedDeliveryDate) : '',
                    order.createdByName,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              )
            })}
            <PgtFoot
              columns={columns}
              cells={{
                number: <strong>Итого по списку</strong>,
                amount: <strong className="pgt__money">{formatPurchaseAmount(grandTotal)}</strong>,
              }}
            />
          </PgtTable>
          <TablePagination
            page={page}
            totalPages={totalPages}
            from={from}
            to={to}
            totalCount={documents.length}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}
    </div>
  )
}
