import { getProgress, getCourseProgress } from './storage'
import { getCoursesForRole } from './auth'
import { getAllCourses, getTrainingEmployees } from './adminData'
import {
  getCourseLessonCount,
  calcLessonProgress,
  getCourseCompletionStatus,
} from './courseStructure'

/** Процент прогресса сотрудника по всем доступным курсам */
export function getEmployeeProgressPercent(userId, role) {
  const courses = getCoursesForRole(role)
  if (courses.length === 0) return 0

  let totalLessons = 0
  let completedLessons = 0

  courses.forEach((course) => {
    const progress = getCourseProgress(userId, course.id)
    const count = getCourseLessonCount(course.id)
    totalLessons += count
    const completed = progress.completedLessons.length
    completedLessons += Math.min(completed, count)
  })

  return totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
}

/** Завершил ли сотрудник все доступные курсы (100% уроков) */
export function hasCompletedAllCourses(userId, role) {
  const courses = getCoursesForRole(role)
  return courses.every((course) => {
    const prog = getCourseProgress(userId, course.id)
    return calcLessonProgress(prog.completedLessons, course.id) === 100
  })
}

/** Статус обучения сотрудника для таблицы «Сотрудники» */
export function getEmployeeTrainingStatus(userId, role) {
  const percent = getEmployeeProgressPercent(userId, role)
  if (percent === 0) return { label: 'Не начал', type: 'idle' }
  if (percent === 100) return { label: 'Завершил', type: 'done' }
  return { label: 'В процессе', type: 'progress' }
}

/**
 * Статус аттестации:
 * - not_started — не начал
 * - in_progress — в процессе
 * - passed — сдал тест
 * - failed — все уроки пройдены, тест не сдан
 */
export function getCertificationStatus(userId, role) {
  const courses = getCoursesForRole(role)
  if (courses.length === 0) return 'not_started'

  const progresses = courses.map((c) => ({
    course: c,
    progress: getCourseProgress(userId, c.id),
  }))

  const totalCompleted = progresses.reduce(
    (sum, { progress }) => sum + progress.completedLessons.length,
    0
  )
  if (totalCompleted === 0) return 'not_started'

  const anyPassed = progresses.some(({ progress }) => progress.testPassed)
  if (anyPassed) return 'passed'

  const anyFailed = progresses.some(({ course, progress }) => {
    const total = getCourseLessonCount(course.id)
    return progress.completedLessons.length >= total && total > 0 && !progress.testPassed
  })
  if (anyFailed) return 'failed'

  return 'in_progress'
}

export const CERTIFICATION_LABELS = {
  not_started: 'Не начал',
  in_progress: 'В процессе',
  passed: 'Сдал',
  failed: 'Не сдал',
}

/** Сводка по статусам аттестации */
export function getCertificationSummary() {
  const employees = getTrainingEmployees()
  const summary = {
    not_started: 0,
    in_progress: 0,
    passed: 0,
    failed: 0,
  }

  employees.forEach((emp) => {
    const status = getCertificationStatus(emp.id, emp.role)
    summary[status]++
  })

  return summary
}

/** Сводная статистика для раздела «Обзор» */
export function getOverviewStats() {
  const employees = getTrainingEmployees()
  const courses = getAllCourses()
  const progress = getProgress()

  let completedCount = 0
  let notCompletedCount = 0
  let totalPercent = 0

  employees.forEach((emp) => {
    const percent = getEmployeeProgressPercent(emp.id, emp.role)
    totalPercent += percent
    if (hasCompletedAllCourses(emp.id, emp.role)) completedCount++
    else notCompletedCount++
  })

  const avgProgress =
    employees.length > 0 ? Math.round(totalPercent / employees.length) : 0

  return {
    totalEmployees: employees.length,
    totalCourses: courses.length,
    completedTraining: completedCount,
    notCompletedTraining: notCompletedCount,
    averageProgress: avgProgress,
    activeLearners: Object.keys(progress).length,
    certification: getCertificationSummary(),
  }
}

/** Детальный прогресс: строки для таблицы «Прогресс» */
export function getProgressRows() {
  const employees = getTrainingEmployees()
  const rows = []

  employees.forEach((emp) => {
    const courses = getCoursesForRole(emp.role)
    courses.forEach((course) => {
      const prog = getCourseProgress(emp.id, course.id)
      const totalLessons = getCourseLessonCount(course.id)
      const percent = calcLessonProgress(prog.completedLessons, course.id)
      const status = getCourseCompletionStatus(prog.completedLessons, course.id)

      rows.push({
        employeeId: emp.id,
        employeeName: emp.name,
        employeeRole: emp.role,
        courseId: course.id,
        courseTitle: course.title,
        completedLessons: prog.completedLessons.length,
        totalLessons,
        percent,
        status,
        testPassed: prog.testPassed,
      })
    })
  })

  return rows
}
