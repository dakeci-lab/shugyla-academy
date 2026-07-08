import { isCloudMode, getDataModeLabel, getDataModeVariant } from '../lib/dataMode'
import { setCloudStore, clearCloudStore } from '../lib/cloudStore'
import * as supabaseAdapter from './supabaseDataAdapter'
import * as localAdapter from './localDataAdapter'

function getAdapter() {
  return isCloudMode() ? supabaseAdapter : localAdapter
}

export { isCloudMode, getDataModeLabel, getDataModeVariant }

/** Load all academy data into memory (cloud) or no-op (local) */
export async function initializeData() {
  if (!isCloudMode()) {
    clearCloudStore()
    return localAdapter.initializeLocal()
  }

  const data = await supabaseAdapter.fetchAllData()
  setCloudStore(data)
  return data
}

export async function refreshData() {
  return initializeData()
}

// --- Employees ---

export async function getEmployees() {
  if (isCloudMode()) {
    const data = await supabaseAdapter.fetchAllData()
    setCloudStore(data)
    return data.employees
  }
  return localAdapter.getEmployees()
}

export async function createEmployee(data) {
  if (isCloudMode()) {
    const all = await supabaseAdapter.fetchAllData()
    const newId =
      data.id ?? (all.employees.length
        ? Math.max(...all.employees.map((e) => e.id)) + 1
        : 1)
    const id = await supabaseAdapter.createEmployee({ ...data, id: newId })
    await refreshData()
    return id
  }
  const id = await localAdapter.createEmployee(data)
  return id
}

export async function updateEmployee(id, updates) {
  await getAdapter().updateEmployee(id, updates)
  if (isCloudMode()) await refreshData()
}

export async function deactivateEmployee(id) {
  await getAdapter().deactivateEmployee(id)
  if (isCloudMode()) await refreshData()
}

export async function restoreEmployee(id) {
  await getAdapter().restoreEmployee(id)
  if (isCloudMode()) await refreshData()
}

export async function permanentlyDeleteEmployee(id) {
  await getAdapter().permanentlyDeleteEmployee(id)
  if (isCloudMode()) await refreshData()
}

export async function updateProfileName(userId, fullName) {
  const trimmed = fullName.trim()
  if (!trimmed) {
    throw new Error('Укажите ФИО')
  }
  if (trimmed.length < 2) {
    throw new Error('ФИО должно содержать минимум 2 символа')
  }

  try {
    await getAdapter().updateProfileName(userId, trimmed)
    if (isCloudMode()) await refreshData()
  } catch {
    throw new Error('Не удалось сохранить профиль. Попробуйте позже.')
  }
}

// --- Courses ---

export async function getCourses() {
  if (isCloudMode()) {
    const data = await supabaseAdapter.fetchAllData()
    setCloudStore(data)
    return data.courses
  }
  return localAdapter.getCourses()
}

export async function createCourse(course) {
  const id = await getAdapter().createCourse(course)
  if (isCloudMode()) await refreshData()
  return id
}

export async function updateCourse(courseId, updates) {
  await getAdapter().updateCourse(courseId, updates)
  if (isCloudMode()) await refreshData()
}

export async function hideCourse(courseId) {
  await getAdapter().hideCourse(courseId)
  if (isCloudMode()) await refreshData()
}

// --- Lessons ---

export async function getLessonsByCourse(courseId) {
  if (isCloudMode()) {
    const data = await supabaseAdapter.fetchAllData()
    setCloudStore(data)
    return data.lessons.filter((l) => l.courseId === courseId)
  }
  return localAdapter.getCourseLessons(courseId)
}

export async function createLesson(courseId, lessonData) {
  const id = await getAdapter().createLesson(courseId, lessonData)
  if (isCloudMode()) await refreshData()
  return id
}

export async function updateLesson(lessonId, updates) {
  await getAdapter().updateLesson(lessonId, updates)
  if (isCloudMode()) await refreshData()
}

export async function deleteLesson(lessonId) {
  await getAdapter().deleteLesson(lessonId)
  if (isCloudMode()) await refreshData()
}

// --- Assignments ---

export async function assignCourseToEmployee(userId, courseId) {
  await getAdapter().assignCourse(userId, courseId)
  if (isCloudMode()) await refreshData()
}

// --- Progress ---

export async function getEmployeeProgress(userId) {
  return getAdapter().getUserProgress(userId)
}

export async function markLessonComplete(userId, courseId, lessonId) {
  await getAdapter().markLessonComplete(userId, courseId, lessonId)
  if (isCloudMode()) await refreshData()
}

export async function saveTestResult(userId, courseId, score, passed) {
  await getAdapter().saveTestResult(userId, courseId, score, passed)
  if (isCloudMode()) await refreshData()
}

// --- Auth ---

export async function authenticateUser(loginValue, password) {
  return getAdapter().authenticateUser(loginValue, password)
}

// --- Migration ---

export async function migrateLocalDataToCloud() {
  if (!isCloudMode()) {
    throw new Error('Supabase не настроен. Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.')
  }

  const snapshot = localAdapter.collectLocalSnapshot()
  await supabaseAdapter.upsertMigrationBatch(snapshot)
  await refreshData()
  return snapshot.counts
}
