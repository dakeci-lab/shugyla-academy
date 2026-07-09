import { getProgress, getCourseProgress } from './storage'
import { getAllCourses } from './adminData'
import { getActiveEmployees, getTrainingEmployees } from './employeeData'
import { getCoursesForEmployee } from './courseAccess'
import {
  getCourseLessonCount,
  calcLessonProgress,
  getCourseCompletionStatus,
} from './courseStructure'
import { areAllAssignedCoursesComplete } from './testProgress'

function safeCompletedCount(completedLessons, courseId) {
  const total = getCourseLessonCount(courseId)
  if (total === 0) return 0
  return Math.min(completedLessons.length, total)
}

/** Процент прогресса сотрудника по доступным курсам */
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
  return areAllAssignedCoursesComplete(userId)
}

export function getEmployeeProgressPercentByRole(userId, role) {
  void role
  return getEmployeeProgressPercent(userId)
}

export function getEmployeeTrainingStatus(userId) {
  const percent = getEmployeeProgressPercent(userId)
  if (percent === 0) return { label: 'Не начат', type: 'idle' }
  if (hasCompletedAllCourses(userId)) return { label: 'Завершён', type: 'done' }
  return { label: 'В процессе', type: 'progress' }
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
  }
}

/** Детальный прогресс для таблицы «Прогресс» */
export function getProgressRows() {
  const employees = getActiveEmployees()

  return employees.map((emp) => {
    const courses = getCoursesForEmployee(emp)
    const progressPercent = getEmployeeProgressPercent(emp.id)
    const trainingStatus = getEmployeeTrainingStatus(emp.id)

    const completedCount = courses.filter((course) => {
      const progress = getCourseProgress(emp.id, course.id)
      const status = getCourseCompletionStatus(progress.completedLessons, course.id)
      return status === 'completed'
    }).length

    const coursesLabel =
      courses.length === 0
        ? 'Нет курсов'
        : `${completedCount} / ${courses.length} завершено`

    return {
      employeeId: emp.id,
      employeeName: emp.name,
      employeeRole: emp.role,
      coursesLabel,
      progressPercent,
      trainingStatus,
    }
  })
}
