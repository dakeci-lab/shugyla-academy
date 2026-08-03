import { getVacancyById } from '../../services/platformDataService'
import { getVacancyPositionLabel } from '../../utils/recruitmentData'
import { formatRecruitmentDate } from '../admin/sections/recruitmentAdminShared'
import CandidateAvatar from '../CandidateAvatar'
import CandidateStatusBadge from './CandidateStatusBadge'
import '../CandidateAvatar.css'
import './CandidatesList.css'

/** Мобильная карточка кандидата */
export default function CandidateMobileCard({ candidate, index, onOpen }) {
  const vacancy = getVacancyById(candidate.vacancyId)
  const positionLabel = vacancy ? getVacancyPositionLabel(vacancy) : null
  const vacancyTitle = vacancy
    ? `${vacancy.title}${
        positionLabel && positionLabel !== vacancy.title ? ` · ${positionLabel}` : ''
      }`
    : '—'
  const experience = candidate.experience || '—'

  return (
    <button
      type="button"
      className="candidate-mobile-card"
      onClick={() => onOpen(candidate)}
      aria-label={`Открыть карточку: ${candidate.fullName}`}
    >
      <div className="candidate-mobile-card__head">
        <span className="candidate-mobile-card__index">№ {index + 1}</span>
        <CandidateStatusBadge status={candidate.status} />
      </div>

      <div className="candidate-mobile-card__main">
        <CandidateAvatar fullName={candidate.fullName} photoUrl={candidate.photoUrl} size="sm" />
        <span className="candidate-mobile-card__name">{candidate.fullName}</span>
      </div>

      <dl className="candidate-mobile-card__facts">
        <div className="candidate-mobile-card__fact">
          <dt>Вакансия</dt>
          <dd>{vacancyTitle}</dd>
        </div>
        <div className="candidate-mobile-card__fact">
          <dt>Возраст</dt>
          <dd>{candidate.age ?? '—'}</dd>
        </div>
        <div className="candidate-mobile-card__fact candidate-mobile-card__fact--wide">
          <dt>Опыт</dt>
          <dd title={experience !== '—' ? experience : undefined}>{experience}</dd>
        </div>
        <div className="candidate-mobile-card__fact">
          <dt>Дата</dt>
          <dd>{formatRecruitmentDate(candidate.submittedAt)}</dd>
        </div>
      </dl>
    </button>
  )
}
