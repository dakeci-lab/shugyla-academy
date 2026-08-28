/** In-memory cache for cloud mode — populated progressively after Auth */

export const MODULE_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
}

/** Logical cloud data modules (bootstrap / route readiness). */
export const CLOUD_MODULES = [
  'employees',
  'recruitment',
  'suppliers',
  'procurement',
  'receiving',
]

const emptyStore = {
  loaded: false,
  employees: [],
  vacancies: [],
  candidateQuestions: [],
  candidates: [],
  suppliers: [],
  purchases: [],
  receivingDocuments: [],
}

function createIdleModuleStates() {
  return Object.fromEntries(CLOUD_MODULES.map((name) => [name, MODULE_STATUS.IDLE]))
}

let store = { ...emptyStore }
let moduleStates = createIdleModuleStates()
let moduleErrors = {}
/** Sticky per-module flag — once true, stays true until clearCloudStore(). Lets a
 *  background reload (module state bounced back to idle/loading) keep serving the
 *  last known-good data instead of the UI flashing empty mid-refresh. */
function createUnreachedModuleFlags() {
  return Object.fromEntries(CLOUD_MODULES.map((name) => [name, false]))
}
let moduleEverReady = createUnreachedModuleFlags()

function assertModuleName(moduleName) {
  if (!CLOUD_MODULES.includes(moduleName)) {
    throw new Error(`Unknown cloud module: ${moduleName}`)
  }
}

export function getCloudStore() {
  return store
}

/** @deprecated Prefer getModuleLoadState / isModuleReady. Kept for compatibility. */
export function isCloudStoreLoaded() {
  return store.loaded
}

/** Ensure in-memory store can accept procurement patches even after a partial boot. */
export function ensureCloudStoreReady() {
  if (store.loaded) return
  store = { ...store, loaded: true }
}

export function getModuleLoadState(moduleName) {
  assertModuleName(moduleName)
  return moduleStates[moduleName] || MODULE_STATUS.IDLE
}

export function getAllModuleLoadStates() {
  return { ...moduleStates }
}

export function isModuleReady(moduleName) {
  return getModuleLoadState(moduleName) === MODULE_STATUS.READY
}

export function isModuleLoading(moduleName) {
  return getModuleLoadState(moduleName) === MODULE_STATUS.LOADING
}

export function getModuleError(moduleName) {
  assertModuleName(moduleName)
  return moduleErrors[moduleName] || null
}

export function markModuleLoading(moduleName) {
  assertModuleName(moduleName)
  moduleStates = { ...moduleStates, [moduleName]: MODULE_STATUS.LOADING }
  delete moduleErrors[moduleName]
}

export function markModuleReady(moduleName) {
  assertModuleName(moduleName)
  moduleStates = { ...moduleStates, [moduleName]: MODULE_STATUS.READY }
  moduleEverReady = { ...moduleEverReady, [moduleName]: true }
  delete moduleErrors[moduleName]
  ensureCloudStoreReady()
}

export function markModuleError(moduleName, error) {
  assertModuleName(moduleName)
  moduleStates = { ...moduleStates, [moduleName]: MODULE_STATUS.ERROR }
  moduleErrors[moduleName] =
    error instanceof Error ? error : new Error(String(error || 'Module load failed'))
  ensureCloudStoreReady()
}

export function resetModuleLoadStates() {
  moduleStates = createIdleModuleStates()
  moduleErrors = {}
}

export function patchCloudStore(patch) {
  if (!patch) return
  if (!store.loaded) {
    ensureCloudStoreReady()
  }
  if (patch.employees !== undefined) store.employees = patch.employees
  if (patch.vacancies !== undefined) store.vacancies = patch.vacancies
  if (patch.candidateQuestions !== undefined) {
    store.candidateQuestions = patch.candidateQuestions
  }
  if (patch.candidates !== undefined) store.candidates = patch.candidates
  if (patch.suppliers !== undefined) store.suppliers = patch.suppliers
  if (patch.purchases !== undefined) store.purchases = patch.purchases
  if (patch.receivingDocuments !== undefined) {
    store.receivingDocuments = patch.receivingDocuments
  }
}

export function setCloudStore(data) {
  store = {
    loaded: true,
    employees: data.employees || [],
    vacancies: data.vacancies || [],
    candidateQuestions: data.candidateQuestions || [],
    candidates: data.candidates || [],
    suppliers: data.suppliers || [],
    purchases: data.purchases || [],
    receivingDocuments: data.receivingDocuments || [],
  }

  for (const name of CLOUD_MODULES) {
    markModuleReady(name)
  }
}

export function clearCloudStore() {
  store = { ...emptyStore }
  resetModuleLoadStates()
  moduleEverReady = createUnreachedModuleFlags()
}

function readWhenReady(moduleName, value) {
  if (isModuleReady(moduleName)) return value
  // A background reload (save/refresh) bounced this module back to idle/loading —
  // once it has loaded successfully before, keep serving that data instead of
  // flashing an empty list until the refetch resolves.
  if (moduleEverReady[moduleName]) return value
  return null
}

export function getCloudEmployees() {
  return readWhenReady('employees', store.employees)
}

export function getCloudVacancies() {
  return readWhenReady('recruitment', store.vacancies)
}

export function getCloudCandidateQuestions() {
  return readWhenReady('recruitment', store.candidateQuestions)
}

export function getCloudCandidates() {
  return readWhenReady('recruitment', store.candidates)
}

export function getCloudSuppliers() {
  return readWhenReady('suppliers', store.suppliers)
}

export function getCloudPurchases() {
  return readWhenReady('procurement', store.purchases)
}

export function getCloudReceivingDocuments() {
  return readWhenReady('receiving', store.receivingDocuments)
}

export function upsertCloudPurchase(order) {
  if (!store.loaded || !order) return
  const list = store.purchases || []
  const idx = list.findIndex((item) => item.id === order.id)
  if (idx >= 0) {
    list[idx] = order
  } else {
    list.unshift(order)
  }
  store.purchases = list
}

export function upsertCloudReceivingDocument(document) {
  if (!store.loaded || !document) return
  const list = store.receivingDocuments || []
  const idx = list.findIndex((item) => item.id === document.id)
  if (idx >= 0) {
    list[idx] = document
  } else {
    list.unshift(document)
  }
  store.receivingDocuments = list
}

export function patchCloudPurchase(orderId, patch) {
  if (!store.loaded) return
  store.purchases = (store.purchases || []).map((item) =>
    item.id === orderId ? { ...item, ...patch } : item
  )
}

export function patchCloudReceivingDocument(documentId, patch) {
  if (!store.loaded) return
  store.receivingDocuments = (store.receivingDocuments || []).map((item) =>
    item.id === documentId ? { ...item, ...patch } : item
  )
}

export function removeCloudPurchase(orderId) {
  if (!store.loaded) return
  store.purchases = (store.purchases || []).filter((item) => item.id !== orderId)
}

export function removeCloudReceivingByPurchaseId(purchaseOrderId) {
  if (!store.loaded) return
  store.receivingDocuments = (store.receivingDocuments || []).filter(
    (item) => item.purchaseOrderId !== purchaseOrderId
  )
}
