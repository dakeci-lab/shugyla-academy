import { CANDIDATE_STATUS_LABELS, CANDIDATE_STATUS_VISIBLE_ORDER } from '../../utils/recruitmentData'
import './CandidateStatusSegmentedControl.css'

/**
 * Always-visible primary status filter. Same flat tab-bar language as
 * ProcurementPage's section tabs. No "all" option — status always has a
 * concrete selected value.
 */
export default function CandidateStatusSegmentedControl({ value, onChange }) {
  return (
    <div className="candidates-status-tabs" role="tablist" aria-label="Статус кандидата">
      {CANDIDATE_STATUS_VISIBLE_ORDER.map((status) => {
        const active = value === status
        return (
          <button
            key={status}
            type="button"
            role="tab"
            className={active ? 'candidates-status-tab is-active' : 'candidates-status-tab'}
            aria-selected={active}
            onClick={() => onChange(status)}
          >
            {CANDIDATE_STATUS_LABELS[status]}
          </button>
        )
      })}
    </div>
  )
}
