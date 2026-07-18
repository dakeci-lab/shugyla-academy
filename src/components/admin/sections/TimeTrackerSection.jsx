import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentPosition, extractCoords, validatePositionAccuracy } from '../../../utils/geolocation'
import {
  formatTimeRange,
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
  formatCheckoutCooldownHint,
  getCheckoutCooldownRemainingMs,
} from '../../../utils/checkoutCooldown'
import {
  logAttendanceActionFailure,
  mapAttendanceActionUserMessage,
} from '../../../utils/attendanceActionErrors'
import {
  getTodayShiftForEmployee,
  checkInEmployee,
  checkOutEmployee,
} from '../../../services/academyDataService'
import { useSession } from '../../../context/SessionContext'
import { usePlatformPageRefresh } from '../../../context/PullToRefreshContext'
import TimeTrackerHomeCard from './TimeTrackerHomeCard'
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

function TimeTrackerLegacyCard({
  isHome,
  shift,
  loading,
  loadError,
  loadShift,
  displayStatus,
  computedStatus,
  canCheckIn,
  canCheckOut,
  checkoutDisabled,
  checkoutCooldownHint,
  acting,
  handleCheckIn,
  handleCheckOut,
  success,
  actionError,
}) {
  return (
    <section className={`time-tracker-card ${isHome ? 'time-tracker-card--home' : ''}`}>
      <h3 className={isHome ? 'time-tracker-card__section-title' : 'admin-panel-card__title'}>
        {isHome ? 'Сегодняшняя смена' : 'Тайм-трекер'}
      </h3>

      <p className="admin-form__hint time-tracker-card__date">{formatTodayLabel()}</p>

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
          {shift && isWorkingShiftStatus(shift.status) && (
            <p>
              <strong>Плановая смена:</strong>{' '}
              {formatTimeRange(shift.plannedStartTime, shift.plannedEndTime) || '—'}
            </p>
          )}
          {shift && !isWorkingShiftStatus(shift.status) && (
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
          disabled={checkoutDisabled}
          onClick={handleCheckOut}
          aria-disabled={checkoutDisabled}
        >
          {acting ? 'Проверка…' : 'Я ухожу'}
        </button>
      </div>

      {checkoutCooldownHint && canCheckOut && (
        <p className="admin-form__hint time-tracker-card__cooldown" role="status">
          {checkoutCooldownHint}
        </p>
      )}

      {success && <p className="admin-success-banner">{success}</p>}
      {actionError && <p className="admin-form__error">{actionError}</p>}
    </section>
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
  const [previousShiftMissedClockOut, setPreviousShiftMissedClockOut] = useState(false)
  const [now, setNow] = useState(new Date())

  const loadShift = useCallback(async (options = {}) => {
    if (!employeeId) return
    // Ignore synthetic click events from onClick={loadShift}
    const quiet =
      options && typeof options === 'object' && !('nativeEvent' in options)
        ? Boolean(options.quiet)
        : false
    if (!quiet) {
      setLoading(true)
      setActionError('')
    }
    setLoadError(false)
    try {
      const row = await getTodayShiftForEmployee(employeeId)
      setShift(row)
      setPreviousShiftMissedClockOut(Boolean(row?.previousShiftMissedClockOut))
      debugLogTimeTracker('loadShift', {
        employeeId,
        shiftFound: Boolean(row),
        shiftDate: row?.shiftDate ?? null,
        planned: row
          ? formatTimeRange(row.plannedStartTime, row.plannedEndTime)
          : null,
        status: row?.status ?? null,
        quiet,
      })
    } catch {
      if (!quiet) {
        setLoadError(true)
        setShift(null)
      }
      debugLogTimeTracker('loadShiftError', { employeeId, quiet })
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [employeeId])

  usePlatformPageRefresh(() => loadShift({ quiet: true }))

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
    () => resolveCanCheckOut(shift, state, { loading, loadError, now }),
    [shift, state, loading, loadError, now]
  )

  const canCheckIn = checkInResult.value
  const canCheckOut = checkOutResult.value

  const checkoutCooldownRemainingMs = useMemo(() => {
    if (!shift?.actualStartTime || shift?.actualEndTime) return 0
    return getCheckoutCooldownRemainingMs(shift.actualStartTime, now)
  }, [shift?.actualStartTime, shift?.actualEndTime, now])

  const checkoutCooldownHint = useMemo(
    () => formatCheckoutCooldownHint(checkoutCooldownRemainingMs),
    [checkoutCooldownRemainingMs]
  )

  const checkoutDisabled =
    !canCheckOut || acting || loading || loadError || checkoutCooldownRemainingMs > 0

  useEffect(() => {
    const hasOpenShift = Boolean(shift?.actualStartTime && !shift?.actualEndTime)
    const intervalMs =
      checkoutCooldownRemainingMs > 0 ? 1000 : hasOpenShift && canCheckOut ? 30000 : 60000
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [
    shift?.actualStartTime,
    shift?.actualEndTime,
    canCheckOut,
    checkoutCooldownRemainingMs,
  ])

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

  function sanitizeActionError(error, context) {
    return mapAttendanceActionUserMessage(error, context)
  }

  async function runWithGeolocation(action, context) {
    if (acting) return false
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
      return true
    } catch (err) {
      const actionName = context === 'checkout' ? 'finish shift' : 'start shift'
      logAttendanceActionFailure(actionName, err, { context })
      setActionError(sanitizeActionError(err, context))
      return false
    } finally {
      setActing(false)
    }
  }

  async function handleCheckIn() {
    if (acting || loading || loadError || !canCheckIn) return
    const ok = await runWithGeolocation(
      (coords) => checkInEmployee(employeeId, coords),
      'checkin'
    )
    if (ok) {
      setSuccess('Приход отмечен')
      // Точечный refresh get_today_status — без полного bootstrap и без skeleton
      void loadShift({ quiet: true })
    }
  }

  async function handleCheckOut() {
    if (acting || loading || loadError || !canCheckOut) return
    if (getCheckoutCooldownRemainingMs(shift?.actualStartTime, new Date()) > 0) return
    const ok = await runWithGeolocation(
      (coords) => checkOutEmployee(employeeId, coords),
      'checkout'
    )
    if (ok) {
      setSuccess('Уход отмечен')
      void loadShift({ quiet: true })
    }
  }

  const welcomeName =
    user?.name?.split(/\s+/)[0] || user?.name || user?.roleName || 'сотрудник'

  if (isHome) {
    return (
      <TimeTrackerHomeCard
        welcomeName={welcomeName}
        shift={shift}
        state={state}
        computedStatus={computedStatus}
        displayStatus={displayStatus}
        canCheckIn={canCheckIn}
        canCheckOut={canCheckOut}
        checkoutDisabled={checkoutDisabled}
        checkoutCooldownHint={checkoutCooldownHint}
        acting={acting}
        loading={loading}
        loadError={loadError}
        onCheckIn={handleCheckIn}
        onCheckOut={handleCheckOut}
        onRetry={loadShift}
        now={now}
        isWorkingShift={Boolean(shift && isWorkingShiftStatus(shift.status))}
        actionError={actionError}
        success={success && !actionError ? success : ''}
        previousShiftMissedClockOut={previousShiftMissedClockOut}
      />
    )
  }

  return (
    <TimeTrackerLegacyCard
      isHome={isHome}
      shift={shift}
      loading={loading}
      loadError={loadError}
      loadShift={loadShift}
      displayStatus={displayStatus}
      computedStatus={computedStatus}
      canCheckIn={canCheckIn}
      canCheckOut={canCheckOut}
      checkoutDisabled={checkoutDisabled}
      checkoutCooldownHint={checkoutCooldownHint}
      acting={acting}
      handleCheckIn={handleCheckIn}
      handleCheckOut={handleCheckOut}
      success={success}
      actionError={actionError}
    />
  )
}
