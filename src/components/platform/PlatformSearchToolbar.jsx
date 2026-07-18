import { forwardRef } from 'react'
import { CloseIcon, FilterIcon, SearchIcon } from '../icons/PlatformIcons'
import './PlatformSearchToolbar.css'

/**
 * Единая поисковая панель Shugyla Platform.
 * Эталон: раздел «Подсчёт зарплаты».
 */
export default function PlatformSearchToolbar({
  value,
  onChange,
  placeholder = 'Поиск…',
  ariaLabel,
  onClear,
  showClear = false,
  actions = null,
  className = '',
  flush = false,
}) {
  const handleChange = (event) => {
    onChange?.(event)
  }

  const clearVisible = showClear && Boolean(String(value || '').trim()) && onClear

  return (
    <div
      className={[
        'platform-search-toolbar',
        flush ? 'platform-search-toolbar--flush' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <label className="platform-search-toolbar__search">
        <span className="platform-search-toolbar__search-icon" aria-hidden="true">
          <SearchIcon size={18} />
        </span>
        <input
          type="search"
          className="platform-search-toolbar__input"
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          aria-label={ariaLabel || placeholder}
          autoComplete="off"
        />
        {clearVisible && (
          <button
            type="button"
            className="platform-search-toolbar__clear"
            onClick={onClear}
            aria-label="Очистить поиск"
          >
            <CloseIcon size={16} />
          </button>
        )}
      </label>

      {actions ? <div className="platform-search-toolbar__actions">{actions}</div> : null}
    </div>
  )
}

/** Квадратная icon-кнопка тулбара (фильтр / создать) */
export const PlatformToolbarIconButton = forwardRef(function PlatformToolbarIconButton(
  {
    children,
    active = false,
    create = false,
    className = '',
    showDot = false,
    count = null,
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={[
        'platform-search-toolbar__icon-btn',
        active ? 'platform-search-toolbar__icon-btn--active' : '',
        create ? 'platform-search-toolbar__icon-btn--create' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
      {showDot && !count ? (
        <span className="platform-search-toolbar__filter-dot" aria-hidden="true" />
      ) : null}
      {count > 0 ? (
        <span className="platform-search-toolbar__filter-count" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </button>
  )
})

/** Обёртка для popover фильтра рядом с кнопкой */
export function PlatformToolbarActionWrap({ children }) {
  return <div className="platform-search-toolbar__action-wrap">{children}</div>
}

export function PlatformFilterButton({
  active = false,
  count = null,
  onClick,
  buttonRef,
  ariaLabel = 'Фильтр',
  title = 'Фильтр',
  ariaExpanded,
}) {
  return (
    <PlatformToolbarIconButton
      ref={buttonRef}
      active={active}
      showDot={active && !count}
      count={count}
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      aria-expanded={ariaExpanded}
    >
      <FilterIcon size={20} />
    </PlatformToolbarIconButton>
  )
}
