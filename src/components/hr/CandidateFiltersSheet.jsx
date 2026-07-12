import { useEffect } from 'react'
import { CloseIcon } from '../icons/PlatformIcons'
import CandidateFiltersFields from './CandidateFiltersFields'
import { createDefaultCandidateFilters } from '../../utils/candidateListUtils'
import './CandidateFiltersPanel.css'

/** Bottom sheet фильтров (мобильная версия) */
export default function CandidateFiltersSheet({
  open,
  draft,
  vacancies,
  onChange,
  onApply,
  onReset,
  onClose,
}) {
  useEffect(() => {
    if (!open) {
      document.body.style.overflow = ''
      return undefined
    }

    document.body.style.overflow = 'hidden'

    function handleEscape(event) {
      if (event.key === 'Escape') onClose?.()
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="candidate-filters-sheet" role="presentation">
      <button type="button" className="candidate-filters-sheet__backdrop" onClick={onClose} aria-label="Закрыть фильтры" />
      <div className="candidate-filters-sheet__panel" role="dialog" aria-label="Фильтры">
        <div className="candidate-filters-sheet__header">
          <h2 className="candidate-filters-sheet__title">Фильтры</h2>
          <button type="button" className="candidate-filters-sheet__close" onClick={onClose} aria-label="Закрыть">
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="candidate-filters-sheet__body">
          <CandidateFiltersFields
            draft={draft}
            vacancies={vacancies}
            onChange={onChange}
            showAgeSort
          />
        </div>

        <div className="candidate-filters-sheet__footer">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onReset?.(createDefaultCandidateFilters())}
          >
            Сбросить
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              onApply?.()
              onClose?.()
            }}
          >
            Показать кандидатов
          </button>
        </div>
      </div>
    </div>
  )
}
