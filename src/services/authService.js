import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { getRole } from '../data/roles'
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
} from '../utils/phoneUtils'

const APP_BASE = '/shugyla-academy'

export function usesSupabaseAuth() {
  return isSupabaseConfigured()
}

export function getPasswordResetRedirectUrl() {
  if (typeof window === 'undefined') {
    return `${APP_BASE}/reset-password`
  }
  return `${window.location.origin}${APP_BASE}/reset-password`
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
    roleName: role?.label || employee.role,
    permissions: role?.permissions || [],
    assignedCourseIds: employee.assignedCourseIds || [],
  }
}

export async function loadAcademyProfileByLogin(loginValue) {
  const login = loginValue?.trim()
  if (!login) return null

  if (isCloudMode() && supabase) {
    const result = await supabase
      .from('academy_users')
      .select('*')
      .eq('login', login)
      .maybeSingle()

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
      normalizeEmployee({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        name: row.full_name,
        login: row.login,
        password: row.password,
        role: row.role,
        position: row.position,
        employmentStatus: row.status,
        assignedCourseIds: (assignmentsRes.data || []).map((a) => a.course_id),
        avatarUrl: row.avatar_url,
      }),
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

export async function loadAcademyProfileByEmail(email) {
  const phone = technicalEmailToPhone(email)
  if (phone) return loadAcademyProfileByLogin(phone)
  return loadAcademyProfileByLogin(email)
}

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

/** @deprecated Используйте signInWithEmail */
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

      const profile = await loadAcademyProfileByEmail(normalizedLogin)
      if (profile?.deactivated) {
        await supabase.auth.signOut()
        return { ok: false, error: 'Аккаунт деактивирован. Обратитесь к администратору.' }
      }
      if (!profile) {
        await supabase.auth.signOut()
        return {
          ok: false,
          error:
            'Профиль сотрудника не найден. Убедитесь, что логин совпадает с учётной записью в системе.',
        }
      }

      return { ok: true, user: profile, session: data.session }
    } catch (err) {
      return { ok: false, error: mapAuthError(err) }
    }
  }

  const legacy = authenticateEmployee(normalizedLogin, password)
  if (!legacy.ok) {
    if (legacy.reason === 'deactivated') {
      return { ok: false, error: 'Аккаунт деактивирован. Обратитесь к администратору.' }
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
  if (!session?.user?.email) return null
  const phone = technicalEmailToPhone(session.user.email)
  const profile = phone
    ? await loadAcademyProfileByLogin(phone)
    : await loadAcademyProfileByEmail(session.user.email)
  if (!profile || profile.deactivated) return null
  return phone ? { ...profile, phone } : profile
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

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })

  return () => {
    data.subscription.unsubscribe()
  }
}
