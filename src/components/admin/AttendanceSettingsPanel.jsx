import { useEffect, useState } from 'react'
import { getCurrentPosition, extractCoords } from '../../utils/geolocation'
import { clampRadiusMeters, DEFAULT_ATTENDANCE_SETTINGS } from '../../utils/attendanceData'
import {
  getWorkLocations,
  saveWorkLocation,
  getAttendanceSettings,
  saveAttendanceSettings,
} from '../../services/academyDataService'
import { useSession } from '../../context/SessionContext'
import './admin-shared.css'
import './EmployeeRating.css'

const TABS = [
  { id: 'location', label: 'Рабочая территория' },
  { id: 'penalties', label: 'Штрафные баллы' },
  { id: 'rules', label: 'Правила отметки' },
]

const EMPTY_LOCATION = {
  id: null,
  name: 'Shugyla Market',
  address: '',
  latitude: '',
  longitude: '',
  radiusMeters: 100,
  isActive: true,
}

/** Настройки тайм-трекера и рейтинга */
export default function AttendanceSettingsPanel() {
  const { user } = useSession()
  const [tab, setTab] = useState('location')
  const [location, setLocation] = useState(EMPTY_LOCATION)
  const [settings, setSettings] = useState(DEFAULT_ATTENDANCE_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [locations, attendanceSettings] = await Promise.all([
          getWorkLocations(),
          getAttendanceSettings(),
        ])
        const active = locations.find((item) => item.isActive) || locations[0]
        if (active) setLocation(active)
        setSettings(attendanceSettings)
      } catch (err) {
        setError(err.message || 'Не удалось загрузить настройки')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSaveLocation() {
    if (!location.name?.trim()) {
      setError('Укажите название рабочей точки')
      return
    }
    if (!location.latitude || !location.longitude) {
      setError('Укажите координаты рабочей точки')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const saved = await saveWorkLocation({
        ...location,
        radiusMeters: clampRadiusMeters(location.radiusMeters),
      })
      setLocation(saved)
      setSuccess('Рабочая территория сохранена')
    } catch (err) {
      setError(err.message || 'Не удалось сохранить рабочую точку')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveSettings() {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const saved = await saveAttendanceSettings(settings, user?.id || null)
      setSettings(saved)
      setSuccess('Настройки рейтинга сохранены')
    } catch (err) {
      setError(err.message || 'Не удалось сохранить настройки')
    } finally {
      setSaving(false)
    }
  }

  async function useCurrentLocation() {
    setError('')
    try {
      const position = await getCurrentPosition()
      const coords = extractCoords(position)
      setLocation((prev) => ({
        ...prev,
        latitude: coords.latitude,
        longitude: coords.longitude,
      }))
    } catch (err) {
      setError(err.message || 'Не удалось определить местоположение')
    }
  }

  if (loading) return <p className="admin-form__hint">Загрузка настроек…</p>

  return (
    <section className="admin-panel-card platform-settings__section">
      <h2 className="admin-panel-card__title">Тайм-трекер и рейтинг</h2>
      <p className="admin-panel-card__desc">
        Рабочая территория, штрафные баллы и правила отметки прихода и ухода.
      </p>

      <div className="attendance-settings-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`admin-filter-tab ${tab === item.id ? 'admin-filter-tab--active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'location' && (
        <div className="admin-form">
          <label className="admin-form__label">
            Название рабочей точки
            <input className="admin-form__input" value={location.name} onChange={(e) => setLocation({ ...location, name: e.target.value })} />
          </label>
          <label className="admin-form__label">
            Адрес
            <input className="admin-form__input" value={location.address} onChange={(e) => setLocation({ ...location, address: e.target.value })} />
          </label>
          <div className="admin-form__row">
            <label className="admin-form__label">
              Широта
              <input className="admin-form__input" type="number" step="any" value={location.latitude} onChange={(e) => setLocation({ ...location, latitude: e.target.value })} />
            </label>
            <label className="admin-form__label">
              Долгота
              <input className="admin-form__input" type="number" step="any" value={location.longitude} onChange={(e) => setLocation({ ...location, longitude: e.target.value })} />
            </label>
          </div>
          <label className="admin-form__label">
            Радиус действия, метров (20–1000)
            <input className="admin-form__input" type="number" min={20} max={1000} value={location.radiusMeters} onChange={(e) => setLocation({ ...location, radiusMeters: e.target.value })} />
          </label>
          <button type="button" className="btn btn--outline btn--sm" onClick={useCurrentLocation}>
            Использовать моё текущее местоположение
          </button>
          <div className="admin-form__actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn--primary" onClick={handleSaveLocation} disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}

      {tab === 'penalties' && (
        <div className="admin-form">
          <div className="admin-form__row">
            <label className="admin-form__label">Баллы за своевременный приход<input className="admin-form__input" type="number" value={settings.onTimePoints} onChange={(e) => setSettings({ ...settings, onTimePoints: Number(e.target.value) })} /></label>
            <label className="admin-form__label">Баллы за отработанную смену<input className="admin-form__input" type="number" value={settings.completedShiftPoints} onChange={(e) => setSettings({ ...settings, completedShiftPoints: Number(e.target.value) })} /></label>
          </div>
          <div className="admin-form__row">
            <label className="admin-form__label">Штраф за опоздание<input className="admin-form__input" type="number" value={settings.latePenalty} onChange={(e) => setSettings({ ...settings, latePenalty: Number(e.target.value) })} /></label>
            <label className="admin-form__label">Штраф за ранний уход<input className="admin-form__input" type="number" value={settings.earlyLeavePenalty} onChange={(e) => setSettings({ ...settings, earlyLeavePenalty: Number(e.target.value) })} /></label>
          </div>
          <div className="admin-form__row">
            <label className="admin-form__label">Штраф за неявку<input className="admin-form__input" type="number" value={settings.absencePenalty} onChange={(e) => setSettings({ ...settings, absencePenalty: Number(e.target.value) })} /></label>
            <label className="admin-form__label">Штраф без отметки прихода<input className="admin-form__input" type="number" value={settings.missingCheckInPenalty} onChange={(e) => setSettings({ ...settings, missingCheckInPenalty: Number(e.target.value) })} /></label>
          </div>
          <label className="admin-form__label">Штраф без отметки ухода<input className="admin-form__input" type="number" value={settings.missingCheckOutPenalty} onChange={(e) => setSettings({ ...settings, missingCheckOutPenalty: Number(e.target.value) })} /></label>
          <div className="admin-form__row">
            <label className="admin-form__label">Допустимое опоздание, мин<input className="admin-form__input" type="number" value={settings.lateGraceMinutes} onChange={(e) => setSettings({ ...settings, lateGraceMinutes: Number(e.target.value) })} /></label>
            <label className="admin-form__label">Допустимый ранний уход, мин<input className="admin-form__input" type="number" value={settings.earlyLeaveGraceMinutes} onChange={(e) => setSettings({ ...settings, earlyLeaveGraceMinutes: Number(e.target.value) })} /></label>
          </div>
          <label className="admin-form__label">Время ожидания отметки ухода, мин<input className="admin-form__input" type="number" value={settings.checkoutWaitMinutes} onChange={(e) => setSettings({ ...settings, checkoutWaitMinutes: Number(e.target.value) })} /></label>
          <div className="admin-form__actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn--outline" onClick={() => setSettings(DEFAULT_ATTENDANCE_SETTINGS)} disabled={saving}>Отмена</button>
            <button type="button" className="btn btn--primary" onClick={handleSaveSettings} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить настройки'}</button>
          </div>
        </div>
      )}

      {tab === 'rules' && (
        <ul className="platform-settings__list">
          <li>Геолокация запрашивается только при нажатии «Я на работе» и «Я ухожу».</li>
          <li>Отметка доступна только внутри настроенного радиуса рабочей точки.</li>
          <li>Опоздание считается по фактическому времени прихода относительно плановой смены.</li>
          <li>Штраф за пропущенный уход начисляется после окончания смены и периода ожидания.</li>
          <li>Баллы пересчитываются при открытии рейтинга за выбранный месяц.</li>
        </ul>
      )}

      {success && <p className="admin-success-banner">{success}</p>}
      {error && <p className="admin-form__error">{error}</p>}
    </section>
  )
}
