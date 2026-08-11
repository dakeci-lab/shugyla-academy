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
import { mapApplicationFormRpcError } from '../utils/applicationForm'

async function throwIfError(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`)
  return result.data
}

function nullableText(value) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function nullableInteger(value) {
  if (value === '' || value == null) return null
  const normalized = Number(value)
  return Number.isInteger(normalized) ? normalized : null
}

function rowToVacancy(row) {
  return normalizeVacancy({
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    city: row.city,
    storeName: row.store_name,
    storeAddress: row.store_address,
    salaryFrom: row.salary_from,
    salaryTo: row.salary_to,
    salaryNote: row.salary_note,
    schedule: row.schedule,
    employmentType: row.employment_type,
    experienceRequirement: row.experience_requirement,
    role: row.role,
    employeeRole: row.employee_role,
    positionId: row.position_id,
    positionNameSnapshot: row.position_name_snapshot,
    positions: row.positions,
    status: row.status,
    passingScore: row.passing_score,
    applicationFormVersion: row.application_form_version,
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
    isActive: row.is_active,
    fieldBinding: row.field_binding,
    helpText: row.help_text,
    placeholder: row.placeholder,
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
    questionCount: questions.filter((q) => q.vacancyId === v.id && q.isActive !== false).length,
    candidateCount: candidates.filter((c) => c.vacancyId === v.id).length,
  }))
}

async function hasAuthSession() {
  const { data } = await supabase.auth.getSession()
  return Boolean(data?.session?.access_token)
}

export async function fetchRecruitmentData() {
  const authed = await hasAuthSession()
  // Anon cannot SELECT positions (RLS); embed only for authenticated HR.
  // Public UI uses position_name_snapshot / title fallback.
  const vacancySelect = authed
    ? '*, positions(id, name, is_active, archived_at)'
    : '*'

  const vacRes = await supabase
    .from('academy_vacancies')
    .select(vacancySelect)
    .order('created_at', { ascending: false })

  const vacancies = (await throwIfError(vacRes, 'Загрузка вакансий')).map(rowToVacancy)

  // Public apply uses get_public_vacancy_application_form RPC; anon cannot SELECT questions
  // (bindings must stay private).
  let questions = []
  let candidates = []
  if (authed) {
    const [qRes, cRes] = await Promise.all([
      supabase.from('academy_candidate_questions').select('*').order('sort_order'),
      supabase
        .from('academy_candidates')
        .select('*')
        .order('submitted_at', { ascending: false }),
    ])
    questions = (await throwIfError(qRes, 'Загрузка вопросов')).map(rowToQuestion)
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
  if (!data.positionId) throw new Error('Выберите должность')
  const vacancies = getAllVacanciesSync()
  const slug = data.slug || generateUniqueVacancySlug(data.title, vacancies)
  const row = {
    id: data.id || crypto.randomUUID(),
    title: data.title,
    slug,
    description: data.description || '',
    city: nullableText(data.city),
    store_name: nullableText(data.storeName),
    store_address: nullableText(data.storeAddress),
    salary_from: nullableInteger(data.salaryFrom),
    salary_to: nullableInteger(data.salaryTo),
    salary_note: nullableText(data.salaryNote),
    schedule: nullableText(data.schedule),
    employment_type: nullableText(data.employmentType),
    experience_requirement: nullableText(data.experienceRequirement),
    role: data.role ?? null,
    employee_role: data.employeeRole ?? data.role ?? null,
    position_id: data.positionId,
    position_name_snapshot: data.positionNameSnapshot || null,
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
  if (Object.prototype.hasOwnProperty.call(updates, 'city')) {
    patch.city = nullableText(updates.city)
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'storeName')) {
    patch.store_name = nullableText(updates.storeName)
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'storeAddress')) {
    patch.store_address = nullableText(updates.storeAddress)
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'salaryFrom')) {
    patch.salary_from = nullableInteger(updates.salaryFrom)
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'salaryTo')) {
    patch.salary_to = nullableInteger(updates.salaryTo)
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'salaryNote')) {
    patch.salary_note = nullableText(updates.salaryNote)
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'schedule')) {
    patch.schedule = nullableText(updates.schedule)
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'employmentType')) {
    patch.employment_type = nullableText(updates.employmentType)
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'experienceRequirement')) {
    patch.experience_requirement = nullableText(updates.experienceRequirement)
  }
  if (updates.role != null) patch.role = updates.role
  if (updates.employeeRole != null) patch.employee_role = updates.employeeRole
  if (updates.positionId != null) {
    patch.position_id = updates.positionId
    if (updates.positionNameSnapshot != null) {
      patch.position_name_snapshot = updates.positionNameSnapshot
    }
  }
  if (updates.status != null) patch.status = updates.status
  if (updates.title && updates.slug == null) {
    patch.slug = generateUniqueVacancySlug(updates.title, getAllVacanciesSync(), vacancyId)
  }

  const nextStatus = patch.status ?? current.status
  const nextPositionId = patch.position_id ?? current.positionId
  if (nextStatus === VACANCY_STATUS.PUBLISHED && !nextPositionId) {
    throw new Error('Перед публикацией выберите должность из справочника')
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
  const { data, error } = await supabase.rpc('duplicate_vacancy_with_application_form', {
    p_source_vacancy_id: sourceVacancyId,
  })
  if (error) {
    throw new Error(
      mapApplicationFormRpcError(error) ||
        'Не удалось продублировать вакансию. Проверьте исходную анкету и должность.'
    )
  }
  if (!data?.vacancy_id) {
    throw new Error('Не удалось продублировать вакансию')
  }
  return data.vacancy_id
}

export async function saveVacancyApplicationForm(vacancyId, { questions, expectedVersion }) {
  const { data, error } = await supabase.rpc('save_vacancy_application_form', {
    p_vacancy_id: vacancyId,
    p_questions: questions,
    p_expected_version: expectedVersion ?? null,
  })
  if (error) {
    throw new Error(
      mapApplicationFormRpcError(error) ||
        'Не удалось сохранить анкету. Проверьте вопросы и попробуйте снова.'
    )
  }
  return {
    ok: true,
    formVersion: data?.form_version,
    questions: data?.questions || [],
  }
}

/** Legacy per-question CRUD replaced by saveVacancyApplicationForm. */
export async function createCandidateQuestion() {
  throw new Error('Используйте сохранение всей анкеты')
}

export async function updateCandidateQuestion() {
  throw new Error('Используйте сохранение всей анкеты')
}

export async function deleteCandidateQuestion() {
  throw new Error('Используйте сохранение всей анкеты')
}

export async function reorderCandidateQuestions() {
  throw new Error('Используйте сохранение всей анкеты')
}

export async function submitCandidateApplication(applicationData) {
  const { data, error } = await supabase.rpc('submit_candidate_application', {
    p_vacancy_id: applicationData.vacancyId,
    p_answers: { answers: applicationData.answers || {} },
    p_form_version: Number(applicationData.formVersion) || 1,
    p_photo_upload_id: applicationData.photoUploadId || null,
  })

  if (error) {
    throw new Error(
      mapApplicationFormRpcError(error) ||
        'Не удалось отправить анкету. Попробуйте ещё раз.'
    )
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
