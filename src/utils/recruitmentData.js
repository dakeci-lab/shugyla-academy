import { isCloudMode } from '../lib/dataMode'
import {
  getCloudVacancies,
  getCloudCandidateQuestions,
  getCloudCandidates,
} from '../lib/cloudStore'
import { getLocalRecruitmentBundle } from '../services/recruitmentLocalAdapter'
import { ROLES, normalizeRoleId } from '../data/roles'
import { slugify } from './standardsData'

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
  new: 'Новая',
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
  purchaser: 'Закупщик',
  buyer: 'Закупщик',
  receiver: 'Приёмщик',
  loader: 'Грузчик',
  admin: 'Админ',
}

export const VACANCY_ROLES = Object.keys(VACANCY_ROLE_LABELS)

export function getVacancyRoleLabel(role) {
  return VACANCY_ROLE_LABELS[role] || ROLES[role]?.label || role || '—'
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

export function getApplyUrl(slug) {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base.slice(0, -1) : base
  return `${window.location.origin}${normalized}/apply/${slug}`
}

export function normalizeVacancy(raw) {
  return {
    id: raw.id,
    title: raw.title || '',
    slug: raw.slug || '',
    description: raw.description || '',
    role: raw.role,
    employeeRole: raw.employeeRole ?? raw.employee_role ?? raw.role,
    status: raw.status || VACANCY_STATUS.DRAFT,
    passingScore: raw.passingScore ?? raw.passing_score ?? 80,
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

  return {
    id: raw.id,
    vacancyId: raw.vacancyId ?? raw.vacancy_id,
    questionText: raw.questionText ?? raw.question_text ?? '',
    questionType: raw.questionType ?? raw.question_type ?? 'single_choice',
    options: Array.isArray(options) ? options : [],
    scores: Array.isArray(scores) ? scores.map(Number) : [],
    required: raw.required !== false,
    sortOrder: raw.sortOrder ?? raw.sort_order ?? 0,
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

export function calculateApplicationScore(questions, answers, passingScore) {
  let totalScore = 0
  let maxScore = 0

  questions.forEach((q) => {
    const qMax = q.scores.length ? Math.max(...q.scores.map(Number)) : 0
    maxScore += qMax

    const answerIndex = answers[q.id]
    if (answerIndex !== undefined && answerIndex !== null && answerIndex !== '') {
      const idx = Number(answerIndex)
      totalScore += Number(q.scores[idx] ?? 0)
    }
  })

  const scorePercent = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0

  let status = CANDIDATE_STATUS.NEW
  if (scorePercent >= passingScore) status = CANDIDATE_STATUS.SUITABLE
  else if (scorePercent >= 50) status = CANDIDATE_STATUS.QUESTIONABLE
  else status = CANDIDATE_STATUS.REJECTED

  return { totalScore, maxScore, scorePercent, status }
}

export function getCandidateAnswerBreakdown(candidate, questions) {
  return questions.map((q) => {
    const answerIndex = candidate.answers?.[q.id]
    const idx = answerIndex !== undefined && answerIndex !== null ? Number(answerIndex) : null
    const selectedOption = idx !== null && q.options[idx] != null ? q.options[idx] : '—'
    const score = idx !== null ? Number(q.scores[idx] ?? 0) : 0
    const maxScore = q.scores.length ? Math.max(...q.scores.map(Number)) : 0

    return {
      questionId: q.id,
      questionText: q.questionText,
      selectedOption,
      score,
      maxScore,
    }
  })
}

export function validateQuestionForm(form) {
  if (!form.questionText?.trim()) return 'Укажите текст вопроса'
  const pairs = form.optionPairs.filter((p) => p.text.trim())
  if (pairs.length < 2) return 'Добавьте минимум 2 варианта ответа'
  for (const pair of pairs) {
    if (pair.score === '' || Number.isNaN(Number(pair.score))) {
      return 'Баллы должны быть числами'
    }
  }
  return null
}

export function questionFormToPayload(form) {
  const pairs = form.optionPairs.filter((p) => p.text.trim())
  return {
    questionText: form.questionText.trim(),
    questionType: 'single_choice',
    options: pairs.map((p) => p.text.trim()),
    scores: pairs.map((p) => Number(p.score)),
    required: form.required !== false,
  }
}

export function questionToForm(question) {
  const pairs = (question?.options || []).map((text, i) => ({
    text,
    score: question.scores?.[i] ?? 0,
  }))
  while (pairs.length < 4) pairs.push({ text: '', score: 0 })
  return {
    questionText: question?.questionText || '',
    required: question?.required !== false,
    optionPairs: pairs,
  }
}

export const SCORE_FILTER_OPTIONS = [
  { id: 'all', label: 'Все результаты' },
  { id: 'high', label: '80%+' },
  { id: 'mid', label: '50–79%' },
  { id: 'low', label: 'Ниже 50%' },
]

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

export function matchesScoreFilter(candidate, filterId) {
  if (filterId === 'all') return true
  const p = candidate.scorePercent
  if (filterId === 'high') return p >= 80
  if (filterId === 'mid') return p >= 50 && p <= 79
  if (filterId === 'low') return p < 50
  return true
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
