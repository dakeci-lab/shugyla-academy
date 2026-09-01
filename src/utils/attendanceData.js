import { isWorkingShiftStatus } from './shiftData'
import { isShiftPlannedEndReached } from './shiftMidnightEnd'
import {
  resolveWorkWindowShift,
  isOpenShiftWorkWindowActive,
} from './shiftWorkWindow'
import { toDateKeyInAppTimezone, APP_TIMEZONE } from './timezone'

/** Событие обновления посещаемости (после сохранения смены / отметки) */
export const ATTENDANCE_UPDATED_EVENT = 'shugyla:attendance-updated'

export function notifyAttendanceUpdated(year, month) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ATTENDANCE_UPDATED_EVENT, { detail: { year, month } }))
}

export function parseYearMonthFromDateKey(dateKey) {
  const [year, month] = dateKey.split('-').map(Number)
  return { year, month }
}

/** Модель тайм-трекера и рабочих точек */

export const DEFAULT_ATTENDANCE_SETTINGS = {
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

export function isShiftEnded(shift, now = new Date()) {
  return isShiftPlannedEndReached(shift, now)
}

/**
 * Выбирает актуальную смену для текущего рабочего окна.
 * Вчерашняя открытая смена учитывается только до effectivePlannedEndAt (ночные смены).
 */
export function resolveActiveShiftForToday(shifts, now = new Date()) {
  return resolveWorkWindowShift(shifts, now).activeShift
}

export function detectPreviousShiftMissedClockOut(shifts, now = new Date()) {
  return resolveWorkWindowShift(shifts, now).previousShiftMissedClockOut
}

export { resolveWorkWindowShift, isOpenShiftWorkWindowActive, isMissedClockOutShift } from './shiftWorkWindow'

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

export function getTodayShiftState(shift, settings, now = new Date()) {
  if (!shift) {
    return { code: 'no_schedule', message: 'На сегодня график не установлен' }
  }
  if (shift.actualStartTime && shift.actualEndTime) {
    return { code: 'completed', message: 'Смена завершена' }
  }
  // Незавершённый приход важнее статуса графика (выходной / смена плана после старта).
  if (shift.actualStartTime && !shift.actualEndTime) {
    return { code: 'checked_in', message: 'Вы на работе' }
  }
  if (!isWorkingShiftStatus(shift.status)) {
    return { code: 'not_working', message: 'Сегодня у вас нет запланированной рабочей смены' }
  }
  if (isShiftEnded(shift, now) && !shift.actualStartTime) {
    return { code: 'missed', message: 'Смена завершена без отметки прихода' }
  }
  return { code: 'ready_check_in', message: 'Можно отметить приход' }
}

/** Ограничение значения диапазоном 0–100 (используется «Здоровьем компании» на Главной) */
export function clampPercentScore(score) {
  return Math.min(100, Math.max(0, Math.round(Number(score) || 0)))
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
