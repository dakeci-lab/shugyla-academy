/** In-memory cache for cloud mode — populated after Supabase fetch */

const emptyStore = {
  loaded: false,
  employees: [],
  courses: [],
  lessons: [],
  assignments: [],
  progress: {},
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
