import { useCallback, useEffect, useState } from 'react'
import { isCloudMode } from '../../../lib/dataMode'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import {
  connectDeviceNotifications,
  DEVICE_CONNECTION_STATUS,
  disablePushNotifications,
  getDeviceConnectionStatus,
  getNotificationPermission,
  isWebPushSupported,
  resolveConnectionErrorMessage,
  WebPushError,
  WEB_PUSH_ERROR_MESSAGES,
} from '../../../services/webPushSubscriptionService'
import './PushNotificationToggle.css'

function isPushConnected(status) {
  return status === DEVICE_CONNECTION_STATUS.CONNECTED
}

/** Компактный toggle push-уведомлений устройства (без подписи) */
export default function PushNotificationToggle({ className = '' }) {
  const { supabaseAuthenticated } = useSession()
  const { success: showSuccess, warning: showWarning } = useToast()
  const [status, setStatus] = useState(DEVICE_CONNECTION_STATUS.LOADING)
  const [busy, setBusy] = useState(false)

  const refreshStatus = useCallback(async () => {
    if (!isCloudMode() || !supabaseAuthenticated || !isWebPushSupported()) {
      setStatus(
        !isCloudMode() || !supabaseAuthenticated
          ? DEVICE_CONNECTION_STATUS.OFFLINE_MODE
          : DEVICE_CONNECTION_STATUS.UNSUPPORTED
      )
      return
    }

    try {
      const next = await getDeviceConnectionStatus()
      setStatus(next.status)
    } catch {
      setStatus(DEVICE_CONNECTION_STATUS.ERROR)
    }
  }, [supabaseAuthenticated])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  async function handleToggle(nextEnabled) {
    if (busy) return

    if (!nextEnabled) {
      setBusy(true)
      try {
        await disablePushNotifications()
        showSuccess('Уведомления выключены')
        await refreshStatus()
      } catch (err) {
        showWarning(resolveConnectionErrorMessage(err))
      } finally {
        setBusy(false)
      }
      return
    }

    setBusy(true)
    try {
      await connectDeviceNotifications({
        reconnect: status === DEVICE_CONNECTION_STATUS.RECONNECTION_REQUIRED,
      })
      showSuccess('Уведомления включены')
      await refreshStatus()
    } catch (err) {
      if (err instanceof WebPushError && err.code === 'permission_denied') {
        setStatus(DEVICE_CONNECTION_STATUS.DENIED)
        showWarning(WEB_PUSH_ERROR_MESSAGES.permission_denied)
        return
      }
      if (getNotificationPermission() === 'denied') {
        setStatus(DEVICE_CONNECTION_STATUS.DENIED)
        showWarning(WEB_PUSH_ERROR_MESSAGES.permission_denied)
        return
      }
      showWarning(resolveConnectionErrorMessage(err))
      await refreshStatus()
    } finally {
      setBusy(false)
    }
  }

  const denied = status === DEVICE_CONNECTION_STATUS.DENIED
  const unsupported =
    status === DEVICE_CONNECTION_STATUS.UNSUPPORTED ||
    status === DEVICE_CONNECTION_STATUS.OFFLINE_MODE
  const enabled = isPushConnected(status)
  const toggleDisabled =
    busy ||
    unsupported ||
    denied ||
    status === DEVICE_CONNECTION_STATUS.LOADING ||
    status === DEVICE_CONNECTION_STATUS.CONNECTING ||
    status === DEVICE_CONNECTION_STATUS.DISCONNECTING

  return (
    <label
      className={`push-notification-toggle ${className}`.trim()}
      title={enabled ? 'Уведомления включены' : 'Уведомления выключены'}
    >
      <input
        type="checkbox"
        checked={enabled}
        disabled={toggleDisabled}
        aria-label={enabled ? 'Выключить уведомления' : 'Включить уведомления'}
        onChange={(event) => void handleToggle(event.target.checked)}
      />
      <span className="push-notification-toggle__ui" aria-hidden="true" />
    </label>
  )
}
