import { useCallback, useEffect, useState } from 'react'
import { isCloudMode } from '../../lib/dataMode'
import {
  fetchAbcAnalysisPage,
  fetchLatestProcurementSnapshot,
} from '../../services/procurementPlanningService'
import { formatUmagMoney } from '../../services/umagSettlementsService'
import { DelayedLoadingSkeleton } from '../loading/LoadingSkeleton'
import PlatformSearchToolbar from '../platform/PlatformSearchToolbar'
import TablePagination from './TablePagination'
import { AbcBadges } from './AbcBadges'
import './ProcurementAbcAnalysisView.css'

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200]
const SEARCH_DEBOUNCE_MS = 300

function formatQty(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('ru-KZ', { maximumFractionDigits: 1 })
}

/**
 * Расчёты для «ABC» — read-only ranking of every product from AAA (best on
 * quantity, revenue and margin at once) down to CCC. Purely analytical: no
 * order quantity, no supplier assignment — see fetchAbcAnalysisPage for the
 * fixed AAA→CCC sort.
 */
export default function ProcurementAbcAnalysisView() {
  const [snapshot, setSnapshot] = useState(null)
  const [snapshotLoading, setSnapshotLoading] = useState(true)
  const [items, setItems] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  useEffect(() => {
    if (!isCloudMode()) {
      setSnapshotLoading(false)
      return
    }
    let cancelled = false
    fetchLatestProcurementSnapshot()
      .then((snap) => {
        if (!cancelled) setSnapshot(snap)
      })
      .catch(() => {
        if (!cancelled) setSnapshot(null)
      })
      .finally(() => {
        if (!cancelled) setSnapshotLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const load = useCallback(async () => {
    if (!snapshot?.id) {
      setItems([])
      setTotalCount(0)
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await fetchAbcAnalysisPage({
        snapshotId: snapshot.id,
        page,
        pageSize,
        search: debouncedSearch,
      })
      setItems(result.items)
      setTotalCount(result.totalCount)
    } catch (err) {
      setError(err.message || 'Не удалось загрузить ABC-анализ')
      setItems([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [snapshot?.id, page, pageSize, debouncedSearch])

  useEffect(() => {
    void load()
  }, [load])

  if (!isCloudMode()) {
    return <p className="proc-abc__empty">ABC-анализ доступен только в облачном режиме.</p>
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  return (
    <div className="proc-abc">
      <PlatformSearchToolbar
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onClear={() => setSearch('')}
        showClear
        placeholder="Товар или штрихкод…"
        ariaLabel="Поиск по ABC-анализу"
        flush
      />

      {snapshotLoading ? (
        <DelayedLoadingSkeleton variant="table" count={8} />
      ) : !snapshot ? (
        <div className="proc-abc__empty">Нет данных снимка. Выполните синхронизацию UMAG.</div>
      ) : error ? (
        <div className="proc-abc__error" role="alert">
          {error}
        </div>
      ) : (
        <>
          <div className="proc-abc__wrap">
            <table className="proc-abc__table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th>Категория</th>
                  <th className="proc-abc__col-class">Класс</th>
                  <th className="proc-abc__col-num">Продажи, 8 нед</th>
                  <th className="proc-abc__col-num">Выручка, 8 нед</th>
                  <th className="proc-abc__col-num">Прибыль, 8 нед</th>
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="proc-abc__empty-cell">
                      Загрузка…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="proc-abc__empty-cell">
                      {debouncedSearch
                        ? 'По вашему запросу ничего не найдено.'
                        : 'Нет товаров в снимке.'}
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="proc-abc__product-name">{item.productName || '—'}</div>
                        <div className="proc-abc__product-barcode">{item.barcode}</div>
                      </td>
                      <td className="proc-abc__category">
                        {item.categoryName}
                        {item.subcategoryName ? ` · ${item.subcategoryName}` : ''}
                      </td>
                      <td className="proc-abc__col-class">
                        <AbcBadges item={item} compact />
                      </td>
                      <td className="proc-abc__col-num">{formatQty(item.sales8w)}</td>
                      <td className="proc-abc__col-num">{formatUmagMoney(item.revenue8w)}</td>
                      <td className="proc-abc__col-num">{formatUmagMoney(item.profit8w)}</td>
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
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            disabled={loading}
          />
        </>
      )}
    </div>
  )
}
