import {
  normalizeVacancy,
  normalizeCandidateQuestion,
  normalizeCandidate,
  generateUniqueVacancySlug,
  getVacancyByIdSync,
  isVacancyQuestionsLocked,
  VACANCY_QUESTIONS_LOCKED_MESSAGE,
  VACANCY_STATUS,
  CANDIDATE_STATUS,
} from '../utils/recruitmentData'

function assertVacancyQuestionsEditable(vacancyId) {
  const vacancy = getVacancyByIdSync(vacancyId)
  if (isVacancyQuestionsLocked(vacancy)) {
    throw new Error(VACANCY_QUESTIONS_LOCKED_MESSAGE)
  }
}

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
  const cashierPositionId = genId()
  const sellerPositionId = genId()

  const vacancies = [
    {
      id: cashierId,
      title: 'Кассир',
      slug: 'kassir',
      description: 'Приглашаем кассира в сеть Shugyla Market. Опыт приветствуется.',
      city: 'Алматы',
      store_name: 'Shugyla Market',
      store_address: 'Учебный адрес для локального режима',
      salary_from: 180000,
      salary_to: 230000,
      schedule: '2/2',
      employment_type: 'full_time',
      experience_requirement: 'preferred',
      role: 'cashier',
      position_id: cashierPositionId,
      position_name_snapshot: 'Кассир',
      status: 'published',
      passing_score: 80,
      application_form_version: 1,
    },
    {
      id: sellerId,
      title: 'Продавец',
      slug: 'prodavets',
      description: 'Требуется продавец торгового зала с аккуратной выкладкой и сервисом.',
      city: 'Астана',
      store_name: 'Shugyla Market',
      store_address: 'Учебный адрес для локального режима',
      salary_from: 170000,
      salary_note: 'Итоговая сумма зависит от графика',
      schedule: '5/2',
      employment_type: 'full_time',
      experience_requirement: 'not_required',
      role: 'seller',
      position_id: sellerPositionId,
      position_name_snapshot: 'Продавец',
      status: 'published',
      passing_score: 80,
      application_form_version: 1,
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
      city: v.city || null,
      store_name: v.storeName || null,
      store_address: v.storeAddress || null,
      salary_from: v.salaryFrom ?? null,
      salary_to: v.salaryTo ?? null,
      salary_note: v.salaryNote || null,
      schedule: v.schedule || null,
      employment_type: v.employmentType || null,
      experience_requirement: v.experienceRequirement || null,
      role: v.role,
      employee_role: v.employeeRole ?? v.role,
      position_id: v.positionId ?? null,
      position_name_snapshot: v.positionNameSnapshot ?? null,
      status: v.status,
      passing_score: v.passingScore,
      application_form_version: v.applicationFormVersion || 1,
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
      is_active: q.isActive !== false,
      field_binding: q.fieldBinding || null,
      help_text: q.helpText || null,
      placeholder: q.placeholder || null,
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
      interview_salutation: c.interviewSalutation,
      interview_date: c.interviewDate,
      interview_time: c.interviewTime,
      interview_address: c.interviewAddress,
      interview_comment: c.interviewComment || '',
      invitation_sent_at: c.invitationSentAt,
      submitted_at: c.submittedAt,
    }))
  )
}

function seedLocalDefaultQuestions(vacancyId, questions) {
  const hasName = questions.some((q) => q.vacancyId === vacancyId && q.fieldBinding === 'first_name')
  if (hasName) return questions
  return [
    ...questions,
    normalizeCandidateQuestion({
      id: genId(),
      vacancyId,
      questionText: 'Имя',
      questionType: 'short_text',
      required: true,
      sortOrder: 0,
      fieldBinding: 'first_name',
      isActive: true,
      options: [],
    }),
    normalizeCandidateQuestion({
      id: genId(),
      vacancyId,
      questionText: 'Телефон',
      questionType: 'phone',
      required: true,
      sortOrder: 1,
      fieldBinding: 'phone',
      isActive: true,
      options: [],
    }),
  ]
}

export async function createVacancy(data) {
  if (!data.positionId) throw new Error('Выберите должность')
  const bundle = getLocalRecruitmentBundle()
  const slug = data.slug || generateUniqueVacancySlug(data.title, bundle.vacancies)
  const vacancy = normalizeVacancy({
    id: genId(),
    ...data,
    positionId: data.positionId,
    positionNameSnapshot: data.positionNameSnapshot || null,
    slug,
    status: data.status || VACANCY_STATUS.DRAFT,
    passingScore: data.passingScore ?? 80,
    applicationFormVersion: 1,
  })
  bundle.vacancies.push(vacancy)
  bundle.questions = seedLocalDefaultQuestions(vacancy.id, bundle.questions)
  saveVacancies(bundle.vacancies)
  saveQuestions(bundle.questions)
  return vacancy.id
}

export async function saveVacancyApplicationForm(vacancyId, { questions, expectedVersion }) {
  const bundle = getLocalRecruitmentBundle()
  const vacancy = bundle.vacancies.find((v) => v.id === vacancyId)
  if (!vacancy) throw new Error('Вакансия не найдена')
  if (
    expectedVersion != null &&
    Number(vacancy.applicationFormVersion || 1) !== Number(expectedVersion)
  ) {
    throw new Error('Анкета изменилась. Обновите страницу и сохраните снова.')
  }

  const keptIds = new Set()
  const nextQuestions = bundle.questions.filter((q) => q.vacancyId !== vacancyId)
  ;(questions || []).forEach((raw, index) => {
    const id = raw.id || genId()
    keptIds.add(id)
    nextQuestions.push(
      normalizeCandidateQuestion({
        id,
        vacancyId,
        questionText: raw.question_text || raw.questionText,
        questionType: raw.question_type || raw.questionType,
        required: raw.required !== false,
        sortOrder: raw.sort_order ?? index,
        isActive: raw.is_active !== false,
        fieldBinding: raw.field_binding ?? raw.fieldBinding ?? null,
        helpText: raw.help_text ?? raw.helpText ?? '',
        placeholder: raw.placeholder ?? '',
        options: raw.options || [],
        scores: [],
      })
    )
  })
  bundle.questions = nextQuestions
  vacancy.applicationFormVersion = Number(vacancy.applicationFormVersion || 1) + 1
  saveQuestions(bundle.questions)
  saveVacancies(bundle.vacancies)
  return { ok: true, formVersion: vacancy.applicationFormVersion, questions: [] }
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

export async function duplicateVacancy(sourceVacancyId) {
  const bundle = getLocalRecruitmentBundle()
  const source = bundle.vacancies.find((v) => v.id === sourceVacancyId)
  if (!source) throw new Error('Вакансия не найдена')

  const title = `${source.title} (копия)`
  const slug = generateUniqueVacancySlug(title, bundle.vacancies)
  const newId = genId()

  if (!source.positionId) {
    throw new Error('Сначала выберите должность для исходной вакансии')
  }

  const vacancy = normalizeVacancy({
    id: newId,
    title,
    description: source.description,
    role: source.role,
    employeeRole: source.employeeRole,
    positionId: source.positionId,
    positionNameSnapshot: source.positionNameSnapshot,
    city: source.city,
    storeName: source.storeName,
    storeAddress: source.storeAddress,
    salaryFrom: source.salaryFrom,
    salaryTo: source.salaryTo,
    salaryNote: source.salaryNote,
    schedule: source.schedule,
    employmentType: source.employmentType,
    experienceRequirement: source.experienceRequirement,
    passingScore: source.passingScore,
    status: VACANCY_STATUS.DRAFT,
    slug,
  })

  bundle.vacancies.push(vacancy)

  const sourceQuestions = bundle.questions
    .filter((q) => q.vacancyId === sourceVacancyId)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  sourceQuestions.forEach((q, index) => {
    bundle.questions.push(
      normalizeCandidateQuestion({
        id: genId(),
        vacancyId: newId,
        questionText: q.questionText,
        questionType: q.questionType,
        options: [...q.options],
        scores: [...q.scores],
        required: q.required,
        sortOrder: index,
        isActive: q.isActive,
        fieldBinding: q.fieldBinding,
        helpText: q.helpText,
        placeholder: q.placeholder,
      })
    )
  })

  saveVacancies(bundle.vacancies)
  saveQuestions(bundle.questions)
  return newId
}

export async function createCandidateQuestion(vacancyId, data) {
  assertVacancyQuestionsEditable(vacancyId)
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
  assertVacancyQuestionsEditable(bundle.questions[idx].vacancyId)
  bundle.questions[idx] = normalizeCandidateQuestion({ ...bundle.questions[idx], ...updates })
  saveQuestions(bundle.questions)
}

export async function deleteCandidateQuestion(questionId) {
  const bundle = getLocalRecruitmentBundle()
  const question = bundle.questions.find((q) => q.id === questionId)
  if (question) assertVacancyQuestionsEditable(question.vacancyId)
  saveQuestions(bundle.questions.filter((q) => q.id !== questionId))
}

export async function reorderCandidateQuestions(vacancyId, orderedQuestionIds) {
  assertVacancyQuestionsEditable(vacancyId)
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
  if (
    Number(applicationData.formVersion) !== Number(vacancy.applicationFormVersion || 1)
  ) {
    throw new Error('Анкета была обновлена. Обновите страницу и заполните её ещё раз.')
  }

  const activeQuestions = bundle.questions
    .filter((q) => q.vacancyId === vacancy.id && q.isActive !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const answersMap = applicationData.answers || {}
  const fields = {}
  const items = []

  for (const q of activeQuestions) {
    const value = answersMap[q.id]
    if (q.fieldBinding === 'first_name') fields.firstName = String(value || '').trim()
    if (q.fieldBinding === 'last_name') fields.lastName = String(value || '').trim()
    if (q.fieldBinding === 'phone') fields.phone = String(value || '').trim()
    if (q.fieldBinding === 'age') fields.age = value ? Number(value) : null
    if (q.fieldBinding === 'city') fields.city = String(value || '').trim()
    if (q.fieldBinding === 'experience') fields.experience = String(value || '').trim()
    if (q.fieldBinding === 'previous_work') fields.previousWork = String(value || '').trim()
    if (q.fieldBinding === 'expected_salary') fields.expectedSalary = String(value || '').trim()
    if (q.fieldBinding === 'available_from') fields.availableFrom = String(value || '').trim()
    if (q.fieldBinding === 'about') fields.about = String(value || '').trim()

    if (q.required && q.questionType !== 'photo' && (value == null || value === '' || (Array.isArray(value) && !value.length))) {
      throw new Error('Заполните обязательные поля')
    }

    items.push({
      question_id: q.id,
      label: q.questionText,
      question_type: q.questionType,
      required: q.required,
      sort_order: q.sortOrder,
      value,
      display_value: Array.isArray(value) ? value.join(', ') : value,
      profile_bound: Boolean(q.fieldBinding),
    })
  }

  if (!fields.firstName || !fields.phone) throw new Error('Заполните обязательные поля')

  const candidate = normalizeCandidate({
    id: genId(),
    vacancyId: vacancy.id,
    firstName: fields.firstName,
    lastName: fields.lastName || '',
    fullName: `${fields.firstName} ${fields.lastName || ''}`.trim(),
    phone: fields.phone,
    age: fields.age ?? null,
    city: fields.city || '',
    experience: fields.experience || '',
    previousWork: fields.previousWork || '',
    expectedSalary: fields.expectedSalary || '',
    availableFrom: fields.availableFrom || '',
    about: fields.about || '',
    answers: {
      version: 2,
      form_version: vacancy.applicationFormVersion || 1,
      submitted_at: new Date().toISOString(),
      items,
    },
    photoUrl: applicationData.photoUrl || null,
    photoPath: applicationData.photoPath || null,
    // photoUploadId ignored in local mode; cloud uses server sessions.
    totalScore: 0,
    maxScore: 0,
    scorePercent: 0,
    status: CANDIDATE_STATUS.NEW,
    submittedAt: new Date().toISOString(),
  })

  bundle.candidates.unshift(candidate)
  saveCandidates(bundle.candidates)

  return {
    ok: true,
    candidateId: candidate.id,
    message: 'Анкета успешно отправлена. Мы свяжемся с вами после рассмотрения.',
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

export async function restoreCandidateToNew(candidateId) {
  await updateCandidateStatus(candidateId, CANDIDATE_STATUS.NEW)
}

export async function inviteCandidate(candidateId) {
  await updateCandidateStatus(candidateId, CANDIDATE_STATUS.INVITED)
}

export async function saveCandidateInterviewInvitation(candidateId, invitation) {
  await updateCandidate(candidateId, {
    status: CANDIDATE_STATUS.INVITED,
    interviewSalutation: invitation.salutation || 'neutral',
    interviewDate: invitation.date,
    interviewTime: invitation.time,
    interviewAddress: invitation.address.trim(),
    interviewComment: invitation.comment?.trim() || '',
    invitationSentAt: new Date().toISOString(),
  })
}

export async function convertCandidateToTrainee(candidateId) {
  await updateCandidateStatus(candidateId, CANDIDATE_STATUS.TRAINEE)
}

export async function linkCandidateToEmployee(candidateId, userId) {
  const bundle = getLocalRecruitmentBundle()
  const candidate = bundle.candidates.find((c) => c.id === candidateId)
  if (!candidate) throw new Error('Кандидат не найден')
  if (candidate.createdUserId) throw new Error('Сотрудник уже создан для этого кандидата')
  await markCandidateHired(candidateId, userId, CANDIDATE_STATUS.HIRED)
}

export async function markCandidateHired(candidateId, userId, status) {
  await updateCandidate(candidateId, {
    status: status || CANDIDATE_STATUS.HIRED,
    createdUserId: userId,
  })
}
