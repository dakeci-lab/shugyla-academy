import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '../../context/ToastContext'
import { isCloudMode } from '../../lib/dataMode'
import {
  fetchSubscriptionReadiness,
  sendEmployeePersonalTest,
} from '../../services/notificationSettingsAdminService'
import '../admin/admin-shared.css'
import './NotificationSubscriptionReadinessPanel.css'

const STATE_LABELS = {
  confirmed: 'Подтверждено',
  connected_unconfirmed: 'Подключено, не подтверждено',
  outdated: 'Требуется переподключение',
  missing: 'Не подключено',
  delivery_failed: 'Ошибка доставки',
  denied: 'Запрещено на устройстве',
  not_eligible: 'Нет доступа',
}

const FILTERS = [
  { id: 'needs_setup', label: 'Требуется подключение' },
  { id: 'all', label: 'Все eligible' },
  { id: 'confirmed', label: 'Подтверждённые' },
  { id: 'missing', label: 'Без подписки' },
  { id: 'outdated', label: 'Outdated' },
  { id: 'delivery_failed', label: 'Ошибки доставки' },
]

const REASON_LABELS = {
  no_subscription: 'Нет активной subscription. Покажите onboarding при входе в PWA.',
  vapid_outdated: 'Устройство со старым VAPID. Нужен reconnect в установленной PWA.',
  awaiting_accepted_delivery: 'Subscription есть, но ещё нет accepted delivery. Отправьте персональный тест.',
  provider_rejected: 'Последние push на current устройства завершились ошибкой провайдера.',
  permission_denied: 'Сотрудник запретил уведомления в настройках устройства.',
  inactive_employee: 'Сотрудник неактивен.',
  missing_auth_user: 'Нет связанного auth user.',
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

function newRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`.slice(0, 36)
}

/** Admin operational table of employee Web Push readiness (no endpoints/keys). */
export default function NotificationSubscriptionReadinessPanel() {
  const { error: showError, success: showSuccess, warning: showWarning } = useToast()
  const cloudMode = isCloudMode()
  const [loading, setLoading] = useState(true)
  const [busyEmployeeId, setBusyEmployeeId] = useState(null)
  const [filter, setFilter] = useState('needs_setup')
  const [readiness, setReadiness] = useState(null)
  const [reasonEmployeeId, setReasonEmployeeId] = useState(null)

  const load = useCallback(async () => {
    if (!cloudMode) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const next = await fetchSubscriptionReadiness()
      setReadiness(next)
    } catch (error) {
      showError(error.message || 'Не удалось загрузить сводку готовности')
    } finally {
      setLoading(false)
    }
  }, [cloudMode, showError])

  useEffect(() => {
    void load()
  }, [load])

  const summary = readiness?.summary
  const warnings = readiness?.warnings ?? []
  const employees = readiness?.employees ?? readiness?.employees_needing_setup ?? []

  const visibleEmployees = useMemo(() => {
    if (filter === 'all') return employees
    if (filter === 'needs_setup') {
      return employees.filter((row) => row.readiness_state !== 'confirmed')
    }
    return employees.filter((row) => row.readiness_state === filter)
  }, [employees, filter])

  async function handlePersonalTest(employee) {
    if (busyEmployeeId) return
    setBusyEmployeeId(employee.employee_id)
    try {
      const result = await sendEmployeePersonalTest(employee.employee_id, newRequestId())
      const outcome = result?.personal_test?.outcome
      if (outcome === 'accepted' || outcome === 'partial') {
        showSuccess(
          `Тест отправлен: принято ${result.personal_test.accepted_count} из ${result.personal_test.devices_targeted}`
        )
      } else if (outcome === 'no_current_subscription') {
        showWarning('Нет current subscription у этого сотрудника')
      } else {
        showWarning('Персональный тест не доставлен ни на одно устройство')
      }
      await load()
    } catch (error) {
      showError(error.message || 'Не удалось отправить персональный тест')
    } finally {
      setBusyEmployeeId(null)
    }
  }

  return (
    <section className="admin-panel-card notification-readiness-panel">
      <div className="admin-panel-card__header">
        <h2 className="admin-panel-card__title">Готовность сотрудников к уведомлениям</h2>
        <p className="admin-panel-card__desc">
          Статус считается по current subscription и accepted delivery. Подключайте сотрудников по одному:
          PWA → «Подключить уведомления» → персональный тест → подтверждение баннера.
        </p>
      </div>

      <div className="notification-readiness-panel__ops">
        <strong>Как подключить сотрудника</strong>
        <ol>
          <li>Откройте список «Требуется подключение».</li>
          <li>Позовите сотрудника с телефоном и убедитесь, что он вошёл в свой аккаунт.</li>
          <li>На iPhone установите PWA на главный экран.</li>
          <li>Нажмите «Подключить» / «Переподключить» и разрешите уведомления.</li>
          <li>Отправьте персональный тест и дождитесь баннера.</li>
          <li>Нажмите «Обновить статус» — сотрудник станет «Подтверждено».</li>
        </ol>
      </div>

      {!cloudMode && <p>Сводка доступна только в облачном режиме.</p>}

      {cloudMode && loading && <p role="status">Загружаем сводку…</p>}

      {cloudMode && !loading && summary && (
        <>
          {warnings.length > 0 && (
            <ul className="notification-readiness-panel__warnings">
              {warnings.map((warning) => (
                <li
                  key={warning.code}
                  className={`notification-readiness-panel__warning notification-readiness-panel__warning--${warning.severity}`}
                >
                  {warning.message}
                </li>
              ))}
            </ul>
          )}

          <dl className="notification-readiness-panel__stats">
            <div>
              <dt>Eligible</dt>
              <dd>{summary.eligible_employees ?? summary.active_employees}</dd>
            </div>
            <div>
              <dt>Confirmed</dt>
              <dd>{summary.confirmed ?? summary.employees_with_current}</dd>
            </div>
            <div>
              <dt>Unconfirmed</dt>
              <dd>{summary.connected_unconfirmed ?? 0}</dd>
            </div>
            <div>
              <dt>Missing</dt>
              <dd>{summary.missing ?? summary.employees_without_subscriptions}</dd>
            </div>
            <div>
              <dt>Outdated</dt>
              <dd>{summary.outdated_only ?? summary.employees_only_outdated}</dd>
            </div>
            <div>
              <dt>Failed</dt>
              <dd>{summary.delivery_failed ?? 0}</dd>
            </div>
            <div>
              <dt>Current устройств</dt>
              <dd>{summary.current_devices}</dd>
            </div>
            <div>
              <dt>Confirmed устройств</dt>
              <dd>{summary.confirmed_devices ?? summary.devices_with_last_success}</dd>
            </div>
            <div className="notification-readiness-panel__stats-wide">
              <dt>Последняя accepted delivery</dt>
              <dd>{formatDate(summary.last_accepted_delivery_at)}</dd>
            </div>
          </dl>

          <div className="notification-readiness-panel__toolbar">
            <div className="notification-readiness-panel__filters" role="tablist" aria-label="Фильтр готовности">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === item.id}
                  className={`notification-readiness-panel__filter${
                    filter === item.id ? ' notification-readiness-panel__filter--active' : ''
                  }`}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn--outline" onClick={() => void load()} disabled={loading}>
              Обновить статус
            </button>
          </div>

          <div className="notification-readiness-panel__table-wrap">
            <table className="notification-readiness-panel__table">
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Должность</th>
                  <th>Аккаунт</th>
                  <th>Устройства</th>
                  <th>Уведомления</th>
                  <th>Последнее подключение</th>
                  <th>Accepted</th>
                  <th>Тайм-трекер</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {visibleEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="notification-readiness-panel__empty-cell">
                      Нет сотрудников в этом фильтре.
                    </td>
                  </tr>
                ) : (
                  visibleEmployees.map((employee) => {
                    const state = employee.readiness_state || employee.connection_state
                    const busy = busyEmployeeId === employee.employee_id
                    return (
                      <tr key={employee.employee_id}>
                        <td>
                          <strong>{employee.full_name}</strong>
                          {employee.multiple_devices ? (
                            <div className="notification-readiness-panel__muted">Несколько устройств</div>
                          ) : null}
                        </td>
                        <td>{employee.position_name || '—'}</td>
                        <td>{employee.account_active === false ? 'Нет доступа' : 'Активен'}</td>
                        <td>
                          current {employee.current_device_count ?? employee.device_count ?? 0}
                          {' / '}
                          outdated {employee.outdated_device_count ?? 0}
                          {typeof employee.confirmed_device_count === 'number' ? (
                            <div className="notification-readiness-panel__muted">
                              подтв. {employee.confirmed_device_count}, неподтв.{' '}
                              {employee.unconfirmed_current_device_count ?? 0}
                            </div>
                          ) : null}
                        </td>
                        <td>{STATE_LABELS[state] || state}</td>
                        <td>{formatDate(employee.last_connected_at || employee.last_success_at)}</td>
                        <td>{formatDate(employee.last_accepted_delivery_at || employee.last_success_at)}</td>
                        <td>{employee.time_tracker_ready ? 'Готов' : 'Не готов'}</td>
                        <td>
                          <div className="notification-readiness-panel__actions">
                            {(state === 'connected_unconfirmed' ||
                              state === 'delivery_failed' ||
                              state === 'confirmed') && (
                              <button
                                type="button"
                                className="btn btn--primary btn--small"
                                disabled={busy}
                                onClick={() => void handlePersonalTest(employee)}
                              >
                                {busy ? 'Отправляем…' : 'Персональный тест'}
                              </button>
                            )}
                            {(state === 'missing' || state === 'outdated') && (
                              <button
                                type="button"
                                className="btn btn--outline btn--small"
                                onClick={() =>
                                  setReasonEmployeeId(
                                    reasonEmployeeId === employee.employee_id
                                      ? null
                                      : employee.employee_id
                                  )
                                }
                              >
                                Инструкция
                              </button>
                            )}
                            {(state === 'denied' || state === 'delivery_failed') && (
                              <button
                                type="button"
                                className="btn btn--outline btn--small"
                                onClick={() =>
                                  setReasonEmployeeId(
                                    reasonEmployeeId === employee.employee_id
                                      ? null
                                      : employee.employee_id
                                  )
                                }
                              >
                                Причина
                              </button>
                            )}
                          </div>
                          {reasonEmployeeId === employee.employee_id ? (
                            <p className="notification-readiness-panel__hint">
                              {REASON_LABELS[employee.reason_code] ||
                                'Покажите сотруднику экран настройки уведомлений в установленной PWA.'}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
