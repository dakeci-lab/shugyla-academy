/**
 * Утилиты для работы с localStorage и облачным кэшем прогресса
 */

import { isCloudMode } from '../lib/dataMode'
import { getCloudProgress } from '../lib/cloudStore'

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
  if (isCloudMode()) {
    const cached = getCloudProgress()
    if (cached) return cached
    return {}
  }
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
  return (
    userProgress[courseId] || {
      completedLessons: [],
      testPassed: false,
      testScore: null,
    }
  )
}

/** Отметить урок как пройденный */
export function markLessonComplete(userId, courseId, lessonId) {
  const progress = getProgress()
  if (!progress[userId]) progress[userId] = {}
  if (!progress[userId][courseId]) {
    progress[userId][courseId] = {
      completedLessons: [],
      testPassed: false,
      testScore: null,
    }
  }
  const completed = progress[userId][courseId].completedLessons
  if (!completed.includes(lessonId)) {
    completed.push(lessonId)
  }
  saveProgress(progress)
}

/** Сохранить результат теста */
export function saveTestResult(userId, courseId, score, passed) {
  const progress = getProgress()
  if (!progress[userId]) progress[userId] = {}
  if (!progress[userId][courseId]) {
    progress[userId][courseId] = { completedLessons: [], testPassed: false, testScore: null }
  }
  progress[userId][courseId].testScore = score
  progress[userId][courseId].testPassed = passed
  saveProgress(progress)
}
