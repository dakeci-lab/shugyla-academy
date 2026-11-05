import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import { usePlatformData } from '../../../context/PlatformDataContext'
import { usePlatformPageRefresh } from '../../../context/PullToRefreshContext'
import { useToast } from '../../../context/ToastContext'
import useStableWhenReady from '../../../hooks/useStableWhenReady'
import useMediaQuery from '../../../hooks/useMediaQuery'
import useInfiniteSlice from '../../../hooks/useInfiniteSlice'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import { canViewPurchases, canCreatePurchase, canDeletePurchase } from '../../../config/permissions'
import {
  getPurchaseOrdersSync,
  createPurchaseOrder,
  deleteDraftPurchaseOrders,
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
  documentGroupKey,
  formatDocumentGroupLabel,
  formatDocumentTime,
  selectPurchaseDocuments,
} from '../../../utils/purchaseDocumentsList'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import IconActionButton from '../../../components/admin/IconActionButton'
import ConfirmDialog from '../../../components/admin/ConfirmDialog'
import PlatformActionsMenu from '../../../components/platform/PlatformActionsMenu'
import { PencilIcon } from '../../../components/icons/PlatformIcons'
import PlatformFab from '../../../components/platform/PlatformFab'
import PlatformFilterTrigger from '../../../components/platform/PlatformFilterTrigger'
import PlatformFilterRow from '../../../components/platform/PlatformFilterRow'
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
  const { error: showError, success: showSuccess } = useToast()
  const { loadError, reloadProcurement, ensureModules, ensureOrdersFrom, version: dataVersion } = usePlatformData()
  // Swipe reloads just the orders (not suppliers, not employees).
  usePlatformPageRefresh(() => reloadProcurement())
  const { version } = useAdminRefresh()
  const navigate = useNavigate()
  const canView = canViewPurchases(user)
  const canCreate = canCreatePurchase(user)
  const canDelete = canDeletePurchase(user)
  const isPhone = useMediaQuery('(max-width: 640px)')
  // The filter opens as a bottom sheet up to 900px; there the field names are placeholders (UMAG).
  const isSheet = useMediaQuery('(max-width: 900px)')

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
  const [selected, setSelected] = useState(() => new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const selectAllRef = useRef(null)

  // The list holds only the recent window of orders; an earlier period in the filter fetches the older ones.
  useEffect(() => {
    if (!filter.dateFrom) return
    void ensureOrdersFrom(filter.dateFrom).catch(() => {})
  }, [filter.dateFrom, ensureOrdersFrom])

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
    () => selectPurchaseDocuments(stableOrders, filter, itemOrderIds, { chronological: isPhone }),
    [stableOrders, filter, itemOrderIds, version, dataVersion, isPhone]
  )
  const grandTotal = useMemo(
    () => documents.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
    [documents]
  )

  const totalPages = Math.max(1, Math.ceil(documents.length / pageSize))
  const pagedVisible = useMemo(
    () => documents.slice((page - 1) * pageSize, page * pageSize),
    [documents, page, pageSize]
  )
  // Phones: no pages — the first 25 rows, the next 25 appear as you scroll to the end (UMAG's behaviour).
  const infinite = useInfiniteSlice(documents, { enabled: isPhone, resetKey: JSON.stringify(filter) })
  const visible = isPhone ? infinite.visible : pagedVisible
  const from = documents.length === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, documents.length)

  useEffect(() => {
    setPage(1)
  }, [filter, pageSize])
  // A selection belongs to the page on screen: another page, filter or page size starts clean.
  useEffect(() => {
    setSelected(new Set())
  }, [filter, page, pageSize])
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

  const visibleIds = visible.map((order) => order.id)
  const pickedOrders = visible.filter((order) => selected.has(order.id))
  const allPicked = visibleIds.length > 0 && pickedOrders.length === visibleIds.length
  const hasSavedPicked = pickedOrders.some((order) => !isOrderDraft(order))
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = pickedOrders.length > 0 && !allPicked
    }
  }, [pickedOrders.length, allPicked])

  function toggleOne(id) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allPicked ? new Set() : new Set(visibleIds))
  }

  /** Why «Удалить» is unavailable right now ('' — it is available). */
  const deleteBlockReason = !canDelete
    ? 'Нет прав на удаление'
    : pickedOrders.length === 0
      ? 'Отметьте документы в списке'
      : hasSavedPicked
        ? 'Сохранённые документы удалить нельзя'
        : ''

  async function handleDeleteSelected() {
    const ids = pickedOrders.map((order) => order.id)
    setDeleting(true)
    try {
      const { deleted, failed } = await deleteDraftPurchaseOrders(ids)
      setSelected((current) => new Set([...current].filter((id) => !deleted.includes(id))))
      if (deleted.length) showSuccess(`Удалено черновиков: ${deleted.length}`)
      if (failed.length) {
        showError(`Не удалено: ${failed.length}. ${failed[0].message}`)
      }
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
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
    {
      key: 'select',
      label: (
        <input
          ref={selectAllRef}
          type="checkbox"
          className="pdl-check"
          checked={allPicked}
          disabled={visibleIds.length === 0}
          onChange={toggleAll}
          aria-label="Выбрать все документы на странице"
        />
      ),
      width: 36,
      mobile: 'hide',
    },
    { key: 'number', label: 'Номер', width: 90, mobile: 'hide' },
    { key: 'created', label: 'Создан', width: 100, mobile: 'hide' },
    { key: 'supplier', label: 'Поставщик', width: 160, flex: true, mobile: 'title' },
    { key: 'delivery', label: 'Доставка', width: 100, mobile: 'hide' },
    { key: 'items', label: 'Позиций', width: 64, align: 'end', mobile: 'hide' },
    { key: 'amount', label: 'Сумма', width: 120, align: 'end', mobile: 'end' },
    { key: 'creator', label: 'Создал', width: 140, mobile: 'hide' },
    { key: 'comment', label: 'Комментарий', width: 140, mobile: 'hide' },
    { key: 'edit', label: '', width: 44, align: 'end', mobile: 'hide' },
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
          {isPhone ? (
            <PlatformFilterRow
              ref={filterButtonRef}
              count={filterCount}
              open={filterOpen}
              onClick={toggleFilter}
              hint="Дата, Поставщик, Статус документа, Название"
            />
          ) : (
            <PlatformFilterTrigger
              ref={filterButtonRef}
              active={filterCount > 0}
              count={filterCount}
              open={filterOpen}
              onClick={toggleFilter}
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
              <label className="pf-field__label" htmlFor="pdl-status">
                Статус:
              </label>
              <div className="pf-field__control">
                <select
                  id="pdl-status"
                  className={`pf-field__input${draft.status ? '' : ' is-empty'}`}
                  value={draft.status}
                  onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
                >
                  <option value="">{isSheet ? 'Статус документа' : 'Все'}</option>
                  <option value={PURCHASE_STATUS.DRAFT}>Черновик</option>
                  <option value={PURCHASE_STATUS.SAVED}>Сохранён</option>
                </select>
              </div>
            </div>
          </PeriodFilterPopover>
        </div>
        <PlatformActionsMenu
          className="pdl-bar__actions"
          count={pickedOrders.length}
          items={[
            {
              key: 'delete',
              label: 'Удалить',
              danger: true,
              disabled: Boolean(deleteBlockReason),
              reason: deleteBlockReason,
              onSelect: () => setConfirmDelete(true),
            },
          ]}
        />
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

      {canCreate ? <PlatformFab label="Создать заказ" disabled={creating} onClick={handleCreate} /> : null}

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
            {visible.map((order, index) => {
              const isDraft = isOrderDraft(order)
              const count = order.itemsCount ?? order.items?.length ?? 0
              const groupKey = documentGroupKey(order)
              const startsGroup = index === 0 || documentGroupKey(visible[index - 1]) !== groupKey
              return (
                <Fragment key={order.id}>
                  {startsGroup ? (
                    <div className="pgt__day" role="presentation">
                      {formatDocumentGroupLabel(groupKey)}
                    </div>
                  ) : null}
                  <PgtRow
                    columns={columns}
                    className={`${isDraft ? 'pdl-row pdl-row--draft' : 'pdl-row'}${selected.has(order.id) ? ' is-selected' : ''}`}
                    interactive
                    onClick={() => navigate(`${DOCUMENT_PATH_PREFIX}/${order.id}`)}
                    cells={{
                      select: (
                        <input
                          type="checkbox"
                          className="pdl-check"
                          checked={selected.has(order.id)}
                          onChange={() => toggleOne(order.id)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`Выбрать документ: ${order.supplierName || 'без поставщика'}`}
                        />
                      ),
                      edit: (
                        <IconActionButton
                          variant="edit"
                          label={isDraft ? 'Редактировать' : 'Открыть'}
                          onClick={(event) => {
                            event.stopPropagation()
                            navigate(`${DOCUMENT_PATH_PREFIX}/${order.id}`)
                          }}
                        >
                          <PencilIcon size={16} />
                        </IconActionButton>
                      ),
                      number: order.number ? (
                        <span className="num pdl-number">{order.number}</span>
                      ) : (
                        <span className="pdl-dash" aria-label="Без номера">
                          ---
                        </span>
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
                    mobileMeta={
                      <>
                        {formatDocumentTime(order) ? <span className="pdl-time">{formatDocumentTime(order)}</span> : null}
                        <span className={`pdl-pill ${isDraft ? 'pdl-pill--draft' : 'pdl-pill--saved'}`}>
                          {isDraft ? 'Черновик' : 'Сохранён'}
                        </span>
                      </>
                    }
                  />
                </Fragment>
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
          {isPhone ? (
            infinite.hasMore ? <div ref={infinite.sentinelRef} className="pgt__more" aria-hidden="true" /> : null
          ) : (
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
          )}
        </div>
      )}

      {confirmDelete ? (
        <ConfirmDialog
          title={`Удалить черновиков: ${pickedOrders.length}?`}
          message="Черновики будут удалены безвозвратно. Сохранённые документы удалить нельзя."
          confirmLabel="Удалить"
          loading={deleting}
          onConfirm={() => void handleDeleteSelected()}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </div>
  )
}
