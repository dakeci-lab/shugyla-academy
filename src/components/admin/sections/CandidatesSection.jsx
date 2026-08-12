import { useEffect, useMemo, useState } from 'react'
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
} from '../../../services/platformDataService'
import { toastSuccess } from '../../../services/notificationService'
import CandidateInterviewInviteModal, {
  copyTextToClipboard,
} from '../CandidateInterviewInviteModal'
import { CANDIDATE_STATUS, getCandidateAnswerBreakdown, buildInterviewInvitationFromCandidate } from '../../../utils/recruitmentData'
import {
  createDefaultCandidateFilters,
  filterCandidates,
  groupCandidatesByPerson,
  buildPersonApplicationCounts,
} from '../../../utils/candidateListUtils'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import CandidatesToolbar from '../../hr/CandidatesToolbar'
import CandidatesTable from '../../hr/CandidatesTable'
import CandidateMobileCard from '../../hr/CandidateMobileCard'
import EmptyCandidatesState from '../../hr/EmptyCandidatesState'
import CandidateDetailsModal from '../../hr/candidate-details/CandidateDetailsModal'
import TablePagination from '../../procurement/TablePagination'
import '../admin-shared.css'
import '../RecruitmentSection.css'
import '../../hr/CandidatesList.css'

const PAGE_SIZE_OPTIONS = [25, 50, 100]
const DEFAULT_PAGE_SIZE = 25

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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  void version

  const vacancies = getVacancies()
  const candidates = getCandidates()

  // Total applications per person across the whole system, independent of
  // the currently applied filters (a status/vacancy filter must not make a
  // person's application count look smaller than it really is).
  const totalPersonApplicationCounts = useMemo(
    () => buildPersonApplicationCounts(candidates),
    [candidates]
  )

  // Filter applications first, then group the survivors into one row per
  // person (current application if the group has one, else the newest).
  const displayedRows = useMemo(() => {
    const filtered = filterCandidates(candidates, appliedFilters, debouncedSearch)
    return groupCandidatesByPerson(filtered, appliedFilters.ageSort)
  }, [candidates, appliedFilters, debouncedSearch])

  const draftResultCount = useMemo(() => {
    const filtered = filterCandidates(candidates, draftFilters, debouncedSearch)
    return groupCandidatesByPerson(filtered).length
  }, [candidates, draftFilters, debouncedSearch])

  useEffect(() => {
    setPage(1)
  }, [appliedFilters, debouncedSearch, pageSize])

  const totalPages = Math.max(1, Math.ceil(displayedRows.length / pageSize))
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageOffset = (page - 1) * pageSize
  const pagedRows = useMemo(
    () => displayedRows.slice(pageOffset, pageOffset + pageSize),
    [displayedRows, pageOffset, pageSize]
  )
  const pageFrom = displayedRows.length === 0 ? 0 : pageOffset + 1
  const pageTo = Math.min(pageOffset + pageSize, displayedRows.length)
  // Table/mobile-card rows: representative candidate + the person's TOTAL
  // application count (not just how many of their applications matched the
  // current filters).
  const pagedCandidates = useMemo(
    () =>
      pagedRows.map((row) => ({
        ...row.candidate,
        applicationCount: totalPersonApplicationCounts.get(row.candidate.personId) || 1,
      })),
    [pagedRows, totalPersonApplicationCounts]
  )

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
  const otherApplications = useMemo(() => {
    if (!detailCandidate?.personId) return []
    return candidates
      .filter((c) => c.personId === detailCandidate.personId && c.id !== detailCandidate.id)
      .map((app) => ({ ...app, vacancyTitle: getVacancyById(app.vacancyId)?.title || null }))
      .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))
  }, [candidates, detailCandidate])

  const hasQuery =
    debouncedSearch.trim() ||
    appliedFilters.vacancyId !== 'all' ||
    appliedFilters.status !== CANDIDATE_STATUS.NEW ||
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
        resultCount={displayedRows.length}
        draftResultCount={draftResultCount}
        statusValue={appliedFilters.status}
        onStatusChange={(status) => setAppliedFilters((prev) => ({ ...prev, status }))}
      />

      {candidates.length === 0 ? (
        <EmptyCandidatesState variant="empty-system" />
      ) : displayedRows.length === 0 ? (
        <EmptyCandidatesState
          variant="not-found"
          onResetFilters={hasQuery ? () => resetFiltersAndSearch() : undefined}
        />
      ) : (
        <>
          <CandidatesTable
            candidates={pagedCandidates}
            rowNumberOffset={pageOffset}
            ageSort={appliedFilters.ageSort}
            onAgeSortChange={(nextSort) =>
              setAppliedFilters((prev) => ({ ...prev, ageSort: nextSort }))
            }
            onOpenCandidate={openCandidateDetail}
          />

          <div className="candidates-mobile-list">
            {pagedCandidates.map((candidate, index) => (
              <CandidateMobileCard
                key={candidate.id}
                candidate={candidate}
                index={pageOffset + index}
                applicationCount={candidate.applicationCount || 1}
                onOpen={openCandidateDetail}
              />
            ))}
          </div>

          <TablePagination
            page={page}
            totalPages={totalPages}
            from={pageFrom}
            to={pageTo}
            totalCount={displayedRows.length}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        </>
      )}

      {detailCandidate && (
        <CandidateDetailsModal
          candidate={detailCandidate}
          vacancy={detailVacancy}
          answerBreakdown={answerBreakdown}
          questionsCount={detailQuestions.length}
          otherApplications={otherApplications}
          onSelectOtherApplication={(candidateId) => setDetailCandidateId(candidateId)}
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
