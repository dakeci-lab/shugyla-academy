import { getProgress, getCourseProgress } from './storage'
import { getAllCourses } from './adminData'
import { getActiveEmployees, getTrainingEmployees } from './employeeData'
import { getCoursesForEmployee } from './courseAccess'
import {
  getCourseLessonCount,
  calcLessonProgress,
  getCourseCompletionStatus,
} from './courseStructure'

function safeCompletedCount(completedLessons, courseId) {
  const total = getCourseLessonCount(courseId)
  if (total === 0) return 0
  return Math.min(completedLessons.length, total)
}

/** Процент прогресса сотрудника по назначенным / доступным курсам */
export function getEmployeeProgressPercent(userId) {
  const courses = getCoursesForEmployee(userId)
  if (courses.length === 0) return 0

  let totalLessons = 0
  let completedLessons = 0

  courses.forEach((course) => {
    const progress = getCourseProgress(userId, course.id)
    const count = getCourseLessonCount(course.id)
    totalLessons += count
    completedLessons += safeCompletedCount(progress.completedLessons, course.id)
  })

  return totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
}

export function hasCompletedAllCourses(userId) {
  const courses = getCoursesForEmployee(userId)
  if (courses.length === 0) return false
  return courses.every((course) => {
    const prog = getCourseProgress(userId, course.id)
    return calcLessonProgress(prog.completedLessons, course.id) === 100
  })
}

/** @deprecated use getEmployeeProgressPercent(userId) */
export function getEmployeeProgressPercentByRole(userId, role) {
  void role
  return getEmployeeProgressPercent(userId)
}

export function getEmployeeTrainingStatus(userId) {
  const percent = getEmployeeProgressPercent(userId)
  if (percent === 0) return { label: 'Не начал', type: 'idle' }
  if (percent === 100) return { label: 'Завершил', type: 'done' }
  return { label: 'В процессе', type: 'progress' }
}

export function getCertificationStatus(userId) {
  const courses = getCoursesForEmployee(userId)
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
    return (
      safeCompletedCount(progress.completedLessons, course.id) >= total &&
      total > 0 &&
      !progress.testPassed
    )
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

export function getCertificationSummary() {
  const employees = getTrainingEmployees()
  const summary = {
    not_started: 0,
    in_progress: 0,
    passed: 0,
    failed: 0,
  }

  employees.forEach((emp) => {
    const status = getCertificationStatus(emp.id)
    summary[status]++
  })

  return summary
}

export function getOverviewStats() {
  const employees = getTrainingEmployees()
  const courses = getAllCourses()
  const progress = getProgress()

  let completedCount = 0
  let notCompletedCount = 0
  let totalPercent = 0

  employees.forEach((emp) => {
    const percent = getEmployeeProgressPercent(emp.id)
    totalPercent += percent
    if (hasCompletedAllCourses(emp.id)) completedCount++
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

/** Детальный прогресс для таблицы «Прогресс» */
export function getProgressRows() {
  const employees = getActiveEmployees()
  const rows = []

  employees.forEach((emp) => {
    const courses = getCoursesForEmployee(emp)

    if (courses.length === 0) {
      rows.push({
        employeeId: emp.id,
        employeeName: emp.name,
        employeeRole: emp.role,
        courseId: null,
        courseTitle: '—',
        completedLessons: 0,
        totalLessons: 0,
        percent: 0,
        status: { label: 'Нет курсов', type: 'idle' },
        testPassed: false,
        noCourses: true,
      })
      return
    }

    courses.forEach((course) => {
      const prog = getCourseProgress(emp.id, course.id)
      const totalLessons = getCourseLessonCount(course.id)
      const completedLessons = safeCompletedCount(prog.completedLessons, course.id)
      const percent = calcLessonProgress(prog.completedLessons, course.id)
      const status = getCourseCompletionStatus(prog.completedLessons, course.id)

      rows.push({
        employeeId: emp.id,
        employeeName: emp.name,
        employeeRole: emp.role,
        courseId: course.id,
        courseTitle: course.title,
        completedLessons,
        totalLessons,
        percent,
        status,
        testPassed: prog.testPassed,
        noCourses: false,
      })
    })
  })

  return rows
}
