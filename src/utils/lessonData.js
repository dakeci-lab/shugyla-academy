import { LESSONS as MOCK_LESSONS } from '../data/lessons'
import { isCloudMode } from '../lib/dataMode'
import { getCloudLessons } from '../lib/cloudStore'

const STORAGE_KEYS = {
  EXTRA_LESSONS: 'shugyla_extra_lessons',
  LESSON_EDITS: 'shugyla_lesson_edits',
  DELETED_LESSON_IDS: 'shugyla_deleted_lesson_ids',
}

function readJson(key, fallback) {
  const data = localStorage.getItem(key)
  return data ? JSON.parse(data) : fallback
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function parseDurationMinutes(duration) {
  if (!duration) return 15
  const match = duration.match(/(\d+)/)
  return match ? Number(match[1]) : 15
}

/** Нормализация урока к единой схеме */
export function normalizeLesson(lesson) {
  return {
    id: lesson.id,
    courseId: lesson.courseId,
    blockId: lesson.blockId ?? null,
    title: lesson.title || '',
    description: lesson.description || '',
    videoUrl: lesson.videoUrl || '',
    durationMinutes: lesson.durationMinutes ?? parseDurationMinutes(lesson.duration),
    summary: lesson.summary || lesson.content || '',
    mandatory: lesson.mandatory !== false,
    order: lesson.order ?? 1,
  }
}

function getDeletedIds() {
  return readJson(STORAGE_KEYS.DELETED_LESSON_IDS, [])
}

function isMockLesson(lessonId) {
  return MOCK_LESSONS.some((l) => l.id === lessonId)
}

/** Все уроки курса из localStorage (без облачного кэша) */
export function getLessonsForCourseLocal(courseId) {
  const deleted = getDeletedIds()
  const edits = readJson(STORAGE_KEYS.LESSON_EDITS, {})
  const extra = readJson(STORAGE_KEYS.EXTRA_LESSONS, [])

  const mock = MOCK_LESSONS.filter(
    (l) => l.courseId === courseId && !deleted.includes(l.id)
  ).map((l) => normalizeLesson({ ...l, ...edits[l.id] }))

  const custom = extra
    .filter((l) => l.courseId === courseId)
    .map((l) => normalizeLesson(l))

  return [...mock, ...custom].sort((a, b) => a.order - b.order)
}

/** Все уроки курса: mock + localStorage / облачный кэш */
export function getLessonsForCourse(courseId) {
  if (isCloudMode()) {
    const cached = getCloudLessons()
    if (cached) {
      return cached
        .filter((l) => l.courseId === courseId)
        .sort((a, b) => a.order - b.order)
    }
    return []
  }
  return getLessonsForCourseLocal(courseId)
}

/** Все уроки (для генерации id) */
function getAllLessonsFlat() {
  const deleted = getDeletedIds()
  const edits = readJson(STORAGE_KEYS.LESSON_EDITS, {})
  const extra = readJson(STORAGE_KEYS.EXTRA_LESSONS, [])

  const mock = MOCK_LESSONS.filter((l) => !deleted.includes(l.id)).map((l) =>
    normalizeLesson({ ...l, ...edits[l.id] })
  )
  return [...mock, ...extra.map(normalizeLesson)]
}

export function getNextLessonId() {
  const all = getAllLessonsFlat()
  const maxMock = Math.max(...MOCK_LESSONS.map((l) => l.id), 0)
  const maxAll = all.length > 0 ? Math.max(...all.map((l) => l.id)) : 0
  return Math.max(maxMock, maxAll, 9999) + 1
}

export function addLesson(courseId, lessonData) {
  const extra = readJson(STORAGE_KEYS.EXTRA_LESSONS, [])
  const existing = getLessonsForCourse(courseId)
  const newLesson = normalizeLesson({
    ...lessonData,
    id: getNextLessonId(),
    courseId,
    order: lessonData.order ?? existing.length + 1,
  })
  extra.push(newLesson)
  writeJson(STORAGE_KEYS.EXTRA_LESSONS, extra)
  return newLesson.id
}

export function updateLesson(lessonId, updates) {
  const extra = readJson(STORAGE_KEYS.EXTRA_LESSONS, [])
  const idx = extra.findIndex((l) => l.id === lessonId)

  if (idx >= 0) {
    extra[idx] = normalizeLesson({ ...extra[idx], ...updates })
    writeJson(STORAGE_KEYS.EXTRA_LESSONS, extra)
    return
  }

  const edits = readJson(STORAGE_KEYS.LESSON_EDITS, {})
  edits[lessonId] = { ...edits[lessonId], ...updates }
  writeJson(STORAGE_KEYS.LESSON_EDITS, edits)
}

export function deleteLesson(lessonId) {
  const extra = readJson(STORAGE_KEYS.EXTRA_LESSONS, [])
  const filtered = extra.filter((l) => l.id !== lessonId)
  if (filtered.length !== extra.length) {
    writeJson(STORAGE_KEYS.EXTRA_LESSONS, filtered)
    return
  }

  if (isMockLesson(lessonId)) {
    const deleted = getDeletedIds()
    if (!deleted.includes(lessonId)) {
      deleted.push(lessonId)
      writeJson(STORAGE_KEYS.DELETED_LESSON_IDS, deleted)
    }
  }
}

/** Изменить порядок уроков по массиву id */
export function reorderLessons(courseId, orderedIds) {
  orderedIds.forEach((id, index) => {
    updateLesson(id, { order: index + 1, courseId })
  })
}

export const EMPTY_LESSON = {
  title: '',
  description: '',
  videoUrl: '',
  durationMinutes: 15,
  summary: '',
  mandatory: true,
}
