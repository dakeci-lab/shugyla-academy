import { supabase } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
import {
  extractFunctionErrorBody,
  isGenericInvokeErrorMessage,
} from '../utils/edgeFunctionErrors'
import { sortNotificationSettings } from '../utils/notificationRuleSettings'

const ERROR_MESSAGES = {
  forbidden: 'У вас нет прав для управления уведомлениями',
  unauthorized: 'Сессия завершена. Войдите повторно',
  validation: 'Проверьте введённые значения',
  load: 'Не удалось загрузить настройки уведомлений',
  save: 'Не удалось сохранить настройки уведомлений',
}

function mapSettingsError(errorBody, fallbackMessage) {
  const code = errorBody?.code ?? errorBody?.error?.code

  if (code === 'forbidden' || code === 'inactive_caller') return ERROR_MESSAGES.forbidden
  if (code === 'unauthorized') return ERROR_MESSAGES.unauthorized
  if (
    code === 'validation_error' ||
    code === 'malformed_json' ||
    code === 'forbidden_field'
  ) {
    return ERROR_MESSAGES.validation
  }
  return fallbackMessage
}

async function ensureCloudSession() {
  if (!isCloudMode() || !supabase) {
    throw new Error('Доступно только в облачном режиме')
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData?.session?.access_token) {
    throw new Error(ERROR_MESSAGES.unauthorized)
  }
}

async function invokeNotificationSettings(body) {
  await ensureCloudSession()

  const { data, error } = await supabase.functions.invoke('admin-notification-settings', {
    body,
  })

  if (error) {
    const errorBody = await extractFunctionErrorBody(error)
    const message = mapSettingsError(
      errorBody,
      isGenericInvokeErrorMessage(error.message) ? body.action === 'get_settings'
        ? ERROR_MESSAGES.load
        : ERROR_MESSAGES.save
        : error.message
    )
    throw new Error(message)
  }

  if (!data?.ok || !Array.isArray(data.settings)) {
    throw new Error(body.action === 'get_settings' ? ERROR_MESSAGES.load : ERROR_MESSAGES.save)
  }

  return sortNotificationSettings(data.settings)
}

export async function fetchNotificationSettings() {
  return invokeNotificationSettings({ action: 'get_settings' })
}

export async function saveNotificationSettings(settings) {
  return invokeNotificationSettings({
    action: 'update_settings',
    settings: settings.map((item) => ({
      code: item.code,
      is_enabled: Boolean(item.is_enabled),
      offset_minutes: item.offset_minutes,
    })),
  })
}
