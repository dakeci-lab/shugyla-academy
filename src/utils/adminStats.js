import { getProgress, getCourseProgress } from './storage'
import { getAllCourses } from './adminData'
import { getActiveEmployees, getTrainingEmployees } from './employeeData'
import { getCoursesForEmployee } from './courseAccess'
import {
  getCourseLessonCount,
  calcLessonProgress,
} from './courseStructure'
import {
  getDetailedCourseStatus,
  getCourseTestStatus,
  getAdminFinalAttestationStatus,
  isCourseFullyComplete,
  areAllAssignedCoursesComplete,
} from './testProgress'

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
  return areAllAssignedCoursesComplete(userId)
}

export function getEmployeeProgressPercentByRole(userId, role) {
  void role
  return getEmployeeProgressPercent(userId)
}

export function getEmployeeTrainingStatus(userId) {
  const percent = getEmployeeProgressPercent(userId)
  if (percent === 0) return { label: 'Не начал', type: 'idle' }
  if (hasCompletedAllCourses(userId)) return { label: 'Завершил', type: 'done' }
  return { label: 'В процессе', type: 'progress' }
}

export function getCertificationStatus(userId) {
  const employee = getTrainingEmployees().find((e) => e.id === userId)
  if (!employee) return 'not_started'
  const att = getAdminFinalAttestationStatus(userId, employee.role)
  if (att.status === 'not_available') return 'not_started'
  if (att.status === 'available' || att.status === 'not_started') return 'in_progress'
  if (att.status === 'passed') return 'passed'
  if (att.status === 'failed') return 'failed'
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

function getAttestationRowStatus(userId, role) {
  const att = getAdminFinalAttestationStatus(userId, role)
  if (att.status === 'passed') {
    return { label: 'Аттестован', type: 'done' }
  }
  if (att.status === 'failed') {
    return { label: 'Не сдана', type: 'failed' }
  }
  if (att.status === 'available') {
    return { label: 'Доступна', type: 'progress' }
  }
  return { label: 'Не доступна', type: 'idle' }
}

/** Детальный прогресс для таблицы «Прогресс» */
export function getProgressRows() {
  const employees = getActiveEmployees()
  const rows = []

  employees.forEach((emp) => {
    const courses = getCoursesForEmployee(emp)
    const attestationStatus = getAttestationRowStatus(emp.id, emp.role)

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
        courseTestStatus: { label: '—', type: 'idle' },
        courseOverallStatus: { label: 'Не начат', type: 'idle' },
        attestationStatus,
        noCourses: true,
      })
      return
    }

    courses.forEach((course) => {
      const prog = getCourseProgress(emp.id, course.id)
      const totalLessons = getCourseLessonCount(course.id)
      const completedLessons = safeCompletedCount(prog.completedLessons, course.id)
      const percent = calcLessonProgress(prog.completedLessons, course.id)
      const courseOverallStatus = getDetailedCourseStatus(
        emp.id,
        course.id,
        prog.completedLessons
      )
      const courseTestStatus = getCourseTestStatus(emp.id, course.id)

      rows.push({
        employeeId: emp.id,
        employeeName: emp.name,
        employeeRole: emp.role,
        courseId: course.id,
        courseTitle: course.title,
        completedLessons,
        totalLessons,
        percent,
        status: courseOverallStatus,
        courseTestStatus,
        courseOverallStatus,
        attestationStatus,
        courseComplete: isCourseFullyComplete(emp.id, course.id, prog.completedLessons),
        noCourses: false,
      })
    })
  })

  return rows
}
