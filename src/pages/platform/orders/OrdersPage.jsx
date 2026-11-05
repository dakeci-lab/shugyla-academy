import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../../../context/SessionContext'
import { usePlatformData } from '../../../context/PlatformDataContext'
import { usePlatformPageRefresh } from '../../../context/PullToRefreshContext'
import { useToast } from '../../../context/ToastContext'
import useStableWhenReady from '../../../hooks/useStableWhenReady'
import useMediaQuery from '../../../hooks/useMediaQuery'
import useInfiniteSlice from '../../../hooks/useInfiniteSlice'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import { canViewOrders } from '../../../config/permissions'
import {
  getPurchaseOrdersSync,
  findPurchaseOrderIdsByItemText,
  isPurchasesDataReady,
  isPurchasesDataLoading,
  getPurchasesDataError,
} from '../../../services/purchaseDataService'
import { getSuppliers } from '../../../services/platformDataService'
import { isCloudMode } from '../../../lib/dataMode'
import { toUserErrorMessage } from '../../../utils/userErrorMessage'
import { DEFAULT_RECEIVER_FILTER, RECEIVER_STATUS, selectReceiverOrders } from '../../../utils/purchaseDocumentsList'
import { PROCUREMENT_FRESH_MS } from '../../../lib/procurementFreshness'
import {
  getSettlementsPeriodDates,
  ORDERS_PERIOD_PRESET_OPTIONS,
  resolveSettlementsPeriodPreset,
  SETTLEMENTS_PERIOD_PRESET,
} from '../../../utils/settlementsPeriod'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import PurchaseTable from '../../../components/procurement/PurchaseTable'
import PlatformFilterRow from '../../../components/platform/PlatformFilterRow'
import PlatformFloatingSearch from '../../../components/platform/PlatformFloatingSearch'
import PeriodFilterPopover from '../../../components/platform/PeriodFilterPopover'
import PlatformFilterTrigger from '../../../components/platform/PlatformFilterTrigger'
import FilterComboField from '../../../components/platform/FilterComboField'
import TablePagination from '../../../components/procurement/TablePagination'
import { DelayedLoadingSkeleton } from '../../../components/loading/LoadingSkeleton'
import '../../../components/platform/FilterComboField.css'
import '../../../components/admin/admin-shared.css'
import '../procurement/ProcurementPage.css'
import './OrdersPage.css'

/**
 * «Заказы» — /platform/orders: what the receiver sees. Saved orders only (drafts belong to the buyer's «Закуп»),
 * period by DELIVERY date (quick: Вчера / Сегодня / Завтра / Неделя / Месяц — the receiver wants to know what comes
 * tomorrow), the shared filter (supplier, name / barcode / number, «Сверено» / «Не сверено»), a one-line summary
 * and the list. The document opens read-only.
 */
function defaultReceiverFilter() {
  return { ...DEFAULT_RECEIVER_FILTER, ...getSettlementsPeriodDates(SETTLEMENTS_PERIOD_PRESET.TODAY) }
}

export default function OrdersPage() {
  const { user } = useSession()
  const { error: showError } = useToast()
  const { loadError, reloadProcurement, ensureModules, version: dataVersion } = usePlatformData()
  // Swipe reloads just the orders (not suppliers, not employees).
  usePlatformPageRefresh(() => reloadProcurement())
  const { version } = useAdminRefresh()
  const canView = canViewOrders(user)

  useEffect(() => {
    if (!isCloudMode()) return
    void ensureModules(['suppliers', 'procurement'])
  }, [ensureModules])

  const isPhone = useMediaQuery('(max-width: 640px)')
  // The filter opens as a bottom sheet up to 900px; there the field names are placeholders (UMAG).
  const isSheet = useMediaQuery('(max-width: 900px)')
  const [filter, setFilter] = useState(defaultReceiverFilter)
  const [draft, setDraft] = useState(() => ({
    ...defaultReceiverFilter(),
    periodPreset: SETTLEMENTS_PERIOD_PRESET.TODAY,
  }))
  const [filterOpen, setFilterOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [itemOrderIds, setItemOrderIds] = useState(null)
  const filterButtonRef = useRef(null)
  const [loadErrorText, setLoadErrorText] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  useEffect(() => {
    if (!canView || !isCloudMode()) return undefined
    let cancelled = false
    void (async () => {
      setRefreshing(true)
      try {
        await reloadProcurement({ maxAgeMs: PROCUREMENT_FRESH_MS })
        if (!cancelled) setLoadErrorText(null)
      } catch (error) {
        const message = toUserErrorMessage(error, 'Не удалось загрузить заказы с сервера.')
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

  // Search by an item's name / barcode is done on the server: the list holds headers only.
  useEffect(() => {
    const text = filter.q.trim()
    if (!text) {
      setItemOrderIds(null)
      return undefined
    }
    let cancelled = false
    // The search box types into the filter live: ask the server only when the typing pauses.
    const timer = setTimeout(() => {
      findPurchaseOrderIdsByItemText(text)
        .then((ids) => {
          if (!cancelled) setItemOrderIds(new Set(ids))
        })
        .catch((error) => {
          if (cancelled) return
          setItemOrderIds(new Set())
          showError(toUserErrorMessage(error, 'Не удалось выполнить поиск по товарам.'))
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [filter.q, showError])

  const purchasesReady = !isCloudMode() || isPurchasesDataReady()
  const purchasesLoading =
    isCloudMode() && (isPurchasesDataLoading() || refreshing || !isPurchasesDataReady())
  const stableOrders = useStableWhenReady(getPurchaseOrdersSync(), purchasesReady)
  const hasLoadedOnce = useRef(false)
  if (purchasesReady) hasLoadedOnce.current = true
  const showInitialSkeleton = purchasesLoading && !hasLoadedOnce.current

  const orders = useMemo(
    () => selectReceiverOrders(stableOrders, filter, itemOrderIds),
    [stableOrders, filter, itemOrderIds, version, dataVersion]
  )

  const supplierOptions = useMemo(
    () =>
      getSuppliers()
        .filter((supplier) => supplier?.id && supplier.name)
        .map((supplier) => ({ id: supplier.id, label: supplier.name }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
    [dataVersion, version]
  )

  const totalPages = Math.max(1, Math.ceil(orders.length / pageSize))
  const pagedOrders = useMemo(
    () => orders.slice((page - 1) * pageSize, page * pageSize),
    [orders, page, pageSize]
  )
  // Phones: no pages — the first 25, the next 25 appear as you scroll to the end (UMAG's behaviour).
  const infinite = useInfiniteSlice(orders, { enabled: isPhone, resetKey: JSON.stringify(filter) })
  const visibleOrders = isPhone ? infinite.visible : pagedOrders
  const from = orders.length === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, orders.length)

  useEffect(() => {
    setPage(1)
  }, [filter, pageSize])
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const defaults = defaultReceiverFilter()
  const periodChanged = filter.dateFrom !== defaults.dateFrom || filter.dateTo !== defaults.dateTo
  const otherCount = (filter.supplierIds.length ? 1 : 0) + (filter.status ? 1 : 0) + (filter.q.trim() ? 1 : 0)
  const filterCount = (periodChanged ? 1 : 0) + otherCount

  function openFilter() {
    if (filterOpen) {
      setFilterOpen(false)
      return
    }
    setDraft({ ...filter, periodPreset: resolveSettlementsPeriodPreset(filter.dateFrom, filter.dateTo) })
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
    setFilter(defaultReceiverFilter())
    setFilterOpen(false)
  }

  if (!canView) return <PlatformAccessDenied title="Нет доступа к разделу «Приёмка»" />

  const errorMessage =
    loadErrorText ||
    (getPurchasesDataError()
      ? toUserErrorMessage(getPurchasesDataError(), 'Не удалось загрузить заказы с сервера.')
      : '')

  return (
    <div className="orders-page">
      <div className="orders-page__bar">
        <div className="pf-filter-anchor orders-page__filter">
          {isPhone ? (
            <PlatformFilterRow
              ref={filterButtonRef}
              count={filterCount}
              open={filterOpen}
              onClick={openFilter}
              hint="Дата, Поставщик, Статус, Название"
            />
          ) : (
            <PlatformFilterTrigger
              ref={filterButtonRef}
              active={filterCount > 0}
              open={filterOpen}
              onClick={openFilter}
              aria-label="Фильтр"
              title="Фильтр"
            />
          )}
          <PeriodFilterPopover
            open={filterOpen}
            draft={draft}
            onChange={setDraft}
            onApply={applyFilter}
            onReset={resetFilter}
            onClose={() => setFilterOpen(false)}
            anchorRef={filterButtonRef}
            getDefaults={() => ({ ...defaultReceiverFilter(), periodPreset: SETTLEMENTS_PERIOD_PRESET.TODAY })}
            presetOptions={ORDERS_PERIOD_PRESET_OPTIONS}
          >
            <div className="pf-field">
              <label className="pf-field__label" htmlFor="ord-q">
                Название, штрихкод или номер:
              </label>
              <div className="pf-field__control">
                <input
                  id="ord-q"
                  type="text"
                  className="pf-field__input"
                  placeholder={isSheet ? 'Название, штрихкод или номер' : 'Введите название или штрихкод'}
                  value={draft.q}
                  onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
                  autoComplete="off"
                />
              </div>
            </div>
            <FilterComboField
              label="Поставщик"
              searchable
              placeholder={isSheet ? 'Поставщик' : 'Введите название'}
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
              <label className="pf-field__label" htmlFor="ord-status">
                Статус:
              </label>
              <div className="pf-field__control">
                <select
                  id="ord-status"
                  className={`pf-field__input${draft.status ? '' : ' is-empty'}`}
                  value={draft.status}
                  onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
                >
                  <option value="">{isSheet ? 'Статус документа' : 'Все'}</option>
                  <option value={RECEIVER_STATUS.UNCHECKED}>Не сверено</option>
                  <option value={RECEIVER_STATUS.CHECKED}>Сверено</option>
                </select>
              </div>
            </div>
          </PeriodFilterPopover>
        </div>
        {isPhone ? null : (
          <input
            type="search"
            className="orders-page__search"
            placeholder="Поставщик, номер или товар"
            aria-label="Поиск по заказам"
            value={filter.q}
            onChange={(event) => setFilter((current) => ({ ...current, q: event.target.value }))}
            autoComplete="off"
          />
        )}
      </div>

      {isPhone ? (
        <PlatformFloatingSearch
          value={filter.q}
          onChange={(value) => setFilter((current) => ({ ...current, q: value }))}
          placeholder="Поставщик, номер или товар"
          label="Поиск по заказам"
        />
      ) : null}

      {errorMessage ? (
        <p className="orders-page__error" role="alert">
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
                  setLoadErrorText(toUserErrorMessage(error, 'Не удалось загрузить заказы с сервера.'))
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
          <PurchaseTable orders={visibleOrders} />
          {isPhone ? (
            infinite.hasMore ? <div ref={infinite.sentinelRef} className="pgt__more" aria-hidden="true" /> : null
          ) : (
            <TablePagination
              page={page}
              totalPages={totalPages}
              from={from}
              to={to}
              totalCount={orders.length}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
            />
          )}
        </div>
      )}
    </div>
  )
}
