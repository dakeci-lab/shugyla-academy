import { isCloudMode } from '../lib/dataMode'
import {
  getCloudVacancies,
  getCloudCandidateQuestions,
  getCloudCandidates,
} from '../lib/cloudStore'
import { getLocalRecruitmentBundle } from '../services/recruitmentLocalAdapter'
import { ROLES } from '../data/roles'
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
  MAYBE: 'maybe',
  REJECTED: 'rejected',
  INVITED: 'invited',
  INTERVIEW_PASSED: 'interview_passed',
  TRAINEE: 'trainee',
  HIRED: 'hired',
}

export const CANDIDATE_STATUS_LABELS = {
  new: 'Новая',
  suitable: 'Подходит',
  maybe: 'Под вопросом',
  rejected: 'Отклонён',
  invited: 'Приглашён',
  interview_passed: 'Собеседование пройдено',
  trainee: 'Стажёр',
  hired: 'Принят',
}

export const CANDIDATE_STATUS_BADGE = {
  new: 'idle',
  suitable: 'done',
  maybe: 'warning',
  rejected: 'failed',
  invited: 'progress',
  interview_passed: 'done',
  trainee: 'progress',
  hired: 'done',
}

export const VACANCY_ROLE_LABELS = {
  cashier: 'Кассир',
  seller: 'Продавец',
  floor_admin: 'Администратор зала',
  buyer: 'Закупщик',
  receiver: 'Приёмщик',
  loader: 'Грузчик',
  trainee: 'Стажёр',
  admin: 'Администратор',
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
    status: raw.status || CANDIDATE_STATUS.NEW,
    adminNotes: raw.adminNotes ?? raw.admin_notes ?? '',
    createdUserId: raw.createdUserId ?? raw.created_user_id ?? null,
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
  else if (scorePercent >= 50) status = CANDIDATE_STATUS.MAYBE
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

export function matchesScoreFilter(candidate, filterId) {
  if (filterId === 'all') return true
  const p = candidate.scorePercent
  if (filterId === 'high') return p >= 80
  if (filterId === 'mid') return p >= 50 && p <= 79
  if (filterId === 'low') return p < 50
  return true
}
