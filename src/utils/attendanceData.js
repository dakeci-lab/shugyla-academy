import {
  formatTimeValue,
  isWorkingShiftStatus,
  toDateKey,
  computeShiftStatus,
  SHIFT_RESULT_CODE,
  computeLateMinutesFromTimes,
  computeEarlyLeaveMinutesFromTimes,
} from './shiftData'

/** Модель тайм-трекера, рейтинга и рабочих точек */

export const SCORE_EVENT_TYPE = {
  ON_TIME: 'on_time',
  COMPLETED_SHIFT: 'completed_shift',
  LATE: 'late',
  EARLY_LEAVE: 'early_leave',
  ABSENCE: 'absence',
  MISSING_CHECK_IN: 'missing_check_in',
  MISSING_CHECK_OUT: 'missing_check_out',
  MANUAL_BONUS: 'manual_bonus',
  MANUAL_PENALTY: 'manual_penalty',
}

export const SCORE_EVENT_LABELS = {
  on_time: 'Своевременный приход',
  completed_shift: 'Полностью отработанная смена',
  late: 'Опоздание',
  early_leave: 'Ранний уход',
  absence: 'Неявка',
  missing_check_in: 'Отсутствие отметки прихода',
  missing_check_out: 'Не отмечен уход',
  manual_bonus: 'Ручное начисление',
  manual_penalty: 'Ручной штраф',
}

export const AUTO_SCORE_EVENT_TYPES = new Set([
  SCORE_EVENT_TYPE.ON_TIME,
  SCORE_EVENT_TYPE.COMPLETED_SHIFT,
  SCORE_EVENT_TYPE.LATE,
  SCORE_EVENT_TYPE.EARLY_LEAVE,
  SCORE_EVENT_TYPE.ABSENCE,
  SCORE_EVENT_TYPE.MISSING_CHECK_IN,
  SCORE_EVENT_TYPE.MISSING_CHECK_OUT,
])

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

export function normalizeScoreEvent(raw) {
  if (!raw) return null
  return {
    id: raw.id,
    employeeId: raw.employeeId ?? raw.employee_id,
    shiftId: raw.shiftId ?? raw.shift_id ?? null,
    eventDate: raw.eventDate ?? raw.event_date,
    eventType: raw.eventType ?? raw.event_type,
    points: Number(raw.points),
    description: raw.description || '',
    isManual: Boolean(raw.isManual ?? raw.is_manual),
    createdBy: raw.createdBy ?? raw.created_by ?? null,
    createdAt: raw.createdAt ?? raw.created_at ?? null,
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
  return new Date(`${shiftDate}T${time}:00`)
}

export function calculateLateMinutes(shift, actualStartIso, graceMinutes = 0) {
  const plannedStart = buildPlannedDateTime(shift.shiftDate, shift.plannedStartTime)
  const actualStart = actualStartIso ? new Date(actualStartIso) : null
  if (!plannedStart || !actualStart || Number.isNaN(actualStart.getTime())) return 0
  const diff = Math.round((actualStart.getTime() - plannedStart.getTime()) / 60000)
  return Math.max(0, diff)
}

export function calculateEarlyLeaveMinutes(shift, actualEndIso, graceMinutes = 0) {
  const plannedEnd = buildPlannedDateTime(shift.shiftDate, shift.plannedEndTime)
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

export function isShiftEnded(shift, now = new Date()) {
  const plannedEnd = buildPlannedDateTime(shift.shiftDate, shift.plannedEndTime)
  return plannedEnd ? now >= plannedEnd : false
}

export function isCheckoutWaitExpired(shift, settings, now = new Date()) {
  const plannedEnd = buildPlannedDateTime(shift.shiftDate, shift.plannedEndTime)
  if (!plannedEnd) return false
  const waitMs = (settings.checkoutWaitMinutes || 0) * 60000
  return now.getTime() >= plannedEnd.getTime() + waitMs
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

export function buildAutoScoreEvents(shift, settings, now = new Date()) {
  if (!shift?.id || !isWorkingShiftStatus(shift.status)) return []

  const result = computeShiftStatus(shift, now)
  if (!result) return []

  const events = []
  const date = shift.shiftDate

  if (result.code === SHIFT_RESULT_CODE.ABSENCE) {
    events.push({
      shiftId: shift.id,
      eventDate: date,
      eventType: SCORE_EVENT_TYPE.ABSENCE,
      points: settings.absencePenalty,
      description: SCORE_EVENT_LABELS.absence,
    })
    return events
  }

  if (shift.actualStartTime) {
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

  if (shift.actualEndTime) {
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

export function deriveShiftAttendanceFlags(shift, settings, now = new Date()) {
  const result = computeShiftStatus(shift, now)
  return {
    missingCheckIn: result?.code === SHIFT_RESULT_CODE.ABSENCE,
    missingCheckOut: result?.code === SHIFT_RESULT_CODE.MISSING_CHECKOUT,
  }
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

export function aggregateEmployeeRating(events, shifts = []) {
  const stats = {
    totalPoints: 0,
    onTimeCount: 0,
    lateCount: 0,
    earlyLeaveCount: 0,
    absenceCount: 0,
    missingCheckOutCount: 0,
    completedShifts: 0,
  }

  events.forEach((event) => {
    stats.totalPoints += Number(event.points) || 0
    if (event.eventType === SCORE_EVENT_TYPE.ON_TIME) stats.onTimeCount += 1
    if (event.eventType === SCORE_EVENT_TYPE.LATE) stats.lateCount += 1
    if (event.eventType === SCORE_EVENT_TYPE.EARLY_LEAVE) stats.earlyLeaveCount += 1
    if (event.eventType === SCORE_EVENT_TYPE.ABSENCE) stats.absenceCount += 1
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
  return toDateKey(new Date())
}
