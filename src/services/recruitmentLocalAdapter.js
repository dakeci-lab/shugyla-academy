import {
  normalizeVacancy,
  normalizeCandidateQuestion,
  normalizeCandidate,
  generateUniqueVacancySlug,
  calculateApplicationScore,
  VACANCY_STATUS,
  CANDIDATE_STATUS,
} from '../utils/recruitmentData'

const STORAGE_KEYS = {
  VACANCIES: 'shugyla_vacancies',
  QUESTIONS: 'shugyla_candidate_questions',
  CANDIDATES: 'shugyla_candidates',
}

function readJson(key, fallback) {
  const data = localStorage.getItem(key)
  return data ? JSON.parse(data) : fallback
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function genId() {
  return crypto.randomUUID()
}

function attachCounts(vacancies, questions, candidates) {
  return vacancies.map((v) => ({
    ...v,
    questionCount: questions.filter((q) => q.vacancyId === v.id).length,
    candidateCount: candidates.filter((c) => c.vacancyId === v.id).length,
  }))
}

export function seedMockRecruitmentIfEmpty() {
  if (readJson(STORAGE_KEYS.VACANCIES, []).length > 0) return

  const cashierId = genId()
  const sellerId = genId()

  const vacancies = [
    {
      id: cashierId,
      title: 'Кассир',
      slug: 'kassir',
      description: 'Приглашаем кассира в сеть Shugyla Market. Опыт приветствуется.',
      role: 'cashier',
      status: 'published',
      passing_score: 80,
    },
    {
      id: sellerId,
      title: 'Продавец',
      slug: 'prodavets',
      description: 'Требуется продавец торгового зала с аккуратной выкладкой и сервисом.',
      role: 'seller',
      status: 'published',
      passing_score: 80,
    },
  ]

  const questions = [
    {
      id: genId(),
      vacancy_id: cashierId,
      question_text: 'Есть ли у вас опыт работы кассиром?',
      question_type: 'single_choice',
      options: ['Да, более года', 'Да, менее года', 'Нет'],
      scores: [10, 7, 0],
      required: true,
      sort_order: 0,
    },
    {
      id: genId(),
      vacancy_id: cashierId,
      question_text: 'Готовы ли работать в сменном графике?',
      question_type: 'single_choice',
      options: ['Да', 'Нет', 'Обсуждаемо'],
      scores: [10, 0, 5],
      required: true,
      sort_order: 1,
    },
    {
      id: genId(),
      vacancy_id: sellerId,
      question_text: 'Есть ли опыт работы с покупателями?',
      question_type: 'single_choice',
      options: ['Да', 'Немного', 'Нет'],
      scores: [10, 5, 0],
      required: true,
      sort_order: 0,
    },
  ]

  writeJson(STORAGE_KEYS.VACANCIES, vacancies)
  writeJson(STORAGE_KEYS.QUESTIONS, questions)
  writeJson(STORAGE_KEYS.CANDIDATES, [])
}

export function getLocalRecruitmentBundle() {
  seedMockRecruitmentIfEmpty()
  const vacancies = readJson(STORAGE_KEYS.VACANCIES, []).map(normalizeVacancy)
  const questions = readJson(STORAGE_KEYS.QUESTIONS, []).map(normalizeCandidateQuestion)
  const candidates = readJson(STORAGE_KEYS.CANDIDATES, []).map(normalizeCandidate)
  return {
    vacancies: attachCounts(vacancies, questions, candidates),
    questions,
    candidates,
  }
}

function saveVacancies(vacancies) {
  writeJson(
    STORAGE_KEYS.VACANCIES,
    vacancies.map(({ questionCount, candidateCount, ...v }) => ({
      id: v.id,
      title: v.title,
      slug: v.slug,
      description: v.description,
      role: v.role,
      status: v.status,
      passing_score: v.passingScore,
      created_by: v.createdBy,
    }))
  )
}

function saveQuestions(questions) {
  writeJson(
    STORAGE_KEYS.QUESTIONS,
    questions.map((q) => ({
      id: q.id,
      vacancy_id: q.vacancyId,
      question_text: q.questionText,
      question_type: q.questionType,
      options: q.options,
      scores: q.scores,
      required: q.required,
      sort_order: q.sortOrder,
    }))
  )
}

function saveCandidates(candidates) {
  writeJson(
    STORAGE_KEYS.CANDIDATES,
    candidates.map((c) => ({
      id: c.id,
      vacancy_id: c.vacancyId,
      first_name: c.firstName,
      last_name: c.lastName,
      full_name: c.fullName,
      phone: c.phone,
      age: c.age,
      city: c.city,
      experience: c.experience,
      previous_work: c.previousWork,
      expected_salary: c.expectedSalary,
      available_from: c.availableFrom,
      about: c.about,
      answers: c.answers,
      score_percent: c.scorePercent,
      total_score: c.totalScore,
      max_score: c.maxScore,
      status: c.status,
      admin_notes: c.adminNotes,
      photo_url: c.photoUrl,
      photo_path: c.photoPath,
      created_user_id: c.createdUserId,
      submitted_at: c.submittedAt,
    }))
  )
}

export async function createVacancy(data) {
  const bundle = getLocalRecruitmentBundle()
  const slug = data.slug || generateUniqueVacancySlug(data.title, bundle.vacancies)
  const vacancy = normalizeVacancy({
    id: genId(),
    ...data,
    slug,
    status: data.status || VACANCY_STATUS.DRAFT,
    passingScore: data.passingScore ?? 80,
  })
  bundle.vacancies.push(vacancy)
  saveVacancies(bundle.vacancies)
  return vacancy.id
}

export async function updateVacancy(vacancyId, updates) {
  const bundle = getLocalRecruitmentBundle()
  const idx = bundle.vacancies.findIndex((v) => v.id === vacancyId)
  if (idx < 0) throw new Error('Вакансия не найдена')
  const current = bundle.vacancies[idx]
  const next = { ...current, ...updates }
  if (updates.title && !updates.slug) {
    next.slug = generateUniqueVacancySlug(updates.title, bundle.vacancies, vacancyId)
  }
  bundle.vacancies[idx] = normalizeVacancy(next)
  saveVacancies(bundle.vacancies)
}

export async function deleteVacancy(vacancyId) {
  const bundle = getLocalRecruitmentBundle()
  saveVacancies(bundle.vacancies.filter((v) => v.id !== vacancyId))
  saveQuestions(bundle.questions.filter((q) => q.vacancyId !== vacancyId))
}

export async function publishVacancy(vacancyId) {
  await updateVacancy(vacancyId, { status: VACANCY_STATUS.PUBLISHED })
}

export async function unpublishVacancy(vacancyId) {
  await updateVacancy(vacancyId, { status: VACANCY_STATUS.DRAFT })
}

export async function archiveVacancy(vacancyId) {
  await updateVacancy(vacancyId, { status: VACANCY_STATUS.ARCHIVED })
}

export async function createCandidateQuestion(vacancyId, data) {
  const bundle = getLocalRecruitmentBundle()
  const existing = bundle.questions.filter((q) => q.vacancyId === vacancyId)
  const question = normalizeCandidateQuestion({
    id: genId(),
    vacancyId,
    ...data,
    sortOrder: data.sortOrder ?? existing.length,
  })
  bundle.questions.push(question)
  saveQuestions(bundle.questions)
  return question.id
}

export async function updateCandidateQuestion(questionId, updates) {
  const bundle = getLocalRecruitmentBundle()
  const idx = bundle.questions.findIndex((q) => q.id === questionId)
  if (idx < 0) throw new Error('Вопрос не найден')
  bundle.questions[idx] = normalizeCandidateQuestion({ ...bundle.questions[idx], ...updates })
  saveQuestions(bundle.questions)
}

export async function deleteCandidateQuestion(questionId) {
  const bundle = getLocalRecruitmentBundle()
  saveQuestions(bundle.questions.filter((q) => q.id !== questionId))
}

export async function reorderCandidateQuestions(vacancyId, orderedQuestionIds) {
  const bundle = getLocalRecruitmentBundle()
  orderedQuestionIds.forEach((id, index) => {
    const q = bundle.questions.find((item) => item.id === id && item.vacancyId === vacancyId)
    if (q) q.sortOrder = index
  })
  saveQuestions(bundle.questions)
}

export async function submitCandidateApplication(applicationData) {
  const bundle = getLocalRecruitmentBundle()
  const vacancy = bundle.vacancies.find((v) => v.id === applicationData.vacancyId)
  if (!vacancy) throw new Error('Вакансия не найдена')
  if (vacancy.status !== VACANCY_STATUS.PUBLISHED) {
    throw new Error('Вакансия недоступна или закрыта')
  }

  const questions = bundle.questions
    .filter((q) => q.vacancyId === vacancy.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const { totalScore, maxScore, scorePercent, status } = calculateApplicationScore(
    questions,
    applicationData.answers || {},
    vacancy.passingScore
  )

  const firstName = applicationData.firstName?.trim()
  const lastName = applicationData.lastName?.trim() || ''
  const candidate = normalizeCandidate({
    id: genId(),
    vacancyId: vacancy.id,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    phone: applicationData.phone?.trim(),
    age: applicationData.age ? Number(applicationData.age) : null,
    city: applicationData.city?.trim() || '',
    experience: applicationData.experience?.trim() || '',
    previousWork: applicationData.previousWork?.trim() || '',
    expectedSalary: applicationData.expectedSalary?.trim() || '',
    availableFrom: applicationData.availableFrom?.trim() || '',
    about: applicationData.about?.trim() || '',
    answers: applicationData.answers || {},
    photoUrl: applicationData.photoUrl || null,
    photoPath: applicationData.photoPath || null,
    totalScore,
    maxScore,
    scorePercent,
    status,
    submittedAt: new Date().toISOString(),
  })

  bundle.candidates.unshift(candidate)
  saveCandidates(bundle.candidates)

  return {
    ok: true,
    candidateId: candidate.id,
    message: 'Спасибо! Ваша анкета отправлена. Если вы подойдёте, мы свяжемся с вами.',
  }
}

export async function updateCandidate(candidateId, updates) {
  const bundle = getLocalRecruitmentBundle()
  const idx = bundle.candidates.findIndex((c) => c.id === candidateId)
  if (idx < 0) throw new Error('Кандидат не найден')
  bundle.candidates[idx] = normalizeCandidate({ ...bundle.candidates[idx], ...updates })
  saveCandidates(bundle.candidates)
}

export async function updateCandidateStatus(candidateId, status) {
  await updateCandidate(candidateId, { status })
}

export async function updateCandidateNotes(candidateId, notes) {
  await updateCandidate(candidateId, { adminNotes: notes })
}

export async function rejectCandidate(candidateId) {
  await updateCandidateStatus(candidateId, CANDIDATE_STATUS.REJECTED)
}

export async function inviteCandidate(candidateId) {
  await updateCandidateStatus(candidateId, CANDIDATE_STATUS.INVITED)
}

export async function convertCandidateToTrainee(candidateId) {
  await updateCandidateStatus(candidateId, CANDIDATE_STATUS.TRAINEE)
}

export async function markCandidateHired(candidateId, userId, status) {
  await updateCandidate(candidateId, {
    status: status || CANDIDATE_STATUS.HIRED,
    createdUserId: userId,
  })
}
