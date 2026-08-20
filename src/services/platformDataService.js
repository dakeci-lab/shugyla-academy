import { isCloudMode, getDataModeLabel, getDataModeVariant } from '../lib/dataMode'
import {
  clearCloudStore,
  patchCloudStore,
  ensureCloudStoreReady,
  getCloudStore,
  getCloudEmployees,
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
import * as localAdapter from './localDataAdapter'
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
const BACKGROUND_MODULES = ['recruitment', 'suppliers']

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
  if (path.includes('/platform/procurement') || path.includes('/platform/receiving')) {
    return ['suppliers', 'procurement', 'receiving']
  }
  if (path.includes('/platform/suppliers')) {
    return ['suppliers']
  }
  // Internal HR only — never match public /vacancies or /apply.
  if (path.includes('/platform/hr') || path.includes('/platform/recruitment')) {
    return ['recruitment']
  }
  if (path === '/platform' || path === '/platform/') {
    // Home: employees are operational; suppliers stay in background prefetch.
    return ['employees']
  }
  if (path.includes('/platform/employees') || path.includes('/platform/dashboard')) {
    return ['employees']
  }
  return []
}

const EMPLOYEES_MODULE_KEY = '__coreEmployees'

async function loadEmployeesCore() {
  const core = await supabaseAdapter.fetchCoreEmployeeData()
  ensureCloudStoreReady()
  patchCloudStore({
    employees: core.employees,
  })
  markModuleReady('employees')
  return core
}

async function ensureEmployeesCore() {
  if (isModuleReady('employees')) {
    return getCloudStore()
  }
  if (modulePromises[EMPLOYEES_MODULE_KEY]) {
    return modulePromises[EMPLOYEES_MODULE_KEY]
  }

  markModuleLoading('employees')
  notifyModulesChanged()

  modulePromises[EMPLOYEES_MODULE_KEY] = (async () => {
    try {
      await loadEmployeesCore()
      notifyModulesChanged()
      return getCloudStore()
    } catch (error) {
      markModuleError('employees', error)
      notifyModulesChanged()
      throw error
    } finally {
      delete modulePromises[EMPLOYEES_MODULE_KEY]
    }
  })()

  return modulePromises[EMPLOYEES_MODULE_KEY]
}

async function loadModule(moduleName) {
  switch (moduleName) {
    case 'employees': {
      await ensureEmployeesCore()
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

  if (moduleName === 'employees') {
    return ensureEmployeesCore()
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

  if (failures.recruitment) markModuleError('recruitment', failures.recruitment)
  else markModuleReady('recruitment')

  if (failures.suppliers) markModuleError('suppliers', failures.suppliers)
  else markModuleReady('suppliers')

  if (failures.procurement) markModuleError('procurement', failures.procurement)
  else markModuleReady('procurement')

  if (failures.receiving) markModuleError('receiving', failures.receiving)
  else markModuleReady('receiving')
}

/** Обновить только закуп и приёмку (Realtime / foreground refresh) */
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
      positionId: data.positionId || data.position_id || undefined,
      // Legacy text only as last-resort fallback for old callers; new UI sends positionId.
      position: data.positionId ? undefined : data.position,
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
        positionId: row.position_id ?? null,
        positionName: row.position_name ?? null,
        positionGroupId: row.position_group_id ?? null,
        positionGroupName: row.position_group_name ?? null,
        positionSortOrder: row.position_sort_order ?? null,
        positionGroupSortOrder: row.position_group_sort_order ?? null,
        positionIsActive: row.position_is_active ?? null,
        positionGroupIsActive: row.position_group_is_active ?? null,
        employmentStatus: row.status,
        avatarUrl: row.avatar_url,
        hiredAt: row.hired_at,
        terminatedAt: row.terminated_at,
        workMode: row.work_mode,
        salaryCalculationType: row.salary_calculation_type,
        payrollParticipation: row.payroll_participation,
        createdAt: row.created_at,
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
  await maybeClearLocalShiftsAfterTermination(id, updates)
}

export async function deactivateEmployee(id) {
  const terminatedAt = todayEmployeeDateKey()
  if (isCloudMode()) {
    await updateEmployeeAsAdmin(id, {
      employmentStatus: 'terminated',
      terminatedAt,
    })
    return
  }
  await getAdapter().deactivateEmployee(id)
  await shiftLocalAdapter.clearEmployeeShiftsAfterTermination(Number(id), terminatedAt)
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

async function maybeClearLocalShiftsAfterTermination(id, updates) {
  const status = updates?.employmentStatus ?? updates?.status
  const isTerm =
    status === 'terminated' || status === 'inactive' || status === 'deactivated'
  if (!isTerm) return
  const terminatedAt =
    updates?.terminatedAt != null && String(updates.terminatedAt).trim() !== ''
      ? String(updates.terminatedAt).trim().slice(0, 10)
      : todayEmployeeDateKey()
  await shiftLocalAdapter.clearEmployeeShiftsAfterTermination(Number(id), terminatedAt)
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

// --- Auth ---

export async function authenticateUser(loginValue, password) {
  return getAdapter().authenticateUser(loginValue, password)
}

// --- Migration (employees only) ---

export async function migrateLocalDataToCloud() {
  if (!isCloudMode()) {
    throw new Error('Supabase не настроен. Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.')
  }

  const snapshot = localAdapter.collectLocalSnapshot()
  await supabaseAdapter.upsertMigrationBatch(snapshot)
  await refreshData()
  return snapshot.counts
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
  if (!vacancyData.positionId) throw new Error('Выберите должность')
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
  if (Object.prototype.hasOwnProperty.call(updates, 'positionId') && !updates.positionId) {
    throw new Error('Выберите должность')
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

export async function saveVacancyApplicationForm(vacancyId, payload) {
  const adapter = getRecruitmentAdapter()
  if (typeof adapter.saveVacancyApplicationForm !== 'function') {
    throw new Error('Сохранение анкеты недоступно в этом режиме')
  }
  const result = await adapter.saveVacancyApplicationForm(vacancyId, payload)
  if (isCloudMode()) await refreshData()
  return result
}

export async function createCandidateQuestion(vacancyId, questionData) {
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
  if (!applicationData.vacancyId) throw new Error('Вакансия не указана')
  if (applicationData.formVersion == null) throw new Error('Анкета устарела. Обновите страницу.')

  let photoPayload = {
    photoUrl: null,
    photoPath: null,
    photoUploadId: applicationData.photoUploadId || null,
  }

  // Prefer pre-uploaded session from the form (avoids double upload).
  if (applicationData.photoFile && !applicationData.photoUploadId) {
    try {
      photoPayload = await prepareCandidatePhotoForSubmit(applicationData.photoFile, {
        vacancyId: applicationData.vacancyId,
        formVersion: applicationData.formVersion,
      })
    } catch (err) {
      throw new Error(err.message || 'Не удалось загрузить фото')
    }
  }

  const { photoFile, vacancySlug, ...rest } = applicationData

  // Prefer publicApplySubmitService for /apply — this path must not refresh PlatformData.
  const result = await getRecruitmentAdapter().submitCandidateApplication({
    ...rest,
    photoUrl: photoPayload.photoUrl,
    photoPath: photoPayload.photoPath,
    photoUploadId: photoPayload.photoUploadId,
  })

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
  const positionId = userData.positionId || userData.position_id || null
  if (!positionId) {
    throw new Error('Укажите должность сотрудника')
  }

  const employeePayload = {
    firstName: userData.firstName || candidate.firstName,
    lastName: userData.lastName || candidate.lastName,
    positionId,
    role,
    roleId: userData.roleId || null,
    login: userData.login,
    password: userData.password,
    employmentStatus: userData.employmentStatus || EMPLOYMENT_STATUS.ACTIVE,
    // Prefer explicit employee avatar; candidate photos are private and transferred below.
    avatarUrl: userData.avatarUrl || null,
  }

  const newUserId = await createEmployee(employeePayload)

  await getRecruitmentAdapter().markCandidateHired(
    candidateId,
    newUserId,
    CANDIDATE_STATUS.HIRED
  )

  if (isCloudMode() && !employeePayload.avatarUrl) {
    try {
      const { transferCandidatePhotoToEmployee } = await import('./candidatePhotoService')
      const avatarUrl = await transferCandidatePhotoToEmployee(candidate, newUserId)
      if (avatarUrl) await updateEmployee(newUserId, { avatarUrl })
    } catch {
      /* hire succeeds even if photo copy fails */
    }
  }

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

export async function getEmployeeShiftsForDateRange(employeeId, dateFrom, dateTo) {
  return getShiftAdapter().getShiftsForEmployeeDateRange(
    Number(employeeId),
    dateFrom,
    dateTo
  )
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

export async function deleteEmployeeShiftDay(employeeId, shiftDate) {
  const result = await getShiftAdapter().deleteEmployeeShift(Number(employeeId), shiftDate)
  const { year, month } = parseYearMonthFromDateKey(shiftDate)
  notifyRatingUpdated(year, month)
  return result
}

export async function clearEmployeeShiftsFromDate(employeeId, fromDate) {
  const result = await getShiftAdapter().clearEmployeeShiftsFromDate(
    Number(employeeId),
    fromDate
  )
  const { year, month } = parseYearMonthFromDateKey(fromDate)
  notifyRatingUpdated(year, month)
  return result
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
