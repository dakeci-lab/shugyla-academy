import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../../context/ToastContext'
import { isCloudMode } from '../../lib/dataMode'
import {
  fetchNotificationSettings,
  saveNotificationSettings,
} from '../../services/notificationSettingsAdminService'
import {
  enrichNotificationSetting,
  normalizeOffsetInput,
  validateOffsetMinutes,
} from '../../utils/notificationRuleSettings'
import '../admin/admin-shared.css'
import './NotificationSettingsPanel.css'

function buildDraft(settings) {
  return settings.map((item) => ({
    code: item.code,
    is_enabled: Boolean(item.is_enabled),
    offset_minutes: item.offset_minutes,
  }))
}

/** Административные настройки автоматических уведомлений тайм-трекера */
export default function NotificationSettingsPanel() {
  const { success: showSuccess, error: showError } = useToast()
  const cloudMode = isCloudMode()

  const [rules, setRules] = useState([])
  const [draft, setDraft] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const enrichedRules = useMemo(
    () => rules.map((item) => enrichNotificationSetting(item)),
    [rules]
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!cloudMode) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const settings = await fetchNotificationSettings()
        if (cancelled) return
        setRules(settings)
        setDraft(buildDraft(settings))
        setFieldErrors({})
      } catch (error) {
        if (!cancelled) {
          showError(error.message || 'Не удалось загрузить настройки уведомлений')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [cloudMode, showError])

  function getDraftItem(code) {
    return draft.find((item) => item.code === code)
  }

  function updateDraftItem(code, patch) {
    setDraft((current) =>
      current.map((item) => (item.code === code ? { ...item, ...patch } : item))
    )
    setFieldErrors((current) => {
      if (!current[code]) return current
      const next = { ...current }
      delete next[code]
      return next
    })
  }

  function validateDraft() {
    const nextErrors = {}

    for (const item of draft) {
      const message = validateOffsetMinutes(item.offset_minutes)
      if (message) nextErrors[item.code] = message
    }

    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSave() {
    if (!cloudMode || saving) return

    const normalizedDraft = draft.map((item) => ({
      ...item,
      offset_minutes: normalizeOffsetInput(item.offset_minutes),
    }))

    setDraft(normalizedDraft)

    if (!validateDraft()) return

    setSaving(true)
    try {
      const saved = await saveNotificationSettings(normalizedDraft)
      setRules(saved)
      setDraft(buildDraft(saved))
      showSuccess('Настройки уведомлений сохранены')
    } catch (error) {
      showError(error.message || 'Не удалось сохранить настройки уведомлений')
    } finally {
      setSaving(false)
    }
  }

  if (!cloudMode) {
    return (
      <section className="admin-panel-card notification-settings-panel">
        <h2 className="admin-panel-card__title">Автоматические уведомления</h2>
        <p className="admin-panel-card__desc">
          Настройки доступны только в облачном режиме с Supabase.
        </p>
      </section>
    )
  }

  if (loading) {
    return (
      <section className="admin-panel-card notification-settings-panel">
        <h2 className="admin-panel-card__title">Автоматические уведомления</h2>
        <p className="admin-panel-card__desc">Загрузка настроек…</p>
      </section>
    )
  }

  return (
    <section className="admin-panel-card notification-settings-panel">
      <div className="notification-settings-panel__header">
        <div>
          <h2 className="admin-panel-card__title">Автоматические уведомления</h2>
          <p className="admin-panel-card__desc">
            Управление напоминаниями тайм-трекера по графику смен. Изменения применяются
            при следующем запуске планировщика без обновления приложения.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Сохранение…' : 'Сохранить настройки'}
        </button>
      </div>

      <div className="notification-settings-panel__list">
        {enrichedRules.map((rule) => {
          const draftItem = getDraftItem(rule.code)
          if (!draftItem) return null

          return (
            <article key={rule.code} className="notification-settings-card">
              <div className="notification-settings-card__head">
                <div>
                  <h3 className="notification-settings-card__title">{rule.title}</h3>
                  <p className="notification-settings-card__desc">{rule.description}</p>
                </div>
                <label className="notification-settings-card__toggle">
                  <input
                    type="checkbox"
                    checked={draftItem.is_enabled}
                    onChange={(event) =>
                      updateDraftItem(rule.code, { is_enabled: event.target.checked })
                    }
                  />
                  <span>Включено</span>
                </label>
              </div>

              <div className="notification-settings-card__offset">
                <span className="notification-settings-card__offset-label">Отправлять за:</span>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  step={1}
                  inputMode="numeric"
                  className="notification-settings-card__offset-input"
                  value={draftItem.offset_minutes}
                  onChange={(event) =>
                    updateDraftItem(rule.code, { offset_minutes: event.target.value })
                  }
                  disabled={!draftItem.is_enabled}
                />
                <span className="notification-settings-card__offset-unit">{rule.offsetLabel}</span>
              </div>

              <p className="notification-settings-card__default">
                Стандартное значение: {rule.defaultOffsetMinutes} {rule.offsetLabel}
              </p>

              {fieldErrors[rule.code] && (
                <p className="notification-settings-card__error" role="alert">
                  {fieldErrors[rule.code]}
                </p>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
