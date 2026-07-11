import { ChevronLeftIcon, ChevronRightIcon } from '../icons/PlatformIcons'
import './TablePagination.css'

/** Компактная пагинация таблицы */
export default function TablePagination({
  page,
  totalPages,
  from,
  to,
  totalCount,
  onPageChange,
}) {
  if (totalCount === 0) return null

  const canPrev = page > 1
  const canNext = page < totalPages

  return (
    <div className="table-pagination">
      <span className="table-pagination__info">
        Показано {from}–{to} из {totalCount}
      </span>
      <div className="table-pagination__controls">
        <button
          type="button"
          className="table-pagination__btn"
          disabled={!canPrev}
          onClick={() => onPageChange?.(page - 1)}
          aria-label="Предыдущая страница"
        >
          <ChevronLeftIcon size={16} />
        </button>
        <span className="table-pagination__page">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="table-pagination__btn"
          disabled={!canNext}
          onClick={() => onPageChange?.(page + 1)}
          aria-label="Следующая страница"
        >
          <ChevronRightIcon size={16} />
        </button>
      </div>
    </div>
  )
}
