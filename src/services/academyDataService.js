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
import * as learningPathLocalAdapter from './learningPathLocalAdapter'
import * as learningPathSupabaseAdapter from './learningPathSupabaseAdapter'
import * as standardsLocalAdapter from './standardsLocalAdapter'
import * as standardsSupabaseAdapter from './standardsSupabaseAdapter'
import * as recruitmentLocalAdapter from './recruitmentLocalAdapter'
import * as recruitmentSupabaseAdapter from './recruitmentSupabaseAdapter'
import * as suppliersLocalAdapter from './suppliersLocalAdapter'
import * as suppliersSupabaseAdapter from './suppliersSupabaseAdapter'
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
} from '../utils/recruitmentData'
import { EMPLOYMENT_STATUS } from '../utils/employeeData'
import { prepareCandidatePhotoForSubmit } from './candidatePhotoService'
import {
  getAllSuppliersSync,
  getSupplierByIdSync,
} from '../utils/supplierData'

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

export async function inviteCandidate(candidateId) {
  await getRecruitmentAdapter().inviteCandidate(candidateId)
  if (isCloudMode()) await refreshData()
}

export async function convertCandidateToTrainee(candidateId) {
  await getRecruitmentAdapter().convertCandidateToTrainee(candidateId)
  if (isCloudMode()) await refreshData()
}

export async function hireCandidateAsUser(candidateId, userData, options = {}) {
  const candidate = getCandidateByIdSync(candidateId)
  if (!candidate) throw new Error('Кандидат не найден')

  const vacancy = candidate.vacancyId ? getVacancyByIdSync(candidate.vacancyId) : null
  const role = userData.role || vacancy?.role || 'cashier'
  const asTrainee = options.asTrainee !== false && userData.employmentStatus !== EMPLOYMENT_STATUS.ACTIVE

  const employeePayload = {
    firstName: userData.firstName || candidate.firstName,
    lastName: userData.lastName || candidate.lastName,
    position: userData.position || getVacancyRoleLabel(role),
    role,
    login: userData.login,
    password: userData.password,
    employmentStatus: userData.employmentStatus || EMPLOYMENT_STATUS.INTERNSHIP,
    assignedCourseIds: userData.assignedCourseIds || [],
    avatarUrl: userData.avatarUrl || candidate.photoUrl || null,
  }

  const newUserId = await createEmployee(employeePayload)

  if (userData.learningPathId) {
    await assignLearningPathToUser(newUserId, userData.learningPathId)
  }

  await getRecruitmentAdapter().markCandidateHired(
    candidateId,
    newUserId,
    asTrainee ? CANDIDATE_STATUS.TRAINEE : CANDIDATE_STATUS.HIRED
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
