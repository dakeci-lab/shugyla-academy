import { useEffect, useState } from 'react'
import { useToast } from '../../context/ToastContext'
import { isCloudMode } from '../../lib/dataMode'
import { fetchSubscriptionReadiness } from '../../services/notificationSettingsAdminService'
import '../admin/admin-shared.css'
import './NotificationSubscriptionReadinessPanel.css'

const STATE_LABELS = {
  current: 'Подключено',
  outdated: 'Требуется переподключение',
  missing: 'Не подключено',
  denied: 'Запрещено устройством',
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

/** Admin operational summary of employee Web Push readiness (no endpoints/keys). */
export default function NotificationSubscriptionReadinessPanel() {
  const { error: showError } = useToast()
  const cloudMode = isCloudMode()
  const [loading, setLoading] = useState(true)
  const [readiness, setReadiness] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!cloudMode) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const next = await fetchSubscriptionReadiness()
        if (!cancelled) setReadiness(next)
      } catch (error) {
        if (!cancelled) {
          showError(error.message || 'Не удалось загрузить сводку готовности')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [cloudMode, showError])

  const summary = readiness?.summary
  const employees = readiness?.employees_needing_setup ?? []

  return (
    <section className="admin-panel-card notification-readiness-panel">
      <div className="admin-panel-card__header">
        <h2 className="admin-panel-card__title">Готовность сотрудников к уведомлениям</h2>
        <p className="admin-panel-card__desc">
          Обезличенная сводка подключений Web Push. Сотрудники подключаются при следующем входе и
          нажатии «Разрешить уведомления».
        </p>
      </div>

      {!cloudMode && <p>Сводка доступна только в облачном режиме.</p>}

      {cloudMode && loading && <p role="status">Загружаем сводку…</p>}

      {cloudMode && !loading && summary && (
        <>
          <dl className="notification-readiness-panel__stats">
            <div>
              <dt>Активные сотрудники</dt>
              <dd>{summary.active_employees}</dd>
            </div>
            <div>
              <dt>С current subscription</dt>
              <dd>{summary.employees_with_current}</dd>
            </div>
            <div>
              <dt>Без subscriptions</dt>
              <dd>{summary.employees_without_subscriptions}</dd>
            </div>
            <div>
              <dt>Только outdated</dt>
              <dd>{summary.employees_only_outdated}</dd>
            </div>
            <div>
              <dt>Permission denied</dt>
              <dd>{summary.employees_with_denied}</dd>
            </div>
            <div>
              <dt>Current устройств</dt>
              <dd>{summary.current_devices}</dd>
            </div>
            <div>
              <dt>Outdated устройств</dt>
              <dd>{summary.outdated_devices}</dd>
            </div>
            <div>
              <dt>С успешной доставкой</dt>
              <dd>{summary.devices_with_last_success}</dd>
            </div>
            <div className="notification-readiness-panel__stats-wide">
              <dt>Последняя accepted delivery</dt>
              <dd>{formatDate(summary.last_accepted_delivery_at)}</dd>
            </div>
          </dl>

          <h3 className="notification-readiness-panel__list-title">Требуется подключение</h3>
          {employees.length === 0 ? (
            <p className="notification-readiness-panel__empty">
              У всех активных сотрудников есть хотя бы одна current subscription.
            </p>
          ) : (
            <ul className="notification-readiness-panel__list">
              {employees.map((employee) => (
                <li key={employee.employee_id} className="notification-readiness-panel__item">
                  <div className="notification-readiness-panel__item-main">
                    <strong>{employee.full_name}</strong>
                    <span>{employee.position_name || 'Должность не указана'}</span>
                  </div>
                  <div className="notification-readiness-panel__item-meta">
                    <span>{STATE_LABELS[employee.connection_state] || employee.connection_state}</span>
                    <span>Устройств: {employee.device_count}</span>
                    <span>Успех: {formatDate(employee.last_success_at)}</span>
                  </div>
                  <p className="notification-readiness-panel__hint">
                    Покажите сотруднику экран «Настройте приложение для работы» или раздел уведомлений в
                    профиле после входа в установленную PWA.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
