import { SearchIcon, CloseIcon } from '../icons/PlatformIcons'
import './CandidateSearch.css'

/** Поле поиска кандидатов */
export default function CandidateSearch({ value, onChange, onClear }) {
  return (
    <label className="candidate-search">
      <span className="candidate-search__icon" aria-hidden="true">
        <SearchIcon size={18} />
      </span>
      <input
        type="search"
        className="candidate-search__input"
        placeholder="Поиск по ФИО или телефону"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Поиск по ФИО или телефону"
      />
      {value && (
        <button
          type="button"
          className="candidate-search__clear"
          onClick={onClear}
          aria-label="Очистить поиск"
        >
          <CloseIcon size={16} />
        </button>
      )}
    </label>
  )
}
