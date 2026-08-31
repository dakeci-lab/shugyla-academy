import { useCallback, useEffect, useRef, useState } from 'react'
import { isCloudMode } from '../../lib/dataMode'
import {
  exportSnapshotItemsCsv,
  fetchProcurementSnapshotsPage,
  fetchProcurementSnapshotTotals,
  fetchSnapshotItemsPage,
  fetchSnapshotItemsTotals,
} from '../../services/procurementPlanningService'
import { formatUmagDateTime, formatUmagMoney } from '../../services/umagSettlementsService'
import { exportWarehouseSnapshotXlsx } from '../../utils/procurementWarehouseExport'
import { toProcurementUserMessage } from '../../utils/procurementErrors'
import { DelayedLoadingSkeleton } from '../loading/LoadingSkeleton'
import PlatformSearchToolbar from '../platform/PlatformSearchToolbar'
import TablePagination from './TablePagination'
import { DownloadIcon, ChevronLeftIcon } from '../icons/PlatformIcons'
import './ProcurementWarehouseView.css'

const HISTORY_PAGE_SIZE = 20
const DETAIL_PAGE_SIZE_OPTIONS = [25, 50, 100, 200]
const SEARCH_DEBOUNCE_MS = 300

function formatQty(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('ru-KZ', { maximumFractionDigits: 3 })
}

/**
 * Склад — history of every UMAG sync. procurement_snapshots is append-only
 * (each sync creates a new row, never overwrites — see the table comment in
 * 20260809072915_procurement_planning_v1.sql), so this is a pure read layer
 * over data that already exists; no new storage was added for this view.
 */
export default function ProcurementWarehouseView() {
  const [snapshots, setSnapshots] = useState([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [exportingId, setExportingId] = useState(null)
  const [historyTotalsById, setHistoryTotalsById] = useState(new Map())
  const [historyTotalsLoading, setHistoryTotalsLoading] = useState(false)

  const [selected, setSelected] = useState(null)
  const [detailItems, setDetailItems] = useState([])
  const [detailTotal, setDetailTotal] = useState(0)
  const [detailPage, setDetailPage] = useState(1)
  const [detailPageSize, setDetailPageSize] = useState(50)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [detailSearch, setDetailSearch] = useState('')
  const [debouncedDetailSearch, setDebouncedDetailSearch] = useState('')
  const [detailExporting, setDetailExporting] = useState(false)
  const [detailTotals, setDetailTotals] = useState(null)
  const [detailTotalsLoading, setDetailTotalsLoading] = useState(false)

  const historyRequestRef = useRef(0)
  const detailRequestRef = useRef(0)
  const totalsRequestRef = useRef(0)
  const historyTotalsRequestRef = useRef(0)

  const loadHistory = useCallback(async () => {
    const requestId = ++historyRequestRef.current
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const result = await fetchProcurementSnapshotsPage({
        page: historyPage,
        pageSize: HISTORY_PAGE_SIZE,
      })
      if (requestId !== historyRequestRef.current) return
      setSnapshots(result.items)
      setHistoryTotal(result.totalCount)
      setHistoryTotalsById(new Map())
      void loadHistoryTotals(requestId, result.items)
    } catch (err) {
      if (requestId !== historyRequestRef.current) return
      setHistoryError(toProcurementUserMessage(err, 'Не удалось загрузить историю склада'))
      setSnapshots([])
      setHistoryTotal(0)
    } finally {
      if (requestId === historyRequestRef.current) setHistoryLoading(false)
    }
  }, [historyPage])

  const loadHistoryTotals = useCallback(async (historyRequestId, items) => {
    const requestId = ++historyTotalsRequestRef.current
    setHistoryTotalsLoading(true)
    try {
      const totals = await fetchProcurementSnapshotTotals(items.map((s) => s.id))
      if (requestId !== historyTotalsRequestRef.current || historyRequestId !== historyRequestRef.current) return
      setHistoryTotalsById(totals)
    } catch {
      // Non-critical — the row simply shows "—" for its totals; the history list itself already loaded fine.
    } finally {
      if (requestId === historyTotalsRequestRef.current) setHistoryTotalsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isCloudMode()) {
      setHistoryLoading(false)
      return
    }
    void loadHistory()
  }, [loadHistory])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedDetailSearch(detailSearch.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [detailSearch])

  useEffect(() => {
    setDetailPage(1)
  }, [debouncedDetailSearch])

  const loadDetail = useCallback(async () => {
    if (!selected?.id) return
    const requestId = ++detailRequestRef.current
    setDetailLoading(true)
    setDetailError('')
    try {
      const result = await fetchSnapshotItemsPage({
        snapshotId: selected.id,
        page: detailPage,
        pageSize: detailPageSize,
        search: debouncedDetailSearch,
      })
      if (requestId !== detailRequestRef.current) return
      setDetailItems(result.items)
      setDetailTotal(result.totalCount)
    } catch (err) {
      if (requestId !== detailRequestRef.current) return
      setDetailError(toProcurementUserMessage(err, 'Не удалось загрузить содержимое снимка'))
      setDetailItems([])
      setDetailTotal(0)
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false)
    }
  }, [selected?.id, detailPage, detailPageSize, debouncedDetailSearch])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const loadDetailTotals = useCallback(async () => {
    if (!selected?.id) return
    const requestId = ++totalsRequestRef.current
    setDetailTotalsLoading(true)
    try {
      const totals = await fetchSnapshotItemsTotals({
        snapshotId: selected.id,
        search: debouncedDetailSearch,
      })
      if (requestId !== totalsRequestRef.current) return
      setDetailTotals(totals)
    } catch {
      if (requestId !== totalsRequestRef.current) return
      setDetailTotals(null)
    } finally {
      if (requestId === totalsRequestRef.current) setDetailTotalsLoading(false)
    }
  }, [selected?.id, debouncedDetailSearch])

  useEffect(() => {
    void loadDetailTotals()
  }, [loadDetailTotals])

  function openSnapshot(snapshot) {
    setSelected(snapshot)
    setDetailItems([])
    setDetailTotal(0)
    setDetailPage(1)
    setDetailSearch('')
    setDebouncedDetailSearch('')
    setDetailTotals(null)
  }

  function closeSnapshot() {
    setSelected(null)
    detailRequestRef.current += 1
    totalsRequestRef.current += 1
    setDetailTotals(null)
  }

  async function handleExportRow(snapshot) {
    if (exportingId) return
    setExportingId(snapshot.id)
    try {
      const items = await exportSnapshotItemsCsv(snapshot.id, {})
      await exportWarehouseSnapshotXlsx(items, { syncedAt: snapshot.syncedAt || snapshot.createdAt })
    } catch (err) {
      setHistoryError(toProcurementUserMessage(err, 'Не удалось выгрузить Excel'))
    } finally {
      setExportingId(null)
    }
  }

  async function handleExportDetail() {
    if (!selected?.id || detailExporting) return
    setDetailExporting(true)
    try {
      const items = await exportSnapshotItemsCsv(selected.id, {})
      await exportWarehouseSnapshotXlsx(items, {
        syncedAt: selected.syncedAt || selected.createdAt,
      })
    } catch (err) {
      setDetailError(toProcurementUserMessage(err, 'Не удалось выгрузить Excel'))
    } finally {
      setDetailExporting(false)
    }
  }

  if (!isCloudMode()) {
    return <p className="proc-wh__empty">Склад доступен только в облачном режиме.</p>
  }

  if (selected) {
    const detailTotalPages = Math.max(1, Math.ceil(detailTotal / detailPageSize))
    const detailFrom = detailTotal === 0 ? 0 : (detailPage - 1) * detailPageSize + 1
    const detailTo = Math.min(detailPage * detailPageSize, detailTotal)

    return (
      <div className="proc-wh">
        <div className="proc-wh__detail-head">
          <button type="button" className="proc-wh__back" onClick={closeSnapshot}>
            <ChevronLeftIcon size={18} />
            К истории склада
          </button>
          <div className="proc-wh__detail-meta">
            <span className="proc-wh__detail-title">
              Синхронизация от {formatUmagDateTime(selected.syncedAt || selected.createdAt)}
            </span>
          </div>
        </div>
        {detailExporting ? <div className="proc-wh__loading-bar" aria-hidden="true" /> : null}

        <PlatformSearchToolbar
          value={detailSearch}
          onChange={(e) => setDetailSearch(e.target.value)}
          onClear={() => setDetailSearch('')}
          showClear
          placeholder="Товар или штрихкод…"
          ariaLabel="Поиск по товарам снимка"
          flush
          actions={
            <button
              type="button"
              className="btn btn--outline proc-wh__export-btn"
              onClick={() => void handleExportDetail()}
              disabled={detailExporting}
            >
              <DownloadIcon size={18} />
              {detailExporting ? 'Экспорт…' : 'Скачать Excel'}
            </button>
          }
        />

        {detailError ? (
          <div className="proc-wh__error" role="alert">
            {detailError}
          </div>
        ) : (
          <>
            <div className="proc-wh__wrap">
              <table className="proc-wh__table">
                <thead>
                  <tr>
                    <th className="proc-wh__col-rank">№</th>
                    <th>Товар</th>
                    <th>Категория</th>
                    <th className="proc-wh__col-num">Остаток</th>
                    <th>Ед.</th>
                    <th className="proc-wh__col-num">Закуп. цена</th>
                    <th className="proc-wh__col-num">Прод. цена</th>
                    <th className="proc-wh__col-num">Сумма закупки</th>
                    <th className="proc-wh__col-num">Сумма продажи</th>
                  </tr>
                </thead>
                <tbody>
                  {detailLoading && detailItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="proc-wh__empty-cell">
                        Загрузка…
                      </td>
                    </tr>
                  ) : detailItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="proc-wh__empty-cell">
                        {debouncedDetailSearch
                          ? 'По вашему запросу ничего не найдено.'
                          : 'В этом снимке нет товаров.'}
                      </td>
                    </tr>
                  ) : (
                    detailItems.map((item, index) => {
                      const stock = Number(item.rawStock) || 0
                      const purchasePrice = Number(item.purchasePrice) || 0
                      const sellingPrice = Number(item.sellingPrice) || 0
                      return (
                        <tr key={item.id}>
                          <td className="proc-wh__col-rank">
                            {(detailPage - 1) * detailPageSize + index + 1}
                          </td>
                          <td>
                            <div className="proc-wh__product-name">{item.productName || '—'}</div>
                            <div className="proc-wh__product-barcode">{item.barcode}</div>
                          </td>
                          <td className="proc-wh__category">
                            {item.categoryName}
                            {item.subcategoryName ? ` · ${item.subcategoryName}` : ''}
                          </td>
                          <td className="proc-wh__col-num">{formatQty(stock)}</td>
                          <td>{item.measure || '—'}</td>
                          <td className="proc-wh__col-num">{formatUmagMoney(purchasePrice)}</td>
                          <td className="proc-wh__col-num">{formatUmagMoney(sellingPrice)}</td>
                          <td className="proc-wh__col-num">
                            {formatUmagMoney(stock * purchasePrice)}
                          </td>
                          <td className="proc-wh__col-num">
                            {formatUmagMoney(stock * sellingPrice)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
                {detailItems.length > 0 ? (
                  <tfoot>
                    <tr className="proc-wh__totals-row">
                      <td colSpan={7}>
                        Итого{debouncedDetailSearch ? ' (по фильтру)' : ''}:
                      </td>
                      <td className="proc-wh__col-num">
                        {detailTotalsLoading && !detailTotals
                          ? '…'
                          : formatUmagMoney(detailTotals?.totalPurchaseValue ?? 0)}
                      </td>
                      <td className="proc-wh__col-num">
                        {detailTotalsLoading && !detailTotals
                          ? '…'
                          : formatUmagMoney(detailTotals?.totalSellingValue ?? 0)}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
            <TablePagination
              page={detailPage}
              totalPages={detailTotalPages}
              from={detailFrom}
              to={detailTo}
              totalCount={detailTotal}
              onPageChange={setDetailPage}
              pageSize={detailPageSize}
              onPageSizeChange={(size) => {
                setDetailPageSize(size)
                setDetailPage(1)
              }}
              pageSizeOptions={DETAIL_PAGE_SIZE_OPTIONS}
              disabled={detailLoading}
            />
          </>
        )}
      </div>
    )
  }

  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE))
  const historyFrom = historyTotal === 0 ? 0 : (historyPage - 1) * HISTORY_PAGE_SIZE + 1
  const historyTo = Math.min(historyPage * HISTORY_PAGE_SIZE, historyTotal)

  return (
    <div className="proc-wh">
      {exportingId ? <div className="proc-wh__loading-bar" aria-hidden="true" /> : null}
      {historyLoading && snapshots.length === 0 ? (
        <DelayedLoadingSkeleton variant="table" count={8} />
      ) : historyError ? (
        <div className="proc-wh__error" role="alert">
          {historyError}
        </div>
      ) : (
        <>
          <div className="proc-wh__wrap">
            <table className="proc-wh__table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th className="proc-wh__col-num">Позиций</th>
                  <th className="proc-wh__col-num">Отриц. остатки</th>
                  <th className="proc-wh__col-num">К заказу</th>
                  <th className="proc-wh__col-num">Сумма закуп.</th>
                  <th className="proc-wh__col-num">Сумма прод.</th>
                  <th>Пользователь</th>
                  <th className="proc-wh__col-actions">Действия</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="proc-wh__empty-cell">
                      История склада пока пуста — выполните синхронизацию на вкладке
                      «Планирование».
                    </td>
                  </tr>
                ) : (
                  snapshots.map((snapshot) => {
                    const totals = historyTotalsById.get(snapshot.id)
                    return (
                    <tr key={snapshot.id}>
                      <td>
                        <button
                          type="button"
                          className="proc-wh__date-link"
                          onClick={() => openSnapshot(snapshot)}
                          disabled={snapshot.status === 'syncing'}
                        >
                          {formatUmagDateTime(snapshot.syncedAt || snapshot.createdAt)}
                        </button>
                      </td>
                      <td className="proc-wh__col-num">{formatQty(snapshot.itemCount)}</td>
                      <td className="proc-wh__col-num">{formatQty(snapshot.negativeStockCount)}</td>
                      <td className="proc-wh__col-num">{formatQty(snapshot.orderableCount)}</td>
                      <td className="proc-wh__col-num">
                        {totals ? formatUmagMoney(totals.totalPurchaseValue) : historyTotalsLoading ? '…' : '—'}
                      </td>
                      <td className="proc-wh__col-num">
                        {totals ? formatUmagMoney(totals.totalSellingValue) : historyTotalsLoading ? '…' : '—'}
                      </td>
                      <td>{snapshot.createdByName || '—'}</td>
                      <td className="proc-wh__col-actions">
                        <button
                          type="button"
                          className="proc-wh__icon-btn"
                          onClick={() => void handleExportRow(snapshot)}
                          disabled={exportingId === snapshot.id || snapshot.status === 'syncing'}
                          title="Скачать Excel"
                          aria-label="Скачать Excel"
                        >
                          <DownloadIcon size={18} />
                        </button>
                      </td>
                    </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={historyPage}
            totalPages={historyTotalPages}
            from={historyFrom}
            to={historyTo}
            totalCount={historyTotal}
            onPageChange={setHistoryPage}
            disabled={historyLoading}
          />
        </>
      )}
    </div>
  )
}
