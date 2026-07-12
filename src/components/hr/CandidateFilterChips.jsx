import { buildCandidateFilterChips, removeCandidateFilterChip } from '../../utils/candidateListUtils'
import './CandidatesList.css'

/** Chips активных фильтров кандидатов */
export default function CandidateFilterChips({ filters, vacancies, onChange }) {
  const chips = buildCandidateFilterChips(filters, vacancies)
  if (chips.length === 0) return null

  return (
    <div className="candidate-filter-chips" aria-label="Активные фильтры">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className="candidate-filter-chips__chip"
          onClick={() => onChange(removeCandidateFilterChip(filters, chip.id))}
          aria-label={`Убрать фильтр: ${chip.label}`}
        >
          <span>{chip.label}</span>
          <span className="candidate-filter-chips__remove" aria-hidden="true">
            ×
          </span>
        </button>
      ))}
    </div>
  )
}
