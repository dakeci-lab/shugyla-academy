import { useEffect, useState } from 'react'
import { useToast } from '../../context/ToastContext'
import { isCloudMode } from '../../lib/dataMode'
import {
  fetchEscalationSettings,
  updateEscalationSettings,
} from '../../services/notificationSettingsAdminService'
import '../admin/admin-shared.css'

export default function TimeTrackerEscalationSettingsPanel() {
  const { error: showError, success: showSuccess } = useToast()
  const cloudMode = isCloudMode()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [warnings, setWarnings] = useState([])
  const [form, setForm] = useState({
    is_enabled: true,
    clock_in_delay_minutes: 15,
    clock_out_delay_minutes: 20,
    recipient_mode: 'duty_with_fallback',
    fallback_employee_ids_text: '',
    push_enabled: true,
    in_app_enabled: true,
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!cloudMode) {
        setLoading(false)
        return
      }
      try {
        const result = await fetchEscalationSettings()
        const escalation = result?.escalation
        if (cancelled || !escalation) return
        setWarnings(result.warnings || [])
        setForm({
          is_enabled: escalation.is_enabled !== false,
          clock_in_delay_minutes: escalation.clock_in_delay_minutes ?? 15,
          clock_out_delay_minutes: escalation.clock_out_delay_minutes ?? 20,
          recipient_mode: escalation.recipient_mode || 'duty_with_fallback',
          fallback_employee_ids_text: (escalation.fallback_employee_ids || []).join(', '),
          push_enabled: escalation.push_enabled !== false,
          in_app_enabled: escalation.in_app_enabled !== false,
        })
      } catch (error) {
        if (!cancelled) showError(error.message || 'Не удалось загрузить эскалации')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [cloudMode, showError])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const fallback = form.fallback_employee_ids_text
        .split(/[,\s]+/)
        .map((part) => Number(part.trim()))
        .filter((id) => Number.isInteger(id) && id > 0)

      await updateEscalationSettings({
        is_enabled: form.is_enabled,
        clock_in_delay_minutes: Number(form.clock_in_delay_minutes),
        clock_out_delay_minutes: Number(form.clock_out_delay_minutes),
        recipient_mode: form.recipient_mode,
        fallback_employee_ids: fallback,
        push_enabled: form.push_enabled,
        in_app_enabled: form.in_app_enabled,
      })
      showSuccess('Настройки эскалаций сохранены')
    } catch (error) {
      showError(error.message || 'Не удалось сохранить эскалации')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-panel-card">
      <div className="admin-panel-card__header">
        <h2 className="admin-panel-card__title">Эскалации тайм-трекера</h2>
        <p className="admin-panel-card__desc">
          Если сотрудник не начал или не завершил смену после персональных напоминаний, дежурный
          администратор получает системное уведомление.
        </p>
      </div>

      {!cloudMode && <p>Доступно только в облачном режиме.</p>}
      {cloudMode && loading && <p role="status">Загрузка…</p>}

      {cloudMode && !loading && warnings.length > 0 && (
        <ul className="notification-readiness-panel__warnings" style={{ marginBottom: 12 }}>
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

      {cloudMode && !loading && (
        <div className="admin-panel-card__body" style={{ display: 'grid', gap: 12 }}>
          <label>
            <input
              type="checkbox"
              checked={form.is_enabled}
              onChange={(e) => setForm((prev) => ({ ...prev, is_enabled: e.target.checked }))}
            />{' '}
            Эскалации включены
          </label>
          <label>
            Задержка clock-in (мин)
            <input
              type="number"
              min={0}
              max={1440}
              value={form.clock_in_delay_minutes}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, clock_in_delay_minutes: e.target.value }))
              }
            />
          </label>
          <label>
            Задержка clock-out (мин)
            <input
              type="number"
              min={0}
              max={1440}
              value={form.clock_out_delay_minutes}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, clock_out_delay_minutes: e.target.value }))
              }
            />
          </label>
          <label>
            Режим получателей
            <select
              value={form.recipient_mode}
              onChange={(e) => setForm((prev) => ({ ...prev, recipient_mode: e.target.value }))}
            >
              <option value="duty">Только дежурные администраторы</option>
              <option value="duty_with_fallback">Дежурные + fallback</option>
            </select>
          </label>
          <label>
            Fallback employee ID (через запятую)
            <input
              type="text"
              value={form.fallback_employee_ids_text}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, fallback_employee_ids_text: e.target.value }))
              }
              placeholder="например: 3, 5"
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.push_enabled}
              onChange={(e) => setForm((prev) => ({ ...prev, push_enabled: e.target.checked }))}
            />{' '}
            Системный Web Push
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.in_app_enabled}
              onChange={(e) => setForm((prev) => ({ ...prev, in_app_enabled: e.target.checked }))}
            />{' '}
            In-app уведомление
          </label>
          <button type="button" className="btn btn--primary" disabled={saving} onClick={() => void handleSave()}>
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      )}
    </section>
  )
}
