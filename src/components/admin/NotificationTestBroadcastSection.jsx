import { useCallback, useEffect, useRef, useState } from 'react'
import Can from '../auth/Can'
import { PERMISSION_CODES } from '../../config/permissionCatalog'
import { useToast } from '../../context/ToastContext'
import { isCloudMode } from '../../lib/dataMode'
import {
  fetchTestBroadcastSummary,
  formatTestBroadcastResult,
  sendTestBroadcast,
} from '../../services/notificationSettingsAdminService'
import {
  getDevicePushDiagnostics,
  reconnectDevicePushNotifications,
} from '../../services/webPushSubscriptionService'
import AdminModal from './AdminModal'
import './NotificationTestBroadcastSection.css'

function createRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    const value = char === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

function labelForPermission(permission) {
  if (permission === 'granted') return 'Разрешено'
  if (permission === 'denied') return 'Запрещено'
  if (permission === 'default') return 'Не запрошено'
  return 'Не поддерживается'
}

function labelForServiceWorker(state) {
  if (state === 'active') return 'Активен'
  if (state === 'installing') return 'Обновляется'
  if (state === 'waiting') return 'Ожидает активации'
  return 'Не готов'
}

function labelForVapidKeyStatus(status) {
  if (status === 'current') return 'Актуальный'
  if (status === 'reconnect_required') return 'Требуется переподключение'
  return 'Не удалось определить'
}

function labelForStandalone(standalone) {
  return standalone ? 'Установленное PWA' : 'Браузерная вкладка'
}

function issueMessage(issue) {
  switch (issue) {
    case 'missing_browser_subscription':
      return 'Разрешение выдано, но push-подписка отсутствует'
    case 'vapid_mismatch':
      return 'Подписка создана со старым ключом. Переподключите уведомления.'
    case 'missing_server_registration':
      return 'Подписка браузера не синхронизирована с сервером'
    case 'ios_not_standalone':
      return 'На iPhone системные push работают только в установленном PWA'
    case 'scope_mismatch':
      return 'Service Worker зарегистрирован вне /shugyla-academy/'
    case 'permission_denied':
      return 'Разрешите уведомления в настройках устройства'
    default:
      return null
  }
}

function BroadcastConfirmModal({
  summary,
  loadingSummary,
  sending,
  onClose,
  onConfirm,
  returnFocusRef,
}) {
  const hasDevices = (summary?.will_send ?? summary?.current_vapid_subscriptions ?? 0) > 0
  const allOutdated =
    (summary?.connected_devices ?? 0) > 0 &&
    (summary?.will_send ?? summary?.current_vapid_subscriptions ?? 0) === 0

  return (
    <AdminModal
      title="Отправить тестовое уведомление"
      onClose={onClose}
      returnFocusRef={returnFocusRef}
      footer={
        <div className="notification-test-broadcast-modal__footer">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClose}
            disabled={sending}
          >
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--primary notification-test-broadcast-modal__confirm"
            onClick={onConfirm}
            disabled={loadingSummary || sending || !hasDevices}
          >
            {sending ? 'Отправка…' : 'Отправить всем'}
          </button>
        </div>
      }
    >
      <div className="notification-test-broadcast-modal__body">
        <p className="notification-test-broadcast-modal__lead">
          Тестовое уведомление будет отправлено:
        </p>

        {loadingSummary ? (
          <p className="notification-test-broadcast-modal__stats">Загрузка статистики…</p>
        ) : (
          <dl className="notification-test-broadcast-modal__stats">
            <div>
              <dt>Активных сотрудников</dt>
              <dd>{summary?.active_employees ?? 0}</dd>
            </div>
            <div>
              <dt>Сотрудников с уведомлениями</dt>
              <dd>{summary?.employees_with_subscriptions ?? 0}</dd>
            </div>
            <div>
              <dt>Подключённых устройств</dt>
              <dd>{summary?.connected_devices ?? 0}</dd>
            </div>
            <div>
              <dt>Актуальных подписок</dt>
              <dd>{summary?.current_vapid_subscriptions ?? 0}</dd>
            </div>
            <div>
              <dt>Требуют переподключения</dt>
              <dd>{summary?.outdated_subscriptions ?? 0}</dd>
            </div>
            <div>
              <dt>Будет отправлено</dt>
              <dd>{summary?.will_send ?? summary?.current_vapid_subscriptions ?? 0}</dd>
            </div>
          </dl>
        )}

        <p className="notification-test-broadcast-modal__warning">
          Уведомление будет отправлено всем подключённым устройствам. Системное уведомление
          появится только на устройствах с активной push-подпиской.
        </p>

        {!loadingSummary && allOutdated && (
          <p className="notification-test-broadcast-modal__empty" role="alert">
            Все зарегистрированные устройства требуют переподключения уведомлений.
          </p>
        )}

        {!loadingSummary && !hasDevices && !allOutdated && (
          <p className="notification-test-broadcast-modal__empty" role="alert">
            Нет подключённых устройств для отправки уведомления.
          </p>
        )}
      </div>
    </AdminModal>
  )
}

/** Блок массовой отправки тестового push-уведомления (только notifications.manage) */
export default function NotificationTestBroadcastSection() {
  const cloudMode = isCloudMode()
  const { success: showSuccess, error: showError, warning: showWarning } = useToast()
  const triggerRef = useRef(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [summary, setSummary] = useState(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [sending, setSending] = useState(false)
  const [diagnostics, setDiagnostics] = useState(null)
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(true)
  const [reconnecting, setReconnecting] = useState(false)

  const refreshDiagnostics = useCallback(async () => {
    setLoadingDiagnostics(true)
    try {
      const next = await getDevicePushDiagnostics()
      setDiagnostics(next)
    } catch {
      setDiagnostics(null)
    } finally {
      setLoadingDiagnostics(false)
    }
  }, [])

  useEffect(() => {
    if (!cloudMode) return
    void refreshDiagnostics()
  }, [cloudMode, refreshDiagnostics])

  const closeModal = useCallback(() => {
    if (sending) return
    setModalOpen(false)
    setSummary(null)
  }, [sending])

  const openModal = useCallback(async () => {
    if (!cloudMode || sending) return

    setModalOpen(true)
    setLoadingSummary(true)
    setSummary(null)

    try {
      const nextSummary = await fetchTestBroadcastSummary()
      setSummary(nextSummary)
    } catch (error) {
      showError(error.message || 'Не удалось загрузить статистику')
      setModalOpen(false)
    } finally {
      setLoadingSummary(false)
    }
  }, [cloudMode, sending, showError])

  const handleConfirm = useCallback(async () => {
    if (sending || loadingSummary || !(summary?.will_send > 0 || summary?.current_vapid_subscriptions > 0)) return

    setSending(true)
    const requestId = createRequestId()

    try {
      const result = await sendTestBroadcast(requestId)
      const formatted = formatTestBroadcastResult(result)

      if (formatted.variant === 'success') {
        showSuccess(`${formatted.title}. ${formatted.message}`)
      } else if (formatted.variant === 'warning') {
        showWarning(`${formatted.title}. ${formatted.message}`)
      } else {
        showError(`${formatted.title}. ${formatted.message}`)
      }

      setModalOpen(false)
      setSummary(null)
      await refreshDiagnostics()
    } catch (error) {
      showError(error.message || 'Не удалось отправить тестовое уведомление')
    } finally {
      setSending(false)
    }
  }, [loadingSummary, refreshDiagnostics, sending, showError, showSuccess, showWarning, summary])

  const handleReconnect = useCallback(async () => {
    if (reconnecting || sending) return
    setReconnecting(true)
    try {
      await reconnectDevicePushNotifications()
      await refreshDiagnostics()
      showSuccess('Push-подписка переподключена')
    } catch (error) {
      showError(error.message || 'Не удалось переподключить уведомления')
    } finally {
      setReconnecting(false)
    }
  }, [reconnecting, refreshDiagnostics, sending, showError, showSuccess])

  if (!cloudMode) return null

  const issueText = issueMessage(diagnostics?.issue)

  return (
    <Can permission={PERMISSION_CODES.NOTIFICATIONS_MANAGE}>
      <section className="admin-panel-card notification-test-broadcast-section">
        <h2 className="admin-panel-card__title">Проверка уведомлений</h2>
        <p className="admin-panel-card__desc">
          Отправьте тестовое уведомление всем активным сотрудникам, у которых подключены
          push-уведомления.
        </p>

        <div className="notification-test-broadcast-section__device-status">
          <h3 className="notification-test-broadcast-section__device-title">Это устройство</h3>
          {loadingDiagnostics ? (
            <p className="notification-test-broadcast-section__device-line">Загрузка статуса…</p>
          ) : (
            <dl className="notification-test-broadcast-section__device-list">
              <div>
                <dt>Системное разрешение</dt>
                <dd>{labelForPermission(diagnostics?.permission)}</dd>
              </div>
              <div>
                <dt>Service Worker</dt>
                <dd>{labelForServiceWorker(diagnostics?.serviceWorker)}</dd>
              </div>
              <div>
                <dt>VAPID-ключ подписки</dt>
                <dd>{labelForVapidKeyStatus(diagnostics?.vapidKeyStatus)}</dd>
              </div>
              <div>
                <dt>Серверная регистрация</dt>
                <dd>{diagnostics?.serverRegistration ? 'Активна' : 'Не активна'}</dd>
              </div>
              <div>
                <dt>Push-подписка</dt>
                <dd>{diagnostics?.pushSubscription ? 'Подключена' : 'Отсутствует'}</dd>
              </div>
              <div>
                <dt>Режим приложения</dt>
                <dd>{labelForStandalone(diagnostics?.standalone)}</dd>
              </div>
            </dl>
          )}

          {issueText && (
            <p className="notification-test-broadcast-section__device-issue" role="alert">
              {issueText}
            </p>
          )}

          {diagnostics?.needsReconnect && (
            <button
              type="button"
              className="btn btn--secondary notification-test-broadcast-section__reconnect"
              onClick={handleReconnect}
              disabled={reconnecting || sending}
            >
              {reconnecting ? 'Переподключение…' : 'Переподключить уведомления'}
            </button>
          )}
        </div>

        <button
          ref={triggerRef}
          type="button"
          className="btn btn--secondary notification-test-broadcast-section__button"
          onClick={openModal}
          disabled={sending || reconnecting}
        >
          {sending ? 'Отправка…' : 'Отправить тестовое уведомление'}
        </button>
      </section>

      {modalOpen && (
        <BroadcastConfirmModal
          summary={summary}
          loadingSummary={loadingSummary}
          sending={sending}
          onClose={closeModal}
          onConfirm={handleConfirm}
          returnFocusRef={triggerRef}
        />
      )}
    </Can>
  )
}
