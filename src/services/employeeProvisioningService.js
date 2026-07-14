import { supabase } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'

const ERROR_MESSAGES = {
  forbidden: 'У вас нет прав на создание сотрудников',
  conflict_login: 'Сотрудник с таким логином уже существует',
  conflict_auth: 'Аккаунт с таким логином уже существует',
  validation: 'Проверьте заполненные поля',
  unauthorized: 'Сессия истекла. Войдите в аккаунт заново',
  default: 'Не удалось создать сотрудника',
}

function mapProvisioningError(errorBody, fallbackMessage) {
  const code = errorBody?.error?.code
  const message = errorBody?.error?.message

  if (code === 'forbidden') return ERROR_MESSAGES.forbidden
  if (code === 'conflict') {
    if (message?.toLowerCase().includes('auth')) return ERROR_MESSAGES.conflict_auth
    return ERROR_MESSAGES.conflict_login
  }
  if (code === 'validation_error' || code === 'malformed_json') return ERROR_MESSAGES.validation
  if (code === 'unauthorized') return ERROR_MESSAGES.unauthorized
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
    position: payload.position?.trim() || undefined,
    avatar_url: payload.avatarUrl || undefined,
  }

  const { data, error } = await supabase.functions.invoke('admin-create-employee', { body })

  if (error) {
    const contextBody = error.context?.json ?? error.context?.body
    if (contextBody && typeof contextBody === 'object') {
      throw new Error(mapProvisioningError(contextBody, ERROR_MESSAGES.default))
    }
    throw new Error(mapProvisioningError(null, error.message))
  }

  if (!data?.ok || !data?.employee) {
    throw new Error(mapProvisioningError(data, ERROR_MESSAGES.default))
  }

  return data.employee
}
