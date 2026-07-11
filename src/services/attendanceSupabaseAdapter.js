import { supabase } from '../lib/supabaseClient'
import { normalizeShift } from '../utils/shiftData'
import {
  normalizeWorkLocation,
  normalizeAttendanceSettings,
  DEFAULT_ATTENDANCE_SETTINGS,
  clampRadiusMeters,
  resolveActiveShiftForToday,
} from '../utils/attendanceData'
import { toDateKeyInAppTimezone, addDaysToDateKey } from '../utils/timezone'

async function throwIfError(result, context) {
  if (result.error) {
    const message = result.error.message || `${context}`
    if (message.includes('~')) throw new Error(message.replace(/^.*?:\s*/, ''))
    throw new Error(message)
  }
  return result.data
}

function rowToLocation(row) {
  return normalizeWorkLocation({
    id: row.id,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    radius_meters: row.radius_meters,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  })
}

function rowToShift(row) {
  return normalizeShift(row)
}

export async function getWorkLocations() {
  const rows = await throwIfError(
    await supabase.from('platform_work_locations').select('*').order('created_at'),
    'Загрузка рабочих точек'
  )
  return rows.map(rowToLocation)
}

export async function saveWorkLocation(location) {
  const row = {
    id: location.id || undefined,
    name: location.name,
    address: location.address || '',
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    radius_meters: clampRadiusMeters(location.radiusMeters),
    is_active: location.isActive !== false,
  }
  const saved = await throwIfError(
    await supabase.from('platform_work_locations').upsert(row).select().single(),
    'Сохранение рабочей точки'
  )
  return rowToLocation(saved)
}

export async function getAttendanceSettings() {
  const rows = await throwIfError(
    await supabase.from('platform_attendance_settings').select('*').order('updated_at', { ascending: false }).limit(1),
    'Загрузка настроек рейтинга'
  )
  if (!rows.length) return normalizeAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS)
  return normalizeAttendanceSettings(rows[0])
}

export async function saveAttendanceSettings(settings, updatedBy = null) {
  const current = await getAttendanceSettings()
  const row = {
    id: current.id || settings.id,
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
  const saved = await throwIfError(
    await supabase.from('platform_attendance_settings').upsert(row).select().single(),
    'Сохранение настроек рейтинга'
  )
  return normalizeAttendanceSettings(saved)
}

export async function checkInEmployee(employeeId, coords) {
  const row = await throwIfError(
    await supabase.rpc('attendance_check_in', {
      p_employee_id: Number(employeeId),
      p_latitude: coords.latitude,
      p_longitude: coords.longitude,
      p_accuracy: coords.accuracy,
    }),
    'Отметка прихода'
  )
  return rowToShift(row)
}

export async function checkOutEmployee(employeeId, coords) {
  const row = await throwIfError(
    await supabase.rpc('attendance_check_out', {
      p_employee_id: Number(employeeId),
      p_latitude: coords.latitude,
      p_longitude: coords.longitude,
      p_accuracy: coords.accuracy,
    }),
    'Отметка ухода'
  )
  return rowToShift(row)
}

export async function getTodayShiftForEmployee(employeeId) {
  const today = toDateKeyInAppTimezone()
  const yesterday = addDaysToDateKey(today, -1)

  const rows = await throwIfError(
    await supabase
      .from('academy_employee_shifts')
      .select('*')
      .eq('employee_id', employeeId)
      .in('shift_date', [today, yesterday])
      .order('shift_date', { ascending: false }),
    'Загрузка смены на сегодня'
  )

  return resolveActiveShiftForToday(rows || [])
}
