import { useEffect, useMemo, useState } from 'react'
import { getCurrentPosition, extractCoords, validatePositionAccuracy } from '../../../utils/geolocation'
import { formatTimeRange, SHIFT_STATUS, SHIFT_STATUS_LABELS } from '../../../utils/shiftData'
import {
  getTodayShiftState,
  formatTodayLabel,
  formatDurationMinutes,
} from '../../../utils/attendanceData'
import {
  getTodayShiftForEmployee,
  checkInEmployee,
  checkOutEmployee,
} from '../../../services/academyDataService'
import { useSession } from '../../../context/SessionContext'
import '../admin-shared.css'
import '../EmployeeRating.css'

function getDisplayStatus(shift, state) {
  if (state.code === 'ready_check_in') return 'Смена ещё не начата'
  if (state.code === 'checked_in') return 'Вы на работе'
  if (state.code === 'completed') return 'Смена завершена'
  if (!shift) return state.message
  if (shift.status === SHIFT_STATUS.DAY_OFF) return 'Сегодня у вас выходной'
  if (state.code === 'no_schedule') return 'На сегодня график не установлен'
  if (state.code === 'not_working') return 'Сегодня у вас нет запланированной рабочей смены'
  return state.message
}

function TimeTrackerSkeleton() {
  return (
    <div className="time-tracker-card__skeleton" aria-hidden="true">
      <div className="time-tracker-card__skeleton-line time-tracker-card__skeleton-line--wide" />
      <div className="time-tracker-card__skeleton-line" />
      <div className="time-tracker-card__skeleton-line" />
      <div className="time-tracker-card__skeleton-actions">
        <div className="time-tracker-card__skeleton-btn" />
        <div className="time-tracker-card__skeleton-btn" />
      </div>
    </div>
  )
}

/** Блок тайм-трекера для сотрудника */
export default function TimeTrackerSection({ employeeId: employeeIdProp, variant = 'default' }) {
  const { user } = useSession()
  const employeeId = employeeIdProp || user?.id
  const isHome = variant === 'home'
  const [shift, setShift] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState('')
  const [success, setSuccess] = useState('')
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  async function loadShift() {
    if (!employeeId) return
    setLoading(true)
    setLoadError(false)
    setActionError('')
    try {
      const row = await getTodayShiftForEmployee(employeeId)
      setShift(row)
    } catch {
      setLoadError(true)
      setShift(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadShift()
  }, [employeeId])

  const state = useMemo(() => {
    if (loading) return { code: 'loading', message: '' }
    return getTodayShiftState(shift)
  }, [shift, loading])

  const displayStatus = useMemo(() => getDisplayStatus(shift, state), [shift, state])

  async function runWithGeolocation(action) {
    setActing(true)
    setActionError('')
    setSuccess('')
    try {
      const position = await getCurrentPosition()
      const coords = extractCoords(position)
      const accuracyError = validatePositionAccuracy(coords.accuracy)
      if (accuracyError) throw new Error(accuracyError)
      const updated = await action(coords)
      setShift(updated)
    } catch (err) {
      setActionError(err.message || 'Не удалось выполнить действие')
    } finally {
      setActing(false)
    }
  }

  async function handleCheckIn() {
    await runWithGeolocation((coords) => checkInEmployee(employeeId, coords))
    setSuccess('Приход отмечен')
  }

  async function handleCheckOut() {
    await runWithGeolocation((coords) => checkOutEmployee(employeeId, coords))
    setSuccess('Уход отмечен')
  }

  const canCheckIn = !loading && !loadError && state.code === 'ready_check_in'
  const canCheckOut = !loading && !loadError && state.code === 'checked_in'

  const welcomeName = user?.name?.split(/\s+/)[0] || user?.name || 'сотрудник'

  return (
    <section className={`time-tracker-card ${isHome ? 'time-tracker-card--home' : ''}`}>
      {isHome && (
        <header className="time-tracker-card__welcome">
          <h2 className="time-tracker-card__welcome-title">
            Добро пожаловать, {welcomeName}
          </h2>
        </header>
      )}

      <h3 className={isHome ? 'time-tracker-card__section-title' : 'admin-panel-card__title'}>
        {isHome ? 'Сегодняшняя смена' : 'Тайм-трекер'}
      </h3>

      <p className="admin-form__hint time-tracker-card__date">{formatTodayLabel()}</p>
      <p className="time-tracker-card__clock">
        {now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </p>

      {loading ? (
        <TimeTrackerSkeleton />
      ) : loadError ? (
        <div className="time-tracker-card__load-error">
          <p>Не удалось загрузить данные смены</p>
          <button type="button" className="btn btn--outline btn--sm" onClick={loadShift}>
            Повторить
          </button>
        </div>
      ) : (
        <div className="time-tracker-card__meta">
          {shift && isWorkingShiftVisible(shift) && (
            <p>
              <strong>Плановая смена:</strong>{' '}
              {formatTimeRange(shift.plannedStartTime, shift.plannedEndTime) || '—'}
            </p>
          )}
          {shift && !isWorkingShiftVisible(shift) && (
            <p>
              <strong>Статус дня:</strong> {SHIFT_STATUS_LABELS[shift.status]}
            </p>
          )}
          <p className="time-tracker-card__status">
            <strong>Текущий статус:</strong> {displayStatus}
          </p>
          {shift?.actualStartTime && (
            <p>
              <strong>Приход:</strong>{' '}
              {new Date(shift.actualStartTime).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
          {shift?.actualEndTime && (
            <p>
              <strong>Уход:</strong>{' '}
              {new Date(shift.actualEndTime).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
          {shift?.workedMinutes > 0 && (
            <p>
              <strong>Отработано:</strong> {formatDurationMinutes(shift.workedMinutes)}
            </p>
          )}
        </div>
      )}

      <div className="time-tracker-card__actions">
        <button
          type="button"
          className="btn btn--primary time-tracker-card__action-btn"
          disabled={!canCheckIn || acting || loading || loadError}
          onClick={handleCheckIn}
        >
          {acting ? 'Проверка…' : 'Я на работе'}
        </button>
        <button
          type="button"
          className="btn btn--outline time-tracker-card__action-btn"
          disabled={!canCheckOut || acting || loading || loadError}
          onClick={handleCheckOut}
        >
          {acting ? 'Проверка…' : 'Я ухожу'}
        </button>
      </div>

      {success && <p className="admin-success-banner">{success}</p>}
      {actionError && <p className="admin-form__error">{actionError}</p>}
    </section>
  )
}

function isWorkingShiftVisible(shift) {
  return shift.status === SHIFT_STATUS.WORKING
}
