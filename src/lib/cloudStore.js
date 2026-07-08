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
}

let store = { ...emptyStore }

export function getCloudStore() {
  return store
}

export function isCloudStoreLoaded() {
  return store.loaded
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
