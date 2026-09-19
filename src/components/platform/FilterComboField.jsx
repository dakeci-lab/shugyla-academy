import { ChevronDownIcon } from '../icons/PlatformIcons'
import './FilterComboField.css'

/**
 * One collapsible combobox row inside PaymentsFilterPopover — «Счёт оплаты» и
 * «Поставщик» are both this, just with searchable on/off. Collapsed by
 * default (per владелец: opening the filter must not immediately dump the
 * full list on screen — only expands on click/typing).
 */
export default function FilterComboField({
  label,
  searchable = false,
  placeholder = 'Введите название',
  searchValue = '',
  onSearchChange,
  summaryText,
  options,
  draft,
  onToggle,
  expanded,
  onToggleExpanded,
  emptyText = 'Ничего не найдено',
}) {
  const query = searchValue.trim().toLowerCase()
  const matches = query
    ? options.filter((opt) => opt.label.toLowerCase().includes(query))
    : options

  return (
    <div className="pf-field">
      <div className="pf-field__label">{label}:</div>
      <div className={`pf-field__control${expanded ? ' pf-field__control--open' : ''}`}>
        {searchable ? (
          <input
            type="text"
            className="pf-field__input"
            placeholder={placeholder}
            value={searchValue}
            onChange={(e) => {
              onSearchChange(e.target.value)
              if (!expanded) onToggleExpanded()
            }}
            onFocus={() => {
              if (!expanded) onToggleExpanded()
            }}
            autoComplete="off"
          />
        ) : (
          <button
            type="button"
            className="pf-field__display"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
          >
            {summaryText}
          </button>
        )}
        <button
          type="button"
          className="pf-field__chevron"
          aria-label={`Показать список: ${label}`}
          aria-expanded={expanded}
          onClick={onToggleExpanded}
        >
          <ChevronDownIcon size={16} />
        </button>
      </div>
      {expanded ? (
        <div className="pf-field__list">
          {matches.length === 0 ? (
            <div className="pf-field__empty">{emptyText}</div>
          ) : (
            matches.map((opt) => (
              <label key={opt.id} className="pf-field__item">
                <input type="checkbox" checked={draft.has(opt.id)} onChange={() => onToggle(opt.id)} />
                <span>{opt.label}</span>
              </label>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
