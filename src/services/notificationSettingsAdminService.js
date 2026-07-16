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
  summary: 'Не удалось загрузить статистику тестовой отправки',
  send: 'Не удалось отправить тестовое уведомление',
  cooldown: 'Тестовое уведомление уже отправлялось недавно. Повторите через несколько секунд.',
  noSubscriptions: 'Нет подключённых устройств для отправки уведомления.',
  webPushNotConfigured: 'Web Push не настроен на сервере',
  offline: 'Нет подключения к интернету',
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

function mapBroadcastError(errorBody, fallbackMessage) {
  const code = errorBody?.code ?? errorBody?.error?.code

  if (code === 'broadcast_cooldown') return ERROR_MESSAGES.cooldown
  if (code === 'web_push_not_configured') return ERROR_MESSAGES.webPushNotConfigured
  return mapSettingsError(errorBody, fallbackMessage)
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

async function invokeAdminNotificationSettings(body) {
  await ensureCloudSession()

  const { data, error } = await supabase.functions.invoke('admin-notification-settings', {
    body,
  })

  if (error) {
    const errorBody = await extractFunctionErrorBody(error)
    throw { errorBody, invokeError: error }
  }

  return data
}

async function invokeNotificationSettings(body) {
  const data = await invokeAdminNotificationSettings(body)

  if (!data?.ok || !Array.isArray(data.settings)) {
    throw new Error(body.action === 'get_settings' ? ERROR_MESSAGES.load : ERROR_MESSAGES.save)
  }

  return data.settings
}

export async function fetchNotificationSettings() {
  const settings = await invokeNotificationSettings({ action: 'get_settings' })
  return sortNotificationSettings(settings)
}

export async function saveNotificationSettings(settings) {
  const saved = await invokeNotificationSettings({
    action: 'update_settings',
    settings: settings.map((item) => ({
      code: item.code,
      is_enabled: Boolean(item.is_enabled),
      offset_minutes: item.offset_minutes,
    })),
  })
  return sortNotificationSettings(saved)
}

export async function fetchTestBroadcastSummary() {
  try {
    const data = await invokeAdminNotificationSettings({ action: 'get_test_broadcast_summary' })

    if (!data?.ok || !data.summary) {
      throw new Error(ERROR_MESSAGES.summary)
    }

    return data.summary
  } catch (error) {
    if (error?.errorBody || error?.invokeError) {
      const message = mapBroadcastError(
        error.errorBody,
        isGenericInvokeErrorMessage(error.invokeError?.message)
          ? ERROR_MESSAGES.summary
          : error.invokeError?.message
      )
      throw new Error(message)
    }
    if (!navigator.onLine) throw new Error(ERROR_MESSAGES.offline)
    throw error instanceof Error ? error : new Error(ERROR_MESSAGES.summary)
  }
}

export async function sendTestBroadcast(requestId) {
  try {
    const data = await invokeAdminNotificationSettings({
      action: 'send_test_broadcast',
      request_id: requestId,
    })

    if (!data?.ok) {
      throw new Error(ERROR_MESSAGES.send)
    }

    return data
  } catch (error) {
    if (error?.errorBody || error?.invokeError) {
      const message = mapBroadcastError(
        error.errorBody,
        isGenericInvokeErrorMessage(error.invokeError?.message)
          ? ERROR_MESSAGES.send
          : error.invokeError?.message
      )
      throw new Error(message)
    }
    if (!navigator.onLine) throw new Error(ERROR_MESSAGES.offline)
    throw error instanceof Error ? error : new Error(ERROR_MESSAGES.send)
  }
}

export function formatTestBroadcastResult(result) {
  const {
    connected_devices: connectedDevices = 0,
    sent_count: sentCount = 0,
    failed_count: failedCount = 0,
    invalidated_count: invalidatedCount = 0,
    employees_with_subscriptions: employeesWithSubscriptions = 0,
  } = result

  if (connectedDevices === 0) {
    return {
      title: 'Отправка недоступна',
      message: ERROR_MESSAGES.noSubscriptions,
      variant: 'error',
    }
  }

  if (sentCount === 0 && failedCount > 0) {
    return {
      title: 'Не удалось отправить тестовое уведомление',
      message: `Подключённых устройств: ${connectedDevices}. Не удалось отправить: ${failedCount}.`,
      variant: 'error',
    }
  }

  if (failedCount > 0) {
    return {
      title: 'Уведомление отправлено частично',
      message: `Уведомление отправлено частично: ${sentCount} из ${connectedDevices} устройств. Сотрудников с уведомлениями: ${employeesWithSubscriptions}. Не удалось отправить: ${failedCount}. Неактивных подписок отключено: ${invalidatedCount}.`,
      variant: 'warning',
    }
  }

  return {
    title: 'Тестовое уведомление отправлено',
    message: `Сервер принял отправку: ${sentCount} из ${connectedDevices} устройств. Системное уведомление появится на устройствах с активной push-подпиской.`,
    variant: 'success',
  }
}
