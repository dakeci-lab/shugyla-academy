import { useEffect, useState } from 'react'
import { useToast } from '../../context/ToastContext'
import { useDevicePermissionsContext } from '../../context/DevicePermissionsContext'
import {
  enableGeolocationFromUserGesture,
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
        <strong>Уведомления запрещены в настройках устройства</strong>
        <ol>
          <li>Откройте «Настройки» iPhone.</li>
          <li>Перейдите в раздел «Уведомления».</li>
          <li>Найдите Shugyla Platform.</li>
          <li>Включите «Допуск уведомлений».</li>
          <li>Вернитесь в приложение и нажмите «Проверить снова».</li>
        </ol>
      </div>
    )
  }

  if (isAndroidLike()) {
    return (
      <div className="device-setup-onboarding__hint">
        <strong>Уведомления запрещены в настройках устройства</strong>
        <ol>
          <li>Откройте настройки приложения или сайта в Chrome.</li>
          <li>Разрешите уведомления для Shugyla Platform.</li>
          <li>Вернитесь и нажмите «Проверить снова».</li>
        </ol>
      </div>
    )
  }

  return (
    <div className="device-setup-onboarding__hint">
      Разрешите уведомления для Shugyla Platform в настройках браузера, затем нажмите «Проверить снова».
    </div>
  )
}

function PwaInstallHelp({ isIos }) {
  if (isIos) {
    return (
      <div className="device-setup-onboarding__hint">
        <strong>Для уведомлений установите приложение на главный экран</strong>
        <ol>
          <li>Нажмите «Поделиться» в Safari.</li>
          <li>Выберите «На экран „Домой“».</li>
          <li>Откройте Shugyla Platform с главного экрана.</li>
        </ol>
      </div>
    )
  }

  return (
    <div className="device-setup-onboarding__hint">
      Установите Shugyla Platform на устройство, затем откройте установленное приложение для подключения
      уведомлений.
    </div>
  )
}

/** First-run permissions setup — notifications then geolocation, only after user taps. */
export default function DeviceSetupOnboarding() {
  const { state, showOnboarding, dismissForSession, refresh } = useDevicePermissionsContext()
  const { success: showSuccess, warning: showWarning } = useToast()
  const [busyNotifications, setBusyNotifications] = useState(false)
  const [busyGeo, setBusyGeo] = useState(false)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (!showOnboarding) return undefined
    lockModalScroll()
    return () => unlockModalScroll()
  }, [showOnboarding])

  if (!showOnboarding || !state) return null

  const notificationsDone = state.notificationsReady
  const geoDone = state.geolocationPermission === 'granted'
  const isIos = state.needsPwaInstall || /iPad|iPhone|iPod/i.test(navigator.userAgent || '')
  const notificationDenied = state.notificationPermission === 'denied'
  const needsReconnect = state.subscriptionStatus === 'outdated'

  async function handleAllowNotifications() {
    if (busyNotifications) return
    setBusyNotifications(true)
    setLocalError('')
    try {
      await enableNotificationsFromUserGesture({ reconnect: needsReconnect })
      showSuccess('Уведомления подключены')
      await refresh()
    } catch (err) {
      if (err instanceof WebPushError && err.code === 'permission_denied') {
        showWarning('Уведомления запрещены в настройках устройства')
      } else {
        setLocalError(err?.message || 'Не удалось подключить уведомления')
        showWarning('Не удалось подключить уведомления')
      }
      await refresh()
    } finally {
      setBusyNotifications(false)
    }
  }

  async function handleRecheckNotifications() {
    if (busyNotifications) return
    setBusyNotifications(true)
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
      setBusyNotifications(false)
    }
  }

  async function handleAllowGeolocation() {
    if (busyGeo) return
    setBusyGeo(true)
    setLocalError('')
    try {
      await enableGeolocationFromUserGesture()
      showSuccess('Геолокация разрешена')
      await refresh()
    } catch (err) {
      if (err?.code === 'geolocation_denied') {
        showWarning('Геолокация запрещена в настройках устройства')
      } else {
        setLocalError(err?.message || 'Не удалось получить доступ к геолокации')
        showWarning('Не удалось получить доступ к геолокации')
      }
      await refresh()
    } finally {
      setBusyGeo(false)
    }
  }

  const readyBoth = notificationsDone && geoDone

  return (
    <div className="device-setup-onboarding" role="dialog" aria-modal="true" aria-labelledby="device-setup-title">
      <div className="device-setup-onboarding__card">
        <h2 id="device-setup-title" className="device-setup-onboarding__title">
          Настройте приложение для работы
        </h2>
        <p className="device-setup-onboarding__lead">
          Разрешите уведомления и геолокацию, чтобы отмечать смены и получать напоминания вовремя.
        </p>

        <section
          className={`device-setup-onboarding__step${notificationsDone ? ' device-setup-onboarding__step--done' : ''}`}
        >
          <h3 className="device-setup-onboarding__step-title">Уведомления</h3>
          <p className="device-setup-onboarding__step-text">
            Разрешите уведомления, чтобы получать напоминания о начале и завершении рабочей смены.
          </p>

          {state.needsPwaInstall && <PwaInstallHelp isIos={isIos} />}

          {notificationDenied && !state.needsPwaInstall && <NotificationDeniedHelp isIos={isIos} />}

          {notificationsDone ? (
            <p className="device-setup-onboarding__status device-setup-onboarding__status--ok">
              Уведомления подключены
            </p>
          ) : needsReconnect && !state.needsPwaInstall && !notificationDenied ? (
            <p className="device-setup-onboarding__status device-setup-onboarding__status--warn">
              Требуется переподключение
            </p>
          ) : null}

          {!state.needsPwaInstall && !notificationsDone && (
            <div className="device-setup-onboarding__actions">
              {notificationDenied ? (
                <button
                  type="button"
                  className="btn btn--primary device-setup-onboarding__primary"
                  onClick={() => void handleRecheckNotifications()}
                  disabled={busyNotifications}
                >
                  {busyNotifications ? 'Проверяем…' : 'Проверить снова'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary device-setup-onboarding__primary"
                  onClick={() => void handleAllowNotifications()}
                  disabled={busyNotifications}
                >
                  {busyNotifications
                    ? 'Подключаем…'
                    : needsReconnect
                      ? 'Переподключить уведомления'
                      : 'Разрешить уведомления'}
                </button>
              )}
            </div>
          )}
        </section>

        <section className={`device-setup-onboarding__step${geoDone ? ' device-setup-onboarding__step--done' : ''}`}>
          <h3 className="device-setup-onboarding__step-title">Геолокация</h3>
          <p className="device-setup-onboarding__step-text">
            Разрешите доступ к местоположению, чтобы отмечать начало и окончание смены в магазине.
          </p>

          {geoDone ? (
            <p className="device-setup-onboarding__status device-setup-onboarding__status--ok">
              Геолокация разрешена
            </p>
          ) : state.geolocationPermission === 'denied' ? (
            <div className="device-setup-onboarding__hint">
              Геолокация запрещена в настройках устройства. Включите доступ для Shugyla Platform и повторите.
            </div>
          ) : state.geolocationPermission === 'unsupported' ? (
            <div className="device-setup-onboarding__hint">Геолокация не поддерживается на этом устройстве.</div>
          ) : (
            <div className="device-setup-onboarding__actions">
              <button
                type="button"
                className="btn btn--primary device-setup-onboarding__primary"
                onClick={() => void handleAllowGeolocation()}
                disabled={busyGeo || !state.geolocationSupported}
              >
                {busyGeo ? 'Запрашиваем…' : 'Разрешить геолокацию'}
              </button>
            </div>
          )}
        </section>

        {localError ? (
          <p className="device-setup-onboarding__status device-setup-onboarding__status--warn" role="alert">
            {localError}
          </p>
        ) : null}

        {readyBoth ? (
          <p className="device-setup-onboarding__status device-setup-onboarding__status--ok">
            Устройство готово к работе
          </p>
        ) : null}

        <div className="device-setup-onboarding__footer device-setup-onboarding__actions">
          {readyBoth ? (
            <button
              type="button"
              className="btn btn--primary device-setup-onboarding__primary"
              onClick={dismissForSession}
            >
              Продолжить
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--outline device-setup-onboarding__secondary"
              onClick={dismissForSession}
            >
              Не сейчас
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
