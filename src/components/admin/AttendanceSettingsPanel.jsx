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

const EMPTY_LOCATION = {
  id: null,
  name: 'Shugyla Market',
  address: '',
  latitude: '',
  longitude: '',
  radiusMeters: 100,
  isActive: true,
}

/** Настройки тайм-трекера: рабочая территория и штрафные баллы */
export default function AttendanceSettingsPanel() {
  const { user } = useSession()
  const [location, setLocation] = useState(EMPTY_LOCATION)
  const [settings, setSettings] = useState(DEFAULT_ATTENDANCE_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [savingLocation, setSavingLocation] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [locationSuccess, setLocationSuccess] = useState('')
  const [locationError, setLocationError] = useState('')
  const [settingsSuccess, setSettingsSuccess] = useState('')
  const [settingsError, setSettingsError] = useState('')

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
        setLocationError(err.message || 'Не удалось загрузить настройки')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSaveLocation() {
    if (!location.name?.trim()) {
      setLocationError('Укажите название рабочей точки')
      return
    }
    if (!location.latitude || !location.longitude) {
      setLocationError('Укажите координаты рабочей точки')
      return
    }
    setSavingLocation(true)
    setLocationError('')
    setLocationSuccess('')
    try {
      const saved = await saveWorkLocation({
        ...location,
        radiusMeters: clampRadiusMeters(location.radiusMeters),
      })
      setLocation(saved)
      setLocationSuccess('Рабочая территория сохранена')
    } catch (err) {
      setLocationError(err.message || 'Не удалось сохранить рабочую точку')
    } finally {
      setSavingLocation(false)
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true)
    setSettingsError('')
    setSettingsSuccess('')
    try {
      const saved = await saveAttendanceSettings(settings, user?.id || null)
      setSettings(saved)
      setSettingsSuccess('Штрафные баллы сохранены')
    } catch (err) {
      setSettingsError(err.message || 'Не удалось сохранить настройки')
    } finally {
      setSavingSettings(false)
    }
  }

  async function useCurrentLocation() {
    setLocationError('')
    try {
      const position = await getCurrentPosition()
      const coords = extractCoords(position)
      setLocation((prev) => ({
        ...prev,
        latitude: coords.latitude,
        longitude: coords.longitude,
      }))
    } catch (err) {
      setLocationError(err.message || 'Не удалось определить местоположение')
    }
  }

  if (loading) return <p className="admin-form__hint">Загрузка настроек…</p>

  return (
    <>
      <section className="admin-panel-card platform-settings__section">
        <h2 className="admin-panel-card__title">Рабочая территория</h2>
        <p className="admin-panel-card__desc">
          Точка и радиус, в пределах которых доступны отметки прихода и ухода.
        </p>

        <div className="admin-form">
          <label className="admin-form__label">
            Название рабочей точки
            <input
              className="admin-form__input"
              value={location.name}
              onChange={(e) => setLocation({ ...location, name: e.target.value })}
            />
          </label>
          <label className="admin-form__label">
            Адрес
            <input
              className="admin-form__input"
              value={location.address}
              onChange={(e) => setLocation({ ...location, address: e.target.value })}
            />
          </label>
          <div className="admin-form__row">
            <label className="admin-form__label">
              Широта
              <input
                className="admin-form__input"
                type="number"
                step="any"
                value={location.latitude}
                onChange={(e) => setLocation({ ...location, latitude: e.target.value })}
              />
            </label>
            <label className="admin-form__label">
              Долгота
              <input
                className="admin-form__input"
                type="number"
                step="any"
                value={location.longitude}
                onChange={(e) => setLocation({ ...location, longitude: e.target.value })}
              />
            </label>
          </div>
          <label className="admin-form__label">
            Радиус действия, метров (20–1000)
            <input
              className="admin-form__input"
              type="number"
              min={20}
              max={1000}
              value={location.radiusMeters}
              onChange={(e) => setLocation({ ...location, radiusMeters: e.target.value })}
            />
          </label>
          <button type="button" className="btn btn--outline btn--sm" onClick={useCurrentLocation}>
            Использовать моё текущее местоположение
          </button>
          <div className="admin-form__actions" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSaveLocation}
              disabled={savingLocation}
            >
              {savingLocation ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>

        {locationSuccess && <p className="admin-success-banner">{locationSuccess}</p>}
        {locationError && <p className="admin-form__error">{locationError}</p>}
      </section>

      <section className="admin-panel-card platform-settings__section">
        <h2 className="admin-panel-card__title">Штрафные баллы</h2>
        <p className="admin-panel-card__desc">
          Баллы и штрафы за отметки прихода и ухода в рейтинге сотрудников.
        </p>

        <div className="admin-form">
          <div className="admin-form__row">
            <label className="admin-form__label">
              Баллы за своевременный приход
              <input
                className="admin-form__input"
                type="number"
                value={settings.onTimePoints}
                onChange={(e) => setSettings({ ...settings, onTimePoints: Number(e.target.value) })}
              />
            </label>
            <label className="admin-form__label">
              Баллы за отработанную смену
              <input
                className="admin-form__input"
                type="number"
                value={settings.completedShiftPoints}
                onChange={(e) =>
                  setSettings({ ...settings, completedShiftPoints: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <div className="admin-form__row">
            <label className="admin-form__label">
              Штраф за опоздание
              <input
                className="admin-form__input"
                type="number"
                value={settings.latePenalty}
                onChange={(e) => setSettings({ ...settings, latePenalty: Number(e.target.value) })}
              />
            </label>
            <label className="admin-form__label">
              Штраф за ранний уход
              <input
                className="admin-form__input"
                type="number"
                value={settings.earlyLeavePenalty}
                onChange={(e) =>
                  setSettings({ ...settings, earlyLeavePenalty: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <div className="admin-form__row">
            <label className="admin-form__label">
              Штраф за неявку
              <input
                className="admin-form__input"
                type="number"
                value={settings.absencePenalty}
                onChange={(e) => setSettings({ ...settings, absencePenalty: Number(e.target.value) })}
              />
            </label>
            <label className="admin-form__label">
              Штраф без отметки прихода
              <input
                className="admin-form__input"
                type="number"
                value={settings.missingCheckInPenalty}
                onChange={(e) =>
                  setSettings({ ...settings, missingCheckInPenalty: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <label className="admin-form__label">
            Штраф без отметки ухода
            <input
              className="admin-form__input"
              type="number"
              value={settings.missingCheckOutPenalty}
              onChange={(e) =>
                setSettings({ ...settings, missingCheckOutPenalty: Number(e.target.value) })
              }
            />
          </label>
          <div className="admin-form__row">
            <label className="admin-form__label">
              Допустимое опоздание, мин
              <input
                className="admin-form__input"
                type="number"
                value={settings.lateGraceMinutes}
                onChange={(e) =>
                  setSettings({ ...settings, lateGraceMinutes: Number(e.target.value) })
                }
              />
            </label>
            <label className="admin-form__label">
              Допустимый ранний уход, мин
              <input
                className="admin-form__input"
                type="number"
                value={settings.earlyLeaveGraceMinutes}
                onChange={(e) =>
                  setSettings({ ...settings, earlyLeaveGraceMinutes: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <label className="admin-form__label">
            Время ожидания отметки ухода, мин
            <input
              className="admin-form__input"
              type="number"
              value={settings.checkoutWaitMinutes}
              onChange={(e) =>
                setSettings({ ...settings, checkoutWaitMinutes: Number(e.target.value) })
              }
            />
          </label>
          <div className="admin-form__actions" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSaveSettings}
              disabled={savingSettings}
            >
              {savingSettings ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>

        {settingsSuccess && <p className="admin-success-banner">{settingsSuccess}</p>}
        {settingsError && <p className="admin-form__error">{settingsError}</p>}
      </section>
    </>
  )
}
