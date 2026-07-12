import {
  CANDIDATE_STATUS_LABELS,
  CANDIDATE_STATUS_FILTER_OPTIONS,
  SCORE_FILTER_OPTIONS,
} from '../../utils/recruitmentData'
import { AGE_SORT } from '../../utils/candidateListUtils'

const AGE_SORT_OPTIONS = [
  { id: AGE_SORT.DEFAULT, label: 'По умолчанию' },
  { id: AGE_SORT.ASC, label: 'Сначала младшие' },
  { id: AGE_SORT.DESC, label: 'Сначала старшие' },
]

/** Поля фильтров кандидатов (popover / sheet) */
export default function CandidateFiltersFields({
  draft,
  vacancies,
  onChange,
  showAgeSort = false,
}) {
  function patch(updates) {
    onChange?.({ ...draft, ...updates })
  }

  return (
    <div className="candidate-filters-fields">
      <label className="admin-form__label">
        Вакансия
        <select
          className="admin-form__select"
          value={draft.vacancyId}
          onChange={(e) => patch({ vacancyId: e.target.value })}
        >
          <option value="all">Все вакансии</option>
          {vacancies.map((vacancy) => (
            <option key={vacancy.id} value={vacancy.id}>
              {vacancy.title}
            </option>
          ))}
        </select>
      </label>

      <label className="admin-form__label">
        Статус
        <select
          className="admin-form__select"
          value={draft.status}
          onChange={(e) => patch({ status: e.target.value })}
        >
          <option value="all">Все статусы</option>
          {CANDIDATE_STATUS_FILTER_OPTIONS.map((id) => (
            <option key={id} value={id}>
              {CANDIDATE_STATUS_LABELS[id]}
            </option>
          ))}
        </select>
      </label>

      <label className="admin-form__label">
        Результат
        <select
          className="admin-form__select"
          value={draft.score}
          onChange={(e) => patch({ score: e.target.value })}
        >
          {SCORE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <div className="candidate-filters-fields__age-row">
        <label className="admin-form__label">
          Возраст от
          <input
            type="number"
            className="admin-form__input"
            min="0"
            max="100"
            placeholder="—"
            value={draft.ageMin}
            onChange={(e) => patch({ ageMin: e.target.value })}
          />
        </label>
        <label className="admin-form__label">
          Возраст до
          <input
            type="number"
            className="admin-form__input"
            min="0"
            max="100"
            placeholder="—"
            value={draft.ageMax}
            onChange={(e) => patch({ ageMax: e.target.value })}
          />
        </label>
      </div>

      {showAgeSort && (
        <label className="admin-form__label">
          Сортировка по возрасту
          <select
            className="admin-form__select"
            value={draft.ageSort}
            onChange={(e) => patch({ ageSort: e.target.value })}
          >
            {AGE_SORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
