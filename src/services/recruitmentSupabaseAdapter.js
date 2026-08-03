import { supabase } from '../lib/supabaseClient'
import {
  normalizeVacancy,
  normalizeCandidateQuestion,
  normalizeCandidate,
  generateUniqueVacancySlug,
  getAllVacanciesSync,
  getAllCandidatesSync,
  getVacancyByIdSync,
  VACANCY_STATUS,
  CANDIDATE_STATUS,
} from '../utils/recruitmentData'
import { attachCandidatePhotoSignedUrls } from './candidatePhotoService'

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

async function hasAuthSession() {
  const { data } = await supabase.auth.getSession()
  return Boolean(data?.session?.access_token)
}

export async function fetchRecruitmentData() {
  const [vacRes, qRes] = await Promise.all([
    supabase.from('academy_vacancies').select('*').order('created_at', { ascending: false }),
    supabase.from('academy_candidate_questions').select('*').order('sort_order'),
  ])

  const vacancies = (await throwIfError(vacRes, 'Загрузка вакансий')).map(rowToVacancy)
  const questions = (await throwIfError(qRes, 'Загрузка вопросов')).map(rowToQuestion)

  let candidates = []
  if (await hasAuthSession()) {
    const cRes = await supabase
      .from('academy_candidates')
      .select('*')
      .order('submitted_at', { ascending: false })
    if (!cRes.error) {
      candidates = await attachCandidatePhotoSignedUrls(
        (cRes.data || []).map(rowToCandidate)
      )
    }
  }

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
    // Legacy column kept for schema compatibility; scoring UI disabled.
    passing_score: 80,
    created_by: data.createdBy ?? null,
  }
  await throwIfError(await supabase.from('academy_vacancies').insert(row), 'Создание вакансии')
  return row.id
}

export async function updateVacancy(vacancyId, updates) {
  const current = getVacancyByIdSync(vacancyId)
  if (!current) throw new Error('Вакансия не найдена')

  const patch = {}
  if (updates.title != null) patch.title = updates.title
  if (updates.slug != null) patch.slug = updates.slug
  if (updates.description != null) patch.description = updates.description
  if (updates.role != null) patch.role = updates.role
  if (updates.employeeRole != null) patch.employee_role = updates.employeeRole
  if (updates.status != null) patch.status = updates.status
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

export async function duplicateVacancy(sourceVacancyId) {
  const source = getVacancyByIdSync(sourceVacancyId)
  if (!source) throw new Error('Вакансия не найдена')

  const title = `${source.title} (копия)`
  const slug = generateUniqueVacancySlug(title, getAllVacanciesSync())
  const newId = crypto.randomUUID()

  await createVacancy({
    id: newId,
    title,
    description: source.description,
    role: source.role,
    employeeRole: source.employeeRole,
    status: VACANCY_STATUS.DRAFT,
    slug,
  })

  return newId
}

/** @deprecated Scored question editor disabled; table retained for future flexible questionnaire. */
export async function createCandidateQuestion() {
  throw new Error('Редактор тестовых вопросов отключён')
}

/** @deprecated Scored question editor disabled. */
export async function updateCandidateQuestion() {
  throw new Error('Редактор тестовых вопросов отключён')
}

/** @deprecated Scored question editor disabled. */
export async function deleteCandidateQuestion() {
  throw new Error('Редактор тестовых вопросов отключён')
}

/** @deprecated Scored question editor disabled. */
export async function reorderCandidateQuestions() {
  throw new Error('Редактор тестовых вопросов отключён')
}

function mapSubmitRpcError(error) {
  const message = error?.message || ''
  if (message.includes('vacancy_closed') || message.includes('vacancy_not_found')) {
    return 'Вакансия недоступна или закрыта'
  }
  if (message.includes('first_name_required')) return 'Укажите имя'
  if (message.includes('phone_required')) return 'Укажите телефон'
  if (message.includes('age_invalid')) return 'Проверьте возраст'
  if (message.includes('photo_invalid')) return 'Не удалось сохранить фото'
  return 'Не удалось отправить анкету. Попробуйте ещё раз.'
}

export async function submitCandidateApplication(applicationData) {
  const { data, error } = await supabase.rpc('submit_candidate_application', {
    p_vacancy_id: applicationData.vacancyId,
    p_first_name: applicationData.firstName?.trim() || '',
    p_last_name: applicationData.lastName?.trim() || '',
    p_phone: applicationData.phone?.trim() || '',
    p_age: applicationData.age ? Number(applicationData.age) : null,
    p_city: applicationData.city?.trim() || null,
    p_experience: applicationData.experience?.trim() || null,
    p_previous_work: applicationData.previousWork?.trim() || null,
    p_expected_salary: applicationData.expectedSalary?.trim() || null,
    p_available_from: applicationData.availableFrom?.trim() || null,
    p_about: applicationData.about?.trim() || null,
    // Private bucket: never accept permanent photo URLs from the client.
    p_photo_url: null,
    p_photo_path: applicationData.photoPath || null,
  })

  if (error) {
    throw new Error(mapSubmitRpcError(error))
  }

  return {
    ok: true,
    candidateId: data?.candidate_id,
    message:
      data?.message ||
      'Анкета успешно отправлена. Мы свяжемся с вами после рассмотрения.',
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
  const { data, error } = await supabase
    .from('academy_candidates')
    .select('id, created_user_id, status')
    .eq('id', candidateId)
    .maybeSingle()

  if (error) throw new Error(`Связь кандидата: ${error.message}`)
  if (!data) throw new Error('Кандидат не найден')

  if (data.created_user_id) {
    if (String(data.created_user_id) === String(userId)) return
    throw new Error('Сотрудник уже создан для этого кандидата')
  }

  await markCandidateHired(candidateId, userId, CANDIDATE_STATUS.HIRED)
}

export async function markCandidateHired(candidateId, userId, status) {
  await updateCandidate(candidateId, {
    status: status || CANDIDATE_STATUS.HIRED,
    createdUserId: userId,
  })
}
