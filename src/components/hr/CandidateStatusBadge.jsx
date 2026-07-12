import { CANDIDATE_STATUS, CANDIDATE_STATUS_LABELS } from '../../utils/recruitmentData'
import './CandidateStatusBadge.css'

const STATUS_CLASS = {
  [CANDIDATE_STATUS.NEW]: 'candidate-status-badge--new',
  [CANDIDATE_STATUS.SUITABLE]: 'candidate-status-badge--suitable',
  [CANDIDATE_STATUS.QUESTIONABLE]: 'candidate-status-badge--questionable',
  maybe: 'candidate-status-badge--questionable',
  [CANDIDATE_STATUS.REJECTED]: 'candidate-status-badge--rejected',
  [CANDIDATE_STATUS.INVITED]: 'candidate-status-badge--invited',
  [CANDIDATE_STATUS.INTERVIEW_PASSED]: 'candidate-status-badge--interview-passed',
  [CANDIDATE_STATUS.INTERN]: 'candidate-status-badge--trainee',
  [CANDIDATE_STATUS.TRAINEE]: 'candidate-status-badge--trainee',
  [CANDIDATE_STATUS.HIRED]: 'candidate-status-badge--hired',
}

/** Компактный badge статуса кандидата */
export default function CandidateStatusBadge({ status }) {
  const normalized = status === 'maybe' ? CANDIDATE_STATUS.QUESTIONABLE : status
  const label = CANDIDATE_STATUS_LABELS[status] || CANDIDATE_STATUS_LABELS[normalized] || status
  const className = STATUS_CLASS[status] || STATUS_CLASS[normalized] || 'candidate-status-badge--new'

  return <span className={`candidate-status-badge ${className}`}>{label}</span>
}
