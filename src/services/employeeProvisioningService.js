import { supabase } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
import {
  extractFunctionErrorBody,
  isGenericInvokeErrorMessage,
} from '../utils/edgeFunctionErrors'

const ERROR_MESSAGES = {
  forbidden: 'У вас нет прав на создание сотрудников',
  conflict_login: 'Логин уже используется другим сотрудником',
  conflict_auth: 'Аккаунт с таким логином уже существует',
  validation: 'Проверьте заполненные поля',
  password: 'Пароль должен содержать минимум 6 символов',
  role: 'Выбранная роль недоступна',
  unauthorized: 'Сессия завершена. Войдите повторно',
  default: 'Не удалось создать сотрудника. Повторите попытку',
}

function mapProvisioningError(errorBody, fallbackMessage) {
  const code = errorBody?.error?.code ?? errorBody?.code
  const message = errorBody?.error?.message ?? errorBody?.message ?? ''

  if (code === 'forbidden') return ERROR_MESSAGES.forbidden
  if (code === 'conflict') {
    if (message?.toLowerCase().includes('auth')) return ERROR_MESSAGES.conflict_auth
    return ERROR_MESSAGES.conflict_login
  }
  if (
    code === 'validation_error' ||
    code === 'invalid_position_id' ||
    code === 'position_not_found' ||
    code === 'position_inactive' ||
    code === 'position_group_not_found' ||
    code === 'position_group_inactive' ||
    code === 'position_mapping_ambiguous'
  ) {
    const normalized = message.toLowerCase()
    if (normalized.includes('password')) return ERROR_MESSAGES.password
    if (normalized.includes('role')) return ERROR_MESSAGES.role
    if (normalized.includes('login')) return 'Укажите корректный логин'
    if (code === 'position_mapping_ambiguous') {
      return 'Не удалось однозначно сопоставить должность. Обратитесь к администратору.'
    }
    if (String(code).startsWith('position_') || code === 'invalid_position_id') {
      return 'Выбранная должность недоступна'
    }
    return ERROR_MESSAGES.validation
  }
  if (code === 'malformed_json') return ERROR_MESSAGES.validation
  if (code === 'unauthorized') return ERROR_MESSAGES.unauthorized
  if (code === 'provisioning_error' || code === 'rollback_failed') {
    return ERROR_MESSAGES.default
  }
  return fallbackMessage || ERROR_MESSAGES.default
}

/**
 * Cloud-only: create employee via admin-create-employee Edge Function.
 * Never sends role/status/auth_user_id/password to the server.
 */
export async function createEmployeeWithAuth(payload) {
  if (!isCloudMode() || !supabase) {
    throw new Error('Создание через Supabase доступно только в облачном режиме')
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData?.session?.access_token) {
    throw new Error(ERROR_MESSAGES.unauthorized)
  }

  const body = {
    login: payload.login?.trim(),
    temporary_password: payload.temporaryPassword,
    first_name: payload.firstName?.trim(),
    last_name: payload.lastName?.trim(),
    full_name: payload.fullName?.trim(),
    role_id: payload.roleId,
    // Optional explicit id; otherwise Edge maps role.name → active position.
    position_id: payload.positionId || undefined,
    position: payload.position?.trim() || undefined,
    avatar_url: payload.avatarUrl || undefined,
    source_candidate_id: payload.sourceCandidateId || undefined,
  }

  const { data, error } = await supabase.functions.invoke('admin-create-employee', { body })

  if (error) {
    const contextBody = await extractFunctionErrorBody(error)
    const fallback = isGenericInvokeErrorMessage(error.message)
      ? ERROR_MESSAGES.default
      : error.message
    throw new Error(mapProvisioningError(contextBody, fallback))
  }

  if (!data?.ok || !data?.employee) {
    throw new Error(mapProvisioningError(data, ERROR_MESSAGES.default))
  }

  return data.employee
}

/**
 * Cloud-only: pre-submit login availability check, so the form can warn before
 * the user hits the hard 409 from createEmployeeWithAuth.
 * Returns null (instead of throwing) on any auth/network hiccup — the check is
 * advisory only, the server-side conflict check on submit remains authoritative.
 */
export async function checkEmployeeLoginAvailability(login) {
  const trimmed = login?.trim()
  if (!isCloudMode() || !supabase || !trimmed) return null

  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData?.session?.access_token) return null

  try {
    const { data, error } = await supabase.functions.invoke('admin-check-employee-login', {
      body: { login: trimmed },
    })
    if (error || !data?.ok) return null
    return { login: data.login, available: Boolean(data.available) }
  } catch {
    return null
  }
}
