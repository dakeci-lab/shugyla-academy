import { useCallback, useEffect, useState } from 'react'
import { isCloudMode } from '../../lib/dataMode'
import { useSession } from '../../context/SessionContext'
import { useToast } from '../../context/ToastContext'
import AdminModal from '../admin/AdminModal'
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
} from '../../services/webPushSubscriptionService'
import './ProfileNotificationsModal.css'

function isPushConnected(status) {
  return status === DEVICE_CONNECTION_STATUS.CONNECTED
}

function getStatusLabel(status) {
  if (status === DEVICE_CONNECTION_STATUS.CONNECTED) return 'Включены'
  if (status === DEVICE_CONNECTION_STATUS.DENIED) return 'Запрещены в настройках браузера'
  return 'Выключены'
}

/** Компактное модальное окно push-уведомлений текущего устройства */
export default function ProfileNotificationsModal({ open, onClose, returnFocusRef }) {
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
    if (!open) return undefined
    void refreshStatus()
  }, [open, refreshStatus])

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
      await connectDeviceNotifications({ reconnect: status === DEVICE_CONNECTION_STATUS.RECONNECTION_REQUIRED })
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

  if (!open) return null

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
    <AdminModal title="Уведомления" onClose={onClose} returnFocusRef={returnFocusRef}>
      <div className="profile-notifications-modal">
        <div className="profile-notifications-modal__row">
          <span className="profile-notifications-modal__label">Уведомления на этом устройстве</span>
          <label className="profile-notifications-modal__toggle">
            <input
              type="checkbox"
              checked={enabled}
              disabled={toggleDisabled}
              onChange={(event) => void handleToggle(event.target.checked)}
            />
            <span className="profile-notifications-modal__toggle-ui" aria-hidden="true" />
          </label>
        </div>
        <p className="profile-notifications-modal__status">{getStatusLabel(status)}</p>
      </div>
    </AdminModal>
  )
}
