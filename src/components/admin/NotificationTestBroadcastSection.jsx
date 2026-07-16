import { useCallback, useRef, useState } from 'react'
import Can from '../auth/Can'
import { PERMISSION_CODES } from '../../config/permissionCatalog'
import { useToast } from '../../context/ToastContext'
import { isCloudMode } from '../../lib/dataMode'
import AdminModal from './AdminModal'
import {
  fetchTestBroadcastSummary,
  formatTestBroadcastResult,
  sendTestBroadcast,
} from '../../services/notificationSettingsAdminService'
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

function BroadcastConfirmModal({
  summary,
  loadingSummary,
  sending,
  onClose,
  onConfirm,
  returnFocusRef,
}) {
  const hasDevices = (summary?.connected_devices ?? 0) > 0

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
          </dl>
        )}

        <p className="notification-test-broadcast-modal__warning">
          Уведомление будет отправлено всем подключённым устройствам.
        </p>

        {!loadingSummary && !hasDevices && (
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
    if (sending || loadingSummary || !(summary?.connected_devices > 0)) return

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
    } catch (error) {
      showError(error.message || 'Не удалось отправить тестовое уведомление')
    } finally {
      setSending(false)
    }
  }, [loadingSummary, sending, showError, showSuccess, showWarning, summary])

  if (!cloudMode) return null

  return (
    <Can permission={PERMISSION_CODES.NOTIFICATIONS_MANAGE}>
      <section className="admin-panel-card notification-test-broadcast-section">
        <h2 className="admin-panel-card__title">Проверка уведомлений</h2>
        <p className="admin-panel-card__desc">
          Отправьте тестовое уведомление всем активным сотрудникам, у которых подключены
          push-уведомления.
        </p>

        <button
          ref={triggerRef}
          type="button"
          className="btn btn--secondary notification-test-broadcast-section__button"
          onClick={openModal}
          disabled={sending}
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
