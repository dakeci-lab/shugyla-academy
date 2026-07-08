import { isAdmin } from '../data/roles'
import { getAllCourses } from './adminData'
import { getEmployeeById } from './employeeData'

/** Только опубликованные курсы */
export function getPublishedCourses() {
  return getAllCourses().filter((c) => c.status === 'published')
}

/**
 * Курсы для сотрудника:
 * - admin — все опубликованные (+ черновики для управления в админке отдельно)
 * - если назначены assignedCourseIds — только они (опубликованные)
 * - иначе — по роли allowedRoles
 */
export function getCoursesForEmployee(employeeOrId) {
  const employee =
    typeof employeeOrId === 'number' || typeof employeeOrId === 'string'
      ? getEmployeeById(Number(employeeOrId))
      : employeeOrId

  if (!employee) return []

  const published = getPublishedCourses()

  if (isAdmin(employee.role)) {
    return published
  }

  const assigned = employee.assignedCourseIds || []

  if (assigned.length > 0) {
    return published.filter((c) => assigned.includes(c.id))
  }

  return published.filter((c) => c.allowedRoles?.includes(employee.role))
}

/** Может ли сотрудник открыть курс */
export function canEmployeeAccessCourse(employee, course) {
  if (!employee || !course) return false
  if (isAdmin(employee.role)) return true
  if (course.status !== 'published') return false

  const assigned = employee.assignedCourseIds || []
  if (assigned.length > 0) {
    return assigned.includes(course.id)
  }

  return Array.isArray(course.allowedRoles) && course.allowedRoles.includes(employee.role)
}

/** Опубликованные курсы для назначения в админке */
export function getAssignableCourses(employeeRole = null) {
  const published = getPublishedCourses()
  if (!employeeRole) return published
  return published
}
