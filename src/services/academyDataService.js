import { isAcademyModuleEnabled } from '../config/featureFlags'
import { isCloudMode, getDataModeLabel, getDataModeVariant } from '../lib/dataMode'
import {
  clearCloudStore,
  patchCloudStore,
  ensureCloudStoreReady,
  getCloudStore,
  getCloudEmployees,
  getCloudCourses,
  getCloudLessons,
  isModuleReady,
  getModuleLoadState,
  markModuleLoading,
  markModuleReady,
  markModuleError,
  resetModuleLoadStates,
  MODULE_STATUS,
} from '../lib/cloudStore'
import { normalizeEmployee } from '../utils/employeeData'
import { createEmployeeWithAuth } from './employeeProvisioningService'
import { updateEmployeeAsAdmin } from './employeeAdminService'
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
import * as learningPathLocalAdapter from './learningPathLocalAdapter'
import * as learningPathSupabaseAdapter from './learningPathSupabaseAdapter'
import * as standardsLocalAdapter from './standardsLocalAdapter'
import * as standardsSupabaseAdapter from './standardsSupabaseAdapter'
import { markDevPerf, logDevPerf } from '../utils/devPerf'
import * as recruitmentLocalAdapter from './recruitmentLocalAdapter'
import * as recruitmentSupabaseAdapter from './recruitmentSupabaseAdapter'
import * as suppliersLocalAdapter from './suppliersLocalAdapter'
import * as suppliersSupabaseAdapter from './suppliersSupabaseAdapter'
import * as shiftLocalAdapter from './shiftLocalAdapter'
import * as shiftSupabaseAdapter from './shiftSupabaseAdapter'
import * as attendanceLocalAdapter from './attendanceLocalAdapter'
import * as attendanceSupabaseAdapter from './attendanceSupabaseAdapter'
import {
  getAllLearningPathsSync,
  getLearningPathByIdSync,
  getLearningPathsByRoleSync,
  getLearningPathCoursesSync,
  getUserLearningPathSync,
  getUserLearningPathsSync,
} from '../utils/learningPathData'
import {
  getAllStandardCategoriesSync,
  getAllStandardArticlesSync,
  getStandardArticleByIdSync,
  getStandardArticleBySlugSync,
  getPublishedStandardArticlesForUserSync,
  getUserStandardReadsSync,
  getStandardArticleReadStatsSync,
  generateUniqueSlug,
} from '../utils/standardsData'
import {
  getAllVacanciesSync,
  getPublishedVacanciesSync,
  getVacancyByIdSync,
  getVacancyBySlugSync,
  getPublishedVacancyBySlugSync,
  getCandidateQuestionsSync,
  getAllCandidateQuestionsSync,
  getAllCandidatesSync,
  getCandidatesByVacancySync,
  getCandidateByIdSync,
  generateUniqueVacancySlug,
  CANDIDATE_STATUS,
  getVacancyRoleLabel,
  getVacancyEmployeeRole,
} from '../utils/recruitmentData'
import {
  EMPLOYMENT_STATUS,
  getEmployeeById,
  todayEmployeeDateKey,
} from '../utils/employeeData'
import { prepareCandidatePhotoForSubmit } from './candidatePhotoService'
import {
  getAllSuppliersSync,
  getSupplierByIdSync,
} from '../utils/supplierData'
import {
  parseYearMonthFromDateKey,
  notifyRatingUpdated,
  getCurrentMonthState,
  calculateRatingsByEmployee,
  isRatingDebugEnabled,
  debugLogShiftRating,
  debugLogEmployeeMonthRating,
} from '../utils/attendanceData'

function getAdapter() {
  return isCloudMode() ? supabaseAdapter : localAdapter
}

function getTestAdapter() {
  return isCloudMode() ? testSupabaseAdapter : testLocalAdapter
}

function getLearningPathAdapter() {
  return isCloudMode() ? learningPathSupabaseAdapter : learningPathLocalAdapter
}

function getStandardsAdapter() {
  return isCloudMode() ? standardsSupabaseAdapter : standardsLocalAdapter
}

function getRecruitmentAdapter() {
  return isCloudMode() ? recruitmentSupabaseAdapter : recruitmentLocalAdapter
}

function getSuppliersAdapter() {
  return isCloudMode() ? suppliersSupabaseAdapter : suppliersLocalAdapter
}

function getShiftAdapter() {
  return isCloudMode() ? shiftSupabaseAdapter : shiftLocalAdapter
}

function getAttendanceAdapter() {
  return isCloudMode() ? attendanceSupabaseAdapter : attendanceLocalAdapter
}

export { isCloudMode, getDataModeLabel, getDataModeVariant }

let pendingInitialize = null
let bootstrapUserId = null
const modulePromises = {}
let backgroundPrefetchScheduled = false
let onModulesChanged = null

/** Prefetched after shell; procurement/receiving stay route-triggered. */
const BACKGROUND_MODULES = ['standards', 'recruitment', 'suppliers']

function notifyModulesChanged() {
  if (typeof onModulesChanged === 'function') {
    onModulesChanged()
  }
}

export function setCloudBootstrapListener(listener) {
  onModulesChanged = listener
}

export function resetCloudBootstrapState() {
  pendingInitialize = null
  bootstrapUserId = null
  backgroundPrefetchScheduled = false
  Object.keys(modulePromises).forEach((key) => {
    delete modulePromises[key]
  })
  clearCloudStore()
}

/** Map pathname → modules needed before page can show real empty/error states. */
export function getRouteCriticalModules(pathname = '') {
  const path = String(pathname || '')
  const academyOn = isAcademyModuleEnabled()
  if (path.includes('/platform/procurement') || path.includes('/platform/receiving')) {
    return ['suppliers', 'procurement', 'receiving']
  }
  if (path.includes('/platform/suppliers')) {
    return ['suppliers']
  }
  if (path.includes('/platform/standards') || path.includes('/standards')) {
    return ['standards']
  }
  if (
    path.includes('/platform/recruitment') ||
    path.includes('/vacancies') ||
    path.includes('/candidates')
  ) {
    return ['recruitment']
  }
  if (
    path.includes('/platform/academy') ||
    path.includes('/platform/admin') ||
    path.includes('/courses') ||
    path.includes('/course/')
  ) {
    // Academy UI is gated; do not pull learning data when the module is off.
    return academyOn ? ['employees', 'courses', 'academyLearning'] : []
  }
  if (path === '/platform' || path === '/platform/') {
    // Home no longer depends on academy core; suppliers stay in background prefetch.
    return academyOn ? ['employees', 'courses', 'suppliers'] : []
  }
  return []
}

const CORE_MODULE_KEY = '__coreEmployeesCourses'

async function loadEmployeesCoursesCore() {
  const core = await supabaseAdapter.fetchCoreAcademyData()
  ensureCloudStoreReady()
  patchCloudStore({
    employees: core.employees,
    courses: core.courses,
    lessons: core.lessons,
    assignments: core.assignments,
    progress: core.progress,
  })
  markModuleReady('employees')
  markModuleReady('courses')
  return core
}

async function ensureEmployeesCoursesCore() {
  if (isModuleReady('employees') && isModuleReady('courses')) {
    return getCloudStore()
  }
  if (modulePromises[CORE_MODULE_KEY]) {
    return modulePromises[CORE_MODULE_KEY]
  }

  markModuleLoading('employees')
  markModuleLoading('courses')
  notifyModulesChanged()

  modulePromises[CORE_MODULE_KEY] = (async () => {
    try {
      await loadEmployeesCoursesCore()
      notifyModulesChanged()
      return getCloudStore()
    } catch (error) {
      markModuleError('employees', error)
      markModuleError('courses', error)
      notifyModulesChanged()
      throw error
    } finally {
      delete modulePromises[CORE_MODULE_KEY]
    }
  })()

  return modulePromises[CORE_MODULE_KEY]
}

async function loadAcademyLearningModule() {
  await ensureEmployeesCoursesCore()
  const extras = await supabaseAdapter.fetchAcademyLearningExtras()
  ensureCloudStoreReady()
  patchCloudStore({
    tests: extras.tests,
    testQuestions: extras.testQuestions,
    testAttempts: extras.testAttempts,
    learningPaths: extras.learningPaths,
    learningPathCourses: extras.learningPathCourses,
    userLearningPaths: extras.userLearningPaths,
  })
  markModuleReady('academyLearning')
  return extras
}

async function loadModule(moduleName) {
  switch (moduleName) {
    case 'employees':
    case 'courses': {
      await ensureEmployeesCoursesCore()
      return
    }
    case 'academyLearning': {
      await loadAcademyLearningModule()
      return
    }
    case 'standards': {
      const data = await supabaseAdapter.fetchStandardsModuleData()
      patchCloudStore(data)
      markModuleReady('standards')
      return
    }
    case 'recruitment': {
      const data = await supabaseAdapter.fetchRecruitmentModuleData()
      patchCloudStore(data)
      markModuleReady('recruitment')
      return
    }
    case 'suppliers': {
      const data = await supabaseAdapter.fetchSuppliersModuleData()
      patchCloudStore(data)
      markModuleReady('suppliers')
      return
    }
    case 'procurement': {
      const data = await supabaseAdapter.fetchPurchasesModuleData()
      patchCloudStore(data)
      markModuleReady('procurement')
      return
    }
    case 'receiving': {
      const data = await supabaseAdapter.fetchReceivingModuleData()
      patchCloudStore(data)
      markModuleReady('receiving')
      return
    }
    default:
      throw new Error(`Unknown module: ${moduleName}`)
  }
}

/**
 * Load a single cloud module once. Concurrent callers share the same promise.
 * Safe to call from pages after shell is ready.
 */
export async function ensureModuleLoaded(moduleName) {
  if (!isCloudMode()) return null

  if (isModuleReady(moduleName)) return getCloudStore()

  if (moduleName === 'employees' || moduleName === 'courses') {
    return ensureEmployeesCoursesCore()
  }

  if (modulePromises[moduleName]) {
    return modulePromises[moduleName]
  }

  markModuleLoading(moduleName)
  notifyModulesChanged()

  modulePromises[moduleName] = (async () => {
    try {
      await loadModule(moduleName)
      notifyModulesChanged()
      return getCloudStore()
    } catch (error) {
      markModuleError(moduleName, error)
      notifyModulesChanged()
      throw error
    } finally {
      delete modulePromises[moduleName]
    }
  })()

  return modulePromises[moduleName]
}

export async function ensureModulesLoaded(moduleNames = []) {
  const unique = [...new Set(moduleNames)]
  await Promise.allSettled(unique.map((name) => ensureModuleLoaded(name)))
  return getCloudStore()
}

function scheduleBackgroundPrefetch(priorityModules = []) {
  if (backgroundPrefetchScheduled || !isCloudMode()) return
  backgroundPrefetchScheduled = true

  const run = async () => {
    const priority = [...new Set(priorityModules)]
    for (const name of priority) {
      try {
        await ensureModuleLoaded(name)
      } catch {
        // isolated — page will surface module error
      }
    }

    // Core academy cache for sync getters / dashboard (does not block shell).
    // Skip entirely while Academy product module is disabled — biggest bootstrap win.
    if (isAcademyModuleEnabled()) {
      try {
        await ensureModuleLoaded('employees')
        await ensureModuleLoaded('courses')
        await ensureModuleLoaded('academyLearning')
      } catch {
        // isolated
      }
    }

    const remaining = BACKGROUND_MODULES.filter(
      (name) => !isModuleReady(name) && getModuleLoadState(name) !== MODULE_STATUS.LOADING
    )

    // Small waves to avoid network storms.
    for (let i = 0; i < remaining.length; i += 2) {
      const wave = remaining.slice(i, i + 2)
      await Promise.allSettled(wave.map((name) => ensureModuleLoaded(name)))
    }
  }

  if (typeof queueMicrotask === 'function') {
    queueMicrotask(() => {
      void run()
    })
  } else {
    void run()
  }
}

/**
 * Progressive cloud bootstrap:
 * - does not block app shell
 * - prioritizes route-critical modules
 * - soft-isolates module failures
 */
export async function initializeData(options = {}) {
  const { mode = 'progressive', pathname = '', userId = null } = options

  if (!isCloudMode()) {
    clearCloudStore()
    return localAdapter.initializeLocal()
  }

  if (userId && bootstrapUserId && bootstrapUserId !== userId) {
    resetCloudBootstrapState()
  }
  if (userId) bootstrapUserId = userId

  if (mode === 'full') {
    if (pendingInitialize) return pendingInitialize
    pendingInitialize = (async () => {
      try {
        markDevPerf('academy-data-load')
        const data = await supabaseAdapter.fetchAllData()
        logDevPerf('academy-data-load')
        applyFullFetchResult(data)
        notifyModulesChanged()
        return data
      } finally {
        pendingInitialize = null
      }
    })()
    return pendingInitialize
  }

  // Progressive: kick route + background loads; resolve without waiting for full dump.
  const routeModules = getRouteCriticalModules(pathname)
  scheduleBackgroundPrefetch(routeModules)
  return getCloudStore()
}

function applyFullFetchResult(data) {
  const failures = data._moduleFailures || {}
  const {
    _moduleFailures: _ignored,
    ...storeData
  } = data

  ensureCloudStoreReady()
  patchCloudStore(storeData)

  markModuleReady('employees')
  markModuleReady('courses')

  if (failures.academyLearning) markModuleError('academyLearning', failures.academyLearning)
  else markModuleReady('academyLearning')

  if (failures.standards) markModuleError('standards', failures.standards)
  else markModuleReady('standards')

  if (failures.recruitment) markModuleError('recruitment', failures.recruitment)
  else markModuleReady('recruitment')

  if (failures.suppliers) markModuleError('suppliers', failures.suppliers)
  else markModuleReady('suppliers')

  if (failures.procurement) markModuleError('procurement', failures.procurement)
  else markModuleReady('procurement')

  if (failures.receiving) markModuleError('receiving', failures.receiving)
  else markModuleReady('receiving')
}

/** Обновить только закуп и приёмку (Realtime / polling) */
export async function refreshProcurementData() {
  if (!isCloudMode()) return null

  markModuleLoading('procurement')
  markModuleLoading('receiving')
  notifyModulesChanged()

  const [purchasesResult, receivingResult] = await Promise.allSettled([
    supabaseAdapter.fetchPurchasesModuleData(),
    supabaseAdapter.fetchReceivingModuleData(),
  ])

  ensureCloudStoreReady()

  if (purchasesResult.status === 'fulfilled') {
    patchCloudStore(purchasesResult.value)
    markModuleReady('procurement')
  } else {
    markModuleError('procurement', purchasesResult.reason)
  }

  if (receivingResult.status === 'fulfilled') {
    patchCloudStore(receivingResult.value)
    markModuleReady('receiving')
  } else {
    markModuleError('receiving', receivingResult.reason)
  }

  notifyModulesChanged()

  if (purchasesResult.status === 'rejected') {
    throw purchasesResult.reason
  }
  if (receivingResult.status === 'rejected') {
    throw receivingResult.reason
  }

  return {
    purchases: purchasesResult.value.purchases,
    receivingDocuments: receivingResult.value.receivingDocuments,
  }
}

export async function refreshData() {
  if (!isCloudMode()) {
    return initializeData()
  }

  resetModuleLoadStates()
  Object.keys(modulePromises).forEach((key) => {
    delete modulePromises[key]
  })
  backgroundPrefetchScheduled = false

  markDevPerf('academy-data-load')
  const data = await supabaseAdapter.fetchAllData()
  logDevPerf('academy-data-load')
  applyFullFetchResult(data)
  notifyModulesChanged()
  return data
}

// --- Employees ---

export async function getEmployees() {
  if (isCloudMode()) {
    await ensureModuleLoaded('employees')
    return getCloudEmployees() || []
  }
  return localAdapter.getEmployees()
}

export async function createEmployee(data) {
  if (isCloudMode()) {
    const fullName =
      data.name?.trim() ||
      `${data.firstName || ''} ${data.lastName || ''}`.trim()

    const row = await createEmployeeWithAuth({
      login: data.login,
      temporaryPassword: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      fullName,
      roleId: data.roleId,
      position: data.position,
      avatarUrl: data.avatarUrl,
      sourceCandidateId: data.sourceCandidateId,
    })

    const store = getCloudStore()
    if (store.loaded) {
      const employee = normalizeEmployee({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        name: row.full_name,
        login: row.login,
        role: row.role,
        roleId: row.role_id,
        position: row.position,
        employmentStatus: row.status,
        avatarUrl: row.avatar_url,
        hiredAt: row.hired_at,
        terminatedAt: row.terminated_at,
        workMode: row.work_mode,
        salaryCalculationType: row.salary_calculation_type,
        payrollParticipation: row.payroll_participation,
        createdAt: row.created_at,
        assignedCourseIds: data.assignedCourseIds || [],
        workLocationId: data.workLocationId || null,
      })
      store.employees = [...store.employees, employee]
    }

    return row.id
  }
  const id = await localAdapter.createEmployee(data)
  return id
}

export async function updateEmployee(id, updates) {
  if (isCloudMode()) {
    await updateEmployeeAsAdmin(id, updates)
    return
  }
  await getAdapter().updateEmployee(id, updates)
}

export async function deactivateEmployee(id) {
  if (isCloudMode()) {
    await updateEmployeeAsAdmin(id, {
      employmentStatus: 'terminated',
      terminatedAt: todayEmployeeDateKey(),
    })
    return
  }
  await getAdapter().deactivateEmployee(id)
}

export async function restoreEmployee(id) {
  if (isCloudMode()) {
    await updateEmployeeAsAdmin(id, {
      employmentStatus: 'active',
      terminatedAt: null,
    })
    return
  }
  await getAdapter().restoreEmployee(id)
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

export async function updateProfile(userId, { firstName, lastName, contactEmail }) {
  const trimmedFirst = firstName?.trim() || ''
  const trimmedLast = lastName?.trim() || ''
  const fullName = `${trimmedFirst} ${trimmedLast}`.trim()

  if (!trimmedFirst) {
    throw new Error('Укажите имя')
  }
  if (fullName.length < 2) {
    throw new Error('Имя и фамилия должны содержать минимум 2 символа')
  }

  try {
    await getAdapter().updateProfile(userId, {
      firstName: trimmedFirst,
      lastName: trimmedLast,
      contactEmail: contactEmail?.trim() || '',
    })
    if (isCloudMode()) await refreshData()
  } catch (err) {
    throw new Error(err.message || 'Не удалось сохранить профиль. Попробуйте позже.')
  }
}

export async function updateEmployeeAvatar(userId, avatarUrl, { previousAvatarUrl } = {}) {
  if (previousAvatarUrl && previousAvatarUrl !== avatarUrl) {
    const { deleteEmployeeAvatarFile } = await import('./employeeAvatarService')
    await deleteEmployeeAvatarFile(previousAvatarUrl)
  }

  await updateEmployee(userId, { avatarUrl: avatarUrl || null })
}

export async function removeEmployeeAvatar(userId) {
  const employee = getEmployeeById(userId)
  if (employee?.avatarUrl) {
    const { deleteEmployeeAvatarFile } = await import('./employeeAvatarService')
    await deleteEmployeeAvatarFile(employee.avatarUrl)
  }

  await updateEmployee(userId, { avatarUrl: null })
}

// --- Courses ---

export async function getCourses() {
  if (isCloudMode()) {
    await ensureModuleLoaded('courses')
    return getCloudCourses() || []
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

export async function deleteCourse(courseId) {
  await getAdapter().deleteCourse(courseId)
  if (isCloudMode()) await refreshData()
}

export async function restoreCourse(courseId) {
  await updateCourse(courseId, { status: 'active' })
}

export async function archiveCourse(courseId) {
  await hideCourse(courseId)
}

// --- Lessons ---

export async function getLessonsByCourse(courseId) {
  if (isCloudMode()) {
    await ensureModuleLoaded('courses')
    const lessons = getCloudLessons() || []
    return lessons.filter((l) => l.courseId === courseId)
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

export async function assignCourseToRole(roleId, courseId) {
  await getAdapter().assignCourseToRole(roleId, courseId)
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

// --- Learning paths (sync reads) ---

export function getLearningPaths() {
  return getAllLearningPathsSync()
}

export function getLearningPathById(pathId) {
  return getLearningPathByIdSync(pathId)
}

export function getLearningPathsByRole(role, options) {
  return getLearningPathsByRoleSync(role, options)
}

export function getLearningPathCourses(pathId) {
  return getLearningPathCoursesSync(pathId)
}

export function getUserLearningPath(userId) {
  return getUserLearningPathSync(userId)
}

export function getUserLearningPaths(userId) {
  return getUserLearningPathsSync(userId)
}

// --- Learning paths (async mutations) ---

export async function createLearningPath(pathData) {
  if (!pathData.title?.trim()) throw new Error('Укажите название маршрута')
  if (!pathData.role) throw new Error('Выберите роль для маршрута')
  const id = await getLearningPathAdapter().createLearningPath(pathData)
  if (isCloudMode()) await refreshData()
  return id
}

export async function updateLearningPath(pathId, updates) {
  if (updates.title != null && !updates.title.trim()) {
    throw new Error('Укажите название маршрута')
  }
  if (updates.role != null && !updates.role) {
    throw new Error('Выберите роль для маршрута')
  }
  await getLearningPathAdapter().updateLearningPath(pathId, updates)
  if (isCloudMode()) await refreshData()
}

export async function deleteLearningPath(pathId) {
  await getLearningPathAdapter().deleteLearningPath(pathId)
  if (isCloudMode()) await refreshData()
}

export async function publishLearningPath(pathId) {
  await getLearningPathAdapter().publishLearningPath(pathId)
  if (isCloudMode()) await refreshData()
}

export async function unpublishLearningPath(pathId) {
  await getLearningPathAdapter().unpublishLearningPath(pathId)
  if (isCloudMode()) await refreshData()
}

export async function archiveLearningPath(pathId) {
  await getLearningPathAdapter().archiveLearningPath(pathId)
  if (isCloudMode()) await refreshData()
}

export async function addCourseToLearningPath(pathId, courseId, options) {
  await getLearningPathAdapter().addCourseToLearningPath(pathId, courseId, options)
  if (isCloudMode()) await refreshData()
}

export async function removeCourseFromLearningPath(pathId, courseId) {
  await getLearningPathAdapter().removeCourseFromLearningPath(pathId, courseId)
  if (isCloudMode()) await refreshData()
}

export async function reorderLearningPathCourses(pathId, orderedCourseIds) {
  await getLearningPathAdapter().reorderLearningPathCourses(pathId, orderedCourseIds)
  if (isCloudMode()) await refreshData()
}

export async function updateLearningPathCourse(pathCourseId, updates) {
  await getLearningPathAdapter().updateLearningPathCourse(pathCourseId, updates)
  if (isCloudMode()) await refreshData()
}

export async function assignLearningPathToUser(userId, pathId, assignedBy = null) {
  const result = await getLearningPathAdapter().assignLearningPathToUser(
    userId,
    pathId,
    assignedBy
  )
  if (isCloudMode()) await refreshData()
  return result
}

export async function cancelUserLearningPath(userId, pathId) {
  await getLearningPathAdapter().cancelUserLearningPath(userId, pathId)
  if (isCloudMode()) await refreshData()
}

export async function completeUserLearningPath(userId, pathId) {
  await getLearningPathAdapter().completeUserLearningPath(userId, pathId)
  if (isCloudMode()) await refreshData()
}

// --- Standards (sync reads) ---

export function getStandardCategories() {
  return getAllStandardCategoriesSync()
}

export function getStandardArticles() {
  return getAllStandardArticlesSync()
}

export function getStandardArticleById(articleId) {
  return getStandardArticleByIdSync(articleId)
}

export function getStandardArticleBySlug(slug) {
  return getStandardArticleBySlugSync(slug)
}

export function getPublishedStandardArticlesForUser(user) {
  return getPublishedStandardArticlesForUserSync(user)
}

export function getUserStandardReads(userId) {
  return getUserStandardReadsSync(userId)
}

export function getStandardArticleReadStats(articleId) {
  return getStandardArticleReadStatsSync(articleId)
}

// --- Standards (async mutations) ---

export async function createStandardCategory(categoryData) {
  if (!categoryData.title?.trim()) throw new Error('Укажите название категории')
  const id = await getStandardsAdapter().createStandardCategory(categoryData)
  if (isCloudMode()) await refreshData()
  return id
}

export async function updateStandardCategory(categoryId, updates) {
  if (updates.title != null && !updates.title.trim()) {
    throw new Error('Укажите название категории')
  }
  await getStandardsAdapter().updateStandardCategory(categoryId, updates)
  if (isCloudMode()) await refreshData()
}

export async function archiveStandardCategory(categoryId) {
  await getStandardsAdapter().archiveStandardCategory(categoryId)
  if (isCloudMode()) await refreshData()
}

export async function deleteStandardCategory(categoryId) {
  await getStandardsAdapter().deleteStandardCategory(categoryId)
  if (isCloudMode()) await refreshData()
}

export async function reorderStandardCategories(orderedCategoryIds) {
  await getStandardsAdapter().reorderStandardCategories(orderedCategoryIds)
  if (isCloudMode()) await refreshData()
}

export async function createStandardArticle(articleData) {
  if (!articleData.title?.trim()) throw new Error('Укажите название статьи')
  if (!articleData.content?.trim()) throw new Error('Укажите содержание статьи')

  const articles = getAllStandardArticlesSync()
  const slug = articleData.slug || generateUniqueSlug(articleData.title, articles)

  const id = await getStandardsAdapter().createStandardArticle({
    ...articleData,
    slug,
  })
  if (isCloudMode()) await refreshData()
  return id
}

export async function updateStandardArticle(articleId, updates) {
  if (updates.title != null && !updates.title.trim()) {
    throw new Error('Укажите название статьи')
  }
  if (updates.content != null && !updates.content.trim()) {
    throw new Error('Укажите содержание статьи')
  }
  await getStandardsAdapter().updateStandardArticle(articleId, updates)
  if (isCloudMode()) await refreshData()
}

export async function publishStandardArticle(articleId) {
  await getStandardsAdapter().publishStandardArticle(articleId)
  if (isCloudMode()) await refreshData()
}

export async function unpublishStandardArticle(articleId) {
  await getStandardsAdapter().unpublishStandardArticle(articleId)
  if (isCloudMode()) await refreshData()
}

export async function archiveStandardArticle(articleId) {
  await getStandardsAdapter().archiveStandardArticle(articleId)
  if (isCloudMode()) await refreshData()
}

export async function deleteStandardArticle(articleId) {
  await getStandardsAdapter().deleteStandardArticle(articleId)
  if (isCloudMode()) await refreshData()
}

export async function markStandardArticleRead(articleId, userId) {
  const result = await getStandardsAdapter().markStandardArticleRead(articleId, userId)
  if (isCloudMode()) await refreshData()
  return result
}

export async function acknowledgeStandardArticle(articleId, userId) {
  const result = await getStandardsAdapter().acknowledgeStandardArticle(articleId, userId)
  if (isCloudMode()) await refreshData()
  return result
}

// --- Recruitment (sync reads) ---

export function getVacancies() {
  return getAllVacanciesSync()
}

export function getPublishedVacancies() {
  return getPublishedVacanciesSync()
}

export function getVacancyById(vacancyId) {
  return getVacancyByIdSync(vacancyId)
}

export function getVacancyBySlug(slug) {
  return getVacancyBySlugSync(slug)
}

export function getPublishedVacancyBySlug(slug) {
  return getPublishedVacancyBySlugSync(slug)
}

export function getCandidateQuestions(vacancyId) {
  return getCandidateQuestionsSync(vacancyId)
}

export function getAllCandidateQuestions() {
  return getAllCandidateQuestionsSync()
}

export function getCandidates() {
  return getAllCandidatesSync()
}

export function getCandidatesByVacancy(vacancyId) {
  return getCandidatesByVacancySync(vacancyId)
}

export function getCandidateById(candidateId) {
  return getCandidateByIdSync(candidateId)
}

// --- Recruitment (async mutations) ---

export async function createVacancy(vacancyData) {
  if (!vacancyData.title?.trim()) throw new Error('Укажите название вакансии')
  if (!vacancyData.role) throw new Error('Выберите роль для вакансии')
  const vacancies = getAllVacanciesSync()
  const slug = vacancyData.slug || generateUniqueVacancySlug(vacancyData.title, vacancies)
  const id = await getRecruitmentAdapter().createVacancy({ ...vacancyData, slug })
  if (isCloudMode()) await refreshData()
  return id
}

export async function updateVacancy(vacancyId, updates) {
  if (updates.title != null && !updates.title.trim()) {
    throw new Error('Укажите название вакансии')
  }
  await getRecruitmentAdapter().updateVacancy(vacancyId, updates)
  if (isCloudMode()) await refreshData()
}

export async function publishVacancy(vacancyId) {
  await getRecruitmentAdapter().publishVacancy(vacancyId)
  if (isCloudMode()) await refreshData()
}

export async function unpublishVacancy(vacancyId) {
  await getRecruitmentAdapter().unpublishVacancy(vacancyId)
  if (isCloudMode()) await refreshData()
}

export async function archiveVacancy(vacancyId) {
  await getRecruitmentAdapter().archiveVacancy(vacancyId)
  if (isCloudMode()) await refreshData()
}

export async function deleteVacancy(vacancyId) {
  await getRecruitmentAdapter().deleteVacancy(vacancyId)
  if (isCloudMode()) await refreshData()
}

export async function duplicateVacancy(vacancyId) {
  const id = await getRecruitmentAdapter().duplicateVacancy(vacancyId)
  if (isCloudMode()) await refreshData()
  return id
}

export async function createCandidateQuestion(vacancyId, questionData) {
  if (!questionData.questionText?.trim()) throw new Error('Укажите текст вопроса')
  if (!questionData.options?.length || questionData.options.length < 2) {
    throw new Error('Добавьте минимум 2 варианта ответа')
  }
  const id = await getRecruitmentAdapter().createCandidateQuestion(vacancyId, questionData)
  if (isCloudMode()) await refreshData()
  return id
}

export async function updateCandidateQuestion(questionId, updates) {
  await getRecruitmentAdapter().updateCandidateQuestion(questionId, updates)
  if (isCloudMode()) await refreshData()
}

export async function deleteCandidateQuestion(questionId) {
  await getRecruitmentAdapter().deleteCandidateQuestion(questionId)
  if (isCloudMode()) await refreshData()
}

export async function reorderCandidateQuestions(vacancyId, orderedQuestionIds) {
  await getRecruitmentAdapter().reorderCandidateQuestions(vacancyId, orderedQuestionIds)
  if (isCloudMode()) await refreshData()
}

export async function submitCandidateApplication(applicationData) {
  if (!applicationData.firstName?.trim()) throw new Error('Укажите имя')
  if (!applicationData.phone?.trim()) throw new Error('Укажите телефон')

  let photoPayload = { photoUrl: null, photoPath: null }

  if (applicationData.photoFile) {
    try {
      photoPayload = await prepareCandidatePhotoForSubmit(
        applicationData.photoFile,
        applicationData.vacancySlug
      )
    } catch (err) {
      throw new Error(err.message || 'Не удалось загрузить фото')
    }
  }

  const { photoFile, vacancySlug, ...rest } = applicationData

  const result = await getRecruitmentAdapter().submitCandidateApplication({
    ...rest,
    photoUrl: photoPayload.photoUrl,
    photoPath: photoPayload.photoPath,
  })

  if (isCloudMode()) await refreshData()

  return {
    ...result,
    localPhotoWarning: photoPayload.isLocalFallback
      ? 'В локальном режиме фото сохраняется только для демо-превью.'
      : null,
  }
}

export async function updateCandidateStatus(candidateId, status) {
  await getRecruitmentAdapter().updateCandidateStatus(candidateId, status)
  if (isCloudMode()) await refreshData()
}

export async function updateCandidateNotes(candidateId, notes) {
  await getRecruitmentAdapter().updateCandidateNotes(candidateId, notes)
  if (isCloudMode()) await refreshData()
}

export async function rejectCandidate(candidateId) {
  await getRecruitmentAdapter().rejectCandidate(candidateId)
  if (isCloudMode()) await refreshData()
}

export async function restoreCandidateToNew(candidateId) {
  await getRecruitmentAdapter().restoreCandidateToNew(candidateId)
  if (isCloudMode()) await refreshData()
}

export async function inviteCandidate(candidateId) {
  await getRecruitmentAdapter().inviteCandidate(candidateId)
  if (isCloudMode()) await refreshData()
}

export async function saveCandidateInterviewInvitation(candidateId, invitation) {
  await getRecruitmentAdapter().saveCandidateInterviewInvitation(candidateId, invitation)
  if (isCloudMode()) await refreshData()
}

export async function convertCandidateToTrainee(candidateId) {
  await getRecruitmentAdapter().convertCandidateToTrainee(candidateId)
  if (isCloudMode()) await refreshData()
}

export async function linkCandidateToEmployee(candidateId, userId) {
  const candidate = getCandidateByIdSync(candidateId)
  if (!candidate) throw new Error('Кандидат не найден')
  if (candidate.createdUserId) throw new Error('Сотрудник уже создан для этого кандидата')

  await getRecruitmentAdapter().linkCandidateToEmployee(candidateId, userId)
  if (isCloudMode()) await refreshData()
}

export async function hireCandidateAsUser(candidateId, userData, options = {}) {
  const candidate = getCandidateByIdSync(candidateId)
  if (!candidate) throw new Error('Кандидат не найден')

  const vacancy = candidate.vacancyId ? getVacancyByIdSync(candidate.vacancyId) : null
  const role = userData.role || getVacancyEmployeeRole(vacancy) || 'cashier'
  const asTrainee = options.asTrainee !== false && userData.employmentStatus !== EMPLOYMENT_STATUS.ACTIVE

  const employeePayload = {
    firstName: userData.firstName || candidate.firstName,
    lastName: userData.lastName || candidate.lastName,
    position: getVacancyRoleLabel(role),
    role,
    login: userData.login,
    password: userData.password,
    employmentStatus: userData.employmentStatus || EMPLOYMENT_STATUS.ACTIVE,
    assignedCourseIds: userData.assignedCourseIds || [],
    avatarUrl: userData.avatarUrl || candidate.photoUrl || null,
  }

  const newUserId = await createEmployee(employeePayload)

  if (userData.initialCourseId) {
    await assignCourseToEmployee(newUserId, userData.initialCourseId)
  }

  await getRecruitmentAdapter().markCandidateHired(
    candidateId,
    newUserId,
    CANDIDATE_STATUS.HIRED
  )

  if (isCloudMode()) await refreshData()
  return newUserId
}

export {
  getAllSuppliersSync,
  getSupplierByIdSync,
  getActiveSuppliersCount,
  filterSuppliers,
  formatSupplierCategories,
  formatMinOrderAmount,
  SUPPLIER_STATUS,
  SUPPLIER_STATUS_LABELS,
  SUPPLIER_STATUS_BADGE,
  PAYMENT_TYPE,
  PAYMENT_TYPE_LABELS,
  RETURN_POLICY,
  RETURN_POLICY_LABELS,
  SUPPLIER_STATUS_FILTER_OPTIONS,
} from '../utils/supplierData'

export function getSuppliers() {
  return getAllSuppliersSync()
}

export function getSupplierById(id) {
  return getSupplierByIdSync(id)
}

export async function createSupplier(supplierData) {
  if (!supplierData.name?.trim()) throw new Error('Укажите название поставщика')
  const id = await getSuppliersAdapter().createSupplier(supplierData)
  if (isCloudMode()) await refreshData()
  return id
}

export async function updateSupplier(supplierId, updates) {
  await getSuppliersAdapter().updateSupplier(supplierId, updates)
  if (isCloudMode()) await refreshData()
}

export async function deleteSupplier(supplierId) {
  await getSuppliersAdapter().deleteSupplier(supplierId)
  if (isCloudMode()) await refreshData()
}

export async function archiveSupplier(supplierId) {
  await getSuppliersAdapter().archiveSupplier(supplierId)
  if (isCloudMode()) await refreshData()
}

// --- Employee shifts / schedule ---

export async function getEmployeeShiftsForMonth(employeeId, year, month) {
  return getShiftAdapter().getShiftsForEmployeeMonth(Number(employeeId), year, month)
}

export async function getTeamShiftsForMonth(year, month, employeeIds = null) {
  return getShiftAdapter().getShiftsForMonth(year, month, employeeIds)
}

export async function saveEmployeeShift(employeeId, payload, createdBy = null) {
  const saved = await getShiftAdapter().upsertEmployeeShift(Number(employeeId), payload, createdBy)
  const { year, month } = parseYearMonthFromDateKey(saved.shiftDate)
  notifyRatingUpdated(year, month)
  return saved
}

export async function applyBulkEmployeeShifts(employeeId, entries, options = {}) {
  const count = await getShiftAdapter().bulkApplyEmployeeShifts(Number(employeeId), entries, options)
  if (count > 0 && entries.length > 0) {
    const months = new Set(
      entries.map((entry) => {
        const { year, month } = parseYearMonthFromDateKey(entry.shiftDate)
        return `${year}-${month}`
      })
    )
    for (const key of months) {
      const [year, month] = key.split('-').map(Number)
      notifyRatingUpdated(year, month)
    }
  }
  return count
}

export async function getWorkLocations() {
  return getAttendanceAdapter().getWorkLocations()
}

export async function saveWorkLocation(location) {
  return getAttendanceAdapter().saveWorkLocation(location)
}

export async function getAttendanceSettings() {
  return getAttendanceAdapter().getAttendanceSettings()
}

export async function saveAttendanceSettings(settings, updatedBy = null) {
  const saved = await getAttendanceAdapter().saveAttendanceSettings(settings, updatedBy)
  const { year, month } = getCurrentMonthState()
  notifyRatingUpdated(year, month)
  return saved
}

/** Вычисляет рейтинг сотрудников за месяц по сменам (без записи в БД) */
export async function computeEmployeeRatingsForMonth(year, month, employeeIds = null) {
  const ids = employeeIds?.map(Number) || []
  const [settings, shifts] = await Promise.all([
    getAttendanceSettings(),
    getTeamShiftsForMonth(year, month, ids.length ? ids : null),
  ])
  const now = new Date()
  const ratings = calculateRatingsByEmployee(shifts, ids, settings, now)

  if (isRatingDebugEnabled()) {
    ratings.forEach((result, employeeId) => {
      const employeeName = getEmployeeById(Number(employeeId))?.name || `Сотрудник #${employeeId}`
      const shiftsByEmployee = shifts.filter((shift) => Number(shift.employeeId) === Number(employeeId))
      shiftsByEmployee.forEach((shift) => {
        const dayEntries = result.entries.filter((entry) => entry.shiftId === shift.id)
        debugLogShiftRating(employeeName, shift, settings, dayEntries)
      })
      debugLogEmployeeMonthRating(employeeName, result.entries, result.stats.totalPoints)
    })
  }

  return ratings
}

export async function checkInEmployee(employeeId, coords) {
  const saved = await getAttendanceAdapter().checkInEmployee(Number(employeeId), coords)
  const { year, month } = parseYearMonthFromDateKey(saved.shiftDate)
  notifyRatingUpdated(year, month)
  return saved
}

export async function checkOutEmployee(employeeId, coords) {
  const saved = await getAttendanceAdapter().checkOutEmployee(Number(employeeId), coords)
  const { year, month } = parseYearMonthFromDateKey(saved.shiftDate)
  notifyRatingUpdated(year, month)
  return saved
}

export async function getTodayShiftForEmployee(employeeId) {
  return getAttendanceAdapter().getTodayShiftForEmployee(Number(employeeId))
}
