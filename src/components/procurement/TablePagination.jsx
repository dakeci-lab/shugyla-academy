import { ChevronLeftIcon, ChevronRightIcon } from '../icons/PlatformIcons'
import './TablePagination.css'

const DEFAULT_PAGE_SIZE_OPTIONS = [25, 50, 100, 500]

function FirstPageIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 5v14" />
      <path d="m18 6-6 6 6 6" />
    </svg>
  )
}

function LastPageIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 5v14" />
      <path d="m6 6 6 6-6 6" />
    </svg>
  )
}

/** Компактная пагинация таблицы */
export default function TablePagination({
  page,
  totalPages,
  from,
  to,
  totalCount,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}) {
  if (totalCount === 0) return null

  const canPrev = page > 1
  const canNext = page < totalPages

  return (
    <div className="table-pagination">
      <div className="table-pagination__controls">
        <button
          type="button"
          className="table-pagination__btn"
          disabled={!canPrev}
          onClick={() => onPageChange?.(1)}
          aria-label="Первая страница"
          title="Первая страница"
        >
          <FirstPageIcon />
        </button>
        <button
          type="button"
          className="table-pagination__btn"
          disabled={!canPrev}
          onClick={() => onPageChange?.(page - 1)}
          aria-label="Предыдущая страница"
          title="Предыдущая страница"
        >
          <ChevronLeftIcon size={16} />
        </button>
        <span className="table-pagination__info" aria-live="polite">
          {from}–{to} / {totalCount}
        </span>
        <button
          type="button"
          className="table-pagination__btn"
          disabled={!canNext}
          onClick={() => onPageChange?.(page + 1)}
          aria-label="Следующая страница"
          title="Следующая страница"
        >
          <ChevronRightIcon size={16} />
        </button>
        <button
          type="button"
          className="table-pagination__btn"
          disabled={!canNext}
          onClick={() => onPageChange?.(totalPages)}
          aria-label="Последняя страница"
          title="Последняя страница"
        >
          <LastPageIcon />
        </button>
        {pageSize && onPageSizeChange ? (
          <label className="table-pagination__size">
            <span className="sr-only">Строк на странице</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange?.(Number(event.target.value))}
              aria-label="Строк на странице"
              title="Строк на странице"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  )
}
