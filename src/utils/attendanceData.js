import {
  formatTimeValue,
  isWorkingShiftStatus,
  toDateKey,
  computeShiftStatus,
  SHIFT_RESULT_CODE,
  SHIFT_STATUS,
  computeLateMinutesFromTimes,
  computeEarlyLeaveMinutesFromTimes,
  normalizeShift,
} from './shiftData'
import {
  buildPlannedShiftEndDateTime,
  isFalseMidnightAbsence,
  isShiftPlannedEndReached,
} from './shiftMidnightEnd'
import {
  toDateKeyInAppTimezone,
  addDaysToDateKey,
  APP_TIMEZONE,
} from './timezone'

/** Событие обновления рейтинга (после сохранения смены / отметки) */
export const RATING_UPDATED_EVENT = 'shugyla:rating-updated'

const RATING_DEBUG_KEY = 'shugyla_rating_debug'

export function isRatingDebugEnabled() {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(RATING_DEBUG_KEY) === '1') {
    return true
  }
  return import.meta.env?.DEV === true
}

export function setRatingDebugEnabled(enabled) {
  if (typeof localStorage === 'undefined') return
  if (enabled) localStorage.setItem(RATING_DEBUG_KEY, '1')
  else localStorage.removeItem(RATING_DEBUG_KEY)
}

export function notifyRatingUpdated(year, month) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(RATING_UPDATED_EVENT, { detail: { year, month } }))
}

export function parseYearMonthFromDateKey(dateKey) {
  const [year, month] = dateKey.split('-').map(Number)
  return { year, month }
}

function hasRecordedCheckIn(shift) {
  return Boolean(formatTimeValue(shift?.actualStartTime))
}

function hasRecordedCheckOut(shift) {
  return Boolean(formatTimeValue(shift?.actualEndTime))
}

function formatDebugDate(dateKey) {
  const [year, month, day] = dateKey.split('-')
  return `${day}.${month}.${year}`
}

function formatDebugPoints(points) {
  const value = Number(points) || 0
  return value > 0 ? `+${value}` : String(value)
}

/** Модель тайм-трекера, рейтинга и рабочих точек */

export const SCORE_EVENT_TYPE = {
  ON_TIME: 'on_time',
  COMPLETED_SHIFT: 'completed_shift',
  LATE: 'late',
  EARLY_LEAVE: 'early_leave',
  ABSENCE: 'absence',
  MISSING_CHECK_IN: 'missing_check_in',
  MISSING_CHECK_OUT: 'missing_check_out',
}

export const SCORE_EVENT_LABELS = {
  on_time: 'Своевременный приход',
  completed_shift: 'Полностью отработанная смена',
  late: 'Опоздание',
  early_leave: 'Ранний уход',
  absence: 'Неявка',
  missing_check_in: 'Отсутствие отметки прихода',
  missing_check_out: 'Не отмечен уход',
}

export const DEFAULT_ATTENDANCE_SETTINGS = {
  onTimePoints: 1,
  completedShiftPoints: 1,
  latePenalty: -2,
  earlyLeavePenalty: -2,
  absencePenalty: -10,
  missingCheckInPenalty: -5,
  missingCheckOutPenalty: -3,
  lateGraceMinutes: 5,
  earlyLeaveGraceMinutes: 5,
  checkoutWaitMinutes: 120,
}

const EARTH_RADIUS_METERS = 6371000

export function normalizeWorkLocation(raw) {
  if (!raw) return null
  return {
    id: raw.id,
    name: raw.name || '',
    address: raw.address || '',
    latitude: Number(raw.latitude),
    longitude: Number(raw.longitude),
    radiusMeters: Number(raw.radiusMeters ?? raw.radius_meters ?? 100),
    isActive: raw.isActive ?? raw.is_active ?? true,
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? null,
  }
}

export function normalizeAttendanceSettings(raw) {
  if (!raw) return { ...DEFAULT_ATTENDANCE_SETTINGS }
  return {
    id: raw.id || null,
    onTimePoints: raw.onTimePoints ?? raw.on_time_points ?? DEFAULT_ATTENDANCE_SETTINGS.onTimePoints,
    completedShiftPoints:
      raw.completedShiftPoints ?? raw.completed_shift_points ?? DEFAULT_ATTENDANCE_SETTINGS.completedShiftPoints,
    latePenalty: raw.latePenalty ?? raw.late_penalty ?? DEFAULT_ATTENDANCE_SETTINGS.latePenalty,
    earlyLeavePenalty:
      raw.earlyLeavePenalty ?? raw.early_leave_penalty ?? DEFAULT_ATTENDANCE_SETTINGS.earlyLeavePenalty,
    absencePenalty: raw.absencePenalty ?? raw.absence_penalty ?? DEFAULT_ATTENDANCE_SETTINGS.absencePenalty,
    missingCheckInPenalty:
      raw.missingCheckInPenalty ?? raw.missing_check_in_penalty ?? DEFAULT_ATTENDANCE_SETTINGS.missingCheckInPenalty,
    missingCheckOutPenalty:
      raw.missingCheckOutPenalty ?? raw.missing_check_out_penalty ?? DEFAULT_ATTENDANCE_SETTINGS.missingCheckOutPenalty,
    lateGraceMinutes:
      raw.lateGraceMinutes ?? raw.late_grace_minutes ?? DEFAULT_ATTENDANCE_SETTINGS.lateGraceMinutes,
    earlyLeaveGraceMinutes:
      raw.earlyLeaveGraceMinutes ?? raw.early_leave_grace_minutes ?? DEFAULT_ATTENDANCE_SETTINGS.earlyLeaveGraceMinutes,
    checkoutWaitMinutes:
      raw.checkoutWaitMinutes ?? raw.checkout_wait_minutes ?? DEFAULT_ATTENDANCE_SETTINGS.checkoutWaitMinutes,
    updatedBy: raw.updatedBy ?? raw.updated_by ?? null,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? null,
  }
}

export function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
}

export function isWithinWorkLocation(location, latitude, longitude) {
  if (!location) return { ok: false, distance: null, error: 'Рабочая территория ещё не настроена. Обратитесь к администратору' }
  const distance = haversineDistanceMeters(
    Number(location.latitude),
    Number(location.longitude),
    Number(latitude),
    Number(longitude)
  )
  if (distance <= Number(location.radiusMeters)) {
    return { ok: true, distance }
  }
  return {
    ok: false,
    distance,
    error: `Вы находитесь вне рабочей территории${distance ? ` (~${Math.round(distance)} м)` : ''}`,
  }
}

export function clampRadiusMeters(value) {
  const num = Number(value)
  if (Number.isNaN(num)) return 100
  return Math.min(1000, Math.max(20, Math.round(num)))
}

export function buildPlannedDateTime(shiftDate, timeValue) {
  const time = formatTimeValue(timeValue)
  if (!shiftDate || !time) return null
  const [year, month, day] = shiftDate.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0)
  if (Number.isNaN(localDate.getTime())) return null
  return localDate
}

export function isShiftEnded(shift, now = new Date()) {
  return isShiftPlannedEndReached(shift, now)
}

export function isCheckoutWaitExpired(shift, settings, now = new Date()) {
  const plannedEnd = buildPlannedShiftEndDateTime(shift)
  if (!plannedEnd) return false
  const waitMs = (settings.checkoutWaitMinutes || 0) * 60000
  return now.getTime() >= plannedEnd.getTime() + waitMs
}

/**
 * Выбирает актуальную смену: сегодня или вчерашнюю с незакрытым приходом (смена через полночь).
 */
export function resolveActiveShiftForToday(shifts, now = new Date()) {
  const todayKey = toDateKeyInAppTimezone(now)
  const yesterdayKey = addDaysToDateKey(todayKey, -1)
  const byDate = new Map()

  for (const row of shifts || []) {
    const normalized = normalizeShift(row)
    if (normalized?.shiftDate) {
      byDate.set(normalized.shiftDate, normalized)
    }
  }

  const todayShift = byDate.get(todayKey) || null
  const yesterdayShift = byDate.get(yesterdayKey) || null

  if (yesterdayShift?.actualStartTime && !yesterdayShift?.actualEndTime) {
    return yesterdayShift
  }

  return todayShift
}

const TIME_TRACKER_DEBUG_KEY = 'shugyla_time_tracker_debug'

export function isTimeTrackerDebugEnabled() {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(TIME_TRACKER_DEBUG_KEY) === '1') {
    return true
  }
  return import.meta.env?.DEV === true
}

/** Диагностика тайм-трекера (только dev / явное включение) */
export function debugLogTimeTracker(label, payload) {
  if (!isTimeTrackerDebugEnabled()) return
  console.info(`[TimeTracker] ${label}`, {
    timezone: APP_TIMEZONE,
    todayKey: toDateKeyInAppTimezone(),
    ...payload,
  })
}

export function calculateLateMinutes(shift, actualStartIso, graceMinutes = 0) {
  const plannedStart = buildPlannedDateTime(shift.shiftDate, shift.plannedStartTime)
  const actualStart = actualStartIso ? new Date(actualStartIso) : null
  if (!plannedStart || !actualStart || Number.isNaN(actualStart.getTime())) return 0
  const diff = Math.round((actualStart.getTime() - plannedStart.getTime()) / 60000)
  return Math.max(0, diff)
}

export function calculateEarlyLeaveMinutes(shift, actualEndIso, graceMinutes = 0) {
  const plannedEnd = buildPlannedShiftEndDateTime(shift)
  const actualEnd = actualEndIso ? new Date(actualEndIso) : null
  if (!plannedEnd || !actualEnd || Number.isNaN(actualEnd.getTime())) return 0
  const diff = Math.round((plannedEnd.getTime() - actualEnd.getTime()) / 60000)
  return Math.max(0, diff)
}

export function calculateWorkedMinutes(shift, actualStartIso, actualEndIso) {
  const start = actualStartIso ? new Date(actualStartIso) : null
  const end = actualEndIso ? new Date(actualEndIso) : null
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
}

export function getTodayShiftState(shift, settings, now = new Date()) {
  if (!shift) {
    return { code: 'no_schedule', message: 'На сегодня график не установлен' }
  }
  if (!isWorkingShiftStatus(shift.status)) {
    return { code: 'not_working', message: 'Сегодня у вас нет запланированной рабочей смены' }
  }
  if (shift.actualStartTime && shift.actualEndTime) {
    return { code: 'completed', message: 'Смена завершена' }
  }
  if (shift.actualStartTime) {
    return { code: 'checked_in', message: 'Вы на работе' }
  }
  if (isShiftEnded(shift, now) && !shift.actualStartTime) {
    return { code: 'missed', message: 'Смена завершена без отметки прихода' }
  }
  return { code: 'ready_check_in', message: 'Можно отметить приход' }
}

/** @deprecated Используйте calculateShiftRatingEntries */
export function buildAutoScoreEvents(shift, settings, now = new Date()) {
  return calculateShiftRatingEntries(shift, settings, now)
}

/** Вычисляет начисления/штрафы за одну смену (только в памяти, без записи в БД) */
export function calculateShiftRatingEntries(shift, settings, now = new Date()) {
  if (!shift?.id) return []

  if (
    shift.status === SHIFT_STATUS.ABSENCE &&
    !isFalseMidnightAbsence(shift, SHIFT_STATUS.ABSENCE, now)
  ) {
    return [
      {
        shiftId: shift.id,
        eventDate: shift.shiftDate,
        eventType: SCORE_EVENT_TYPE.ABSENCE,
        points: settings.absencePenalty,
        description: SCORE_EVENT_LABELS.absence,
      },
    ]
  }

  if (!isWorkingShiftStatus(shift.status)) return []

  const result = computeShiftStatus(shift, now)
  if (!result || result.code === SHIFT_RESULT_CODE.SCHEDULED) return []

  const events = []
  const date = shift.shiftDate
  const hasCheckIn = hasRecordedCheckIn(shift)
  const hasCheckOut = hasRecordedCheckOut(shift)

  if (
    result.code === SHIFT_RESULT_CODE.ABSENCE &&
    !isFalseMidnightAbsence(shift, result.code, now)
  ) {
    events.push({
      shiftId: shift.id,
      eventDate: date,
      eventType: SCORE_EVENT_TYPE.ABSENCE,
      points: settings.absencePenalty,
      description: SCORE_EVENT_LABELS.absence,
    })
    return events
  }

  if (!hasCheckIn && hasCheckOut) {
    events.push({
      shiftId: shift.id,
      eventDate: date,
      eventType: SCORE_EVENT_TYPE.MISSING_CHECK_IN,
      points: settings.missingCheckInPenalty,
      description: SCORE_EVENT_LABELS.missing_check_in,
    })
  }

  if (hasCheckIn) {
    const lateMinutes = result.lateMinutes ?? computeLateMinutesFromTimes(shift)
    if (lateMinutes > (settings.lateGraceMinutes || 0)) {
      events.push({
        shiftId: shift.id,
        eventDate: date,
        eventType: SCORE_EVENT_TYPE.LATE,
        points: settings.latePenalty,
        description: `Опоздание на ${lateMinutes} минут`,
      })
    } else {
      events.push({
        shiftId: shift.id,
        eventDate: date,
        eventType: SCORE_EVENT_TYPE.ON_TIME,
        points: settings.onTimePoints,
        description: SCORE_EVENT_LABELS.on_time,
      })
    }
  }

  if (result.code === SHIFT_RESULT_CODE.MISSING_CHECKOUT) {
    events.push({
      shiftId: shift.id,
      eventDate: date,
      eventType: SCORE_EVENT_TYPE.MISSING_CHECK_OUT,
      points: settings.missingCheckOutPenalty,
      description: SCORE_EVENT_LABELS.missing_check_out,
    })
    return events
  }

  if (hasCheckOut) {
    const earlyMinutes =
      result.earlyLeaveMinutes ?? computeEarlyLeaveMinutesFromTimes(shift)
    if (earlyMinutes > (settings.earlyLeaveGraceMinutes || 0)) {
      events.push({
        shiftId: shift.id,
        eventDate: date,
        eventType: SCORE_EVENT_TYPE.EARLY_LEAVE,
        points: settings.earlyLeavePenalty,
        description: `Ранний уход на ${earlyMinutes} минут`,
      })
    }
    events.push({
      shiftId: shift.id,
      eventDate: date,
      eventType: SCORE_EVENT_TYPE.COMPLETED_SHIFT,
      points: settings.completedShiftPoints,
      description: SCORE_EVENT_LABELS.completed_shift,
    })
  }

  return events
}

/** Рейтинг сотрудника за период по его сменам */
export function calculateEmployeeRatingFromShifts(shifts, settings, now = new Date()) {
  const scorableShifts = (shifts || []).filter(
    (shift) => shift.status === SHIFT_STATUS.ABSENCE || isWorkingShiftStatus(shift.status)
  )
  const entries = []

  scorableShifts.forEach((shift) => {
    calculateShiftRatingEntries(shift, settings, now).forEach((entry) => {
      entries.push({
        ...entry,
        employeeId: shift.employeeId,
      })
    })
  })

  const stats = aggregateEmployeeRating(entries, scorableShifts)
  return { entries, stats }
}

/** Рейтинги нескольких сотрудников за месяц */
export function calculateRatingsByEmployee(shifts, employeeIds, settings, now = new Date()) {
  const idSet = new Set((employeeIds || []).map(Number))
  const shiftsByEmployee = new Map()

  idSet.forEach((id) => shiftsByEmployee.set(id, []))
  ;(shifts || []).forEach((shift) => {
    const employeeId = Number(shift.employeeId)
    if (!idSet.has(employeeId)) return
    if (!shiftsByEmployee.has(employeeId)) shiftsByEmployee.set(employeeId, [])
    shiftsByEmployee.get(employeeId).push(shift)
  })

  const ratings = new Map()
  idSet.forEach((employeeId) => {
    ratings.set(
      employeeId,
      calculateEmployeeRatingFromShifts(shiftsByEmployee.get(employeeId) || [], settings, now)
    )
  })
  return ratings
}

/** DEBUG: вывод расчёта рейтинга в консоль */
export function debugLogShiftRating(employeeName, shift, settings, events, monthTotal) {
  if (!isRatingDebugEnabled() || !shift) return

  const status = computeShiftStatus(shift)
  const dayTotal = events.reduce((sum, event) => sum + (Number(event.points) || 0), 0)

  console.group(`[Rating] ${employeeName} · ${formatDebugDate(shift.shiftDate)}`)
  console.log(`Статус: ${status?.label || '—'}`)
  if (events.length === 0) {
    console.log('События: нет (смена ещё не завершена или без начислений)')
  } else {
    events.forEach((event) => {
      const label = SCORE_EVENT_LABELS[event.eventType] || event.eventType
      console.log(`${formatDebugPoints(event.points)} — ${label}`)
    })
  }
  console.log(`Итого за день: ${formatDebugPoints(dayTotal)}`)
  if (monthTotal != null) {
    console.log(`Итого за месяц: ${formatDebugPoints(monthTotal)}`)
  }
  console.groupEnd()
}

/** DEBUG: сводка рейтинга сотрудника за месяц */
export function debugLogEmployeeMonthRating(employeeName, monthEvents, monthScore) {
  if (!isRatingDebugEnabled()) return

  console.group(`[Rating] ${employeeName} — итог за месяц`)
  console.log(`Баллы: ${monthScore}`)
  console.log(`Событий: ${monthEvents.length}`)
  console.groupEnd()
}

/** Базовый рейтинг до начислений и штрафов за период */
export const RATING_BASE_SCORE = 100

/** Ограничение итогового балла диапазоном 0–100 */
export function clampRatingScore(score) {
  return Math.min(100, Math.max(0, Math.round(Number(score) || 0)))
}

/** Цвет шкалы рейтинга: 0 — красный, 50 — жёлто-оранжевый, 100 — зелёный */
export function getRatingScoreColor(score) {
  const value = clampRatingScore(score)
  const hue = (value / 100) * 130
  return `hsl(${hue}, 68%, 42%)`
}

/** Градиент полосы рейтинга по диапазонам баллов */
export function getRatingScoreGradient(score) {
  const value = clampRatingScore(score)
  if (value >= 95) return 'linear-gradient(90deg, #15803d, #22c55e)'
  if (value >= 85) return 'linear-gradient(90deg, #65a30d, #a3e635)'
  if (value >= 75) return 'linear-gradient(90deg, #ca8a04, #facc15)'
  if (value >= 60) return 'linear-gradient(90deg, #ea580c, #fb923c)'
  return 'linear-gradient(90deg, #dc2626, #ef4444)'
}

export function aggregateEmployeeRating(events, shifts = []) {
  const stats = {
    totalPoints: 0,
    onTimeCount: 0,
    lateCount: 0,
    earlyLeaveCount: 0,
    absenceCount: 0,
    missingCheckInCount: 0,
    missingCheckOutCount: 0,
    completedShifts: 0,
  }

  events.forEach((event) => {
    stats.totalPoints += Number(event.points) || 0
    if (event.eventType === SCORE_EVENT_TYPE.ON_TIME) stats.onTimeCount += 1
    if (event.eventType === SCORE_EVENT_TYPE.LATE) stats.lateCount += 1
    if (event.eventType === SCORE_EVENT_TYPE.EARLY_LEAVE) stats.earlyLeaveCount += 1
    if (event.eventType === SCORE_EVENT_TYPE.ABSENCE) stats.absenceCount += 1
    if (event.eventType === SCORE_EVENT_TYPE.MISSING_CHECK_IN) stats.missingCheckInCount += 1
    if (event.eventType === SCORE_EVENT_TYPE.MISSING_CHECK_OUT) stats.missingCheckOutCount += 1
  })

  stats.completedShifts = shifts.filter(
    (shift) => isWorkingShiftStatus(shift.status) && shift.actualEndTime
  ).length

  stats.totalPoints = clampRatingScore(RATING_BASE_SCORE + stats.totalPoints)

  return stats
}

export function compareRatingRows(a, b) {
  return b.totalPoints - a.totalPoints
}

export function getMonthRange(year, month) {
  const lastDay = new Date(year, month, 0).getDate()
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function getCurrentMonthState() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export function formatTodayLabel() {
  return new Date().toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatDurationMinutes(minutes) {
  if (!minutes) return '0 мин'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours && mins) return `${hours} ч ${mins} мин`
  if (hours) return `${hours} ч`
  return `${mins} мин`
}

export function todayDateKey() {
  return toDateKeyInAppTimezone()
}
