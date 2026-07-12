import './CandidatesList.css'

/** Пустое состояние списка кандидатов */
export default function EmptyCandidatesState({ variant, onResetFilters }) {
  if (variant === 'empty-system') {
    return (
      <div className="candidates-empty">
        <h3 className="candidates-empty__title">Пока нет кандидатов</h3>
        <p className="candidates-empty__desc">
          Кандидаты появятся здесь после заполнения анкеты вакансии.
        </p>
      </div>
    )
  }

  return (
    <div className="candidates-empty">
      <h3 className="candidates-empty__title">Кандидаты не найдены</h3>
      <p className="candidates-empty__desc">
        Измените параметры поиска или сбросьте фильтры.
      </p>
      {onResetFilters && (
        <button type="button" className="btn btn--outline btn--sm" onClick={onResetFilters}>
          Сбросить фильтры
        </button>
      )}
    </div>
  )
}
