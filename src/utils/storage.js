/**
 * Утилиты для работы с localStorage
 */

const STORAGE_KEYS = {
  USER: 'shugyla_user',
  PROGRESS: 'shugyla_progress',
}

/** Сохранить текущего пользователя */
export function saveUser(user) {
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user))
}

/** Получить текущего пользователя */
export function getUser() {
  const data = localStorage.getItem(STORAGE_KEYS.USER)
  return data ? JSON.parse(data) : null
}

/** Удалить данные пользователя (выход) */
export function clearUser() {
  localStorage.removeItem(STORAGE_KEYS.USER)
}

/** Получить прогресс обучения всех пользователей */
export function getProgress() {
  const data = localStorage.getItem(STORAGE_KEYS.PROGRESS)
  return data ? JSON.parse(data) : {}
}

/** Сохранить прогресс обучения */
export function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(progress))
}

/** Получить прогресс конкретного пользователя по курсу */
export function getCourseProgress(userId, courseId) {
  const progress = getProgress()
  const userProgress = progress[userId] || {}
  return userProgress[courseId] || { completedLessons: [], testPassed: false }
}

/** Отметить урок как пройденный */
export function markLessonComplete(userId, courseId, lessonId) {
  const progress = getProgress()
  if (!progress[userId]) progress[userId] = {}
  if (!progress[userId][courseId]) {
    progress[userId][courseId] = { completedLessons: [], testPassed: false }
  }
  const completed = progress[userId][courseId].completedLessons
  if (!completed.includes(lessonId)) {
    completed.push(lessonId)
  }
  saveProgress(progress)
}
