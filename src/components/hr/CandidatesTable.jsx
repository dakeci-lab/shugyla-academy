import { getVacancyById } from '../../services/platformDataService'
import { getVacancyPositionLabel } from '../../utils/recruitmentData'
import { AGE_SORT, cycleAgeSort } from '../../utils/candidateListUtils'
import { formatRecruitmentDate } from '../admin/sections/recruitmentAdminShared'
import CandidateAvatar from '../CandidateAvatar'
import CandidateStatusBadge from './CandidateStatusBadge'
import { SortIcon } from '../icons/PlatformIcons'
import '../CandidateAvatar.css'
import './CandidatesList.css'

function getSortDirection(ageSort) {
  if (ageSort === AGE_SORT.ASC) return 'asc'
  if (ageSort === AGE_SORT.DESC) return 'desc'
  return 'neutral'
}

function getSortAriaLabel(ageSort) {
  if (ageSort === AGE_SORT.ASC) return 'Сортировка по возрасту: сначала младшие'
  if (ageSort === AGE_SORT.DESC) return 'Сортировка по возрасту: сначала старшие'
  return 'Сортировка по возрасту: по умолчанию'
}

/** Таблица кандидатов (десктоп / планшет) */
export default function CandidatesTable({
  candidates,
  rowNumberOffset = 0,
  ageSort,
  onAgeSortChange,
  onOpenCandidate,
}) {
  function handleAgeHeaderClick() {
    onAgeSortChange?.(cycleAgeSort(ageSort))
  }

  function handleAgeHeaderKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleAgeHeaderClick()
    }
  }

  return (
    <div className="candidates-table-card">
      <div className="candidates-table-card__scroll">
        <table className="candidates-table">
          <thead>
            <tr>
              <th className="candidates-table__col-index">№</th>
              <th className="candidates-table__col-date">Дата заявки</th>
              <th className="candidates-table__col-candidate">Кандидат</th>
              <th className="candidates-table__col-vacancy">Вакансия</th>
              <th className="candidates-table__col-age">
                <button
                  type="button"
                  className={`candidates-table__sort-btn${ageSort !== AGE_SORT.DEFAULT ? ' candidates-table__sort-btn--active' : ''}`}
                  onClick={handleAgeHeaderClick}
                  onKeyDown={handleAgeHeaderKeyDown}
                  aria-label={getSortAriaLabel(ageSort)}
                >
                  <span>Возраст</span>
                  <SortIcon size={14} direction={getSortDirection(ageSort)} />
                </button>
              </th>
              <th className="candidates-table__col-experience">Опыт</th>
              <th className="candidates-table__col-status">Статус</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate, index) => {
              const vacancy = getVacancyById(candidate.vacancyId)
              const vacancyTitle = vacancy
                ? `${vacancy.title}${
                    getVacancyPositionLabel(vacancy) &&
                    getVacancyPositionLabel(vacancy) !== vacancy.title
                      ? ` · ${getVacancyPositionLabel(vacancy)}`
                      : ''
                  }`
                : '—'
              const experience = candidate.experience || '—'

              return (
                <tr
                  key={candidate.id}
                  className="candidates-table__row"
                  tabIndex={0}
                  onClick={() => onOpenCandidate(candidate)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onOpenCandidate(candidate)
                    }
                  }}
                  aria-label={`Открыть карточку: ${candidate.fullName}`}
                >
                  <td className="candidates-table__col-index">{rowNumberOffset + index + 1}</td>
                  <td className="candidates-table__col-date">
                    {formatRecruitmentDate(candidate.submittedAt)}
                  </td>
                  <td className="candidates-table__col-candidate">
                    <div className="candidates-table__candidate">
                      <CandidateAvatar
                        fullName={candidate.fullName}
                        photoUrl={candidate.photoUrl}
                        size="sm"
                      />
                      <span className="candidates-table__candidate-name">{candidate.fullName}</span>
                      {candidate.applicationCount > 1 && (
                        <span
                          className="candidates-table__application-count"
                          title={`Заявок этого кандидата: ${candidate.applicationCount}`}
                        >
                          {candidate.applicationCount}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="candidates-table__col-vacancy" title={vacancyTitle}>
                    {vacancyTitle}
                  </td>
                  <td className="candidates-table__col-age">{candidate.age ?? '—'}</td>
                  <td className="candidates-table__col-experience" title={experience !== '—' ? experience : undefined}>
                    {experience}
                  </td>
                  <td className="candidates-table__col-status">
                    <CandidateStatusBadge status={candidate.status} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
