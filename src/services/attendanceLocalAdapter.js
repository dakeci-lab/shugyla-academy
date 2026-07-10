import { normalizeShift, isWorkingShiftStatus, toDateKey } from '../utils/shiftData'
import { getEmployeeById } from '../utils/employeeData'
import {
  normalizeWorkLocation,
  normalizeAttendanceSettings,
  normalizeScoreEvent,
  DEFAULT_ATTENDANCE_SETTINGS,
  isWithinWorkLocation,
  calculateLateMinutes,
  calculateEarlyLeaveMinutes,
  calculateWorkedMinutes,
  deriveShiftAttendanceFlags,
  buildAutoScoreEvents,
  getMonthRange,
  SCORE_EVENT_TYPE,
  SCORE_EVENT_LABELS,
  clampRadiusMeters,
} from '../utils/attendanceData'

const STORAGE_KEYS = {
  LOCATIONS: 'shugyla_work_locations',
  SETTINGS: 'shugyla_attendance_settings',
  SCORE_EVENTS: 'shugyla_score_events',
  SHIFTS: 'shugyla_employee_shifts',
}

function readJson(key, fallback) {
  const data = localStorage.getItem(key)
  return data ? JSON.parse(data) : fallback
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function genId() {
  return crypto.randomUUID()
}

function readShifts() {
  return readJson(STORAGE_KEYS.SHIFTS, [])
}

function writeShifts(shifts) {
  writeJson(STORAGE_KEYS.SHIFTS, shifts)
}

function readScoreEvents() {
  return readJson(STORAGE_KEYS.SCORE_EVENTS, [])
}

function writeScoreEvents(events) {
  writeJson(STORAGE_KEYS.SCORE_EVENTS, events)
}

function getEmployeeLocation(employeeId) {
  const employee = getEmployeeById(Number(employeeId))
  const locations = getWorkLocations()
  if (employee?.workLocationId) {
    return locations.find((loc) => loc.id === employee.workLocationId && loc.isActive) || null
  }
  return locations.find((loc) => loc.isActive) || null
}

function upsertAutoScoreEvents(employeeId, shiftId, events, createdBy) {
  const all = readScoreEvents().filter(
    (event) => !(event.employee_id === employeeId && event.shift_id === shiftId && !event.is_manual)
  )
  events.forEach((event) => {
    all.push({
      id: genId(),
      employee_id: employeeId,
      shift_id: shiftId,
      event_date: event.eventDate,
      event_type: event.eventType,
      points: event.points,
      description: event.description,
      is_manual: false,
      created_by: createdBy,
      created_at: new Date().toISOString(),
    })
  })
  writeScoreEvents(all)
}

export function getWorkLocations() {
  return readJson(STORAGE_KEYS.LOCATIONS, []).map(normalizeWorkLocation)
}

export function saveWorkLocation(location) {
  const locations = readJson(STORAGE_KEYS.LOCATIONS, [])
  const row = {
    id: location.id || genId(),
    name: location.name,
    address: location.address || '',
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    radius_meters: clampRadiusMeters(location.radiusMeters),
    is_active: location.isActive !== false,
    created_at: location.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const idx = locations.findIndex((item) => item.id === row.id)
  if (idx >= 0) locations[idx] = row
  else locations.push(row)
  writeJson(STORAGE_KEYS.LOCATIONS, locations)
  return normalizeWorkLocation(row)
}

export function getAttendanceSettings() {
  const rows = readJson(STORAGE_KEYS.SETTINGS, [])
  if (!rows.length) {
    return normalizeAttendanceSettings({ id: genId(), ...DEFAULT_ATTENDANCE_SETTINGS })
  }
  return normalizeAttendanceSettings(rows[0])
}

export function saveAttendanceSettings(settings, updatedBy = null) {
  const row = {
    id: settings.id || genId(),
    on_time_points: settings.onTimePoints,
    completed_shift_points: settings.completedShiftPoints,
    late_penalty: settings.latePenalty,
    early_leave_penalty: settings.earlyLeavePenalty,
    absence_penalty: settings.absencePenalty,
    missing_check_in_penalty: settings.missingCheckInPenalty,
    missing_check_out_penalty: settings.missingCheckOutPenalty,
    late_grace_minutes: settings.lateGraceMinutes,
    early_leave_grace_minutes: settings.earlyLeaveGraceMinutes,
    checkout_wait_minutes: settings.checkoutWaitMinutes,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  }
  writeJson(STORAGE_KEYS.SETTINGS, [row])
  return normalizeAttendanceSettings(row)
}

export function getScoreEventsForMonth(year, month, employeeIds = null) {
  const { start, end } = getMonthRange(year, month)
  const idSet = employeeIds ? new Set(employeeIds.map(Number)) : null
  return readScoreEvents()
    .filter((event) => {
      if (event.event_date < start || event.event_date > end) return false
      if (idSet && !idSet.has(Number(event.employee_id))) return false
      return true
    })
    .map(normalizeScoreEvent)
}

export function getEmployeeScoreEvents(employeeId, year, month) {
  return getScoreEventsForMonth(year, month, [employeeId]).filter(
    (event) => Number(event.employeeId) === Number(employeeId)
  )
}

export function addManualScoreEvent({ employeeId, eventDate, points, description, createdBy }) {
  const eventType = points >= 0 ? SCORE_EVENT_TYPE.MANUAL_BONUS : SCORE_EVENT_TYPE.MANUAL_PENALTY
  const row = {
    id: genId(),
    employee_id: employeeId,
    shift_id: null,
    event_date: eventDate,
    event_type: eventType,
    points,
    description,
    is_manual: true,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  }
  const all = readScoreEvents()
  all.push(row)
  writeScoreEvents(all)
  return normalizeScoreEvent(row)
}

function getTodayShift(employeeId) {
  const today = toDateKey(new Date())
  const row = readShifts().find(
    (shift) => shift.employee_id === employeeId && shift.shift_date === today
  )
  return row ? normalizeShift(row) : null
}

export async function checkInEmployee(employeeId, coords) {
  const location = getEmployeeLocation(employeeId)
  const zone = isWithinWorkLocation(location, coords.latitude, coords.longitude)
  if (!zone.ok) throw new Error(zone.error)

  const shift = getTodayShift(employeeId)
  if (!shift) throw new Error('На сегодня график не установлен')
  if (!isWorkingShiftStatus(shift.status)) {
    throw new Error('Сегодня у вас нет запланированной рабочей смены')
  }
  if (shift.actualStartTime) throw new Error('Приход уже отмечен')

  const settings = getAttendanceSettings()
  const nowIso = new Date().toISOString()
  const lateMinutes = calculateLateMinutes(shift, nowIso)

  const shifts = readShifts()
  const idx = shifts.findIndex((row) => row.id === shift.id)
  const updated = {
    ...shifts[idx],
    actual_start_time: nowIso,
    check_in_latitude: coords.latitude,
    check_in_longitude: coords.longitude,
    check_in_accuracy: coords.accuracy,
    late_minutes: lateMinutes,
    missing_check_in: false,
    attendance_status: 'in_progress',
    work_location_id: location?.id || null,
    updated_at: nowIso,
  }
  shifts[idx] = updated
  writeShifts(shifts)

  const normalized = normalizeShift(updated)
  const autoEvents = []
  if (lateMinutes > settings.lateGraceMinutes) {
    autoEvents.push({
      eventDate: normalized.shiftDate,
      eventType: SCORE_EVENT_TYPE.LATE,
      points: settings.latePenalty,
      description: `Опоздание на ${lateMinutes} минут`,
    })
  } else {
    autoEvents.push({
      eventDate: normalized.shiftDate,
      eventType: SCORE_EVENT_TYPE.ON_TIME,
      points: settings.onTimePoints,
      description: SCORE_EVENT_LABELS.on_time,
    })
  }
  upsertAutoScoreEvents(employeeId, normalized.id, autoEvents, employeeId)
  return normalized
}

export async function checkOutEmployee(employeeId, coords) {
  const location = getEmployeeLocation(employeeId)
  const zone = isWithinWorkLocation(location, coords.latitude, coords.longitude)
  if (!zone.ok) throw new Error(zone.error)

  const shift = getTodayShift(employeeId)
  if (!shift) throw new Error('На сегодня график не установлен')
  if (!shift.actualStartTime) throw new Error('Сначала отметьте приход')
  if (shift.actualEndTime) throw new Error('Уход уже отмечен')

  const settings = getAttendanceSettings()
  const nowIso = new Date().toISOString()
  const earlyLeaveMinutes = calculateEarlyLeaveMinutes(shift, nowIso)
  const workedMinutes = calculateWorkedMinutes(shift, shift.actualStartTime, nowIso)

  const shifts = readShifts()
  const idx = shifts.findIndex((row) => row.id === shift.id)
  const updated = {
    ...shifts[idx],
    actual_end_time: nowIso,
    check_out_latitude: coords.latitude,
    check_out_longitude: coords.longitude,
    check_out_accuracy: coords.accuracy,
    early_leave_minutes: earlyLeaveMinutes,
    worked_minutes: workedMinutes,
    missing_check_out: false,
    attendance_status: 'completed',
    updated_at: nowIso,
  }
  shifts[idx] = updated
  writeShifts(shifts)

  const normalized = normalizeShift(updated)
  const existingAuto = readScoreEvents().filter(
    (event) => event.employee_id === employeeId && event.shift_id === normalized.id && !event.is_manual
  )
  const keep = existingAuto.filter((event) => event.event_type === SCORE_EVENT_TYPE.ON_TIME || event.event_type === SCORE_EVENT_TYPE.LATE)
  const autoEvents = keep.map((event) => ({
    eventDate: event.event_date,
    eventType: event.event_type,
    points: event.points,
    description: event.description,
  }))

  if (earlyLeaveMinutes > settings.earlyLeaveGraceMinutes) {
    autoEvents.push({
      eventDate: normalized.shiftDate,
      eventType: SCORE_EVENT_TYPE.EARLY_LEAVE,
      points: settings.earlyLeavePenalty,
      description: `Ранний уход на ${earlyLeaveMinutes} минут`,
    })
  }
  autoEvents.push({
    eventDate: normalized.shiftDate,
    eventType: SCORE_EVENT_TYPE.COMPLETED_SHIFT,
    points: settings.completedShiftPoints,
    description: SCORE_EVENT_LABELS.completed_shift,
  })
  upsertAutoScoreEvents(employeeId, normalized.id, autoEvents, employeeId)
  return normalized
}

export async function recalculateAttendanceForMonth(year, month) {
  const settings = getAttendanceSettings()
  const { start, end } = getMonthRange(year, month)
  const shifts = readShifts().filter(
    (row) => row.shift_date >= start && row.shift_date <= end && row.status === 'working'
  )

  shifts.forEach((row, index) => {
    const normalized = normalizeShift(row)
    const flags = deriveShiftAttendanceFlags(normalized, settings)
    const updated = {
      ...row,
      missing_check_in: flags.missingCheckIn,
      missing_check_out: flags.missingCheckOut,
      attendance_status: flags.attendanceStatus,
    }
    shifts[index] = updated

    if (flags.missingCheckIn || flags.missingCheckOut) {
      const autoEvents = []
      if (flags.missingCheckIn) {
        autoEvents.push({
          eventDate: row.shift_date,
          eventType: SCORE_EVENT_TYPE.MISSING_CHECK_IN,
          points: settings.missingCheckInPenalty,
          description: SCORE_EVENT_LABELS.missing_check_in,
        })
      }
      if (flags.missingCheckOut) {
        autoEvents.push({
          eventDate: row.shift_date,
          eventType: SCORE_EVENT_TYPE.MISSING_CHECK_OUT,
          points: settings.missingCheckOutPenalty,
          description: SCORE_EVENT_LABELS.missing_check_out,
        })
      }
      upsertAutoScoreEvents(row.employee_id, row.id, autoEvents, null)
    }
  })

  writeShifts(shifts)
}

export async function getTodayShiftForEmployee(employeeId) {
  return getTodayShift(employeeId)
}
