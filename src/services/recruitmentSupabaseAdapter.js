import { supabase } from '../lib/supabaseClient'
import {
  normalizeVacancy,
  normalizeCandidateQuestion,
  normalizeCandidate,
  generateUniqueVacancySlug,
  calculateApplicationScore,
  getAllVacanciesSync,
  getAllCandidatesSync,
  VACANCY_STATUS,
  CANDIDATE_STATUS,
} from '../utils/recruitmentData'

async function throwIfError(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`)
  return result.data
}

function rowToVacancy(row) {
  return normalizeVacancy({
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    role: row.role,
    employeeRole: row.employee_role,
    status: row.status,
    passingScore: row.passing_score,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function rowToQuestion(row) {
  return normalizeCandidateQuestion({
    id: row.id,
    vacancyId: row.vacancy_id,
    questionText: row.question_text,
    questionType: row.question_type,
    options: row.options,
    scores: row.scores,
    required: row.required,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function rowToCandidate(row) {
  return normalizeCandidate({
    id: row.id,
    vacancyId: row.vacancy_id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: row.full_name,
    phone: row.phone,
    age: row.age,
    city: row.city,
    experience: row.experience,
    previousWork: row.previous_work,
    expectedSalary: row.expected_salary,
    availableFrom: row.available_from,
    about: row.about,
    answers: row.answers,
    scorePercent: row.score_percent,
    totalScore: row.total_score,
    maxScore: row.max_score,
    status: row.status,
    adminNotes: row.admin_notes,
    photoUrl: row.photo_url,
    photoPath: row.photo_path,
    createdUserId: row.created_user_id,
    interviewSalutation: row.interview_salutation,
    interviewDate: row.interview_date,
    interviewTime: row.interview_time,
    interviewAddress: row.interview_address,
    interviewComment: row.interview_comment,
    invitationSentAt: row.invitation_sent_at,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  })
}

function attachCounts(vacancies, questions, candidates) {
  return vacancies.map((v) => ({
    ...v,
    questionCount: questions.filter((q) => q.vacancyId === v.id).length,
    candidateCount: candidates.filter((c) => c.vacancyId === v.id).length,
  }))
}

export async function fetchRecruitmentData() {
  const [vacRes, qRes, cRes] = await Promise.all([
    supabase.from('academy_vacancies').select('*').order('created_at', { ascending: false }),
    supabase.from('academy_candidate_questions').select('*').order('sort_order'),
    supabase.from('academy_candidates').select('*').order('submitted_at', { ascending: false }),
  ])

  const vacancies = (await throwIfError(vacRes, 'Загрузка вакансий')).map(rowToVacancy)
  const questions = (await throwIfError(qRes, 'Загрузка вопросов')).map(rowToQuestion)
  const candidates = (await throwIfError(cRes, 'Загрузка кандидатов')).map(rowToCandidate)

  return {
    vacancies: attachCounts(vacancies, questions, candidates),
    questions,
    candidates,
  }
}

export async function createVacancy(data) {
  const vacancies = getAllVacanciesSync()
  const slug = data.slug || generateUniqueVacancySlug(data.title, vacancies)
  const row = {
    id: data.id || crypto.randomUUID(),
    title: data.title,
    slug,
    description: data.description || '',
    role: data.role,
    employee_role: data.employeeRole ?? data.role ?? null,
    status: data.status || VACANCY_STATUS.DRAFT,
    passing_score: data.passingScore ?? 80,
    created_by: data.createdBy ?? null,
  }
  await throwIfError(await supabase.from('academy_vacancies').insert(row), 'Создание вакансии')
  return row.id
}

export async function updateVacancy(vacancyId, updates) {
  const patch = {}
  if (updates.title != null) patch.title = updates.title
  if (updates.slug != null) patch.slug = updates.slug
  if (updates.description != null) patch.description = updates.description
  if (updates.role != null) patch.role = updates.role
  if (updates.employeeRole != null) patch.employee_role = updates.employeeRole
  if (updates.status != null) patch.status = updates.status
  if (updates.passingScore != null) patch.passing_score = updates.passingScore
  if (updates.title && updates.slug == null) {
    patch.slug = generateUniqueVacancySlug(updates.title, getAllVacanciesSync(), vacancyId)
  }
  if (Object.keys(patch).length) {
    await throwIfError(
      await supabase.from('academy_vacancies').update(patch).eq('id', vacancyId),
      'Обновление вакансии'
    )
  }
}

export async function deleteVacancy(vacancyId) {
  await throwIfError(
    await supabase.from('academy_vacancies').delete().eq('id', vacancyId),
    'Удаление вакансии'
  )
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
  const countRes = await supabase
    .from('academy_candidate_questions')
    .select('sort_order')
    .eq('vacancy_id', vacancyId)
  const existing = await throwIfError(countRes, 'Подсчёт вопросов')

  const row = {
    id: crypto.randomUUID(),
    vacancy_id: vacancyId,
    question_text: data.questionText,
    question_type: data.questionType || 'single_choice',
    options: data.options,
    scores: data.scores,
    required: data.required !== false,
    sort_order: data.sortOrder ?? existing.length,
  }
  await throwIfError(
    await supabase.from('academy_candidate_questions').insert(row),
    'Создание вопроса'
  )
  return row.id
}

export async function updateCandidateQuestion(questionId, updates) {
  const patch = {}
  if (updates.questionText != null) patch.question_text = updates.questionText
  if (updates.options != null) patch.options = updates.options
  if (updates.scores != null) patch.scores = updates.scores
  if (updates.required != null) patch.required = updates.required
  if (updates.sortOrder != null) patch.sort_order = updates.sortOrder
  if (Object.keys(patch).length) {
    await throwIfError(
      await supabase.from('academy_candidate_questions').update(patch).eq('id', questionId),
      'Обновление вопроса'
    )
  }
}

export async function deleteCandidateQuestion(questionId) {
  await throwIfError(
    await supabase.from('academy_candidate_questions').delete().eq('id', questionId),
    'Удаление вопроса'
  )
}

export async function reorderCandidateQuestions(vacancyId, orderedQuestionIds) {
  await Promise.all(
    orderedQuestionIds.map((id, index) =>
      supabase
        .from('academy_candidate_questions')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('vacancy_id', vacancyId)
    )
  )
}

export async function submitCandidateApplication(applicationData) {
  const vacancyRes = await supabase
    .from('academy_vacancies')
    .select('*')
    .eq('id', applicationData.vacancyId)
    .maybeSingle()
  const vacancyRow = await throwIfError(vacancyRes, 'Загрузка вакансии')
  if (!vacancyRow) throw new Error('Вакансия не найдена')
  if (vacancyRow.status !== VACANCY_STATUS.PUBLISHED) {
    throw new Error('Вакансия недоступна или закрыта')
  }

  const questionsRes = await supabase
    .from('academy_candidate_questions')
    .select('*')
    .eq('vacancy_id', applicationData.vacancyId)
    .order('sort_order')
  const questions = (await throwIfError(questionsRes, 'Загрузка вопросов')).map(rowToQuestion)

  const { totalScore, maxScore, scorePercent, status } = calculateApplicationScore(
    questions,
    applicationData.answers || {},
    vacancyRow.passing_score
  )

  const firstName = applicationData.firstName?.trim()
  const lastName = applicationData.lastName?.trim() || ''

  const row = {
    vacancy_id: applicationData.vacancyId,
    first_name: firstName,
    last_name: lastName,
    full_name: `${firstName} ${lastName}`.trim(),
    phone: applicationData.phone?.trim(),
    age: applicationData.age ? Number(applicationData.age) : null,
    city: applicationData.city?.trim() || '',
    experience: applicationData.experience?.trim() || '',
    previous_work: applicationData.previousWork?.trim() || '',
    expected_salary: applicationData.expectedSalary?.trim() || '',
    available_from: applicationData.availableFrom?.trim() || '',
    about: applicationData.about?.trim() || '',
    answers: applicationData.answers || {},
    photo_url: applicationData.photoUrl || null,
    photo_path: applicationData.photoPath || null,
    score_percent: scorePercent,
    total_score: totalScore,
    max_score: maxScore,
    status,
  }

  const inserted = await throwIfError(
    await supabase.from('academy_candidates').insert(row).select().single(),
    'Сохранение анкеты'
  )

  return {
    ok: true,
    candidateId: inserted.id,
    message: 'Спасибо! Ваша анкета отправлена. Если вы подойдёте, мы свяжемся с вами.',
  }
}

export async function updateCandidate(candidateId, updates) {
  const patch = {}
  if (updates.status != null) patch.status = updates.status
  if (updates.adminNotes != null) patch.admin_notes = updates.adminNotes
  if (updates.createdUserId != null) patch.created_user_id = updates.createdUserId
  if (updates.interviewSalutation != null) patch.interview_salutation = updates.interviewSalutation
  if (updates.interviewDate != null) patch.interview_date = updates.interviewDate
  if (updates.interviewTime != null) patch.interview_time = updates.interviewTime
  if (updates.interviewAddress != null) patch.interview_address = updates.interviewAddress
  if (updates.interviewComment != null) patch.interview_comment = updates.interviewComment
  if (updates.invitationSentAt != null) patch.invitation_sent_at = updates.invitationSentAt
  if (Object.keys(patch).length) {
    await throwIfError(
      await supabase.from('academy_candidates').update(patch).eq('id', candidateId),
      'Обновление кандидата'
    )
  }
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
  const candidate = getAllCandidatesSync().find((c) => c.id === candidateId)
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
