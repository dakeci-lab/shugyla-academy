/** In-memory cache for cloud mode — populated after Supabase fetch */

const emptyStore = {
  loaded: false,
  employees: [],
  courses: [],
  lessons: [],
  assignments: [],
  progress: {},
  tests: [],
  testQuestions: [],
  testAttempts: [],
  learningPaths: [],
  learningPathCourses: [],
  userLearningPaths: [],
  standardCategories: [],
  standardArticles: [],
  standardArticleReads: [],
  vacancies: [],
  candidateQuestions: [],
  candidates: [],
  suppliers: [],
  purchases: [],
  receivingDocuments: [],
}

let store = { ...emptyStore }

export function getCloudStore() {
  return store
}

export function isCloudStoreLoaded() {
  return store.loaded
}

export function patchCloudStore(patch) {
  if (!store.loaded || !patch) return
  if (patch.purchases !== undefined) store.purchases = patch.purchases
  if (patch.receivingDocuments !== undefined) {
    store.receivingDocuments = patch.receivingDocuments
  }
}

export function setCloudStore(data) {
  store = {
    loaded: true,
    employees: data.employees || [],
    courses: data.courses || [],
    lessons: data.lessons || [],
    assignments: data.assignments || [],
    progress: data.progress || {},
    tests: data.tests || [],
    testQuestions: data.testQuestions || data.questions || [],
    testAttempts: data.testAttempts || data.attempts || [],
    learningPaths: data.learningPaths || [],
    learningPathCourses: data.learningPathCourses || [],
    userLearningPaths: data.userLearningPaths || [],
    standardCategories: data.standardCategories || [],
    standardArticles: data.standardArticles || [],
    standardArticleReads: data.standardArticleReads || [],
    vacancies: data.vacancies || [],
    candidateQuestions: data.candidateQuestions || [],
    candidates: data.candidates || [],
    suppliers: data.suppliers || [],
    purchases: data.purchases || [],
    receivingDocuments: data.receivingDocuments || [],
  }
}

export function clearCloudStore() {
  store = { ...emptyStore }
}

export function getCloudEmployees() {
  return store.loaded ? store.employees : null
}

export function getCloudCourses() {
  return store.loaded ? store.courses : null
}

export function getCloudLessons() {
  return store.loaded ? store.lessons : null
}

export function getCloudProgress() {
  return store.loaded ? store.progress : null
}

export function getCloudTests() {
  return store.loaded ? store.tests : null
}

export function getCloudTestQuestions() {
  return store.loaded ? store.testQuestions : null
}

export function getCloudTestAttempts() {
  return store.loaded ? store.testAttempts : null
}

export function getCloudLearningPaths() {
  return store.loaded ? store.learningPaths : null
}

export function getCloudLearningPathCourses() {
  return store.loaded ? store.learningPathCourses : null
}

export function getCloudUserLearningPaths() {
  return store.loaded ? store.userLearningPaths : null
}

export function getCloudStandardCategories() {
  return store.loaded ? store.standardCategories : null
}

export function getCloudStandardArticles() {
  return store.loaded ? store.standardArticles : null
}

export function getCloudStandardArticleReads() {
  return store.loaded ? store.standardArticleReads : null
}

export function getCloudVacancies() {
  return store.loaded ? store.vacancies : null
}

export function getCloudCandidateQuestions() {
  return store.loaded ? store.candidateQuestions : null
}

export function getCloudCandidates() {
  return store.loaded ? store.candidates : null
}

export function getCloudSuppliers() {
  return store.loaded ? store.suppliers : null
}

export function getCloudPurchases() {
  return store.loaded ? store.purchases : null
}

export function getCloudReceivingDocuments() {
  return store.loaded ? store.receivingDocuments : null
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
