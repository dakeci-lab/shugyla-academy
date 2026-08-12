import { isCloudMode } from '../lib/dataMode'
import {
  getCloudVacancies,
  getCloudCandidateQuestions,
  getCloudCandidates,
} from '../lib/cloudStore'
import { getLocalRecruitmentBundle } from '../services/recruitmentLocalAdapter'
import { ROLES, normalizeRoleId } from '../data/roles'
import { slugify } from './slugify'
import { getCareersUrl } from '../router/hostSurface'
import { getCandidateAnswerDisplayRows } from './applicationForm'

export const VACANCY_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
}

export const VACANCY_STATUS_LABELS = {
  draft: 'Черновик',
  published: 'Опубликовано',
  archived: 'Архив',
}

export const CANDIDATE_STATUS = {
  NEW: 'new',
  SUITABLE: 'suitable',
  QUESTIONABLE: 'questionable',
  REJECTED: 'rejected',
  INVITED: 'invited',
  INTERVIEW_PASSED: 'interview_passed',
  INTERN: 'intern',
  TRAINEE: 'trainee',
  HIRED: 'hired',
}

/** @deprecated используйте CANDIDATE_STATUS.QUESTIONABLE */
export const CANDIDATE_STATUS_LEGACY = {
  MAYBE: 'maybe',
}

export function normalizeCandidateStatus(status) {
  if (status === 'maybe') return CANDIDATE_STATUS.QUESTIONABLE
  return status || CANDIDATE_STATUS.NEW
}

export const CANDIDATE_STATUS_LABELS = {
  new: 'Новый',
  suitable: 'Подходит',
  questionable: 'Под вопросом',
  maybe: 'Под вопросом',
  rejected: 'Отклонён',
  invited: 'Приглашён',
  interview_passed: 'Собеседование пройдено',
  intern: 'Стажёр',
  trainee: 'Стажёр',
  hired: 'Принят',
}

export const CANDIDATE_STATUS_BADGE = {
  new: 'idle',
  suitable: 'done',
  questionable: 'warning',
  maybe: 'warning',
  rejected: 'failed',
  invited: 'progress',
  interview_passed: 'done',
  intern: 'progress',
  trainee: 'progress',
  hired: 'done',
}

export const VACANCY_ROLE_LABELS = {
  cashier: 'Кассир',
  seller: 'Продавец',
  floor_admin: 'Администратор торгового зала',
  buyer: 'Закупщик',
  // Legacy read compatibility — not offered as a new selection option.
  purchaser: 'Закупщик',
  receiver: 'Приёмщик',
  loader: 'Грузчик',
  admin: 'Админ',
}

/** New vacancy role selections — canonical buyer, no duplicate purchaser option. */
export const VACANCY_ROLES = [
  'cashier',
  'seller',
  'floor_admin',
  'buyer',
  'receiver',
  'loader',
  'admin',
]

export function getVacancyRoleLabel(role) {
  if (!role) return '—'
  return (
    VACANCY_ROLE_LABELS[role] ||
    VACANCY_ROLE_LABELS[normalizeRoleId(role)] ||
    ROLES[normalizeRoleId(role)]?.label ||
    role ||
    '—'
  )
}

/**
 * Display label for vacancy organizational position.
 * Prefer live catalog name (HR), then snapshot, then title / legacy role.
 */
export function getVacancyPositionLabel(vacancy) {
  if (!vacancy) return '—'
  return (
    vacancy.positionName ||
    vacancy.positionNameSnapshot ||
    vacancy.title ||
    getVacancyRoleLabel(vacancy.employeeRole || vacancy.role) ||
    '—'
  )
}

export function vacancyNeedsPositionSelection(vacancy) {
  return !vacancy?.positionId
}

export function vacancyHasArchivedPosition(vacancy) {
  if (!vacancy?.positionId) return false
  if (vacancy.positionIsActive === false) return true
  if (vacancy.positionArchived === true) return true
  return false
}

export function generateUniqueVacancySlug(title, vacancies, excludeId = null) {
  const base = slugify(title)
  const existing = new Set(
    vacancies.filter((v) => v.id !== excludeId && v.slug).map((v) => v.slug)
  )
  if (!existing.has(base)) return base
  let counter = 2
  while (existing.has(`${base}-${counter}`)) counter++
  return `${base}-${counter}`
}

/** Canonical public URL for the careers hub (jobs `/`, local `/apply`). */
export function getApplyHubUrl(search = '') {
  return getCareersUrl('', search)
}

/** Absolute public URL for a vacancy apply form (`/apply/:slug`). */
export function getApplyUrl(slug, search = '') {
  const safeSlug = String(slug || '').replace(/^\/+|\/+$/g, '')
  return getCareersUrl(`apply/${encodeURIComponent(safeSlug)}`, search)
}

/** Absolute canonical public URL for vacancy details. */
export function getVacancyUrl(slug, search = '') {
  const safeSlug = String(slug || '').replace(/^\/+|\/+$/g, '')
  return getCareersUrl(`vacancies/${encodeURIComponent(safeSlug)}`, search)
}

export function normalizeVacancy(raw) {
  const embedded =
    raw.positions && !Array.isArray(raw.positions)
      ? raw.positions
      : Array.isArray(raw.positions)
        ? raw.positions[0]
        : null

  const positionId = raw.positionId ?? raw.position_id ?? null
  const positionNameSnapshot =
    raw.positionNameSnapshot ?? raw.position_name_snapshot ?? null
  const liveName = raw.positionName ?? embedded?.name ?? null
  const positionIsActive =
    raw.positionIsActive ??
    (embedded ? embedded.is_active !== false : null)
  const positionArchived =
    raw.positionArchived ??
    (embedded
      ? Boolean(embedded.archived_at) || embedded.is_active === false
      : null)
  const salaryFromRaw = raw.salaryFrom ?? raw.salary_from ?? null
  const salaryToRaw = raw.salaryTo ?? raw.salary_to ?? null

  return {
    id: raw.id,
    title: raw.title || '',
    slug: raw.slug || '',
    description: raw.description || '',
    city: raw.city || '',
    storeName: raw.storeName ?? raw.store_name ?? '',
    storeAddress: raw.storeAddress ?? raw.store_address ?? '',
    salaryFrom:
      salaryFromRaw === null || salaryFromRaw === '' || !Number.isFinite(Number(salaryFromRaw))
        ? null
        : Number(salaryFromRaw),
    salaryTo:
      salaryToRaw === null || salaryToRaw === '' || !Number.isFinite(Number(salaryToRaw))
        ? null
        : Number(salaryToRaw),
    salaryNote: raw.salaryNote ?? raw.salary_note ?? '',
    schedule: raw.schedule || '',
    employmentType: raw.employmentType ?? raw.employment_type ?? null,
    experienceRequirement:
      raw.experienceRequirement ?? raw.experience_requirement ?? null,
    role: raw.role,
    employeeRole: raw.employeeRole ?? raw.employee_role ?? raw.role,
    positionId,
    positionNameSnapshot,
    positionName: liveName || positionNameSnapshot || null,
    positionIsActive,
    positionArchived,
    status: raw.status || VACANCY_STATUS.DRAFT,
    passingScore: raw.passingScore ?? raw.passing_score ?? 80,
    applicationFormVersion:
      raw.applicationFormVersion ?? raw.application_form_version ?? 1,
    createdBy: raw.createdBy ?? raw.created_by ?? null,
    questionCount: raw.questionCount ?? 0,
    candidateCount: raw.candidateCount ?? 0,
    createdAt: raw.createdAt ?? raw.created_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
  }
}

export function normalizeCandidateQuestion(raw) {
  let options = raw.options ?? []
  let scores = raw.scores ?? []
  if (typeof options === 'string') {
    try { options = JSON.parse(options) } catch { options = [] }
  }
  if (typeof scores === 'string') {
    try { scores = JSON.parse(scores) } catch { scores = [] }
  }

  // Prefer object options [{id,label}]; keep legacy string[] readable.
  if (Array.isArray(options)) {
    options = options.map((item, index) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return {
          id: String(item.id || `opt-${index + 1}`),
          label: String(item.label ?? item.text ?? '').trim(),
        }
      }
      return {
        id: `opt-${index + 1}`,
        label: String(item ?? '').trim(),
      }
    }).filter((o) => o.label)
  } else {
    options = []
  }

  return {
    id: raw.id,
    vacancyId: raw.vacancyId ?? raw.vacancy_id,
    questionText: raw.questionText ?? raw.question_text ?? '',
    questionType: raw.questionType ?? raw.question_type ?? 'short_text',
    options,
    scores: Array.isArray(scores) ? scores.map(Number) : [],
    required: raw.required !== false,
    sortOrder: raw.sortOrder ?? raw.sort_order ?? 0,
    isActive: raw.isActive ?? raw.is_active !== false,
    fieldBinding: raw.fieldBinding ?? raw.field_binding ?? null,
    helpText: raw.helpText ?? raw.help_text ?? '',
    placeholder: raw.placeholder ?? '',
    createdAt: raw.createdAt ?? raw.created_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
  }
}

export function normalizeCandidate(raw) {
  let answers = raw.answers ?? {}
  if (typeof answers === 'string') {
    try { answers = JSON.parse(answers) } catch { answers = {} }
  }

  const firstName = raw.firstName ?? raw.first_name ?? ''
  const lastName = raw.lastName ?? raw.last_name ?? ''
  const fullName = raw.fullName ?? raw.full_name ?? `${firstName} ${lastName}`.trim()

  return {
    id: raw.id,
    vacancyId: raw.vacancyId ?? raw.vacancy_id ?? null,
    firstName,
    lastName,
    fullName,
    phone: raw.phone || '',
    age: raw.age ?? null,
    city: raw.city || '',
    experience: raw.experience || '',
    previousWork: raw.previousWork ?? raw.previous_work ?? '',
    expectedSalary: raw.expectedSalary ?? raw.expected_salary ?? '',
    availableFrom: raw.availableFrom ?? raw.available_from ?? '',
    about: raw.about || '',
    answers,
    // Legacy scoring columns retained in DB/API; no longer drive UI or status.
    scorePercent: raw.scorePercent ?? raw.score_percent ?? 0,
    totalScore: raw.totalScore ?? raw.total_score ?? 0,
    maxScore: raw.maxScore ?? raw.max_score ?? 0,
    status: normalizeCandidateStatus(raw.status),
    adminNotes: raw.adminNotes ?? raw.admin_notes ?? '',
    photoUrl: raw.photoUrl ?? raw.photo_url ?? null,
    photoPath: raw.photoPath ?? raw.photo_path ?? null,
    createdUserId: raw.createdUserId ?? raw.created_user_id ?? null,
    interviewSalutation: raw.interviewSalutation ?? raw.interview_salutation ?? null,
    interviewDate: raw.interviewDate ?? raw.interview_date ?? null,
    interviewTime: raw.interviewTime ?? raw.interview_time ?? null,
    interviewAddress: raw.interviewAddress ?? raw.interview_address ?? null,
    interviewComment: raw.interviewComment ?? raw.interview_comment ?? '',
    invitationSentAt: raw.invitationSentAt ?? raw.invitation_sent_at ?? null,
    submittedAt: raw.submittedAt ?? raw.submitted_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
  }
}

function attachVacancyCounts(vacancies, questions, candidates) {
  return vacancies.map((v) => ({
    ...v,
    questionCount: questions.filter((q) => q.vacancyId === v.id).length,
    candidateCount: candidates.filter((c) => c.vacancyId === v.id).length,
  }))
}

function readBundle() {
  if (isCloudMode()) {
    const vacancies = getCloudVacancies()
    const questions = getCloudCandidateQuestions()
    const candidates = getCloudCandidates()
    if (vacancies) {
      return {
        vacancies: attachVacancyCounts(vacancies, questions || [], candidates || []),
        questions: questions || [],
        candidates: candidates || [],
      }
    }
    return { vacancies: [], questions: [], candidates: [] }
  }
  return getLocalRecruitmentBundle()
}

export function getAllVacanciesSync() {
  return readBundle().vacancies
}

export function getPublishedVacanciesSync() {
  return getAllVacanciesSync().filter((v) => v.status === VACANCY_STATUS.PUBLISHED)
}

export function getVacancyByIdSync(vacancyId) {
  return getAllVacanciesSync().find((v) => v.id === vacancyId) || null
}

export function getVacancyBySlugSync(slug) {
  return getAllVacanciesSync().find((v) => v.slug === slug) || null
}

export function getPublishedVacancyBySlugSync(slug) {
  const vacancy = getVacancyBySlugSync(slug)
  if (!vacancy || vacancy.status !== VACANCY_STATUS.PUBLISHED) return null
  return vacancy
}

export function getAllCandidateQuestionsSync() {
  return readBundle().questions
}

export function getCandidateQuestionsSync(vacancyId) {
  return getAllCandidateQuestionsSync()
    .filter((q) => q.vacancyId === vacancyId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function getAllCandidatesSync() {
  return readBundle()
    .candidates
    .slice()
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
}

export function getCandidatesByVacancySync(vacancyId) {
  return getAllCandidatesSync().filter((c) => c.vacancyId === vacancyId)
}

export function getCandidateByIdSync(candidateId) {
  return getAllCandidatesSync().find((c) => c.id === candidateId) || null
}

/** Flexible forms stay editable after candidates arrive. */
export function isVacancyQuestionsLocked() {
  return false
}

export const VACANCY_QUESTIONS_LOCKED_MESSAGE = ''

/**
 * Display rows for candidate answers (snapshot v2 + legacy option-index map).
 */
export function getCandidateAnswerBreakdown(candidate, questions) {
  return getCandidateAnswerDisplayRows(candidate, questions).map((row) => ({
    questionId: row.questionId,
    questionText: row.questionText,
    selectedOption: row.displayValue,
  }))
}

export const CANDIDATE_STATUS_FILTER_OPTIONS = [
  CANDIDATE_STATUS.NEW,
  CANDIDATE_STATUS.SUITABLE,
  CANDIDATE_STATUS.QUESTIONABLE,
  CANDIDATE_STATUS.REJECTED,
  CANDIDATE_STATUS.INVITED,
  CANDIDATE_STATUS.INTERVIEW_PASSED,
  CANDIDATE_STATUS.TRAINEE,
  CANDIDATE_STATUS.HIRED,
]

export function getVacancyEmployeeRole(vacancy) {
  if (!vacancy) return null
  const raw = vacancy.employeeRole || vacancy.role
  return normalizeRoleId(raw) || raw
}

export function canCreateEmployeeForCandidate(candidate) {
  if (!candidate || candidate.createdUserId) return false
  return [
    CANDIDATE_STATUS.INTERVIEW_PASSED,
    CANDIDATE_STATUS.TRAINEE,
    CANDIDATE_STATUS.INTERN,
  ].includes(candidate.status)
}

export function isCandidateEmployeeCreated(candidate) {
  return Boolean(candidate?.createdUserId)
}


export const INTERVIEW_SALUTATION_OPTIONS = [
  { id: 'neutral', label: 'Уважаемый(ая)' },
  { id: 'male', label: 'Уважаемый' },
  { id: 'female', label: 'Уважаемая' },
]

export function getInterviewSalutationLabel(salutationId) {
  return (
    INTERVIEW_SALUTATION_OPTIONS.find((item) => item.id === salutationId)?.label ||
    'Уважаемый(ая)'
  )
}

export function formatInterviewDateLabel(dateValue) {
  if (!dateValue) return ''
  const parts = dateValue.split('-')
  if (parts.length !== 3) return dateValue
  const [year, month, day] = parts
  return `${day}.${month}.${year}`
}

export function formatInterviewTimeLabel(timeValue) {
  if (!timeValue) return ''
  return timeValue.slice(0, 5)
}

export function buildInterviewInvitationText({
  salutation = 'neutral',
  candidateName,
  date,
  time,
  address,
  comment,
}) {
  const greeting = getInterviewSalutationLabel(salutation)
  const dateLabel = formatInterviewDateLabel(date)
  const timeLabel = formatInterviewTimeLabel(time)

  let text = `${greeting} ${candidateName}!

Приглашаем вас на собеседование в Shugyla Market.

Дата: ${dateLabel}
Время: ${timeLabel}
Адрес: ${address}

Ждём вас в указанное время.`

  if (comment?.trim()) {
    text += `\n\n${comment.trim()}`
  }

  return text
}

export function buildInterviewInvitationFromCandidate(candidate) {
  if (!candidate) return ''
  const name = candidate.firstName || candidate.fullName || 'кандидат'
  return buildInterviewInvitationText({
    salutation: candidate.interviewSalutation || 'neutral',
    candidateName: name,
    date: candidate.interviewDate,
    time: candidate.interviewTime,
    address: candidate.interviewAddress,
    comment: candidate.interviewComment,
  })
}

export function hasInterviewInvitation(candidate) {
  return Boolean(
    candidate?.interviewDate &&
      candidate?.interviewTime &&
      candidate?.interviewAddress
  )
}

export function validateInterviewInviteForm(form) {
  const errors = {}
  if (!form.date?.trim()) errors.date = 'Укажите дату собеседования'
  if (!form.time?.trim()) errors.time = 'Укажите время собеседования'
  if (!form.address?.trim()) errors.address = 'Укажите адрес'
  return errors
}
