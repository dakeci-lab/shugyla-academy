import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { getRole } from '../data/roles'
import { getUser, clearUser } from '../utils/storage'
import {
  ensureRbacLoaded,
  getRoleById,
  getRoleByCode,
  getPermissionCodesForUserRole,
} from './rbacService'
import {
  authenticateEmployee,
  canEmployeeLogin,
  getAllEmployees,
  normalizeEmployee,
} from '../utils/employeeData'
import { isCloudMode } from '../lib/dataMode'
import {
  normalizePhone,
  phoneToTechnicalEmail,
  technicalEmailToPhone,
  loginToTechnicalEmail,
  technicalEmailToLogin,
} from '../utils/phoneUtils'

import { getAppUrl } from '../router/basename'

/**
 * Minimal profile columns for Auth login/session restore.
 * Intentionally excludes employment-date columns so PostgREST schema-cache lag
 * after migrations cannot break sign-in.
 */
export const ACADEMY_AUTH_PROFILE_FIELDS =
  'id, first_name, last_name, full_name, login, role, role_id, status, position, avatar_url, auth_user_id, contact_email, created_at'

/** Safe academy_users columns for Auth-first cloud queries (never includes password). */
export const ACADEMY_PROFILE_SAFE_FIELDS =
  `${ACADEMY_AUTH_PROFILE_FIELDS}, hired_at, terminated_at, work_mode, salary_calculation_type`

const DEACTIVATED_ACCOUNT_MESSAGE =
  'Доступ закрыт: сотрудник уволен. Обратитесь к администратору.'

export function usesSupabaseAuth() {
  return isSupabaseConfigured()
}

export function getPasswordResetRedirectUrl() {
  return getAppUrl('reset-password')
}

function buildSessionUser(employee, phone = null) {
  const role = getRole(employee.role)
  const loginPhone = phone || technicalEmailToPhone(employee.login) || employee.login
  return {
    id: employee.id,
    login: employee.login,
    phone: loginPhone,
    email: phoneToTechnicalEmail(loginPhone),
    name: employee.name,
    role: employee.role,
    roleId: employee.roleId ?? employee.role_id ?? null,
    roleName: role?.label || employee.role,
    position: employee.position || role?.label || employee.role,
    avatarUrl: employee.avatarUrl || null,
    permissions: role?.permissions || [],
    assignedCourseIds: employee.assignedCourseIds || [],
  }
}

function profileRowToEmployee(row, assignedCourseIds = []) {
  return normalizeEmployee({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: row.full_name,
    login: row.login,
    role: row.role,
    roleId: row.role_id,
    position: row.position,
    employmentStatus: row.status,
    hiredAt: row.hired_at,
    terminatedAt: row.terminated_at,
    workMode: row.work_mode,
    salaryCalculationType: row.salary_calculation_type,
    createdAt: row.created_at,
    assignedCourseIds,
    avatarUrl: row.avatar_url,
  })
}

/**
 * Load course assignments for the authenticated employee (after Auth session exists).
 */
export async function loadAcademyAssignmentsForEmployee(employeeId) {
  if (employeeId === undefined || employeeId === null || employeeId === '' || !supabase) {
    return []
  }

  const assignmentsRes = await supabase
    .from('academy_course_assignments')
    .select('course_id')
    .eq('user_id', employeeId)

  if (assignmentsRes.error) {
    throw new Error('Не удалось загрузить назначения курсов')
  }

  return (assignmentsRes.data || []).map((a) => a.course_id)
}

/**
 * Auth-first profile lookup: academy_users.auth_user_id = Supabase Auth user id.
 * Must only be called after a valid Auth session exists.
 */
/**
 * Load academy_users row. Auth path uses columns that always exist so a
 * PostgREST schema-cache lag after migrations cannot break sign-in.
 * Employment dates are attached when the extended select succeeds.
 */
async function loadAcademyUserRow(match) {
  const authResult = await match(ACADEMY_AUTH_PROFILE_FIELDS)
  if (authResult.error || !authResult.data) return authResult

  const extendedResult = await match(
    'id, hired_at, terminated_at, work_mode, salary_calculation_type'
  )
  if (!extendedResult.error && extendedResult.data) {
    return {
      ...authResult,
      data: {
        ...authResult.data,
        hired_at: extendedResult.data.hired_at ?? null,
        terminated_at: extendedResult.data.terminated_at ?? null,
        work_mode: extendedResult.data.work_mode ?? null,
        salary_calculation_type: extendedResult.data.salary_calculation_type ?? null,
      },
    }
  }

  // Fallback if PostgREST cache still lacks the newest columns
  const datesResult = await match('id, hired_at, terminated_at')
  if (!datesResult.error && datesResult.data) {
    return {
      ...authResult,
      data: {
        ...authResult.data,
        hired_at: datesResult.data.hired_at ?? null,
        terminated_at: datesResult.data.terminated_at ?? null,
      },
    }
  }

  return authResult
}

export async function loadAcademyProfileByAuthUserId(authUserId) {
  if (!authUserId || !supabase) return null

  const result = await loadAcademyUserRow((fields) =>
    supabase.from('academy_users').select(fields).eq('auth_user_id', authUserId).maybeSingle()
  )

  if (result.error) {
    throw new Error('Не удалось загрузить профиль сотрудника')
  }

  if (!result.data) return null

  const row = result.data
  if (!canEmployeeLogin(row.status)) {
    return { deactivated: true }
  }

  return row
}

/** Build platform session user from an academy_users row (no password). */
export async function buildCloudPlatformSessionUser(profileRow, options = {}) {
  const { skipAssignments = false } = options
  const assignedCourseIds = skipAssignments
    ? []
    : await loadAcademyAssignmentsForEmployee(profileRow.id)

  await ensureRbacLoaded()

  const employee = profileRowToEmployee(profileRow, assignedCourseIds)
  const sessionProfile = buildSessionUser(
    employee,
    technicalEmailToPhone(profileRow.login) || profileRow.login
  )

  const roleId = sessionProfile.roleId ?? profileRow.role_id ?? null
  const roleCodeFromProfile = sessionProfile.role ? String(sessionProfile.role).trim() : ''

  const rbacRole =
    (roleId && getRoleById(roleId)) ||
    (roleCodeFromProfile && getRoleByCode(roleCodeFromProfile)) ||
    null

  if (!rbacRole || rbacRole.isActive === false) {
    return null
  }

  const permissionCodes = getPermissionCodesForUserRole({
    role: rbacRole.code,
    roleId: rbacRole.id,
  })

  return {
    ...sessionProfile,
    role: rbacRole.code,
    roleId: rbacRole.id,
    roleName: rbacRole.name,
    permissions: [],
    permissionCodes,
    permissionSlugs: permissionCodes,
    assignedCourseIds,
    sessionType: SESSION_TYPE.SUPABASE,
    supabaseAuthenticated: true,
  }
}

/**
 * @deprecated Pre-Auth lookup by login. Do not use in Auth-first cloud login/restore paths.
 */
export async function loadAcademyProfileByLogin(loginValue) {
  const login = loginValue?.trim()
  if (!login) return null

  if (isCloudMode() && supabase) {
    const result = await loadAcademyUserRow((fields) =>
      supabase.from('academy_users').select(fields).eq('login', login).maybeSingle()
    )

    if (result.error) {
      throw new Error('Не удалось загрузить профиль сотрудника')
    }

    if (!result.data) return null

    const row = result.data
    if (!canEmployeeLogin(row.status)) {
      return { deactivated: true }
    }

    const assignmentsRes = await supabase
      .from('academy_course_assignments')
      .select('course_id')
      .eq('user_id', row.id)

    if (assignmentsRes.error) {
      throw new Error('Не удалось загрузить назначения курсов')
    }

    return buildSessionUser(
      profileRowToEmployee(row, (assignmentsRes.data || []).map((a) => a.course_id)),
      technicalEmailToPhone(row.login) || row.login
    )
  }

  const employee = getAllEmployees().find(
    (e) => e.login?.trim().toLowerCase() === login.toLowerCase()
  )
  if (!employee) return null
  if (!canEmployeeLogin(employee.employmentStatus)) {
    return { deactivated: true }
  }
  return buildSessionUser(employee, technicalEmailToPhone(employee.login) || employee.login)
}

/**
 * @deprecated Pre-Auth lookup by id. Do not use in Auth-first cloud login/restore paths.
 */
export async function loadAcademyProfileById(userId) {
  if (userId === undefined || userId === null || userId === '') return null

  if (isCloudMode() && supabase) {
    const result = await loadAcademyUserRow((fields) =>
      supabase.from('academy_users').select(fields).eq('id', userId).maybeSingle()
    )

    if (result.error) {
      throw new Error('Не удалось загрузить профиль сотрудника')
    }

    if (!result.data) return null

    const row = result.data
    if (!canEmployeeLogin(row.status)) {
      return { deactivated: true }
    }

    const assignmentsRes = await supabase
      .from('academy_course_assignments')
      .select('course_id')
      .eq('user_id', row.id)

    if (assignmentsRes.error) {
      throw new Error('Не удалось загрузить назначения курсов')
    }

    return buildSessionUser(
      profileRowToEmployee(row, (assignmentsRes.data || []).map((a) => a.course_id)),
      technicalEmailToPhone(row.login) || row.login
    )
  }

  const employee = getAllEmployees().find((e) => String(e.id) === String(userId))
  if (!employee) return null
  if (!canEmployeeLogin(employee.employmentStatus)) {
    return { deactivated: true }
  }
  return buildSessionUser(employee, technicalEmailToPhone(employee.login) || employee.login)
}

export async function loadAcademyProfileByEmail(email) {
  /** @deprecated Auth-first cloud paths must use loadAcademyProfileByAuthUserId. */
  const phone = technicalEmailToPhone(email)
  if (phone) return loadAcademyProfileByLogin(phone)
  const login = technicalEmailToLogin(email)
  if (login) return loadAcademyProfileByLogin(login)
  return null
}

export { DEACTIVATED_ACCOUNT_MESSAGE }

export function mapAuthError(error) {
  if (!error) return 'Произошла ошибка. Попробуйте позже.'

  const message = error.message || ''
  const code = error.code || error.status || ''

  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'Supabase недоступен. Проверьте интернет и попробуйте позже.'
  }

  if (
    code === 'invalid_credentials' ||
    message.includes('Invalid login credentials') ||
    message.includes('Invalid email or password')
  ) {
    return 'Неверный логин или пароль'
  }

  if (
    message.includes('Password should be at least') ||
    message.includes('weak password') ||
    code === 'weak_password'
  ) {
    return 'Пароль слишком простой. Используйте не менее 6 символов.'
  }

  if (
    message.includes('expired') ||
    message.includes('Email link is invalid') ||
    code === 'otp_expired'
  ) {
    return 'Ссылка восстановления устарела или недействительна'
  }

  if (message.includes('Email not confirmed')) {
    return 'Email не подтверждён. Проверьте почту.'
  }

  return message || 'Произошла ошибка. Попробуйте позже.'
}

export function mapPasswordChangeError(error) {
  if (!error) return 'Произошла ошибка. Попробуйте ещё раз'

  const message = error.message || ''
  const code = error.code || error.status || ''

  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'Не удалось изменить пароль. Проверьте подключение к интернету'
  }

  if (
    code === 'invalid_credentials' ||
    message.includes('Invalid login credentials') ||
    message.includes('Invalid email or password')
  ) {
    return 'Текущий пароль указан неверно'
  }

  if (
    message.includes('Auth session missing') ||
    message.includes('JWT') ||
    (message.includes('session') && message.includes('expired')) ||
    code === 'session_not_found'
  ) {
    return 'Сессия истекла. Войдите в аккаунт заново'
  }

  if (
    message.includes('Password should be at least') ||
    message.includes('weak password') ||
    message.includes('same as the old') ||
    message.includes('different from the old') ||
    code === 'weak_password'
  ) {
    return 'Новый пароль не соответствует требованиям безопасности'
  }

  return 'Произошла ошибка. Попробуйте ещё раз'
}

function resolveAuthEmail(session, fallbackLogin) {
  if (session?.user?.email) return session.user.email
  return loginToTechnicalEmail(fallbackLogin)
}

export const SESSION_TYPE = {
  SUPABASE: 'supabase',
  LEGACY: 'legacy',
}

/** Роли, для которых Supabase Auth-сессия обязательна (RBAC RPC) */
export function requiresMandatorySupabaseAuth(role) {
  if (!role) return false
  const code = String(role).toLowerCase()
  return code === 'admin' || code === 'administrator'
}

/** Минимальная проверка сохранённого профиля shugyla_user */
export function isValidStoredPlatformUser(raw) {
  if (!raw || typeof raw !== 'object') return false
  const id = raw.id
  if (id === undefined || id === null || id === '') return false
  return Boolean(String(raw.login || '').trim())
}

function emptyRestoredSession() {
  return {
    user: null,
    sessionType: null,
    supabaseAuthenticated: false,
  }
}

/**
 * Legacy-восстановление: shugyla_user → academy_users → roles → role_permissions.
 * Не доверяет permissions из localStorage; динамические роли не требуют статического каталога.
 */
async function restoreLegacyPlatformSession(storedSnapshot) {
  if (!isValidStoredPlatformUser(storedSnapshot)) {
    clearUser()
    return emptyRestoredSession()
  }

  try {
    await ensureRbacLoaded()
  } catch {
    clearUser()
    return emptyRestoredSession()
  }

  let profile = null
  try {
    if (storedSnapshot.id !== undefined && storedSnapshot.id !== null && storedSnapshot.id !== '') {
      profile = await loadAcademyProfileById(storedSnapshot.id)
    }
    if (!profile && storedSnapshot.login) {
      profile = await loadAcademyProfileByLogin(storedSnapshot.login)
    }
  } catch {
    clearUser()
    return emptyRestoredSession()
  }

  if (!profile || profile.deactivated) {
    clearUser()
    return emptyRestoredSession()
  }

  const roleId = profile.roleId ?? profile.role_id ?? null
  const roleCodeFromProfile = profile.role ? String(profile.role).trim() : ''

  if (!roleId && !roleCodeFromProfile) {
    clearUser()
    return emptyRestoredSession()
  }

  const rbacRole =
    (roleId && getRoleById(roleId)) ||
    (roleCodeFromProfile && getRoleByCode(roleCodeFromProfile)) ||
    null

  if (!rbacRole || rbacRole.isActive === false) {
    clearUser()
    return emptyRestoredSession()
  }

  if (
    requiresMandatorySupabaseAuth(rbacRole.code) ||
    requiresMandatorySupabaseAuth(roleCodeFromProfile)
  ) {
    // Admin требует Supabase JWT — не удаляем shugyla_user, пока Auth ещё может восстановиться
    return emptyRestoredSession()
  }

  const permissionCodes = getPermissionCodesForUserRole({
    role: rbacRole.code,
    roleId: rbacRole.id,
  })

  return {
    user: {
      id: profile.id,
      login: profile.login,
      name: profile.name,
      role: rbacRole.code,
      roleId: rbacRole.id,
      roleName: rbacRole.name,
      permissions: [],
      permissionCodes,
      permissionSlugs: permissionCodes,
      assignedCourseIds: profile.assignedCourseIds || [],
      sessionType: SESSION_TYPE.LEGACY,
    },
    sessionType: SESSION_TYPE.LEGACY,
    supabaseAuthenticated: false,
  }
}

/** Дождаться INITIAL_SESSION от Supabase SDK (загрузка session из storage) */
function waitForSupabaseInitialAuthEvent() {
  if (!supabase) return Promise.resolve()

  return new Promise((resolve) => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION') {
        subscription.unsubscribe()
        resolve()
      }
    })
  })
}

/** Дождаться обновления access token (refresh) без setTimeout */
function waitForSupabaseTokenRefresh() {
  if (!supabase) return Promise.resolve(null)

  return new Promise((resolve) => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session?.access_token) {
        subscription.unsubscribe()
        resolve(session)
      } else if (event === 'SIGNED_OUT') {
        subscription.unsubscribe()
        resolve(null)
      }
    })
  })
}

/**
 * Supabase Auth session после холодного старта: INITIAL_SESSION → getSession (refresh) → TOKEN_REFRESHED.
 */
export async function resolveSupabaseAuthSession() {
  if (!usesSupabaseAuth() || !supabase) return null

  await waitForSupabaseInitialAuthEvent()

  const { data, error } = await supabase.auth.getSession()
  if (!error && data?.session?.access_token) {
    return data.session
  }

  if (data?.session?.refresh_token && !data?.session?.access_token) {
    const refreshed = await waitForSupabaseTokenRefresh()
    if (refreshed?.access_token) return refreshed
  }

  return null
}

/**
 * Cloud restore/login: build session from Supabase Auth user id (auth_user_id lookup).
 */
async function resolveCloudSessionFromAuthUserId(authUserId) {
  if (!authUserId) return null

  const profileRow = await loadAcademyProfileByAuthUserId(authUserId)
  if (!profileRow || profileRow.deactivated) return null

  return buildCloudPlatformSessionUser(profileRow)
}

/**
 * Восстановление сессии при старте.
 * Cloud: только Supabase JWT + auth_user_id (без legacy fallback).
 * Offline: legacy localStorage snapshot.
 */
export async function restorePlatformSession() {
  if (usesSupabaseAuth() && supabase) {
    let supabaseSession = null
    try {
      supabaseSession = await resolveSupabaseAuthSession()
    } catch {
      clearUser()
      return emptyRestoredSession()
    }

    if (!supabaseSession?.access_token || !supabaseSession.user?.id) {
      clearUser()
      return emptyRestoredSession()
    }

    try {
      const sessionUser = await resolveCloudSessionFromAuthUserId(supabaseSession.user.id)
      if (sessionUser) {
        return {
          user: sessionUser,
          sessionType: SESSION_TYPE.SUPABASE,
          supabaseAuthenticated: true,
        }
      }
    } catch {
      // fall through to signOut
    }

    await signOut().catch(() => {})
    clearUser()
    return emptyRestoredSession()
  }

  const storedUser = getUser()
  if (isValidStoredPlatformUser(storedUser)) {
    return restoreLegacyPlatformSession(storedUser)
  }

  return emptyRestoredSession()
}

function mapMandatorySupabaseAuthError(error) {
  if (!error) return 'Не удалось создать защищённую сессию администратора'

  const message = error.message || ''
  const code = error.code || error.status || ''

  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'Supabase Auth недоступен. Проверьте подключение и попробуйте позже.'
  }

  if (
    code === 'invalid_credentials' ||
    message.includes('Invalid login credentials') ||
    message.includes('Invalid email or password')
  ) {
    return 'Учётная запись администратора не настроена в Supabase Auth. Обратитесь к техническому администратору.'
  }

  return 'Не удалось создать защищённую сессию администратора'
}

/**
 * @deprecated Pre-Auth bridge after academy_users password compare. Auth-first login uses signInWithPassword directly.
 */
export async function signInSupabaseAuthAfterAcademyLogin(login, password, { required = false } = {}) {
  if (!usesSupabaseAuth() || !supabase) {
    if (required) {
      return {
        ok: false,
        error: 'Supabase Auth недоступен. Проверьте подключение и попробуйте позже.',
      }
    }
    return { ok: true, skipped: true }
  }

  const email = loginToTechnicalEmail(login)
  if (!email) {
    if (required) {
      return { ok: false, error: 'Не удалось создать защищённую сессию администратора' }
    }
    return { ok: true, skipped: true }
  }

  try {
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      if (required) {
        await supabase.auth.signOut().catch(() => {})
        return { ok: false, error: mapMandatorySupabaseAuthError(signInError) }
      }
      return { ok: true, optionalFailed: true }
    }

    const session = data?.session ?? null

    if (required) {
      if (!session?.access_token) {
        await supabase.auth.signOut().catch(() => {})
        return { ok: false, error: 'Не удалось создать защищённую сессию администратора' }
      }

      const sessionEmail = session.user?.email?.toLowerCase()
      if (sessionEmail !== email.toLowerCase()) {
        await supabase.auth.signOut().catch(() => {})
        return { ok: false, error: 'Не удалось создать защищённую сессию администратора' }
      }
    }

    return { ok: true, session }
  } catch {
    if (required) {
      return {
        ok: false,
        error: 'Supabase Auth недоступен. Проверьте подключение и попробуйте позже.',
      }
    }
    return { ok: true, optionalFailed: true }
  }
}

/**
 * Смена пароля: повторная авторизация + updateUser.
 * Пароль обрабатывается только через Supabase Auth.
 */
export async function changePasswordWithVerification({
  currentPassword,
  newPassword,
  fallbackLogin,
}) {
  if (!usesSupabaseAuth() || !supabase) {
    throw new Error('Смена пароля доступна только в облачном режиме с Supabase Auth.')
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) {
    throw new Error(mapPasswordChangeError(sessionError))
  }

  const email = resolveAuthEmail(sessionData.session, fallbackLogin)
  if (!email) {
    throw new Error('Сессия истекла. Войдите в аккаунт заново')
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  })

  if (signInError) {
    throw new Error(mapPasswordChangeError(signInError))
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
  if (updateError) {
    throw new Error(mapPasswordChangeError(updateError))
  }
}

/** @deprecated Используйте signInWithPhone */
export async function signInWithPhone(phoneInput, password) {
  const phone = normalizePhone(phoneInput)
  if (!phone) {
    return { ok: false, error: 'Проверьте номер телефона' }
  }
  return signInWithEmail(phoneToTechnicalEmail(phone), password)
}

export async function signInWithEmail(email, password) {
  const normalizedLogin = email?.trim()
  if (!normalizedLogin || !password) {
    return { ok: false, error: 'Неверный логин или пароль' }
  }

  if (usesSupabaseAuth()) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedLogin,
        password,
      })

      if (error) {
        return { ok: false, error: mapAuthError(error) }
      }

      const authUserId = data.session?.user?.id
      if (!authUserId) {
        await supabase.auth.signOut().catch(() => {})
        return { ok: false, error: 'Неверный логин или пароль' }
      }

      const profileRow = await loadAcademyProfileByAuthUserId(authUserId)
      if (profileRow?.deactivated) {
        await supabase.auth.signOut()
        return { ok: false, error: DEACTIVATED_ACCOUNT_MESSAGE }
      }
      if (!profileRow) {
        await supabase.auth.signOut()
        return { ok: false, error: 'Неверный логин или пароль' }
      }

      const user = await buildCloudPlatformSessionUser(profileRow)
      if (!user) {
        await supabase.auth.signOut()
        return { ok: false, error: 'Неверный логин или пароль' }
      }

      return { ok: true, user, session: data.session }
    } catch (err) {
      await supabase.auth.signOut().catch(() => {})
      return { ok: false, error: mapAuthError(err) }
    }
  }

  const legacy = authenticateEmployee(normalizedLogin, password)
  if (!legacy.ok) {
    if (legacy.reason === 'deactivated') {
      return { ok: false, error: DEACTIVATED_ACCOUNT_MESSAGE }
    }
    return { ok: false, error: 'Неверный логин или пароль' }
  }

  const role = getRole(legacy.user.role)
  return {
    ok: true,
    user: {
      id: legacy.user.id,
      login: legacy.user.login,
      email: legacy.user.login,
      name: legacy.user.name,
      role: legacy.user.role,
      roleName: role?.label || legacy.user.role,
      position: legacy.user.position || role?.label || legacy.user.role,
      avatarUrl: legacy.user.avatarUrl || null,
      permissions: role?.permissions || [],
      assignedCourseIds: legacy.user.assignedCourseIds || [],
    },
    session: null,
  }
}

export async function signOut() {
  if (usesSupabaseAuth() && supabase) {
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(mapAuthError(error))
  }
}

export async function getCurrentAuthSession() {
  if (!usesSupabaseAuth() || !supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error(mapAuthError(error))
  return data.session
}

export async function resolveSessionUser(session) {
  if (!session?.user?.id) return null
  return resolveCloudSessionFromAuthUserId(session.user.id)
}

export async function sendPasswordResetEmail(email) {
  if (!usesSupabaseAuth() || !supabase) {
    throw new Error('Восстановление пароля доступно только в облачном режиме с Supabase Auth.')
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: getPasswordResetRedirectUrl(),
  })

  if (error) {
    throw new Error(mapAuthError(error))
  }
}

export async function updatePassword(newPassword) {
  if (!usesSupabaseAuth() || !supabase) {
    throw new Error('Смена пароля доступна только в облачном режиме с Supabase Auth.')
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) {
    throw new Error(mapAuthError(error))
  }
}

export function subscribeToAuthChanges(callback) {
  if (!usesSupabaseAuth() || !supabase) return () => {}

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session, event)
  })

  return () => {
    data.subscription.unsubscribe()
  }
}
