import { COURSES } from '../data/courses'
import { getRole } from '../data/roles'
import { getCourseLessonCount } from './courseStructure'
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
  EXTRA_COURSES: 'shugyla_extra_courses',
  COURSE_EDITS: 'shugyla_course_edits',
}

function readJson(key, fallback) {
  const data = localStorage.getItem(key)
  return data ? JSON.parse(data) : fallback
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

/** Все курсы: mock data + правки + новые */
export function getAllCourses() {
  const extra = readJson(STORAGE_KEYS.EXTRA_COURSES, [])
  const edits = readJson(STORAGE_KEYS.COURSE_EDITS, {})
  const base = COURSES.map((course) => ({
    ...course,
    status: course.status || 'published',
    ...edits[course.id],
  }))
  return [...base, ...extra].map((course) => ({
    ...course,
    lessonsCount: getCourseLessonCount(course.id),
    blocksCount: course.blocksCount ?? 1,
  }))
}

/** Создать курс в localStorage */
export function addCourse(course) {
  const extra = readJson(STORAGE_KEYS.EXTRA_COURSES, [])
  const all = getAllCourses()
  const newId = all.length > 0 ? Math.max(...all.map((c) => c.id)) + 1 : 1

  extra.push({
    ...course,
    id: newId,
    status: course.status || 'draft',
    blocksCount: course.blocksCount || 1,
    imageColor: course.imageColor || '#2d8f4e',
    duration: course.duration || '—',
  })
  writeJson(STORAGE_KEYS.EXTRA_COURSES, extra)
  return newId
}

/** Обновить курс (mock или localStorage) */
export function updateCourse(courseId, updates) {
  const extra = readJson(STORAGE_KEYS.EXTRA_COURSES, [])
  const extraIndex = extra.findIndex((c) => c.id === courseId)

  if (extraIndex >= 0) {
    extra[extraIndex] = { ...extra[extraIndex], ...updates }
    writeJson(STORAGE_KEYS.EXTRA_COURSES, extra)
    return
  }

  const edits = readJson(STORAGE_KEYS.COURSE_EDITS, {})
  edits[courseId] = { ...edits[courseId], ...updates }
  writeJson(STORAGE_KEYS.COURSE_EDITS, edits)
}

/** Найти курс по id */
export function getCourseById(id) {
  return getAllCourses().find((c) => c.id === id) || null
}
