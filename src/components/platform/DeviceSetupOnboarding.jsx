import { useEffect, useState } from 'react'
import { useToast } from '../../context/ToastContext'
import { useDevicePermissionsContext } from '../../context/DevicePermissionsContext'
import {
  enableNotificationsFromUserGesture,
  recheckNotificationPermissionState,
} from '../../services/devicePermissionsService'
import { WebPushError } from '../../services/webPushSubscriptionService'
import { lockModalScroll, unlockModalScroll } from '../../utils/modalScrollLock'
import './DeviceSetupOnboarding.css'

function isAndroidLike() {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent || '')
}

function NotificationDeniedHelp({ isIos }) {
  if (isIos) {
    return (
      <div className="device-setup-onboarding__hint">
        Включите уведомления для Shugyla Platform в «Настройки → Уведомления», затем нажмите
        «Проверить снова».
      </div>
    )
  }

  if (isAndroidLike()) {
    return (
      <div className="device-setup-onboarding__hint">
        Разрешите уведомления для Shugyla Platform в настройках Chrome, затем нажмите «Проверить
        снова».
      </div>
    )
  }

  return (
    <div className="device-setup-onboarding__hint">
      Разрешите уведомления в настройках браузера, затем нажмите «Проверить снова».
    </div>
  )
}

function PwaInstallHelp({ isIos }) {
  if (isIos) {
    return (
      <div className="device-setup-onboarding__hint">
        Установите на экран «Домой»: Поделиться → «На экран „Домой“», затем откройте приложение с
        главного экрана.
      </div>
    )
  }

  return (
    <div className="device-setup-onboarding__hint">
      Установите Shugyla Platform на устройство и откройте установленное приложение.
    </div>
  )
}

/** Compact notifications-only setup — no geolocation. */
export default function DeviceSetupOnboarding() {
  const { state, showOnboarding, dismissForSession, refresh } = useDevicePermissionsContext()
  const { success: showSuccess, warning: showWarning } = useToast()
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (!showOnboarding) return undefined
    lockModalScroll()
    return () => unlockModalScroll()
  }, [showOnboarding])

  if (!showOnboarding || !state) return null

  const isIos = state.needsPwaInstall || /iPad|iPhone|iPod/i.test(navigator.userAgent || '')
  const notificationDenied = state.notificationPermission === 'denied'
  const needsReconnect = state.subscriptionStatus === 'outdated'

  async function handleEnableNotifications() {
    if (busy) return
    setBusy(true)
    setLocalError('')
    try {
      await enableNotificationsFromUserGesture({ reconnect: needsReconnect })
      showSuccess('Уведомления подключены')
      await refresh()
    } catch (err) {
      if (err instanceof WebPushError && err.code === 'permission_denied') {
        showWarning('Уведомления запрещены')
        setLocalError('Уведомления запрещены')
      } else if (err instanceof WebPushError && err.code === 'needs_pwa') {
        setLocalError('Установите приложение на главный экран')
      } else {
        setLocalError(err?.message || 'Не удалось подключить')
        showWarning('Не удалось подключить')
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleRecheckNotifications() {
    if (busy) return
    setBusy(true)
    setLocalError('')
    try {
      const next = await recheckNotificationPermissionState()
      if (next.notificationPermission === 'granted' && !next.notificationsReady) {
        await enableNotificationsFromUserGesture({
          reconnect: next.subscriptionStatus === 'outdated',
        })
        showSuccess('Уведомления подключены')
      }
      await refresh()
    } catch (err) {
      setLocalError(err?.message || 'Не удалось проверить разрешение')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="device-setup-onboarding"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-setup-title"
    >
      <div className="device-setup-onboarding__card">
        <h2 id="device-setup-title" className="device-setup-onboarding__title">
          Уведомления
        </h2>

        {state.needsPwaInstall && <PwaInstallHelp isIos={isIos} />}

        {notificationDenied && !state.needsPwaInstall && <NotificationDeniedHelp isIos={isIos} />}

        {localError ? (
          <p className="device-setup-onboarding__status device-setup-onboarding__status--warn" role="alert">
            {localError}
          </p>
        ) : null}

        <div className="device-setup-onboarding__actions">
          {!state.needsPwaInstall &&
            (notificationDenied ? (
              <button
                type="button"
                className="btn btn--primary device-setup-onboarding__primary"
                onClick={() => void handleRecheckNotifications()}
                disabled={busy}
              >
                {busy ? 'Проверяем…' : 'Проверить снова'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary device-setup-onboarding__primary"
                onClick={() => void handleEnableNotifications()}
                disabled={busy}
              >
                {busy ? 'Подключаем…' : 'Включить уведомления'}
              </button>
            ))}

          <button
            type="button"
            className="btn btn--outline device-setup-onboarding__secondary"
            onClick={dismissForSession}
            disabled={busy}
          >
            Не сейчас
          </button>
        </div>
      </div>
    </div>
  )
}
