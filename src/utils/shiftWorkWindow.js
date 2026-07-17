/**
 * Рабочее окно смены: effectivePlannedEndAt, stale/missed checkout, overnight shifts.
 */
import { addDaysToDateKey, toDateKeyInAppTimezone } from './timezone.js'

function formatTimeValue(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    if (value.includes('T')) {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }
    return value.slice(0, 5)
  }
  return ''
}

function timeToMinutes(timeValue) {
  const time = formatTimeValue(timeValue)
  if (!time) return null
  const [hours, minutes] = time.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

/** Смена 22:00–06:00 и аналогичные: planned_end <= planned_start по минутам суток */
export function isOvernightPlannedShift(plannedStartTime, plannedEndTime) {
  const start = timeToMinutes(plannedStartTime)
  const end = timeToMinutes(plannedEndTime)
  if (start == null || end == null) return false
  return end <= start
}

/** Смена заканчивается в 00:00 следующего календарного дня (13:45–00:00) */
export function isShiftEndingAtMidnight(plannedStartTime, plannedEndTime) {
  const end = formatTimeValue(plannedEndTime)
  const start = formatTimeValue(plannedStartTime)
  return end === '00:00' && Boolean(start) && start !== '00:00'
}

/** Плановое окончание смены (effectivePlannedEndAt) с учётом overnight/midnight */
export function buildEffectivePlannedEndAt(shift) {
  if (!shift?.shiftDate) return null
  const endTime = formatTimeValue(shift.plannedEndTime)
  if (!endTime) return null

  let dateKey = shift.shiftDate
  if (
    isShiftEndingAtMidnight(shift.plannedStartTime, shift.plannedEndTime) ||
    isOvernightPlannedShift(shift.plannedStartTime, shift.plannedEndTime)
  ) {
    dateKey = addDaysToDateKey(shift.shiftDate, 1)
  }

  const [year, month, day] = dateKey.split('-').map(Number)
  const [hours, minutes] = endTime.split(':').map(Number)
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0)
  return Number.isNaN(date.getTime()) ? null : date
}

export function isEffectivePlannedEndReached(shift, now = new Date()) {
  const plannedEnd = buildEffectivePlannedEndAt(shift)
  if (!plannedEnd) return false
  return now.getTime() >= plannedEnd.getTime()
}

/** Есть незавершённая отметка прихода (независимо от планового конца / графика) */
export function hasOpenAttendance(shift) {
  return Boolean(shift?.actualStartTime) && !shift?.actualEndTime
}

/** Открытая смена всё ещё в рабочем окне (ночная смена после полуночи) */
export function isOpenShiftWorkWindowActive(shift, now = new Date()) {
  if (!hasOpenAttendance(shift)) return false
  const plannedEnd = buildEffectivePlannedEndAt(shift)
  if (!plannedEnd) return true
  return now.getTime() < plannedEnd.getTime()
}

/** Прошлая смена с приходом без ухода после effectivePlannedEndAt */
export function isStaleOpenShift(shift, now = new Date()) {
  if (!hasOpenAttendance(shift)) return false
  return isEffectivePlannedEndReached(shift, now)
}

export function isMissedClockOutShift(shift, now = new Date()) {
  return isStaleOpenShift(shift, now)
}

export function resolveWorkWindowShift(shifts, now = new Date()) {
  const todayKey = toDateKeyInAppTimezone(now)
  const yesterdayKey = addDaysToDateKey(todayKey, -1)
  const byDate = new Map()

  for (const row of shifts || []) {
    const dateKey = row?.shiftDate ?? row?.shift_date
    if (dateKey) byDate.set(String(dateKey), row)
  }

  const todayShift = byDate.get(todayKey) ?? null
  const yesterdayShift = byDate.get(yesterdayKey) ?? null

  // Незавершённая смена всегда остаётся активной для тайм-трекера (в т.ч. stale / после
  // смены графика). Сначала вчерашняя (overnight), затем сегодняшняя.
  if (hasOpenAttendance(yesterdayShift)) {
    return {
      activeShift: yesterdayShift,
      todayShift,
      yesterdayShift,
      previousShiftMissedClockOut: false,
    }
  }

  if (hasOpenAttendance(todayShift)) {
    return {
      activeShift: todayShift,
      todayShift,
      yesterdayShift,
      previousShiftMissedClockOut: false,
    }
  }

  return {
    activeShift: todayShift,
    todayShift,
    yesterdayShift,
    previousShiftMissedClockOut: false,
  }
}

/** @deprecated alias — используйте resolveWorkWindowShift().activeShift */
export function resolveActiveShiftForToday(shifts, now = new Date()) {
  return resolveWorkWindowShift(shifts, now).activeShift
}

export function deriveTrackerStatus(shift, now = new Date()) {
  if (!shift) return 'no_shift'
  if (shift.actualStartTime && shift.actualEndTime) return 'completed'
  // Незавершённая смена важнее текущего статуса графика (выходной / смена плана).
  if (hasOpenAttendance(shift)) return 'working'
  if (shift.status === 'day_off') return 'day_off'
  if (shift.status === 'vacation' || shift.status === 'sick_leave') return 'day_off'
  if (shift.status !== 'working') return 'no_shift'
  return 'not_started'
}
