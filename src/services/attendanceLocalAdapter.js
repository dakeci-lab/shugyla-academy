import { normalizeShift, isWorkingShiftStatus, toDateKey } from '../utils/shiftData'
import { getEmployeeById } from '../utils/employeeData'
import {
  normalizeWorkLocation,
  normalizeAttendanceSettings,
  DEFAULT_ATTENDANCE_SETTINGS,
  isWithinWorkLocation,
  clampRadiusMeters,
} from '../utils/attendanceData'

const STORAGE_KEYS = {
  LOCATIONS: 'shugyla_work_locations',
  SETTINGS: 'shugyla_attendance_settings',
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

function getEmployeeLocation(employeeId) {
  const employee = getEmployeeById(Number(employeeId))
  const locations = getWorkLocations()
  if (employee?.workLocationId) {
    return locations.find((loc) => loc.id === employee.workLocationId && loc.isActive) || null
  }
  return locations.find((loc) => loc.isActive) || null
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

  const nowIso = new Date().toISOString()
  const shifts = readShifts()
  const idx = shifts.findIndex((row) => row.id === shift.id)
  const updated = {
    ...shifts[idx],
    actual_start_time: nowIso,
    check_in_latitude: coords.latitude,
    check_in_longitude: coords.longitude,
    check_in_accuracy: coords.accuracy,
    work_location_id: location?.id || null,
    updated_at: nowIso,
  }
  shifts[idx] = updated
  writeShifts(shifts)
  return normalizeShift(updated)
}

export async function checkOutEmployee(employeeId, coords) {
  const location = getEmployeeLocation(employeeId)
  const zone = isWithinWorkLocation(location, coords.latitude, coords.longitude)
  if (!zone.ok) throw new Error(zone.error)

  const shift = getTodayShift(employeeId)
  if (!shift) throw new Error('На сегодня график не установлен')
  if (!shift.actualStartTime) throw new Error('Сначала отметьте приход')
  if (shift.actualEndTime) throw new Error('Уход уже отмечен')

  const nowIso = new Date().toISOString()
  const shifts = readShifts()
  const idx = shifts.findIndex((row) => row.id === shift.id)
  const updated = {
    ...shifts[idx],
    actual_end_time: nowIso,
    check_out_latitude: coords.latitude,
    check_out_longitude: coords.longitude,
    check_out_accuracy: coords.accuracy,
    updated_at: nowIso,
  }
  shifts[idx] = updated
  writeShifts(shifts)
  return normalizeShift(updated)
}

export async function getTodayShiftForEmployee(employeeId) {
  return getTodayShift(employeeId)
}
