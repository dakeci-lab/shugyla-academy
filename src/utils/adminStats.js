import { getProgress, getCourseProgress } from './storage'
import { getCoursesForRole } from './auth'
import { getAllCourses, getTrainingEmployees } from './adminData'

/** Процент прогресса сотрудника по всем доступным курсам */
export function getEmployeeProgressPercent(userId, role) {
  const courses = getCoursesForRole(role)
  if (courses.length === 0) return 0

  let totalLessons = 0
  let completedLessons = 0

  courses.forEach((course) => {
    const progress = getCourseProgress(userId, course.id)
    totalLessons += course.lessonsCount
    completedLessons += progress.completedLessons.length
  })

  return totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
}

/** Статус обучения сотрудника для таблицы */
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
 * - passed — сдал
 * - failed — не сдал (все уроки пройдены, тест не сдан)
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

  const anyFailed = progresses.some(
    ({ course, progress }) =>
      progress.completedLessons.length >= course.lessonsCount && !progress.testPassed
  )
  if (anyFailed) return 'failed'

  return 'in_progress'
}

export const CERTIFICATION_LABELS = {
  not_started: 'Не начал',
  in_progress: 'В процессе',
  passed: 'Сдал',
  failed: 'Не сдал',
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
    const cert = getCertificationStatus(emp.id, emp.role)
    if (cert === 'passed') completedCount++
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
      const percent =
        course.lessonsCount > 0
          ? Math.round((prog.completedLessons.length / course.lessonsCount) * 100)
          : 0

      rows.push({
        employeeId: emp.id,
        employeeName: emp.name,
        courseId: course.id,
        courseTitle: course.title,
        completedLessons: prog.completedLessons.length,
        totalLessons: course.lessonsCount,
        percent,
        testPassed: prog.testPassed,
      })
    })
  })

  return rows
}
