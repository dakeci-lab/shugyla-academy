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
import { saveUser, clearUser } from './storage'
import { authenticateEmployee } from './employeeData'
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
  PROFILE_FORBIDDEN: 'profile_forbidden',
  PROFILE_LOAD_FAILED: 'profile_load_failed',
  RBAC_LOAD_FAILED: 'rbac_load_failed',
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
    if (isAuthNetworkError(err)) {
      return { success: false, error: LOGIN_ERROR.NETWORK }
    }
    if (err?.code === LOGIN_ERROR.PROFILE_FORBIDDEN || err?.code === 'profile_forbidden') {
      if (import.meta.env.DEV) {
        console.warn('[login] profile_forbidden after Auth 200')
      }
      return { success: false, error: LOGIN_ERROR.PROFILE_FORBIDDEN }
    }
    if (import.meta.env.DEV) {
      console.warn('[login] profile_load_failed after Auth 200', { code: err?.code })
    }
    return { success: false, error: LOGIN_ERROR.PROFILE_LOAD_FAILED }
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
    if (isAuthNetworkError(err)) {
      return { success: false, error: LOGIN_ERROR.NETWORK }
    }
    if (import.meta.env.DEV) {
      console.warn('[login] rbac_load_failed after profile', { code: err?.code })
    }
    return { success: false, error: LOGIN_ERROR.RBAC_LOAD_FAILED }
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

export function roleHasPermission(roleId, permission) {
  return hasPermission(roleId, permission)
}

export function canManageAdmin(roleId) {
  return isAdmin(roleId) || hasPermission(roleId, PERMISSIONS.MANAGE_USERS)
}

export { ROLES, getRole, isAdmin, PERMISSIONS }
