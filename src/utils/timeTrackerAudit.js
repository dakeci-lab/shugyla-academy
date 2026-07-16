/**
 * Аудит и локальная логика кнопок тайм-трекера.
 * Не меняет shiftData.js и attendanceData.js.
 */
import { formatTimeValue, isWorkingShiftStatus, computeShiftStatus, SHIFT_RESULT_CODE } from './shiftData'
import {
  getTodayShiftState,
  debugLogTimeTracker,
  isTimeTrackerDebugEnabled,
} from './attendanceData'
import {
  buildPlannedShiftEndDateTime,
  isShiftPlannedEndReached,
  isShiftEndingAtMidnight,
  isFalseMidnightAbsence,
} from './shiftMidnightEnd'
import { isOpenShiftWorkWindowActive } from './shiftWorkWindow'
import { toDateKeyInAppTimezone } from './timezone'

/** Можно ли отметить приход — только для UI тайм-трекера */
export function resolveCanCheckIn(shift, state, { loading, loadError, now = new Date() }) {
  if (loading) return { value: false, reason: 'loading' }
  if (loadError) return { value: false, reason: 'load_error' }
  if (!shift) return { value: false, reason: 'shift_not_loaded' }
  if (!isWorkingShiftStatus(shift.status)) {
    return { value: false, reason: `shift_status_${shift.status}` }
  }
  if (shift.actualStartTime && shift.actualEndTime) {
    return { value: false, reason: 'shift_completed' }
  }
  if (shift.actualStartTime) {
    return { value: false, reason: 'already_checked_in' }
  }
  if (isShiftPlannedEndReached(shift, now)) {
    return { value: false, reason: 'shift_ended_without_checkin' }
  }
  if (state?.code && state.code !== 'ready_check_in') {
    return { value: true, reason: `override_from_${state.code}` }
  }
  return { value: true, reason: null }
}

/** Можно ли отметить уход — только для UI тайм-трекера */
export function resolveCanCheckOut(shift, state, { loading, loadError, now = new Date() }) {
  if (loading) return { value: false, reason: 'loading' }
  if (loadError) return { value: false, reason: 'load_error' }
  if (!shift) return { value: false, reason: 'shift_not_loaded' }
  if (!isOpenShiftWorkWindowActive(shift, now)) {
    return { value: false, reason: 'shift_not_active' }
  }
  if (shift.actualStartTime && !shift.actualEndTime) {
    return { value: true, reason: null }
  }
  if (state?.code === 'checked_in') {
    return { value: true, reason: null }
  }
  return { value: false, reason: state?.code || 'not_checked_in' }
}

/** Текст статуса для тайм-трекера (не влияет на график/рейтинг) */
export function resolveTimeTrackerDisplayStatus(shift, state, computedStatus, now = new Date()) {
  const stateCode = state?.code
  if (
    shift &&
    isWorkingShiftStatus(shift.status) &&
    !shift.actualStartTime &&
    !isShiftPlannedEndReached(shift, now) &&
    (stateCode === 'missed' ||
      isFalseMidnightAbsence(shift, computedStatus?.code, now))
  ) {
    return 'Смена ещё не начата'
  }

  if (stateCode === 'ready_check_in') return 'Смена ещё не начата'
  if (stateCode === 'checked_in') return 'Вы на работе'
  if (stateCode === 'completed') return 'Смена завершена'
  if (stateCode === 'missed') return 'Смена завершена без отметки прихода'
  if (!shift) return state?.message || 'На сегодня график не установлен'

  const computedCode = computedStatus?.code
  if (
    computedCode === SHIFT_RESULT_CODE.ABSENCE &&
    isFalseMidnightAbsence(shift, computedCode, now)
  ) {
    return 'Смена ещё не начата'
  }

  if (
    computedStatus?.label &&
    isWorkingShiftStatus(shift.status) &&
    computedCode !== SHIFT_RESULT_CODE.SCHEDULED
  ) {
    return computedStatus.label
  }

  return state?.message || 'Статус смены'
}

/** Одна строка аудита для сотрудника */
export function buildTimeTrackerAuditRow({
  employeeId,
  role,
  shift,
  now = new Date(),
  loading = false,
  loadError = false,
}) {
  const state = loading ? { code: 'loading' } : getTodayShiftState(shift, undefined, now)
  const computedStatus = shift ? computeShiftStatus(shift, now) : null
  const checkIn = resolveCanCheckIn(shift, state, { loading, loadError, now })
  const checkOut = resolveCanCheckOut(shift, state, { loading, loadError, now })

  let disabledReason = null
  if (!checkIn.value) disabledReason = checkIn.reason
  else if (checkOut.value === false && state.code === 'checked_in') disabledReason = null

  return {
    employeeId,
    role: role ?? null,
    shiftDate: shift?.shiftDate ?? null,
    plannedStart: formatTimeValue(shift?.plannedStartTime) || null,
    plannedEnd: formatTimeValue(shift?.plannedEndTime) || null,
    endsAtMidnight: shift
      ? isShiftEndingAtMidnight(shift.plannedStartTime, shift.plannedEndTime)
      : false,
    currentTime: now.toISOString(),
    state: state.code,
    computedStatus: computedStatus?.code ?? null,
    canCheckIn: checkIn.value,
    canCheckOut: checkOut.value,
    disabledReason,
    checkInReason: checkIn.reason,
    checkOutReason: checkOut.reason,
  }
}

/** Пакетный аудит (dev / консоль) */
export async function auditEmployeesTimeTracker(employees, getTodayShiftForEmployee, now = new Date()) {
  const rows = []
  for (const employee of employees) {
    let shift = null
    let loading = false
    let loadError = false
    try {
      shift = await getTodayShiftForEmployee(employee.id)
    } catch {
      loadError = true
    }
    rows.push(
      buildTimeTrackerAuditRow({
        employeeId: employee.id,
        role: employee.role,
        shift,
        now,
        loading,
        loadError,
      })
    )
  }
  if (isTimeTrackerDebugEnabled()) {
    console.table(rows)
    debugLogTimeTracker('batchAudit', { count: rows.length, todayKey: toDateKeyInAppTimezone(now) })
  }
  return rows
}
