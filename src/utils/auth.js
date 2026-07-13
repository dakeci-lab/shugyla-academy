import {
  ROLES,
  getRole,
  hasPermission,
  isAdmin,
  PERMISSIONS,
  normalizeRoleId,
  ROLE_IDS,
} from '../data/roles'
import { resolveUserRole, getDefaultPlatformPath } from '../config/permissions'
import { LOGIN_PATH } from '../router/authRoutes'
import { getAllCourses } from './adminData'
import { saveUser } from './storage'
import {
  authenticateEmployee,
  getEmployeeById,
} from './employeeData'
import { authenticateUser } from '../services/academyDataService'
import {
  requiresMandatorySupabaseAuth,
  signInSupabaseAuthAfterAcademyLogin,
  SESSION_TYPE,
} from '../services/authService'
import { isCloudMode } from '../lib/dataMode'
import {
  getCoursesForEmployee,
  canEmployeeAccessCourse,
} from './courseAccess'

/** Причины отказа в доступе к курсу */
export const ACCESS_REASON = {
  GRANTED: 'granted',
  NOT_FOUND: 'not_found',
  UNAUTHENTICATED: 'unauthenticated',
  FORBIDDEN: 'forbidden',
  DRAFT: 'draft',
}

/** Безопасный redirect после входа */
export function getSafeRedirectPath(redirectPath) {
  if (
    redirectPath &&
    redirectPath.startsWith('/') &&
    !redirectPath.startsWith('//') &&
    !redirectPath.startsWith(LOGIN_PATH) &&
    !redirectPath.startsWith('/forgot-password') &&
    !redirectPath.startsWith('/reset-password')
  ) {
    return redirectPath
  }
  return '/platform'
}

export function getPostLoginPath(user, redirectPath) {
  const safe = getSafeRedirectPath(redirectPath)
  if (safe === '/platform') {
    return getDefaultPlatformPath(user)
  }
  return safe
}

const DEACTIVATED_MESSAGE = 'Аккаунт деактивирован. Обратитесь к администратору.'

/**
 * Вход по логину и паролю (academy_users / localStorage; cloud + Supabase Auth для admin)
 */
export async function login(loginValue, password) {
  const result = isCloudMode()
    ? await authenticateUser(loginValue, password)
    : authenticateEmployee(loginValue, password)

  if (!result.ok) {
    return {
      success: false,
      error: result.reason === 'deactivated' ? DEACTIVATED_MESSAGE : 'invalid',
    }
  }

  const user = result.user
  const roleId = resolveUserRole(user) || normalizeRoleId(user.role) || ROLE_IDS.CASHIER
  const role = getRole(roleId)
  const mandatoryAuth = isCloudMode() && requiresMandatorySupabaseAuth(user.role || roleId)

  let sessionType = SESSION_TYPE.LEGACY
  let supabaseAuthenticated = false

  if (isCloudMode()) {
    const authBridge = await signInSupabaseAuthAfterAcademyLogin(user.login, password, {
      required: mandatoryAuth,
    })
    if (!authBridge.ok) {
      return { success: false, error: authBridge.error }
    }
    if (authBridge.session?.access_token) {
      sessionType = SESSION_TYPE.SUPABASE
      supabaseAuthenticated = true
    }
  }

  const sessionUser = {
    id: user.id,
    login: user.login,
    name: user.name,
    role: roleId,
    roleId: user.roleId ?? user.role_id ?? null,
    roleName: role?.label || roleId,
    permissions: role?.permissions || [],
    assignedCourseIds: user.assignedCourseIds || [],
    sessionType,
    supabaseAuthenticated,
  }
  saveUser(sessionUser)
  return { success: true, user: sessionUser, sessionType, supabaseAuthenticated }
}

/** Курсы по роли (legacy — для admin stats fallback) */
export function getCoursesForRole(roleId) {
  if (isAdmin(roleId)) return getAllCourses()
  return getAllCourses().filter(
    (c) => c.status === 'published' && c.allowedRoles?.includes(roleId)
  )
}

/** Курсы для текущего пользователя (по id или role) */
export function getAccessibleCourses(userOrRole) {
  if (typeof userOrRole === 'string') {
    return getCoursesForRole(userOrRole)
  }
  const employee = getEmployeeById(userOrRole.id) || userOrRole
  return getCoursesForEmployee(employee)
}

export function canAccessCourse(userOrRole, course) {
  if (!course) return false

  if (typeof userOrRole === 'string') {
    if (isAdmin(userOrRole)) return true
    if (course.status !== 'published') return false
    return course.allowedRoles?.includes(userOrRole)
  }

  const employee = getEmployeeById(userOrRole.id) || userOrRole
  return canEmployeeAccessCourse(employee, course)
}

export function resolveCourseAccess(user, courseId) {
  const course = getAllCourses().find((c) => c.id === Number(courseId))

  if (!course) {
    return { allowed: false, reason: ACCESS_REASON.NOT_FOUND, course: null }
  }

  if (!user) {
    return { allowed: false, reason: ACCESS_REASON.UNAUTHENTICATED, course }
  }

  const employee = getEmployeeById(user.id) || user

  if (!isAdmin(employee.role) && course.status !== 'published') {
    return { allowed: false, reason: ACCESS_REASON.DRAFT, course }
  }

  if (!canEmployeeAccessCourse(employee, course)) {
    return { allowed: false, reason: ACCESS_REASON.FORBIDDEN, course }
  }

  return { allowed: true, reason: ACCESS_REASON.GRANTED, course }
}

export function roleHasPermission(roleId, permission) {
  return hasPermission(roleId, permission)
}

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

export function getCourseAllowedRoleLabels(course) {
  if (!course?.allowedRoles) return []
  return course.allowedRoles
    .map((roleId) => getRole(roleId)?.label || roleId)
    .filter(Boolean)
}

export { ROLES, getRole, isAdmin, PERMISSIONS }
