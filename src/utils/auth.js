import {
  ROLES,
  getRole,
  hasPermission,
  isAdmin,
  PERMISSIONS,
  normalizeRoleId,
  ROLE_IDS,
} from '../data/roles'
import { resolveUserRole } from '../config/permissions'
import { getDefaultPlatformPath } from '../platform/platformAccess'
import { LOGIN_PATH } from '../router/authRoutes'
import { getAllCourses } from './adminData'
import { saveUser, clearUser } from './storage'
import {
  authenticateEmployee,
  getEmployeeById,
} from './employeeData'
import {
  DEACTIVATED_ACCOUNT_MESSAGE,
  buildCloudPlatformSessionUser,
  loadAcademyProfileByAuthUserId,
  signOut,
  SESSION_TYPE,
} from '../services/authService'
import { isCloudMode } from '../lib/dataMode'
import { supabase } from '../lib/supabaseClient'
import { loginToTechnicalEmail } from './phoneUtils'
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

const INVALID_CREDENTIALS_MESSAGE = 'invalid'

/** Machine-readable login failure codes for Login page (no PII). */
export const LOGIN_ERROR = {
  INVALID: 'invalid',
  DEACTIVATED: 'deactivated',
  PROFILE_NOT_CONFIGURED: 'profile_not_configured',
  NETWORK: 'network',
}

function isAuthNetworkError(err) {
  if (!err) return false
  const message = String(err.message || err)
  return (
    message.includes('Failed to fetch') ||
    message.includes('NetworkError') ||
    message.includes('fetch failed') ||
    message.includes('Network request failed')
  )
}

/**
 * Offline/local login — mock employees in localStorage (no Supabase).
 */
function loginOffline(loginValue, password) {
  const result = authenticateEmployee(loginValue, password)

  if (!result.ok) {
    return {
      success: false,
      error: result.reason === 'deactivated' ? DEACTIVATED_ACCOUNT_MESSAGE : INVALID_CREDENTIALS_MESSAGE,
    }
  }

  const user = result.user
  const roleId = resolveUserRole(user) || normalizeRoleId(user.role) || ROLE_IDS.CASHIER
  const role = getRole(roleId)

  const sessionUser = {
    id: user.id,
    login: user.login,
    name: user.name,
    role: roleId,
    roleId: user.roleId ?? user.role_id ?? null,
    roleName: role?.label || roleId,
    permissions: role?.permissions || [],
    assignedCourseIds: user.assignedCourseIds || [],
    sessionType: SESSION_TYPE.LEGACY,
    supabaseAuthenticated: false,
  }
  saveUser(sessionUser)
  return {
    success: true,
    user: sessionUser,
    sessionType: SESSION_TYPE.LEGACY,
    supabaseAuthenticated: false,
  }
}

/**
 * Cloud Auth-first login: Supabase Auth validates password, then own profile by auth_user_id.
 */
async function loginCloud(loginValue, password) {
  const loginInput = loginValue?.trim()
  if (!loginInput || !password) {
    return { success: false, error: INVALID_CREDENTIALS_MESSAGE }
  }

  const technicalEmail = loginToTechnicalEmail(loginInput)
  if (!technicalEmail) {
    return { success: false, error: INVALID_CREDENTIALS_MESSAGE }
  }

  clearUser()
  try {
    await signOut()
  } catch {
    // Previous session may be absent
  }

  let data
  let error
  try {
    ;({ data, error } = await supabase.auth.signInWithPassword({
      email: technicalEmail,
      password,
    }))
  } catch (err) {
    await supabase.auth.signOut().catch(() => {})
    clearUser()
    return {
      success: false,
      error: isAuthNetworkError(err) ? LOGIN_ERROR.NETWORK : LOGIN_ERROR.INVALID,
    }
  }

  if (error || !data.session?.access_token || !data.user?.id) {
    await supabase.auth.signOut().catch(() => {})
    clearUser()
    return {
      success: false,
      error: isAuthNetworkError(error) ? LOGIN_ERROR.NETWORK : LOGIN_ERROR.INVALID,
    }
  }

  let profileRow
  try {
    profileRow = await loadAcademyProfileByAuthUserId(data.user.id)
  } catch (err) {
    await supabase.auth.signOut().catch(() => {})
    clearUser()
    return {
      success: false,
      error: isAuthNetworkError(err)
        ? LOGIN_ERROR.NETWORK
        : 'Не удалось загрузить профиль. Обновите страницу или обратитесь к администратору.',
    }
  }

  if (profileRow?.deactivated) {
    await supabase.auth.signOut().catch(() => {})
    clearUser()
    return { success: false, error: LOGIN_ERROR.DEACTIVATED }
  }

  if (!profileRow) {
    await supabase.auth.signOut().catch(() => {})
    clearUser()
    return { success: false, error: LOGIN_ERROR.PROFILE_NOT_CONFIGURED }
  }

  let sessionUser
  try {
    sessionUser = await buildCloudPlatformSessionUser(profileRow)
  } catch (err) {
    await supabase.auth.signOut().catch(() => {})
    clearUser()
    return {
      success: false,
      error: isAuthNetworkError(err) ? LOGIN_ERROR.NETWORK : LOGIN_ERROR.INVALID,
    }
  }

  if (!sessionUser) {
    await supabase.auth.signOut().catch(() => {})
    clearUser()
    return { success: false, error: LOGIN_ERROR.PROFILE_NOT_CONFIGURED }
  }

  saveUser(sessionUser)
  return {
    success: true,
    user: sessionUser,
    sessionType: SESSION_TYPE.SUPABASE,
    supabaseAuthenticated: true,
  }
}

/**
 * Вход по логину и паролю.
 * Cloud: Auth-first (Supabase only). Offline: local mock employees.
 */
export async function login(loginValue, password) {
  if (isCloudMode()) {
    return loginCloud(loginValue, password)
  }
  return loginOffline(loginValue, password)
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
