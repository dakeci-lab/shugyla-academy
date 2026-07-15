import { useCallback, useEffect, useState } from 'react'
import { isCloudMode } from '../../../lib/dataMode'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import {
  disablePushNotifications,
  enablePushNotifications,
  getNotificationPermission,
  getPushRegistrationStatus,
  isWebPushSupported,
  isProductionE2eTestSendEnabled,
  sendServerTestWebPush,
  showDevelopmentTestNotification,
  WebPushError,
  WEB_PUSH_ERROR_MESSAGES,
} from '../../../services/webPushSubscriptionService'
import './PushNotificationSettings.css'

const UI_STATE = {
  LOADING: 'loading',
  UNSUPPORTED: 'unsupported',
  OFFLINE_MODE: 'offline_mode',
  DEFAULT: 'default',
  ENABLING: 'enabling',
  ENABLED: 'enabled',
  DENIED: 'denied',
  ERROR: 'error',
  DISABLED: 'disabled',
  DISABLING: 'disabling',
}

const SERVER_SEND_STATE = {
  IDLE: 'idle',
  SENDING: 'sending',
  SUCCESS: 'success',
  ERROR: 'error',
}

export default function PushNotificationSettings() {
  const { supabaseAuthenticated } = useSession()
  const { success: showSuccess, warning: showWarning } = useToast()
  const [uiState, setUiState] = useState(UI_STATE.LOADING)
  const [errorMessage, setErrorMessage] = useState('')
  const [serverSendState, setServerSendState] = useState(SERVER_SEND_STATE.IDLE)
  const [serverSendMessage, setServerSendMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const refreshStatus = useCallback(async () => {
    if (!isCloudMode()) {
      setUiState(UI_STATE.OFFLINE_MODE)
      return
    }

    if (!supabaseAuthenticated) {
      setUiState(UI_STATE.DEFAULT)
      return
    }

    if (!isWebPushSupported()) {
      setUiState(UI_STATE.UNSUPPORTED)
      return
    }

    const permission = getNotificationPermission()
    if (permission === 'denied') {
      setUiState(UI_STATE.DENIED)
      return
    }

    try {
      const status = await getPushRegistrationStatus()
      if (status.active && status.registered) {
        setUiState(UI_STATE.ENABLED)
        return
      }
      if (status.registered && !status.active) {
        setUiState(UI_STATE.DISABLED)
        return
      }
      if (permission === 'granted' && status.syncPending) {
        setUiState(UI_STATE.ERROR)
        setErrorMessage('Не удалось синхронизировать подписку с сервером')
        return
      }
      setUiState(UI_STATE.DEFAULT)
    } catch (err) {
      setErrorMessage(err.message || 'Не удалось проверить состояние уведомлений')
      setUiState(UI_STATE.ERROR)
    }
  }, [supabaseAuthenticated])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  function resolveEnableErrorMessage(err) {
    if (err instanceof WebPushError && err.code && WEB_PUSH_ERROR_MESSAGES[err.code]) {
      return WEB_PUSH_ERROR_MESSAGES[err.code]
    }
    return err?.message || WEB_PUSH_ERROR_MESSAGES.backend_registration_failed
  }

  async function handleEnable() {
    if (busy) return
    setBusy(true)
    setErrorMessage('')
    setUiState(UI_STATE.ENABLING)
    try {
      await enablePushNotifications()
      setUiState(UI_STATE.ENABLED)
      showSuccess('Уведомления на этом устройстве включены')
    } catch (err) {
      if (
        err instanceof WebPushError &&
        err.code === 'permission_denied'
      ) {
        setUiState(UI_STATE.DENIED)
        showWarning(WEB_PUSH_ERROR_MESSAGES.permission_denied)
        return
      }
      if (getNotificationPermission() === 'denied') {
        setUiState(UI_STATE.DENIED)
        showWarning(WEB_PUSH_ERROR_MESSAGES.permission_denied)
        return
      }
      setErrorMessage(resolveEnableErrorMessage(err))
      setUiState(UI_STATE.ERROR)
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable() {
    if (busy) return
    setBusy(true)
    setErrorMessage('')
    setUiState(UI_STATE.DISABLING)
    try {
      await disablePushNotifications()
      setUiState(UI_STATE.DISABLED)
      showSuccess('Уведомления отключены')
    } catch (err) {
      setErrorMessage(resolveEnableErrorMessage(err))
      setUiState(UI_STATE.ERROR)
    } finally {
      setBusy(false)
    }
  }

  async function handleDevTest() {
    try {
      await showDevelopmentTestNotification()
    } catch (err) {
      showWarning(err.message || 'Не удалось показать тестовое уведомление')
    }
  }

  async function handleServerTest() {
    if (serverSendState === SERVER_SEND_STATE.SENDING) return

    setServerSendState(SERVER_SEND_STATE.SENDING)
    setServerSendMessage('')
    try {
      await sendServerTestWebPush()
      setServerSendState(SERVER_SEND_STATE.SUCCESS)
      setServerSendMessage('Серверное push-уведомление отправлено')
      showSuccess('Серверное push-уведомление отправлено')
    } catch (err) {
      const message = err.message || 'Не удалось отправить push-уведомление'
      setServerSendState(SERVER_SEND_STATE.ERROR)
      setServerSendMessage(message)
      showWarning(message)

      if (
        message.includes('не зарегистрировано') ||
        message.includes('устарела')
      ) {
        await refreshStatus()
      }
    }
  }

  return (
    <section className="push-settings profile-page__card">
      <h2 className="push-settings__title">Уведомления на этом устройстве</h2>
      <p className="push-settings__description">
        Получайте напоминания о смене и важных событиях, даже когда платформа закрыта.
      </p>

      {uiState === UI_STATE.LOADING && (
        <p className="push-settings__status" role="status">
          Проверяем состояние…
        </p>
      )}

      {uiState === UI_STATE.UNSUPPORTED && (
        <p className="push-settings__status">
          Этот браузер не поддерживает системные уведомления.
        </p>
      )}

      {uiState === UI_STATE.OFFLINE_MODE && (
        <p className="push-settings__status">
          Web Push доступен только в облачном режиме с Supabase Auth.
        </p>
      )}

      {uiState === UI_STATE.DENIED && (
        <p className="push-settings__status push-settings__status--warning">
          {WEB_PUSH_ERROR_MESSAGES.permission_denied}
        </p>
      )}

      {(uiState === UI_STATE.DEFAULT || uiState === UI_STATE.DISABLED) && (
        <div className="push-settings__actions">
          {uiState === UI_STATE.DISABLED && (
            <p className="push-settings__status">Уведомления отключены</p>
          )}
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={handleEnable}
            disabled={busy}
          >
            {uiState === UI_STATE.DISABLED ? 'Включить снова' : 'Включить уведомления'}
          </button>
        </div>
      )}

      {uiState === UI_STATE.ENABLING && (
        <button type="button" className="btn btn--primary btn--sm" disabled>
          Подключаем…
        </button>
      )}

      {uiState === UI_STATE.ENABLED && (
        <div className="push-settings__actions">
          <p className="push-settings__status push-settings__status--success">
            Уведомления включены
          </p>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={handleDisable}
            disabled={busy}
          >
            Отключить
          </button>
          {import.meta.env.DEV && (
            <div className="push-settings__dev-tests">
              <p className="push-settings__hint">
                Локальное уведомление проверяет браузер. Серверное push проверяет полный путь от Edge Function до устройства.
              </p>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={handleDevTest}
              >
                Показать локальное уведомление
              </button>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={handleServerTest}
                disabled={serverSendState === SERVER_SEND_STATE.SENDING || busy}
              >
                {serverSendState === SERVER_SEND_STATE.SENDING
                  ? 'Отправляем…'
                  : 'Отправить серверное push'}
              </button>
              {serverSendMessage && (
                <p
                  className={`push-settings__status ${
                    serverSendState === SERVER_SEND_STATE.SUCCESS
                      ? 'push-settings__status--success'
                      : 'push-settings__status--warning'
                  }`}
                  role="status"
                >
                  {serverSendMessage}
                </p>
              )}
            </div>
          )}
          {isProductionE2eTestSendEnabled() && !import.meta.env.DEV && (
            <div className="push-settings__dev-tests">
              <p className="push-settings__hint">
                Одно контролируемое тестовое уведомление отправляется только на это устройство.
              </p>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={handleServerTest}
                disabled={
                  serverSendState === SERVER_SEND_STATE.SENDING ||
                  serverSendState === SERVER_SEND_STATE.SUCCESS ||
                  busy
                }
              >
                {serverSendState === SERVER_SEND_STATE.SENDING
                  ? 'Отправляем…'
                  : 'Отправить тестовое уведомление'}
              </button>
              {serverSendMessage && (
                <p
                  className={`push-settings__status ${
                    serverSendState === SERVER_SEND_STATE.SUCCESS
                      ? 'push-settings__status--success'
                      : 'push-settings__status--warning'
                  }`}
                  role="status"
                >
                  {serverSendMessage}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {uiState === UI_STATE.DISABLING && (
        <button type="button" className="btn btn--outline btn--sm" disabled>
          Отключаем…
        </button>
      )}

      {uiState === UI_STATE.ERROR && (
        <div className="push-settings__actions">
          <p className="push-settings__status push-settings__status--warning">
            {errorMessage || 'Не удалось подключить уведомления'}
          </p>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={handleEnable}
            disabled={busy}
          >
            Повторить
          </button>
        </div>
      )}
    </section>
  )
}
