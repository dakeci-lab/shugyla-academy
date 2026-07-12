import { useEffect, useRef } from 'react'
import CandidateFiltersFields from './CandidateFiltersFields'
import { createDefaultCandidateFilters } from '../../utils/candidateListUtils'
import './CandidateFiltersPanel.css'

/** Popover фильтров кандидатов (десктоп) */
export default function CandidateFiltersPopover({
  open,
  draft,
  vacancies,
  onChange,
  onApply,
  onReset,
  onClose,
  anchorRef,
}) {
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      const anchor = anchorRef?.current
      const popover = popoverRef.current
      if (!popover) return
      if (popover.contains(event.target)) return
      if (anchor?.contains(event.target)) return
      onClose?.()
    }

    function handleEscape(event) {
      if (event.key === 'Escape') onClose?.()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  return (
    <div ref={popoverRef} className="candidate-filters-popover" role="dialog" aria-label="Фильтры кандидатов">
      <CandidateFiltersFields draft={draft} vacancies={vacancies} onChange={onChange} />

      <div className="candidate-filters-popover__actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => onReset?.(createDefaultCandidateFilters())}
        >
          Сбросить
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={onApply}>
          Применить
        </button>
      </div>
    </div>
  )
}
