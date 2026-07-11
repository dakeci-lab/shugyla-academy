import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentPosition, extractCoords, validatePositionAccuracy } from '../../../utils/geolocation'
import {
  formatTimeRange,
  SHIFT_STATUS,
  SHIFT_STATUS_LABELS,
  isWorkingShiftStatus,
  computeShiftStatus,
} from '../../../utils/shiftData'
import {
  getTodayShiftState,
  formatTodayLabel,
  formatDurationMinutes,
  debugLogTimeTracker,
} from '../../../utils/attendanceData'
import {
  resolveCanCheckIn,
  resolveCanCheckOut,
  resolveTimeTrackerDisplayStatus,
  buildTimeTrackerAuditRow,
} from '../../../utils/timeTrackerAudit'
import {
  getTodayShiftForEmployee,
  checkInEmployee,
  checkOutEmployee,
} from '../../../services/academyDataService'
import { useSession } from '../../../context/SessionContext'
import { usePlatformPageRefresh } from '../../../context/PullToRefreshContext'
import '../admin-shared.css'
import '../EmployeeRating.css'


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

  const loadShift = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    setLoadError(false)
    setActionError('')
    try {
      const row = await getTodayShiftForEmployee(employeeId)
      setShift(row)
      debugLogTimeTracker('loadShift', {
        employeeId,
        shiftFound: Boolean(row),
        shiftDate: row?.shiftDate ?? null,
        planned: row
          ? formatTimeRange(row.plannedStartTime, row.plannedEndTime)
          : null,
        status: row?.status ?? null,
      })
    } catch {
      setLoadError(true)
      setShift(null)
      debugLogTimeTracker('loadShiftError', { employeeId })
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  usePlatformPageRefresh(loadShift)

  useEffect(() => {
    loadShift()
  }, [loadShift])

  const computedStatus = useMemo(() => {
    if (!shift) return null
    return computeShiftStatus(shift, now)
  }, [shift, now])

  const state = useMemo(() => {
    if (loading) return { code: 'loading', message: '' }
    return getTodayShiftState(shift, undefined, now)
  }, [shift, loading, now])

  const displayStatus = useMemo(() => {
    if (loading) return ''
    return resolveTimeTrackerDisplayStatus(shift, state, computedStatus, now)
  }, [shift, state, loading, computedStatus, now])

  const checkInResult = useMemo(
    () => resolveCanCheckIn(shift, state, { loading, loadError, now }),
    [shift, state, loading, loadError, now]
  )
  const checkOutResult = useMemo(
    () => resolveCanCheckOut(shift, state, { loading, loadError }),
    [shift, state, loading, loadError]
  )

  const canCheckIn = checkInResult.value
  const canCheckOut = checkOutResult.value
  const disabledReason = acting
    ? 'acting'
    : !canCheckIn
      ? checkInResult.reason
      : null

  useEffect(() => {
    if (loading) return
    const audit = buildTimeTrackerAuditRow({
      employeeId,
      role: user?.role ?? null,
      shift,
      now,
      loading,
      loadError,
    })
    debugLogTimeTracker('audit', audit)
  }, [loading, employeeId, user?.role, shift, state, computedStatus, canCheckIn, canCheckOut, disabledReason, now, loadError])

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
          {(computedStatus?.workedMinutes ?? shift?.workedMinutes) > 0 && (
            <p>
              <strong>Отработано:</strong>{' '}
              {formatDurationMinutes(computedStatus?.workedMinutes ?? shift.workedMinutes)}
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
