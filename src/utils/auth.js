import { USERS } from '../data/users'
import {
  ROLES,
  getRole,
  hasPermission,
  isAdmin,
  PERMISSIONS,
} from '../data/roles'
import { getAllCourses } from './adminData'
import { saveUser } from './storage'

/** Причины отказа в доступе к курсу */
export const ACCESS_REASON = {
  GRANTED: 'granted',
  NOT_FOUND: 'not_found',
  UNAUTHENTICATED: 'unauthenticated',
  FORBIDDEN: 'forbidden',
}

/**
 * Попытка входа по логину и паролю.
 * Возвращает объект пользователя сессии или null.
 */
export function login(loginValue, password) {
  const user = USERS.find(
    (u) => u.login === loginValue && u.password === password
  )
  if (!user) return null

  const role = getRole(user.role)

  const sessionUser = {
    id: user.id,
    login: user.login,
    name: user.name,
    role: user.role,
    roleName: role?.label || user.role,
    permissions: role?.permissions || [],
  }
  saveUser(sessionUser)
  return sessionUser
}

/**
 * Курсы, доступные пользователю по роли.
 * admin — все курсы; остальные — только где role ∈ allowedRoles.
 */
export function getCoursesForRole(roleId) {
  const courses = getAllCourses()
  if (isAdmin(roleId)) return courses
  return courses.filter((course) => course.allowedRoles?.includes(roleId))
}

/** Алиас для читаемости в компонентах */
export function getAccessibleCourses(roleId) {
  return getCoursesForRole(roleId)
}

/**
 * Может ли роль открыть конкретный курс.
 * admin всегда true; иначе role должен быть в allowedRoles.
 */
export function canAccessCourse(roleId, course) {
  if (!course) return false
  if (isAdmin(roleId)) return true
  return Array.isArray(course.allowedRoles) && course.allowedRoles.includes(roleId)
}

/**
 * Полная проверка доступа к курсу (с учётом авторизации).
 * @returns {{ allowed: boolean, reason: string, course?: object }}
 */
export function resolveCourseAccess(user, courseId) {
  const course = getAllCourses().find((c) => c.id === Number(courseId))

  if (!course) {
    return { allowed: false, reason: ACCESS_REASON.NOT_FOUND, course: null }
  }

  if (!user) {
    return { allowed: false, reason: ACCESS_REASON.UNAUTHENTICATED, course }
  }

  if (!canAccessCourse(user.role, course)) {
    return { allowed: false, reason: ACCESS_REASON.FORBIDDEN, course }
  }

  return { allowed: true, reason: ACCESS_REASON.GRANTED, course }
}

/** Проверить разрешение роли */
export function roleHasPermission(roleId, permission) {
  return hasPermission(roleId, permission)
}

/** Доступ к админ-панели (управление сотрудниками) */
export function canManageAdmin(roleId) {
  return isAdmin(roleId) || hasPermission(roleId, PERMISSIONS.MANAGE_USERS)
}

export function canManageCourses(roleId) {
  return isAdmin(roleId) || hasPermission(roleId, PERMISSIONS.MANAGE_COURSES)
}

export function canViewProgress(roleId) {
  return isAdmin(roleId) || hasPermission(roleId, PERMISSIONS.VIEW_PROGRESS)
}

export function canManageTests(roleId) {
  return isAdmin(roleId) || hasPermission(roleId, PERMISSIONS.MANAGE_TESTS)
}

export function canPassTests(roleId) {
  return hasPermission(roleId, PERMISSIONS.PASS_TESTS)
}

export function canViewTeamChecklists(roleId) {
  return hasPermission(roleId, PERMISSIONS.VIEW_TEAM_CHECKLISTS)
}

/** Куда перенаправить пользователя после входа */
export function getPostLoginPath(user, redirectPath) {
  if (redirectPath && redirectPath.startsWith('/')) {
    return redirectPath
  }
  return canManageAdmin(user.role) ? '/admin' : '/dashboard'
}

/** Все роли, которым разрешён доступ к курсу (для UI) */
export function getCourseAllowedRoleLabels(course) {
  if (!course?.allowedRoles) return []
  return course.allowedRoles
    .map((roleId) => getRole(roleId)?.label || roleId)
    .filter(Boolean)
}

export { ROLES, getRole, isAdmin, PERMISSIONS }
