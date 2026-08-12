import { CANDIDATE_STATUS_LABELS, CANDIDATE_STATUS_VISIBLE_ORDER } from '../../utils/recruitmentData'
import './CandidateStatusSegmentedControl.css'

/**
 * Always-visible primary status filter. Same segmented-toggle language as
 * ScheduleViewModeToggle (Employees → Work schedule), generalized to 5 options.
 * No "all" option — status always has a concrete selected value.
 */
export default function CandidateStatusSegmentedControl({ value, onChange, counts }) {
  return (
    <div className="candidate-status-toggle" role="group" aria-label="Статус кандидата">
      {CANDIDATE_STATUS_VISIBLE_ORDER.map((status) => {
        const active = value === status
        const count = counts?.[status]
        return (
          <button
            key={status}
            type="button"
            className={`candidate-status-toggle__btn${active ? ' candidate-status-toggle__btn--active' : ''}`}
            aria-pressed={active}
            onClick={() => onChange(status)}
          >
            {CANDIDATE_STATUS_LABELS[status]}
            {typeof count === 'number' && (
              <span className="candidate-status-toggle__count">{count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
