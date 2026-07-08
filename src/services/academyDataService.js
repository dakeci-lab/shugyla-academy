import { isCloudMode, getDataModeLabel, getDataModeVariant } from '../lib/dataMode'
import { setCloudStore, clearCloudStore } from '../lib/cloudStore'
import * as supabaseAdapter from './supabaseDataAdapter'
import * as testSupabaseAdapter from './testSupabaseAdapter'
import * as testLocalAdapter from './testLocalAdapter'
import {
  getAllTestsSync,
  getTestByIdSync,
  getTestQuestionsSync,
  getPublishedCourseTest,
  getPublishedFinalAttestation,
  getUserAttemptsSync,
  getBestAttemptSync,
  hasPassedTestSync,
  TEST_TYPE,
} from '../utils/testData'

import * as localAdapter from './localDataAdapter'

function getAdapter() {
  return isCloudMode() ? supabaseAdapter : localAdapter
}

function getTestAdapter() {
  return isCloudMode() ? testSupabaseAdapter : testLocalAdapter
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

// --- Tests (sync reads for UI) ---

export function getTests() {
  return getAllTestsSync()
}

export function getTestById(testId) {
  return getTestByIdSync(testId)
}

export function getCourseTest(courseId) {
  return getPublishedCourseTest(courseId)
}

export function getFinalAttestationByRole(role) {
  return getPublishedFinalAttestation(role)
}

export function getTestQuestions(testId) {
  return getTestQuestionsSync(testId)
}

export function getUserTestAttempts(userId) {
  return getUserAttemptsSync(userId)
}

export function getUserAttemptsForTest(userId, testId) {
  return getUserAttemptsSync(userId, testId)
}

export function getBestAttempt(userId, testId) {
  return getBestAttemptSync(userId, testId)
}

export function hasPassedTest(userId, testId) {
  return hasPassedTestSync(userId, testId)
}

// --- Tests (async mutations) ---

export async function createTest(testData) {
  const id = await getTestAdapter().createTest(testData)
  if (isCloudMode()) await refreshData()
  return id
}

export async function updateTest(testId, updates) {
  await getTestAdapter().updateTest(testId, updates)
  if (isCloudMode()) await refreshData()
}

export async function deleteTest(testId) {
  await getTestAdapter().deleteTest(testId)
  if (isCloudMode()) await refreshData()
}

export async function publishTest(testId) {
  await getTestAdapter().publishTest(testId)
  if (isCloudMode()) await refreshData()
}

export async function unpublishTest(testId) {
  await getTestAdapter().unpublishTest(testId)
  if (isCloudMode()) await refreshData()
}

export async function createTestQuestion(testId, questionData) {
  const id = await getTestAdapter().createTestQuestion(testId, questionData)
  if (isCloudMode()) await refreshData()
  return id
}

export async function updateTestQuestion(questionId, updates) {
  await getTestAdapter().updateTestQuestion(questionId, updates)
  if (isCloudMode()) await refreshData()
}

export async function deleteTestQuestion(questionId) {
  await getTestAdapter().deleteTestQuestion(questionId)
  if (isCloudMode()) await refreshData()
}

export async function reorderTestQuestions(testId, orderedQuestionIds) {
  await getTestAdapter().reorderTestQuestions(testId, orderedQuestionIds)
  if (isCloudMode()) await refreshData()
}

export async function submitTestAttempt({ userId, testId, courseId, type, answers }) {
  const test = getTestByIdSync(testId)
  if (!test) throw new Error('Тест не найден')

  const questions = getTestQuestionsSync(testId)
  if (!questions.length) throw new Error('В тесте нет вопросов')

  const previousAttempts = getUserAttemptsSync(userId, testId)
  if (test.maxAttempts && previousAttempts.length >= test.maxAttempts) {
    throw new Error('Исчерпано максимальное количество попыток')
  }

  let correctCount = 0
  questions.forEach((q) => {
    if (answers[q.id] === q.correctOptionIndex) correctCount++
  })

  const totalQuestions = questions.length
  const scorePercent =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0
  const passed = scorePercent >= test.passingScore

  let attempt
  if (isCloudMode()) {
    attempt = await testSupabaseAdapter.insertTestAttempt({
      test_id: testId,
      user_id: userId,
      course_id: courseId ?? null,
      type,
      answers,
      score_percent: scorePercent,
      correct_count: correctCount,
      total_questions: totalQuestions,
      passed,
      submitted_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    })
  } else {
    attempt = testLocalAdapter.localSubmitAttempt(
      { userId, testId, courseId, type, answers },
      test,
      questions
    )
  }

  if (type === TEST_TYPE.COURSE && courseId) {
    await saveTestResult(userId, courseId, scorePercent, passed)
  }

  if (isCloudMode()) await refreshData()

  return {
    ...attempt,
    scorePercent,
    correctCount,
    totalQuestions,
    passed,
  }
}
