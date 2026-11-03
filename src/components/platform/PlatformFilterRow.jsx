import { forwardRef } from 'react'
import { ChevronDownIcon, FilterIcon } from '../icons/PlatformIcons'
import './PlatformFilterRow.css'

/**
 * Phone filter row like UMAG's «Фильтры»: icon, a title with the count of active conditions, a one-line hint with
 * what can be filtered, a chevron. One look for every list («Закуп», «Заказы», …); it opens the filter sheet.
 */
const PlatformFilterRow = forwardRef(function PlatformFilterRow(
  { hint, count = 0, open = false, onClick, label = 'Фильтры' },
  ref
) {
  return (
    <button
      type="button"
      ref={ref}
      className="pf-row"
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={onClick}
    >
      <FilterIcon size={22} />
      <span className="pf-row__text">
        <span className="pf-row__title">
          {label}
          {count > 0 ? <span className="pf-trigger__count">{count}</span> : null}
        </span>
        {hint ? <span className="pf-row__hint">{hint}</span> : null}
      </span>
      <ChevronDownIcon size={20} />
    </button>
  )
})

export default PlatformFilterRow
