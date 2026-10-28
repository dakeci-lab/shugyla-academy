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
  isModuleFresh,
  MODULE_STATUS,
} from '../lib/cloudStore'
import { normalizeEmployee } from '../utils/employeeData'
import { createEmployeeWithAuth, checkEmployeeLoginAvailability } from './employeeProvisioningService'
import { updateEmployeeAsAdmin } from './employeeAdminService'
import * as supabaseAdapter from './supabaseDataAdapter'
import * as localAdapter from './localDataAdapter'
import { markDevPerf, logDevPerf } from '../utils/devPerf'
import * as suppliersLocalAdapter from './suppliersLocalAdapter'
import * as suppliersSupabaseAdapter from './suppliersSupabaseAdapter'
import {
  getEmployeeById,
  todayEmployeeDateKey,
} from '../utils/employeeData'
import {
  getAllSuppliersSync,
  getSupplierByIdSync,
} from '../utils/supplierData'

function getAdapter() {
  return isCloudMode() ? supabaseAdapter : localAdapter
}

function getSuppliersAdapter() {
  return isCloudMode() ? suppliersSupabaseAdapter : suppliersLocalAdapter
}

export { isCloudMode, getDataModeLabel, getDataModeVariant }

let pendingInitialize = null
let bootstrapUserId = null
const modulePromises = {}
let backgroundPrefetchScheduled = false
let onModulesChanged = null

/** Prefetched after shell; procurement stays route-triggered. */
const BACKGROUND_MODULES = ['suppliers']

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
  if (path.includes('/platform/procurement') || path.includes('/platform/orders')) {
    return ['suppliers', 'procurement']
  }
  if (path.includes('/platform/suppliers')) {
    return ['suppliers']
  }
  // «Пользователи» (Настройки) — единственный экран, которому нужен список сотрудников.
  // Рекрутинг, график и тайм-трекер скрыты (stage 12), /platform только перенаправляет.
  if (path.includes('/platform/settings/users')) {
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

  if (failures.suppliers) markModuleError('suppliers', failures.suppliers)
  else markModuleReady('suppliers')

  if (failures.procurement) markModuleError('procurement', failures.procurement)
  else markModuleReady('procurement')
}

let procurementRefreshInFlight = null
let procurementRefreshQueued = null

/**
 * Загрузка закупа — это десятки параллельных запросов; на планшете (WebKit) один из них изредка обрывается
 * («Load failed»), и тогда весь список оставался заглушкой с ошибкой. Один повтор после короткой паузы это снимает.
 */
async function withOneRetry(load, delayMs = 700) {
  try {
    return await load()
  } catch (error) {
    console.warn('[Загрузка закупа] повтор после ошибки', error)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    return load()
  }
}

async function runProcurementRefresh() {
  markModuleLoading('procurement')
  notifyModulesChanged()

  let purchasesResult
  try {
    purchasesResult = { status: 'fulfilled', value: await withOneRetry(() => supabaseAdapter.fetchPurchasesModuleData()) }
  } catch (reason) {
    purchasesResult = { status: 'rejected', reason }
  }

  ensureCloudStoreReady()

  if (purchasesResult.status === 'fulfilled') {
    patchCloudStore(purchasesResult.value)
    markModuleReady('procurement')
  } else {
    markModuleError('procurement', purchasesResult.reason)
  }

  notifyModulesChanged()

  if (purchasesResult.status === 'rejected') {
    throw purchasesResult.reason
  }

  return { purchases: purchasesResult.value.purchases }
}

function cachedProcurementResult() {
  return { purchases: getCloudStore().purchases }
}

/**
 * Обновить только закуп (Realtime / foreground refresh / после мутаций).
 *
 * - `maxAgeMs > 0`: если закуп уже загружен не позже `maxAgeMs` назад —
 *   сеть не трогаем. Для монтирования страницы, focus/visibility и т.п.
 * - без `maxAgeMs` (по умолчанию): принудительная загрузка — для мутаций и
 *   realtime-событий, которым нужны актуальные данные.
 * - Одновременные вызовы не плодят запросы: мягкий вызов делит текущий запрос,
 *   принудительный ждёт его и запускает один повторный (данные могли устареть
 *   в момент старта текущего запроса); несколько принудительных делят этот повтор.
 */
export async function refreshProcurementData({ maxAgeMs = 0 } = {}) {
  if (!isCloudMode()) return null

  const soft = maxAgeMs > 0
  if (soft && isModuleFresh('procurement', maxAgeMs)) {
    return cachedProcurementResult()
  }

  if (procurementRefreshQueued) return procurementRefreshQueued

  if (procurementRefreshInFlight) {
    if (soft) return procurementRefreshInFlight
    if (!procurementRefreshQueued) {
      procurementRefreshQueued = procurementRefreshInFlight
        .catch(() => {})
        .then(() => {
          procurementRefreshQueued = null
          return startProcurementRefresh()
        })
    }
    return procurementRefreshQueued
  }

  return startProcurementRefresh()
}

function startProcurementRefresh() {
  const run = runProcurementRefresh().finally(() => {
    if (procurementRefreshInFlight === run) procurementRefreshInFlight = null
  })
  procurementRefreshInFlight = run
  return run
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

export { checkEmployeeLoginAvailability }

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
      avatarUrl: data.avatarUrl,
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
        employmentStatus: row.status,
        avatarUrl: row.avatar_url,
        hiredAt: row.hired_at,
        terminatedAt: row.terminated_at,
        createdAt: row.created_at,
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
  const terminatedAt = todayEmployeeDateKey()
  if (isCloudMode()) {
    await updateEmployeeAsAdmin(id, {
      employmentStatus: 'terminated',
      terminatedAt,
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

/**
 * Single-supplier writes patch the in-memory cache instead of calling
 * refreshData(): a full reload re-fetched every module (employees, candidates,
 * all purchase order items…) and made one field edit take ~15 s.
 * Falls back to the full reload only when the cache cannot be patched.
 */
function replaceCachedSupplier(supplier) {
  const store = getCloudStore()
  if (!store.loaded || !supplier?.id) return false
  const current = store.suppliers || []
  if (!current.some((s) => s.id === supplier.id)) return false
  patchCloudStore({ suppliers: current.map((s) => (s.id === supplier.id ? supplier : s)) })
  notifyModulesChanged()
  return true
}

function removeCachedSupplier(supplierId) {
  const store = getCloudStore()
  if (!store.loaded) return false
  patchCloudStore({ suppliers: (store.suppliers || []).filter((s) => s.id !== supplierId) })
  notifyModulesChanged()
  return true
}

export async function updateSupplier(supplierId, updates) {
  const saved = await getSuppliersAdapter().updateSupplier(supplierId, updates)
  if (isCloudMode() && !replaceCachedSupplier(saved)) await refreshData()
}

export async function deleteSupplier(supplierId) {
  await getSuppliersAdapter().deleteSupplier(supplierId)
  if (isCloudMode() && !removeCachedSupplier(supplierId)) await refreshData()
}

export async function archiveSupplier(supplierId) {
  const saved = await getSuppliersAdapter().archiveSupplier(supplierId)
  if (isCloudMode() && !replaceCachedSupplier(saved)) await refreshData()
}

// --- Employee shifts / schedule ---

