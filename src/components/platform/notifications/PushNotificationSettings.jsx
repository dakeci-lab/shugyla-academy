import { useCallback, useEffect, useState } from 'react'
import { isCloudMode } from '../../../lib/dataMode'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import { isAdmin } from '../../../data/roles'
import {
  clearTestUiSessionState,
  connectDeviceNotifications,
  CONNECT_SUCCESS_HINT,
  CONNECT_SUCCESS_MESSAGE,
  CONNECTION_ERROR_HINT,
  CONNECTION_ERROR_MESSAGE,
  DEVICE_CONNECTION_STATUS,
  disablePushNotifications,
  getDeviceConnectionStatus,
  getNotificationPermission,
  isWebPushDiagnosticsEnabled,
  isWebPushSupported,
  resolveConnectionErrorMessage,
  WebPushError,
  WEB_PUSH_ERROR_MESSAGES,
} from '../../../services/webPushSubscriptionService'
import PushNotificationDiagnostics from './PushNotificationDiagnostics'
import './PushNotificationSettings.css'

const DISCONNECT_CONFIRM_MESSAGE =
  'Отключить уведомления на этом устройстве? Напоминания о смене больше не будут приходить.'

export default function PushNotificationSettings() {
  const { user, supabaseAuthenticated } = useSession()
  const { success: showSuccess, warning: showWarning } = useToast()
  const [status, setStatus] = useState(DEVICE_CONNECTION_STATUS.LOADING)
  const [busy, setBusy] = useState(false)
  const [successHint, setSuccessHint] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const showDiagnostics = isAdmin(user?.role) && isWebPushDiagnosticsEnabled()

  const refreshStatus = useCallback(async () => {
    if (!isCloudMode()) {
      setStatus(DEVICE_CONNECTION_STATUS.OFFLINE_MODE)
      return
    }

    if (!supabaseAuthenticated) {
      setStatus(DEVICE_CONNECTION_STATUS.NOT_CONNECTED)
      return
    }

    if (!isWebPushSupported()) {
      setStatus(DEVICE_CONNECTION_STATUS.UNSUPPORTED)
      return
    }

    try {
      const next = await getDeviceConnectionStatus()
      setStatus(next.status)
    } catch (err) {
      setErrorMessage(err.message || CONNECTION_ERROR_MESSAGE)
      setStatus(DEVICE_CONNECTION_STATUS.ERROR)
    }
  }, [supabaseAuthenticated])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (!showDiagnostics) {
      clearTestUiSessionState()
    }
  }, [showDiagnostics])

  async function handleConnect({ reconnect = false } = {}) {
    if (busy) return
    setBusy(true)
    setErrorMessage('')
    setSuccessHint('')
    setStatus(DEVICE_CONNECTION_STATUS.CONNECTING)
    try {
      await connectDeviceNotifications({ reconnect })
      setSuccessHint(CONNECT_SUCCESS_HINT)
      showSuccess(CONNECT_SUCCESS_MESSAGE)
      await refreshStatus()
    } catch (err) {
      if (
        err instanceof WebPushError &&
        err.code === 'permission_denied'
      ) {
        setStatus(DEVICE_CONNECTION_STATUS.DENIED)
        showWarning(WEB_PUSH_ERROR_MESSAGES.permission_denied)
        return
      }
      if (getNotificationPermission() === 'denied') {
        setStatus(DEVICE_CONNECTION_STATUS.DENIED)
        showWarning(WEB_PUSH_ERROR_MESSAGES.permission_denied)
        return
      }
      setErrorMessage(resolveConnectionErrorMessage(err))
      setStatus(DEVICE_CONNECTION_STATUS.ERROR)
      showWarning(CONNECTION_ERROR_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    if (busy) return
    if (!window.confirm(DISCONNECT_CONFIRM_MESSAGE)) return

    setBusy(true)
    setErrorMessage('')
    setSuccessHint('')
    setStatus(DEVICE_CONNECTION_STATUS.DISCONNECTING)
    try {
      await disablePushNotifications()
      showSuccess('Уведомления отключены')
      await refreshStatus()
    } catch (err) {
      setErrorMessage(resolveConnectionErrorMessage(err))
      setStatus(DEVICE_CONNECTION_STATUS.ERROR)
      showWarning(CONNECTION_ERROR_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  async function handleRecheckDenied() {
    if (busy) return
    setBusy(true)
    setErrorMessage('')
    setSuccessHint('')
    try {
      if (getNotificationPermission() === 'granted') {
        await connectDeviceNotifications({ reconnect: true })
        setSuccessHint(CONNECT_SUCCESS_HINT)
        showSuccess(CONNECT_SUCCESS_MESSAGE)
      }
      await refreshStatus()
    } catch (err) {
      setErrorMessage(resolveConnectionErrorMessage(err))
      setStatus(DEVICE_CONNECTION_STATUS.ERROR)
      showWarning(CONNECTION_ERROR_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  const primaryButtonLabel =
    status === DEVICE_CONNECTION_STATUS.RECONNECTION_REQUIRED
      ? 'Переподключить уведомления'
      : 'Подключить уведомления'

  const showPrimaryButton =
    status === DEVICE_CONNECTION_STATUS.NOT_CONNECTED ||
    status === DEVICE_CONNECTION_STATUS.RECONNECTION_REQUIRED ||
    status === DEVICE_CONNECTION_STATUS.ERROR

  const showDisconnectButton = status === DEVICE_CONNECTION_STATUS.CONNECTED

  return (
    <section className="push-settings profile-page__card">
      <h2 className="push-settings__title">Уведомления на этом устройстве</h2>
      <p className="push-settings__description">
        Получайте напоминания о начале и завершении смены, даже когда платформа закрыта.
      </p>

      {status === DEVICE_CONNECTION_STATUS.LOADING && (
        <p className="push-settings__status" role="status">
          Проверяем состояние…
        </p>
      )}

      {status === DEVICE_CONNECTION_STATUS.UNSUPPORTED && (
        <div className="push-settings__panel">
          <p className="push-settings__status-title">Уведомления не поддерживаются на этом устройстве</p>
          <p className="push-settings__status-text">
            Обновите браузер или установите Shugyla Platform на главный экран.
          </p>
        </div>
      )}

      {status === DEVICE_CONNECTION_STATUS.OFFLINE_MODE && (
        <div className="push-settings__panel">
          <p className="push-settings__status-text">
            Уведомления доступны только в облачном режиме с авторизацией.
          </p>
        </div>
      )}

      {status === DEVICE_CONNECTION_STATUS.CONNECTED && (
        <div className="push-settings__panel push-settings__panel--success">
          <p className="push-settings__status-title push-settings__status-title--success">
            Уведомления подключены
          </p>
          <p className="push-settings__status-text">
            Напоминания о смене будут приходить на это устройство автоматически.
          </p>
          {successHint && (
            <p className="push-settings__status-text push-settings__status-text--success">{successHint}</p>
          )}
        </div>
      )}

      {status === DEVICE_CONNECTION_STATUS.RECONNECTION_REQUIRED && (
        <div className="push-settings__panel push-settings__panel--warning">
          <p className="push-settings__status-title push-settings__status-title--warning">
            Требуется переподключение
          </p>
          <p className="push-settings__status-text">
            Подключение уведомлений устарело. Переподключите устройство, чтобы снова получать напоминания.
          </p>
        </div>
      )}

      {status === DEVICE_CONNECTION_STATUS.NOT_CONNECTED && (
        <div className="push-settings__panel">
          <p className="push-settings__status-title">Уведомления не подключены</p>
          <p className="push-settings__status-text">
            Подключите уведомления, чтобы получать напоминания о своей смене.
          </p>
        </div>
      )}

      {status === DEVICE_CONNECTION_STATUS.DENIED && (
        <div className="push-settings__panel push-settings__panel--warning">
          <p className="push-settings__status-title push-settings__status-title--warning">
            Уведомления запрещены в настройках устройства
          </p>
          <p className="push-settings__status-text">
            Разрешите уведомления для Shugyla Platform в настройках телефона, затем вернитесь и повторите
            подключение.
          </p>
          <p className="push-settings__status-text push-settings__device-hint">
            Откройте Настройки → Уведомления → Shugyla Platform → Разрешить уведомления.
          </p>
        </div>
      )}

      {status === DEVICE_CONNECTION_STATUS.ERROR && (
        <div className="push-settings__panel push-settings__panel--warning">
          <p className="push-settings__status-title push-settings__status-title--warning">
            {CONNECTION_ERROR_MESSAGE}
          </p>
          <p className="push-settings__status-text">{errorMessage || CONNECTION_ERROR_HINT}</p>
        </div>
      )}

      {(status === DEVICE_CONNECTION_STATUS.CONNECTING ||
        status === DEVICE_CONNECTION_STATUS.DISCONNECTING) && (
        <p className="push-settings__status" role="status">
          {status === DEVICE_CONNECTION_STATUS.CONNECTING ? 'Подключаем…' : 'Отключаем…'}
        </p>
      )}

      <div className="push-settings__actions">
        {showPrimaryButton && status !== DEVICE_CONNECTION_STATUS.CONNECTING && (
          <button
            type="button"
            className="btn btn--primary push-settings__primary-btn"
            onClick={() =>
              void handleConnect({
                reconnect: status === DEVICE_CONNECTION_STATUS.RECONNECTION_REQUIRED,
              })
            }
            disabled={busy}
          >
            {busy ? 'Подключаем…' : primaryButtonLabel}
          </button>
        )}

        {status === DEVICE_CONNECTION_STATUS.DENIED && (
          <button
            type="button"
            className="btn btn--primary push-settings__primary-btn"
            onClick={() => void handleRecheckDenied()}
            disabled={busy}
          >
            {busy ? 'Проверяем…' : 'Проверить снова'}
          </button>
        )}

        {showDisconnectButton && status !== DEVICE_CONNECTION_STATUS.DISCONNECTING && (
          <button
            type="button"
            className="btn btn--outline push-settings__secondary-btn"
            onClick={() => void handleDisconnect()}
            disabled={busy}
          >
            {busy ? 'Отключаем…' : 'Отключить уведомления'}
          </button>
        )}
      </div>

      {showDiagnostics && (
        <PushNotificationDiagnostics
          busy={busy}
          onBusyChange={setBusy}
          onRefreshStatus={refreshStatus}
        />
      )}
    </section>
  )
}
