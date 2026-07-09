import { isAdmin, normalizeRoleId } from '../data/roles'
import { getAllCourses, getActiveCourses } from './adminData'
import { getEmployeeById, getActiveEmployees } from './employeeData'
import { isActiveCourseStatus } from './courseData'

/** Только активные курсы для каталога и сотрудников */
export function getPublishedCourses() {
  return getActiveCourses()
}

/**
 * Курсы для сотрудника:
 * - admin — все активные
 * - если назначены assignedCourseIds — только они (активные)
 * - иначе — по роли allowedRoles
 */
export function getCoursesForEmployee(employeeOrId) {
  const employee =
    typeof employeeOrId === 'number' || typeof employeeOrId === 'string'
      ? getEmployeeById(Number(employeeOrId))
      : employeeOrId

  if (!employee) return []

  const published = getPublishedCourses()
  const role = normalizeRoleId(employee.role)

  if (isAdmin(role)) {
    return published
  }

  const assigned = employee.assignedCourseIds || []

  if (assigned.length > 0) {
    return published.filter((c) => assigned.includes(c.id))
  }

  return published.filter((c) => c.allowedRoles?.includes(role))
}

/** Может ли сотрудник открыть курс */
export function canEmployeeAccessCourse(employee, course) {
  if (!employee || !course) return false
  const role = normalizeRoleId(employee.role)
  if (isAdmin(role)) return isActiveCourseStatus(course.status)
  if (!isActiveCourseStatus(course.status)) return false

  const assigned = employee.assignedCourseIds || []
  if (assigned.length > 0) {
    return assigned.includes(course.id)
  }

  return Array.isArray(course.allowedRoles) && course.allowedRoles.includes(role)
}

/** Активные курсы для назначения в админке */
export function getAssignableCourses() {
  return getPublishedCourses()
}

/** Сотрудники с указанной ролью */
export function getEmployeesByRole(roleId) {
  const role = normalizeRoleId(roleId)
  return getActiveEmployees().filter((emp) => normalizeRoleId(emp.role) === role)
}
