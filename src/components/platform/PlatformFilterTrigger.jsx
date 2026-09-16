import { forwardRef } from 'react'
import { ChevronDownIcon, FilterIcon } from '../icons/PlatformIcons'
import './PlatformFilterTrigger.css'

/**
 * Shared «Фильтр ⌄» button (icon + label + optional count badge + chevron).
 * Built first for «К оплате», now the single design every page's filter
 * trigger should use, so a filter reads the same wherever it appears.
 */
const PlatformFilterTrigger = forwardRef(function PlatformFilterTrigger(
  { label = 'Фильтр', active = false, count = 0, onClick, open = false, className = '', ...rest },
  ref
) {
  return (
    <button
      type="button"
      ref={ref}
      className={`pf-trigger${active ? ' pf-trigger--active' : ''}${className ? ` ${className}` : ''}`}
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={onClick}
      {...rest}
    >
      <FilterIcon size={18} />
      <span>{label}</span>
      {count > 0 ? <span className="pf-trigger__count">{count}</span> : null}
      <ChevronDownIcon size={14} />
    </button>
  )
})

export default PlatformFilterTrigger
