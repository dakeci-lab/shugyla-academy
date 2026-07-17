import { supabase } from '../lib/supabaseClient'
import { ACADEMY_PROFILE_SAFE_FIELDS } from './authService'
import { normalizeEmployee, canEmployeeLogin } from '../utils/employeeData'
import { normalizeLesson } from '../utils/lessonData'
import { fetchTestsData } from './testSupabaseAdapter'
import { normalizeRoleId } from '../data/roles'
import { resolveRoleIdByCode } from './rbacService'

async function resolveRoleIdForSlug(roleSlug) {
  try {
    return await resolveRoleIdByCode(normalizeRoleId(roleSlug))
  } catch {
    return null
  }
}

function parseDurationHours(durationLabel) {
  if (!durationLabel) return null
  const match = String(durationLabel).match(/([\d.,]+)/)
  return match ? Number(match[1].replace(',', '.')) : null
}

import { normalizeCourse, courseStatusToStorage } from '../utils/courseData'

function rowToCourse(row) {
  const allowedRoles = Array.isArray(row.allowed_roles) && row.allowed_roles.length
    ? row.allowed_roles
    : [row.role || row.category || 'cashier']

  return normalizeCourse({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    allowedRoles,
    status: row.status,
    duration: row.duration_label,
    imageColor: row.image_color,
    blocksCount: row.blocks_count,
    lessonsCount: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function courseToRow(course) {
  const allowedRoles = course.allowedRoles?.length
    ? course.allowedRoles
    : [course.category || course.role || 'cashier']

  const status = courseStatusToStorage(course.status || 'draft')

  return {
    id: course.id,
    title: course.title || '',
    description: course.description || '',
    category: course.category || allowedRoles[0],
    role: allowedRoles[0],
    status,
    duration_hours: parseDurationHours(course.duration),
    duration_label: course.duration || '—',
    allowed_roles: allowedRoles,
    image_color: course.imageColor || '#2d8f4e',
    blocks_count: course.blocksCount ?? 1,
  }
}

function rowToLesson(row) {
  return normalizeLesson({
    id: row.id,
    courseId: row.course_id,
    blockId: row.block_id,
    title: row.title,
    description: row.description,
    videoUrl: row.video_url,
    durationMinutes: row.duration_minutes,
    summary: row.summary,
    mandatory: row.mandatory,
    order: row.sort_order,
  })
}

function lessonToRow(lesson) {
  return {
    id: lesson.id,
    course_id: lesson.courseId,
    block_id: lesson.blockId ?? null,
    title: lesson.title || '',
    description: lesson.description || '',
    video_url: lesson.videoUrl || '',
    duration_minutes: lesson.durationMinutes ?? 15,
    summary: lesson.summary || '',
    mandatory: lesson.mandatory !== false,
    sort_order: lesson.order ?? 1,
    is_deleted: false,
  }
}

function buildProgressMap(rows) {
  const progress = {}

  rows.forEach((row) => {
    if (!progress[row.user_id]) progress[row.user_id] = {}
    if (!progress[row.user_id][row.course_id]) {
      progress[row.user_id][row.course_id] = {
        completedLessons: [],
        testPassed: false,
        testScore: null,
      }
    }

    const entry = progress[row.user_id][row.course_id]

    if (row.lesson_id == null) {
      if (row.test_passed != null) entry.testPassed = row.test_passed
      if (row.test_score != null) entry.testScore = row.test_score
      return
    }

    if (row.completed && !entry.completedLessons.includes(row.lesson_id)) {
      entry.completedLessons.push(row.lesson_id)
    }
  })

  return progress
}

function attachLessonCounts(courses, lessons) {
  return courses.map((course) => ({
    ...course,
    lessonsCount: lessons.filter((l) => l.courseId === course.id).length,
  }))
}

function groupAssignments(rows) {
  const map = new Map()
  rows.forEach((row) => {
    if (!map.has(row.user_id)) map.set(row.user_id, [])
    map.get(row.user_id).push(row.course_id)
  })
  return map
}

async function throwIfError(result, context) {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`)
  }
  return result.data
}

function settleTableResult(result, context, fallback = []) {
  if (result?.error) {
    console.error(`[${context}]`, result.error)
    if (import.meta.env.DEV) {
      console.error('[DataLoad]', {
        context,
        code: result.error.code,
        message: result.error.message,
        details: result.error.details,
        hint: result.error.hint,
      })
    }
    return fallback
  }
  return result?.data ?? fallback
}

/** Core academy tables (employees / courses / lessons / assignments / progress). */
export async function fetchCoreAcademyData() {
  const [usersRes, coursesRes, lessonsRes, assignmentsRes, progressRes] =
    await Promise.all([
      supabase.from('academy_users').select(ACADEMY_PROFILE_SAFE_FIELDS).order('id'),
      supabase.from('academy_courses').select('*').order('id'),
      supabase.from('academy_lessons').select('*').eq('is_deleted', false).order('sort_order'),
      supabase.from('academy_course_assignments').select('*'),
      supabase.from('academy_progress').select('*'),
    ])

  const users = settleTableResult(usersRes, 'Загрузка сотрудников', [])
  const courses = settleTableResult(coursesRes, 'Загрузка курсов', [])
  const lessons = settleTableResult(lessonsRes, 'Загрузка уроков', [])
  const assignments = settleTableResult(assignmentsRes, 'Загрузка назначений', [])
  const progressRows = settleTableResult(progressRes, 'Загрузка прогресса', [])

  const assignmentMap = groupAssignments(assignments)
  const normalizedLessons = lessons.map(rowToLesson)

  const employees = users.map((row) =>
    normalizeEmployee({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      name: row.full_name,
      login: row.login,
      role: row.role,
      roleId: row.role_id,
      position: row.position,
      employmentStatus: row.status,
      assignedCourseIds: assignmentMap.get(row.id) || [],
      avatarUrl: row.avatar_url,
      contactEmail: row.contact_email || '',
      workLocationId: row.work_location_id,
    })
  )

  const normalizedCourses = attachLessonCounts(
    courses.map(rowToCourse),
    normalizedLessons
  )

  return {
    employees,
    courses: normalizedCourses,
    lessons: normalizedLessons,
    assignments,
    progress: buildProgressMap(progressRows),
  }
}

export async function fetchAcademyLearningExtras() {
  const [testsResult, pathsResult] = await Promise.allSettled([
    fetchTestsData(),
    import('./learningPathSupabaseAdapter').then(({ fetchLearningPathsData }) =>
      fetchLearningPathsData()
    ),
  ])

  const testsData =
    testsResult.status === 'fulfilled'
      ? testsResult.value
      : { tests: [], questions: [], attempts: [] }
  const pathsData =
    pathsResult.status === 'fulfilled'
      ? pathsResult.value
      : { paths: [], pathCourses: [], userPaths: [] }

  if (testsResult.status === 'rejected') {
    console.error('[Загрузка тестов]', testsResult.reason)
  }
  if (pathsResult.status === 'rejected') {
    console.error('[Загрузка learning paths]', pathsResult.reason)
  }

  return {
    tests: testsData.tests,
    testQuestions: testsData.questions,
    testAttempts: testsData.attempts,
    learningPaths: pathsData.paths,
    learningPathCourses: pathsData.pathCourses,
    userLearningPaths: pathsData.userPaths,
  }
}

export async function fetchStandardsModuleData() {
  const { fetchStandardsData } = await import('./standardsSupabaseAdapter')
  const data = await fetchStandardsData()
  return {
    standardCategories: data.categories,
    standardArticles: data.articles,
    standardArticleReads: data.reads,
  }
}

export async function fetchRecruitmentModuleData() {
  const { fetchRecruitmentData } = await import('./recruitmentSupabaseAdapter')
  const data = await fetchRecruitmentData()
  return {
    vacancies: data.vacancies,
    candidateQuestions: data.questions,
    candidates: data.candidates,
  }
}

export async function fetchSuppliersModuleData() {
  const { fetchSuppliersData } = await import('./suppliersSupabaseAdapter')
  const data = await fetchSuppliersData()
  return { suppliers: data.suppliers }
}

export async function fetchPurchasesModuleData() {
  const { fetchPurchasesDataCloud } = await import('./purchaseSupabaseAdapter')
  const data = await fetchPurchasesDataCloud()
  return { purchases: data.orders }
}

export async function fetchReceivingModuleData() {
  const { fetchReceivingDataCloud } = await import('./receivingSupabaseAdapter')
  const data = await fetchReceivingDataCloud()
  return { receivingDocuments: data.documents }
}

/**
 * Full dump for legacy callers. Soft-isolates optional modules (including procurement).
 * Prefer progressive bootstrap via academyDataService.ensureModuleLoaded.
 */
export async function fetchAllData() {
  const core = await fetchCoreAcademyData()

  const [
    learningResult,
    standardsResult,
    recruitmentResult,
    suppliersResult,
    purchasesResult,
    receivingResult,
  ] = await Promise.allSettled([
    fetchAcademyLearningExtras(),
    fetchStandardsModuleData(),
    fetchRecruitmentModuleData(),
    fetchSuppliersModuleData(),
    fetchPurchasesModuleData(),
    fetchReceivingModuleData(),
  ])

  const learning =
    learningResult.status === 'fulfilled'
      ? learningResult.value
      : {
          tests: [],
          testQuestions: [],
          testAttempts: [],
          learningPaths: [],
          learningPathCourses: [],
          userLearningPaths: [],
        }
  const standards =
    standardsResult.status === 'fulfilled'
      ? standardsResult.value
      : { standardCategories: [], standardArticles: [], standardArticleReads: [] }
  const recruitment =
    recruitmentResult.status === 'fulfilled'
      ? recruitmentResult.value
      : { vacancies: [], candidateQuestions: [], candidates: [] }
  const suppliers =
    suppliersResult.status === 'fulfilled' ? suppliersResult.value : { suppliers: [] }

  if (purchasesResult.status === 'rejected') {
    console.error('[Загрузка закупов]', purchasesResult.reason)
  }
  if (receivingResult.status === 'rejected') {
    console.error('[Загрузка приёмки]', receivingResult.reason)
  }

  const purchases =
    purchasesResult.status === 'fulfilled' ? purchasesResult.value : { purchases: [] }
  const receiving =
    receivingResult.status === 'fulfilled'
      ? receivingResult.value
      : { receivingDocuments: [] }

  return {
    ...core,
    ...learning,
    ...standards,
    ...recruitment,
    ...suppliers,
    ...purchases,
    ...receiving,
    _moduleFailures: {
      academyLearning: learningResult.status === 'rejected' ? learningResult.reason : null,
      standards: standardsResult.status === 'rejected' ? standardsResult.reason : null,
      recruitment: recruitmentResult.status === 'rejected' ? recruitmentResult.reason : null,
      suppliers: suppliersResult.status === 'rejected' ? suppliersResult.reason : null,
      procurement: purchasesResult.status === 'rejected' ? purchasesResult.reason : null,
      receiving: receivingResult.status === 'rejected' ? receivingResult.reason : null,
    },
  }
}

async function createUser(data) {
  const employee = normalizeEmployee({
    ...data,
    id: data.id,
    employmentStatus: data.employmentStatus || data.status || 'active',
    assignedCourseIds: data.assignedCourseIds || [],
  })

  const row = {
    id: employee.id,
    first_name: employee.firstName,
    last_name: employee.lastName,
    full_name: employee.name,
    login: employee.login,
    password: employee.password || '',
    role: employee.role,
    role_id: employee.roleId || null,
    position: employee.position || '',
    status: employee.employmentStatus,
    avatar_url: employee.avatarUrl || null,
    work_location_id: employee.workLocationId || null,
  }

  if (!row.role_id && employee.role) {
    row.role_id = await resolveRoleIdForSlug(employee.role)
  }

  await throwIfError(
    await supabase.from('academy_users').insert(row),
    'Создание сотрудника'
  )

  await syncAssignments(employee.id, employee.assignedCourseIds)
  return employee.id
}

export async function createEmployee(data) {
  return createUser(data)
}

export async function updateEmployee(id, updates) {
  return updateUser(id, updates)
}

async function updateUser(id, updates) {
  const patch = {}
  if (updates.firstName != null) patch.first_name = updates.firstName
  if (updates.lastName != null) patch.last_name = updates.lastName
  if (updates.firstName != null || updates.lastName != null) {
    const first = updates.firstName ?? ''
    const last = updates.lastName ?? ''
    patch.full_name = `${first} ${last}`.trim()
  }
  if (updates.name != null) patch.full_name = updates.name
  if (updates.login != null) patch.login = updates.login
  if (updates.password != null && updates.password !== '') patch.password = updates.password
  if (updates.role != null) {
    patch.role = updates.role
    patch.role_id = await resolveRoleIdForSlug(updates.role)
  }
  if (updates.roleId != null) patch.role_id = updates.roleId
  if (updates.position != null) patch.position = updates.position
  if (updates.employmentStatus != null) patch.status = updates.employmentStatus
  if (updates.status != null) patch.status = updates.status
  if (updates.avatarUrl != null) patch.avatar_url = updates.avatarUrl
  if (updates.workLocationId != null) patch.work_location_id = updates.workLocationId

  if (Object.keys(patch).length > 0) {
    await throwIfError(
      await supabase.from('academy_users').update(patch).eq('id', id),
      'Обновление сотрудника'
    )
  }

  if (updates.assignedCourseIds != null) {
    await syncAssignments(id, updates.assignedCourseIds)
  }
}

export async function deactivateEmployee(id) {
  await updateUser(id, { employmentStatus: 'inactive' })
}

export async function restoreEmployee(id) {
  await updateUser(id, { employmentStatus: 'active' })
}

export async function permanentlyDeleteEmployee(id) {
  await throwIfError(
    await supabase.from('academy_course_assignments').delete().eq('user_id', id),
    'Удаление назначений'
  )
  await throwIfError(
    await supabase.from('academy_progress').delete().eq('user_id', id),
    'Удаление прогресса'
  )
  await throwIfError(
    await supabase.from('academy_users').delete().eq('id', id),
    'Удаление сотрудника'
  )
}

export async function updateProfileName(userId, fullName) {
  const trimmed = fullName.trim()
  const parts = trimmed.split(/\s+/).filter(Boolean)
  const firstName = parts[0] || trimmed
  const lastName = parts.slice(1).join(' ')

  await throwIfError(
    await supabase
      .from('academy_users')
      .update({
        full_name: trimmed,
        first_name: firstName,
        last_name: lastName,
      })
      .eq('id', userId),
    'Обновление профиля'
  )
}

export async function updateProfile(userId, { firstName, lastName, contactEmail }) {
  const trimmedFirst = firstName.trim()
  const trimmedLast = lastName.trim()
  const fullName = `${trimmedFirst} ${trimmedLast}`.trim()

  await throwIfError(
    await supabase
      .from('academy_users')
      .update({
        first_name: trimmedFirst,
        last_name: trimmedLast,
        full_name: fullName,
        contact_email: contactEmail?.trim() ? contactEmail.trim().toLowerCase() : null,
      })
      .eq('id', userId),
    'Обновление профиля'
  )
}

async function syncAssignments(userId, courseIds) {
  await throwIfError(
    await supabase.from('academy_course_assignments').delete().eq('user_id', userId),
    'Очистка назначений'
  )

  if (!courseIds?.length) return

  const rows = courseIds.map((courseId) => ({
    user_id: userId,
    course_id: courseId,
  }))

  await throwIfError(
    await supabase.from('academy_course_assignments').insert(rows),
    'Назначение курсов'
  )
}

export async function createCourse(course) {
  const allRes = await supabase.from('academy_courses').select('id')
  const existing = await throwIfError(allRes, 'Получение id курса')
  const newId =
    course.id ??
    (existing.length > 0 ? Math.max(...existing.map((c) => c.id)) + 1 : 1)

  const row = courseToRow({ ...course, id: newId })
  await throwIfError(
    await supabase.from('academy_courses').insert(row),
    'Создание курса'
  )
  return newId
}

export async function updateCourse(courseId, updates) {
  const row = {}
  if (updates.title != null) row.title = updates.title
  if (updates.description != null) row.description = updates.description
  if (updates.category != null) row.category = updates.category
  if (updates.status != null) row.status = updates.status
  if (updates.duration != null) {
    row.duration_label = updates.duration
    row.duration_hours = parseDurationHours(updates.duration)
  }
  if (updates.allowedRoles != null) {
    row.allowed_roles = updates.allowedRoles
    row.role = updates.allowedRoles[0] || row.role
  }
  if (updates.imageColor != null) row.image_color = updates.imageColor
  if (updates.blocksCount != null) row.blocks_count = updates.blocksCount

  if (Object.keys(row).length > 0) {
    await throwIfError(
      await supabase.from('academy_courses').update(row).eq('id', courseId),
      'Обновление курса'
    )
  }
}

export async function hideCourse(courseId) {
  await updateCourse(courseId, { status: 'archive' })
}

export async function deleteCourse(courseId) {
  await throwIfError(
    await supabase.from('academy_courses').delete().eq('id', courseId),
    'Удаление курса'
  )
}

export async function createLesson(courseId, lessonData) {
  const allRes = await supabase.from('academy_lessons').select('id')
  const existing = await throwIfError(allRes, 'Получение id урока')
  const newId =
    lessonData.id ??
    (existing.length > 0 ? Math.max(...existing.map((l) => l.id)) + 1 : 1)

  const courseLessonsRes = await supabase
    .from('academy_lessons')
    .select('sort_order')
    .eq('course_id', courseId)
    .eq('is_deleted', false)
  const courseLessons = await throwIfError(courseLessonsRes, 'Подсчёт уроков')

  const lesson = normalizeLesson({
    ...lessonData,
    id: newId,
    courseId,
    order: lessonData.order ?? courseLessons.length + 1,
  })

  await throwIfError(
    await supabase.from('academy_lessons').insert(lessonToRow(lesson)),
    'Создание урока'
  )
  return newId
}

export async function updateLesson(lessonId, updates) {
  const row = {}
  if (updates.title != null) row.title = updates.title
  if (updates.description != null) row.description = updates.description
  if (updates.videoUrl != null) row.video_url = updates.videoUrl
  if (updates.durationMinutes != null) row.duration_minutes = updates.durationMinutes
  if (updates.summary != null) row.summary = updates.summary
  if (updates.mandatory != null) row.mandatory = updates.mandatory
  if (updates.order != null) row.sort_order = updates.order
  if (updates.courseId != null) row.course_id = updates.courseId
  if (updates.blockId != null) row.block_id = updates.blockId

  if (Object.keys(row).length > 0) {
    await throwIfError(
      await supabase.from('academy_lessons').update(row).eq('id', lessonId),
      'Обновление урока'
    )
  }
}

export async function deleteLesson(lessonId) {
  await throwIfError(
    await supabase
      .from('academy_lessons')
      .update({ is_deleted: true })
      .eq('id', lessonId),
    'Удаление урока'
  )
}

export async function assignCourse(userId, courseId) {
  await throwIfError(
    await supabase
      .from('academy_course_assignments')
      .upsert({ user_id: userId, course_id: courseId }, { onConflict: 'user_id,course_id' }),
    'Назначение курса'
  )
}

export async function assignCourseToRole(roleId, courseId) {
  const usersResult = await supabase
    .from('academy_users')
    .select('id')
    .eq('role', roleId)
    .eq('status', 'active')

  const users = await throwIfError(usersResult, 'Загрузка сотрудников по роли')
  for (const user of users || []) {
    await assignCourse(user.id, courseId)
  }
}

export async function getUserProgress(userId) {
  const result = await supabase
    .from('academy_progress')
    .select('*')
    .eq('user_id', userId)
  const rows = await throwIfError(result, 'Загрузка прогресса')
  return buildProgressMap(rows)[userId] || {}
}

export async function markLessonComplete(userId, courseId, lessonId) {
  await throwIfError(
    await supabase.from('academy_progress').upsert(
      {
        user_id: userId,
        course_id: courseId,
        lesson_id: lessonId,
        completed: true,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,course_id,lesson_id' }
    ),
    'Сохранение прогресса'
  )
}

export async function saveTestResult(userId, courseId, score, passed) {
  await throwIfError(
    await supabase.from('academy_progress').upsert(
      {
        user_id: userId,
        course_id: courseId,
        lesson_id: null,
        completed: passed,
        completed_at: passed ? new Date().toISOString() : null,
        test_passed: passed,
        test_score: score,
      },
      { onConflict: 'user_id,course_id,lesson_id' }
    ),
    'Сохранение результата теста'
  )
}

/** @deprecated Pre-Auth password compare — not used in Auth-first cloud login. */
export async function authenticateUser(loginValue, password) {
  if (!loginValue?.trim()) return { ok: false, reason: 'invalid' }

  const result = await supabase
    .from('academy_users')
    .select('*')
    .eq('login', loginValue.trim())
    .maybeSingle()

  const row = await throwIfError(result, 'Аутентификация')
  if (!row || row.password !== password) {
    return { ok: false, reason: 'invalid' }
  }

  if (!canEmployeeLogin(row.status)) {
    return { ok: false, reason: 'deactivated' }
  }

  const assignmentsRes = await supabase
    .from('academy_course_assignments')
    .select('course_id')
    .eq('user_id', row.id)
  const assignments = await throwIfError(assignmentsRes, 'Назначения')

  return {
    ok: true,
    user: normalizeEmployee({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      name: row.full_name,
      login: row.login,
      password: row.password,
      role: row.role,
      roleId: row.role_id,
      position: row.position,
      employmentStatus: row.status,
      assignedCourseIds: assignments.map((a) => a.course_id),
    }),
  }
}

export async function upsertMigrationBatch(payload) {
  const { users, courses, lessons, assignments, progressRows } = payload

  if (users.length) {
    await throwIfError(
      await supabase.from('academy_users').upsert(users, { onConflict: 'id' }),
      'Миграция сотрудников'
    )
  }

  if (courses.length) {
    await throwIfError(
      await supabase.from('academy_courses').upsert(courses, { onConflict: 'id' }),
      'Миграция курсов'
    )
  }

  if (lessons.length) {
    await throwIfError(
      await supabase.from('academy_lessons').upsert(lessons, { onConflict: 'id' }),
      'Миграция уроков'
    )
  }

  if (assignments.length) {
    await throwIfError(
      await supabase
        .from('academy_course_assignments')
        .upsert(assignments, { onConflict: 'user_id,course_id' }),
      'Миграция назначений'
    )
  }

  if (progressRows.length) {
    await throwIfError(
      await supabase
        .from('academy_progress')
        .upsert(progressRows, { onConflict: 'user_id,course_id,lesson_id' }),
      'Миграция прогресса'
    )
  }
}

export { courseToRow, lessonToRow, parseDurationHours }
