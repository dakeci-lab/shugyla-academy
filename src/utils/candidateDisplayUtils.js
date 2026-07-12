import {
  CANDIDATE_STATUS,
  candidateHasScreening,
  canCreateEmployeeForCandidate,
  hasInterviewInvitation,
  isCandidateEmployeeCreated,
  normalizeCandidateStatus,
} from './recruitmentData'

const EMPTY_FALLBACK = 'Не указано'

export function formatDisplayValue(value, fallback = EMPTY_FALLBACK) {
  if (value == null || value === '') return fallback
  if (typeof value === 'number' && Number.isNaN(value)) return fallback
  const str = String(value).trim()
  if (!str || str === 'null' || str === 'undefined' || str === '[object Object]') return fallback
  return str
}

export function formatAgeYears(age) {
  const num = Number(age)
  if (!Number.isFinite(num) || num <= 0) return null

  const mod10 = num % 10
  const mod100 = num % 100
  let suffix = 'лет'
  if (mod100 < 11 || mod100 > 14) {
    if (mod10 === 1) suffix = 'год'
    else if (mod10 >= 2 && mod10 <= 4) suffix = 'года'
  }
  return `${num} ${suffix}`
}

export function formatPhoneDisplay(phone) {
  const raw = formatDisplayValue(phone, '')
  if (!raw) return null

  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('7')) {
    return `8 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`
  }
  if (digits.length === 10) {
    return `8 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`
  }
  return raw
}

export function formatPhoneTel(phone) {
  const raw = formatDisplayValue(phone, '')
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 11 && digits.startsWith('8')) return `tel:+7${digits.slice(1)}`
  if (digits.length === 11 && digits.startsWith('7')) return `tel:+${digits}`
  if (digits.length === 10) return `tel:+7${digits}`
  return `tel:${raw}`
}

export function formatSalaryDisplay(salary) {
  const raw = formatDisplayValue(salary, '')
  if (!raw) return null

  const digitsOnly = raw.replace(/\s/g, '').replace(/[^\d.,]/g, '')
  const normalized = digitsOnly.replace(',', '.')
  const num = Number(normalized)
  if (Number.isFinite(num) && num > 0) {
    return `${Math.round(num).toLocaleString('ru-RU')} ₸`
  }
  return raw
}

/** Отображение результата в списке кандидатов */
export function formatCandidateScoreDisplay(candidate) {
  if (!candidateHasScreening(candidate)) {
    return { type: 'no_test', label: 'Без теста' }
  }
  return { type: 'percent', label: `${candidate.scorePercent ?? 0}%` }
}

export function formatTestResultSummary(candidate, answerBreakdown = []) {
  if (!candidateHasScreening(candidate)) {
    return {
      hasTest: false,
      percentLabel: null,
      detailLabel: 'Тест не проводился',
      hint: 'Для этой вакансии вопросы не были настроены.',
    }
  }

  const totalQuestions = answerBreakdown.length
  const scorePercent = Number(candidate?.scorePercent ?? 0)
  const maxScore = Number(candidate?.maxScore ?? 0)
  const correctCount = answerBreakdown.filter(
    (row) => row.maxScore > 0 && row.score === row.maxScore
  ).length

  return {
    hasTest: true,
    percentLabel: `${scorePercent}%`,
    detailLabel:
      totalQuestions > 0
        ? `${correctCount} правильных из ${totalQuestions}`
        : `${candidate.totalScore ?? 0} из ${maxScore}`,
    hint: null,
  }
}

const URL_REGEX = /https?:\/\/[^\s]+/gi

export function parseInterviewAddress(address) {
  const text = formatDisplayValue(address, '')
  if (!text) return { label: null, url: null, display: EMPTY_FALLBACK }

  const match = text.match(URL_REGEX)
  const url = match?.[0] || null
  const label = text
    .replace(URL_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    label: label || (url ? 'Адрес' : text),
    url,
    display: text,
  }
}

export function getCandidateDetailActions(candidate) {
  const actions = {
    invite: false,
    reject: false,
    interviewPassed: false,
    toTrainee: false,
    createEmployee: false,
    restoreToNew: false,
  }

  if (!candidate || isCandidateEmployeeCreated(candidate)) return actions

  const status = normalizeCandidateStatus(candidate.status)

  if (status === CANDIDATE_STATUS.HIRED) return actions

  if (status === CANDIDATE_STATUS.REJECTED) {
    actions.restoreToNew = true
    return actions
  }

  actions.reject = true

  if ([CANDIDATE_STATUS.NEW, CANDIDATE_STATUS.SUITABLE, CANDIDATE_STATUS.QUESTIONABLE].includes(status)) {
    actions.invite = true
  } else if (status === CANDIDATE_STATUS.INVITED) {
    actions.interviewPassed = true
  } else if (status === CANDIDATE_STATUS.INTERVIEW_PASSED) {
    actions.toTrainee = true
  }

  if (canCreateEmployeeForCandidate(candidate)) {
    actions.createEmployee = true
  }

  return actions
}

export function getTodayLocalDateString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
