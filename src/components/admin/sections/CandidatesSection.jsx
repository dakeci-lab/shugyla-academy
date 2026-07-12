import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getVacancies,
  getCandidates,
  getVacancyById,
  getCandidateById,
  getCandidateQuestions,
  updateCandidateNotes,
  updateCandidateStatus,
  rejectCandidate,
  restoreCandidateToNew,
  saveCandidateInterviewInvitation,
  convertCandidateToTrainee,
} from '../../../services/academyDataService'
import { toastSuccess } from '../../../services/notificationService'
import CandidateInterviewInviteModal, {
  copyTextToClipboard,
} from '../CandidateInterviewInviteModal'
import { CANDIDATE_STATUS, getCandidateAnswerBreakdown, buildInterviewInvitationFromCandidate } from '../../../utils/recruitmentData'
import {
  createDefaultCandidateFilters,
  filterCandidates,
  sortCandidates,
} from '../../../utils/candidateListUtils'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import CandidatesToolbar from '../../hr/CandidatesToolbar'
import CandidatesTable from '../../hr/CandidatesTable'
import CandidateMobileCard from '../../hr/CandidateMobileCard'
import EmptyCandidatesState from '../../hr/EmptyCandidatesState'
import CandidateDetailsModal from '../../hr/candidate-details/CandidateDetailsModal'
import '../admin-shared.css'
import '../RecruitmentSection.css'
import '../../hr/CandidatesList.css'

/** Кандидаты и результаты анкетирования (HR) */
export default function CandidatesSection() {
  const navigate = useNavigate()
  const { version, refresh } = useAdminRefresh()
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, 300)
  const [appliedFilters, setAppliedFilters] = useState(createDefaultCandidateFilters)
  const [draftFilters, setDraftFilters] = useState(createDefaultCandidateFilters)
  const [detailCandidateId, setDetailCandidateId] = useState(null)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteSubmitting, setInviteSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  void version

  const vacancies = getVacancies()
  const candidates = getCandidates()

  const displayedCandidates = useMemo(() => {
    const filtered = filterCandidates(candidates, appliedFilters, debouncedSearch)
    return sortCandidates(filtered, appliedFilters.ageSort)
  }, [candidates, appliedFilters, debouncedSearch])

  const draftResultCount = useMemo(() => {
    const filtered = filterCandidates(candidates, draftFilters, debouncedSearch)
    return filtered.length
  }, [candidates, draftFilters, debouncedSearch])

  const detailCandidate = detailCandidateId ? getCandidateById(detailCandidateId) : null
  const detailVacancy = detailCandidate?.vacancyId
    ? getVacancyById(detailCandidate.vacancyId)
    : null
  const detailQuestions = detailCandidate?.vacancyId
    ? getCandidateQuestions(detailCandidate.vacancyId)
    : []
  const answerBreakdown = detailCandidate
    ? getCandidateAnswerBreakdown(detailCandidate, detailQuestions)
    : []

  const hasQuery =
    debouncedSearch.trim() ||
    appliedFilters.vacancyId !== 'all' ||
    appliedFilters.status !== 'all' ||
    appliedFilters.score !== 'all' ||
    appliedFilters.ageMin !== '' ||
    appliedFilters.ageMax !== '' ||
    appliedFilters.ageSort !== 'default'

  function resetFiltersAndSearch(defaults = createDefaultCandidateFilters()) {
    setAppliedFilters(defaults)
    setDraftFilters(defaults)
    setSearchInput('')
  }

  function openCandidateDetail(candidate) {
    setDetailCandidateId(candidate.id)
    setSuccessMessage('')
  }

  function closeCandidateDetail() {
    setDetailCandidateId(null)
    setInviteModalOpen(false)
  }

  async function saveNotes(notes) {
    if (!detailCandidateId) return
    await updateCandidateNotes(detailCandidateId, notes)
    await refresh()
  }

  async function runCandidateAction(action) {
    if (!detailCandidateId) return
    await action(detailCandidateId)
    await refresh()
  }

  function goCreateEmployee(candidate) {
    navigate(`/platform/employees/list?createFromCandidate=${candidate.id}`)
    setDetailCandidateId(null)
  }

  async function handleInterviewInviteSubmit(invitation) {
    if (!detailCandidateId) return
    setInviteSubmitting(true)
    try {
      await saveCandidateInterviewInvitation(detailCandidateId, invitation)
      await refresh()
      setInviteModalOpen(false)
      setSuccessMessage('Кандидат отмечен как приглашённый.')
      toastSuccess('Приглашение скопировано')
    } finally {
      setInviteSubmitting(false)
    }
  }

  return (
    <>
      {successMessage && (
        <p className="admin-success-banner candidates-page__banner" role="status">
          {successMessage}
        </p>
      )}

      <CandidatesToolbar
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onSearchClear={() => setSearchInput('')}
        appliedFilters={appliedFilters}
        draftFilters={draftFilters}
        onDraftChange={setDraftFilters}
        onApplyFilters={() => setAppliedFilters({ ...draftFilters })}
        onResetFilters={resetFiltersAndSearch}
        onRemoveChip={setAppliedFilters}
        vacancies={vacancies}
        resultCount={displayedCandidates.length}
        draftResultCount={draftResultCount}
        totalCount={candidates.length}
      />

      {candidates.length === 0 ? (
        <EmptyCandidatesState variant="empty-system" />
      ) : displayedCandidates.length === 0 ? (
        <EmptyCandidatesState
          variant="not-found"
          onResetFilters={hasQuery ? () => resetFiltersAndSearch() : undefined}
        />
      ) : (
        <>
          <CandidatesTable
            candidates={displayedCandidates}
            ageSort={appliedFilters.ageSort}
            onAgeSortChange={(nextSort) =>
              setAppliedFilters((prev) => ({ ...prev, ageSort: nextSort }))
            }
            onOpenCandidate={openCandidateDetail}
          />

          <div className="candidates-mobile-list">
            {displayedCandidates.map((candidate, index) => (
              <CandidateMobileCard
                key={candidate.id}
                candidate={candidate}
                index={index}
                onOpen={openCandidateDetail}
              />
            ))}
          </div>
        </>
      )}

      {detailCandidate && (
        <CandidateDetailsModal
          candidate={detailCandidate}
          vacancy={detailVacancy}
          answerBreakdown={answerBreakdown}
          questionsCount={detailQuestions.length}
          onClose={closeCandidateDetail}
          onSaveNotes={saveNotes}
          onInvite={() => setInviteModalOpen(true)}
          onReject={() => runCandidateAction(rejectCandidate)}
          onReCopyInvitation={async () => {
            const text = buildInterviewInvitationFromCandidate(detailCandidate)
            const copied = await copyTextToClipboard(text)
            if (!copied) throw new Error('Не удалось скопировать текст в буфер обмена')
          }}
          onInterviewPassed={() =>
            runCandidateAction((id) => updateCandidateStatus(id, CANDIDATE_STATUS.INTERVIEW_PASSED))
          }
          onToTrainee={() => runCandidateAction(convertCandidateToTrainee)}
          onCreateEmployee={() => goCreateEmployee(detailCandidate)}
          onRestoreToNew={() => runCandidateAction(restoreCandidateToNew)}
        />
      )}

      {inviteModalOpen && detailCandidate && (
        <CandidateInterviewInviteModal
          candidate={detailCandidate}
          onClose={() => setInviteModalOpen(false)}
          onSubmit={handleInterviewInviteSubmit}
          submitting={inviteSubmitting}
        />
      )}
    </>
  )
}
