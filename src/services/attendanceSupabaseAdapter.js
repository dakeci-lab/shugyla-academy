import { supabase } from '../lib/supabaseClient'
import { normalizeShift } from '../utils/shiftData'
import {
  normalizeWorkLocation,
  normalizeAttendanceSettings,
  DEFAULT_ATTENDANCE_SETTINGS,
  clampRadiusMeters,
} from '../utils/attendanceData'
import { toDateKeyInAppTimezone, addDaysToDateKey } from '../utils/timezone'

const CHECK_IN_ERROR = 'Не удалось отметить приход. Проверьте интернет и повторите попытку.'
const CHECK_OUT_ERROR = 'Не удалось отметить уход. Проверьте интернет и повторите попытку.'

function extractFunctionError(error) {
  const contextBody = error?.context?.json ?? error?.context?.body
  if (contextBody && typeof contextBody === 'object') return contextBody
  return null
}

function sanitizeAttendanceError(message, context) {
  const fallback = context === 'checkout' ? CHECK_OUT_ERROR : CHECK_IN_ERROR
  if (!message) return fallback
  const text = String(message).trim()
  if (/permission denied/i.test(text) || /42501/.test(text)) return fallback
  if (/^[А-Яа-яЁё]/.test(text)) return text.replace(/^.*?:\s*/, '')
  return fallback
}

function mapTimeTrackerActionError(errorBody, context) {
  const code = errorBody?.code ?? errorBody?.error?.code
  if (code === 'clock_in_required') return 'Сначала отметьте приход'
  if (code === 'unauthorized') return 'Сессия истекла. Войдите в аккаунт заново'
  if (code === 'forbidden' || code === 'inactive_caller' || code === 'forbidden_field') {
    return context === 'checkout' ? CHECK_OUT_ERROR : CHECK_IN_ERROR
  }
  if (errorBody?.message) return sanitizeAttendanceError(errorBody.message, context)
  return context === 'checkout' ? CHECK_OUT_ERROR : CHECK_IN_ERROR
}

async function invokeTimeTrackerAction(body, context) {
  const { data, error } = await supabase.functions.invoke('employee-time-tracker-action', {
    body,
  })

  if (error) {
    throw new Error(mapTimeTrackerActionError(extractFunctionError(error), context))
  }

  if (!data?.ok) {
    throw new Error(mapTimeTrackerActionError(data, context))
  }

  return data
}

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

function rowToShift(row, meta = {}) {
  const shift = normalizeShift(row)
  if (!shift) return null
  if (meta.previousShiftMissedClockOut) {
    shift.previousShiftMissedClockOut = true
  }
  if (meta.trackerStatus) {
    shift.trackerStatus = meta.trackerStatus
  }
  return shift
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

export async function checkInEmployee(_employeeId, coords) {
  const result = await invokeTimeTrackerAction(
    {
      action: 'clock_in',
      coords: {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy ?? null,
      },
    },
    'checkin'
  )
  return rowToShift(result.shift)
}

export async function checkOutEmployee(_employeeId, coords) {
  const result = await invokeTimeTrackerAction(
    {
      action: 'clock_out',
      coords: {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy ?? null,
      },
    },
    'checkout'
  )
  return rowToShift(result.shift)
}

export async function getTodayShiftForEmployee(_employeeId) {
  const result = await invokeTimeTrackerAction({ action: 'get_today_status' }, 'checkin')
  return rowToShift(result.shift, {
    previousShiftMissedClockOut: Boolean(result.previousShiftMissedClockOut),
    trackerStatus: result.status ?? null,
  })
}

/** Fallback read path for admin views — cloud tracker UI uses get_today_status Edge Function. */
export async function getRecentShiftsForEmployee(employeeId) {
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
  return rows || []
}
