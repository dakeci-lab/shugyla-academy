import { COURSES } from '../data/courses'
import { getCourseLessonCount } from './courseStructure'
import { isCloudMode } from '../lib/dataMode'
import { getCloudCourses } from '../lib/cloudStore'
import {
  normalizeCourse,
  countCourseTests,
  courseStatusToStorage,
  COURSE_STATUS,
  isActiveCourseStatus,
} from './courseData'
import { getAllTestsSync } from './testData'
import {
  getAllEmployees,
  getActiveEmployees,
  getTrainingEmployees,
  getEmployeeById,
  addEmployee,
  updateEmployee,
  deactivateEmployee,
  deleteEmployee,
  getEmployeeByLogin,
  isLoginTaken,
} from './employeeData'

export {
  getAllEmployees,
  getActiveEmployees,
  getTrainingEmployees,
  getEmployeeById,
  addEmployee,
  updateEmployee,
  deactivateEmployee,
  deleteEmployee,
  getEmployeeByLogin,
  isLoginTaken,
}

const STORAGE_KEYS = {
  COURSES: 'shugyla_courses',
  LEGACY_EXTRA: 'shugyla_extra_courses',
  LEGACY_EDITS: 'shugyla_course_edits',
}

function readJson(key, fallback) {
  const data = localStorage.getItem(key)
  return data ? JSON.parse(data) : fallback
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function getLocalTests() {
  try {
    return getAllTestsSync()
  } catch {
    return []
  }
}

function enrichCourse(course) {
  const normalized = normalizeCourse(course)
  return {
    ...normalized,
    lessonsCount: getCourseLessonCount(normalized.id),
    testsCount: countCourseTests(getLocalTests(), normalized.id),
  }
}

/** Миграция mock + legacy localStorage → единый массив курсов */
function seedCoursesIfEmpty() {
  if (localStorage.getItem(STORAGE_KEYS.COURSES)) return

  const extra = readJson(STORAGE_KEYS.LEGACY_EXTRA, [])
  const edits = readJson(STORAGE_KEYS.LEGACY_EDITS, {})
  const now = new Date().toISOString()

  const base = COURSES.map((course) =>
    normalizeCourse({
      ...course,
      ...edits[course.id],
      createdAt: course.createdAt || now,
      updatedAt: edits[course.id]?.updatedAt || now,
    })
  )

  const merged = [
    ...base,
    ...extra.map((course) =>
      normalizeCourse({
        ...course,
        createdAt: course.createdAt || now,
        updatedAt: course.updatedAt || now,
      })
    ),
  ]

  writeJson(STORAGE_KEYS.COURSES, merged)
}

function readCoursesRaw() {
  seedCoursesIfEmpty()
  return readJson(STORAGE_KEYS.COURSES, [])
}

function writeCoursesRaw(courses) {
  writeJson(STORAGE_KEYS.COURSES, courses)
}

/** Все курсы из localStorage */
export function getAllCoursesLocal() {
  return readCoursesRaw().map(enrichCourse)
}

/** Все курсы: localStorage / облачный кэш */
export function getAllCourses() {
  if (isCloudMode()) {
    const cached = getCloudCourses()
    if (cached) return cached.map(enrichCourse)
    return []
  }
  return getAllCoursesLocal()
}

/** Только активные курсы для сотрудников */
export function getActiveCourses() {
  return getAllCourses().filter((course) => isActiveCourseStatus(course.status))
}

export function getCourseById(id) {
  return getAllCourses().find((c) => c.id === id) || null
}

export function addCourse(course) {
  const courses = readCoursesRaw()
  const all = courses.map(normalizeCourse)
  const newId = all.length > 0 ? Math.max(...all.map((c) => c.id)) + 1 : 1
  const now = new Date().toISOString()

  const row = normalizeCourse({
    ...course,
    id: newId,
    status: course.status || COURSE_STATUS.DRAFT,
    createdAt: now,
    updatedAt: now,
  })

  courses.push({
    ...row,
    status: courseStatusToStorage(row.status),
  })
  writeCoursesRaw(courses)
  return newId
}

export function updateCourse(courseId, updates) {
  const courses = readCoursesRaw()
  const idx = courses.findIndex((c) => c.id === courseId)
  if (idx < 0) throw new Error('Курс не найден')

  const current = normalizeCourse(courses[idx])
  const next = normalizeCourse({
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  })

  courses[idx] = {
    ...next,
    status: courseStatusToStorage(next.status),
  }
  writeCoursesRaw(courses)
}

export function deleteCourse(courseId) {
  const courses = readCoursesRaw()
  const next = courses.filter((c) => c.id !== courseId)
  if (next.length === courses.length) throw new Error('Курс не найден')
  writeCoursesRaw(next)
}

export function archiveCourse(courseId) {
  updateCourse(courseId, { status: COURSE_STATUS.ARCHIVE })
}

export function restoreCourse(courseId) {
  updateCourse(courseId, { status: COURSE_STATUS.ACTIVE })
}
