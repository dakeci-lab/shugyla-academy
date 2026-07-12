import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../icons/PlatformIcons'
import CandidateFiltersFields from './CandidateFiltersFields'
import { createDefaultCandidateFilters, formatCandidatesCount } from '../../utils/candidateListUtils'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import './CandidateFiltersPanel.css'

/** Bottom sheet фильтров (мобильная версия, portal → document.body) */
export default function CandidateFiltersSheet({
  open,
  draft,
  vacancies,
  resultCount,
  onChange,
  onApply,
  onReset,
  onClose,
  returnFocusRef,
}) {
  const closeButtonRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [animatedOpen, setAnimatedOpen] = useState(false)

  useBodyScrollLock(open)

  useEffect(() => {
    if (open) {
      setVisible(true)
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setAnimatedOpen(true))
      })
      return () => window.cancelAnimationFrame(frame)
    }

    setAnimatedOpen(false)
    const timer = window.setTimeout(() => setVisible(false), 280)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    function handleEscape(event) {
      if (event.key === 'Escape') onClose?.()
    }

    document.addEventListener('keydown', handleEscape)
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 50)

    return () => {
      document.removeEventListener('keydown', handleEscape)
      window.clearTimeout(focusTimer)
    }
  }, [open, onClose])

  useEffect(() => {
    if (open || visible) return undefined

    returnFocusRef?.current?.focus()
  }, [open, visible, returnFocusRef])

  if (!visible) return null

  const applyLabel =
    typeof resultCount === 'number'
      ? `Показать ${formatCandidatesCount(resultCount)}`
      : 'Показать кандидатов'

  return createPortal(
    <>
      <button
        type="button"
        className={`candidate-filters-backdrop${animatedOpen ? ' candidate-filters-backdrop--open' : ''}`}
        onClick={onClose}
        aria-label="Закрыть фильтры"
      />

      <div
        id="candidate-filters-sheet"
        className={`candidate-filters-sheet-panel${animatedOpen ? ' candidate-filters-sheet-panel--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-filters-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="candidate-filters-sheet-panel__handle" aria-hidden="true" />

        <div className="candidate-filters-sheet-panel__header">
          <h2 id="candidate-filters-title" className="candidate-filters-sheet-panel__title">
            Фильтры
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="candidate-filters-sheet-panel__close"
            onClick={onClose}
            aria-label="Закрыть фильтры"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="candidate-filters-sheet-panel__body">
          <CandidateFiltersFields
            draft={draft}
            vacancies={vacancies}
            onChange={onChange}
            showAgeSort
          />
        </div>

        <div className="candidate-filters-sheet-panel__footer">
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
            {applyLabel}
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}
