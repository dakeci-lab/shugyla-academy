import '@supabase/functions-js/edge-runtime.d.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  adminErrorResponse,
  authorizeAuthenticatedEmployee,
} from '../_shared/employeeAuthorization.ts'
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import {
  addDaysToDateKey,
  deriveTrackerStatus,
  getDateKeyInTimezone,
  hasOpenAttendance,
  resolveWorkWindowShift,
} from '../_shared/shiftWorkWindow.ts'

const APP_TIMEZONE = 'Asia/Almaty'

const FORBIDDEN_TOP_LEVEL = new Set([
  'employee_id',
  'auth_user_id',
  'user_id',
  'login',
  'role',
  'status',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'service_role',
  'shift_date',
  'shift_id',
])

type Action = 'clock_in' | 'clock_out' | 'get_today_status'

type Coords = {
  latitude: number
  longitude: number
  accuracy?: number | null
}

function extractRpcMessage(error: { message?: string; details?: string } | null): string {
  const message = error?.message ?? error?.details ?? ''
  const match = message.match(/(?:ERROR:\s*)?(.+?)(?:\n|$)/)
  return (match?.[1] ?? message).trim()
}

function isAlreadyCheckedInMessage(message: string): boolean {
  return message.includes('Приход уже отмечен')
}

function isAlreadyCheckedOutMessage(message: string): boolean {
  return message.includes('Уход уже отмечен')
}

function mapAttendanceError(message: string, action: 'clock_in' | 'clock_out'): string {
  const trimmed = message.trim()
  if (!trimmed) {
    return action === 'clock_out'
      ? 'Не удалось завершить смену. Повторите попытку.'
      : 'Не удалось отметить приход. Повторите попытку.'
  }

  if (/permission denied/i.test(trimmed) || /42501/.test(trimmed) || /row-level security/i.test(trimmed)) {
    return action === 'clock_out'
      ? 'Не удалось завершить смену из-за ошибки доступа. Обратитесь к администратору.'
      : 'Не удалось отметить приход из-за ошибки доступа. Обратитесь к администратору.'
  }

  if (/активная смена не найдена/i.test(trimmed)) {
    return 'Активная смена не найдена. Обновите страницу или обратитесь к администратору.'
  }

  if (/^[А-Яа-яЁё]/.test(trimmed)) {
    return trimmed.replace(/^.*?:\s*/, '')
  }

  return action === 'clock_out'
    ? 'Не удалось завершить смену. Повторите попытку.'
    : 'Не удалось отметить приход. Повторите попытку.'
}

function mapAttendanceErrorCode(message: string): string {
  const trimmed = message.trim()
  if (/permission denied/i.test(trimmed) || /42501/.test(trimmed) || /row-level security/i.test(trimmed)) {
    return 'access_denied'
  }
  if (/активная смена не найдена/i.test(trimmed)) {
    return 'active_shift_not_found'
  }
  if (/сначала отметьте приход/i.test(trimmed)) {
    return 'clock_in_required'
  }
  if (/уход уже отмечен/i.test(trimmed)) {
    return 'already_checked_out'
  }
  return 'attendance_error'
}

function parseCoords(value: unknown): Coords | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const latitude = Number(record.latitude)
  const longitude = Number(record.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const accuracyRaw = record.accuracy
  const accuracy =
    accuracyRaw == null || accuracyRaw === ''
      ? null
      : Number.isFinite(Number(accuracyRaw))
        ? Number(accuracyRaw)
        : null
  return { latitude, longitude, accuracy }
}

async function loadRecentShiftRows(
  serviceClient: SupabaseClient,
  employeeId: number,
  now = new Date()
): Promise<ShiftLike[]> {
  const todayKey = getDateKeyInTimezone(now, APP_TIMEZONE)
  const yesterdayKey = addDaysToDateKey(todayKey, -1)

  const { data, error } = await serviceClient
    .from('academy_employee_shifts')
    .select('*')
    .eq('employee_id', employeeId)
    .in('shift_date', [todayKey, yesterdayKey])
    .order('shift_date', { ascending: false })

  if (error) return []
  return (data ?? []) as ShiftLike[]
}

async function resolveShiftContext(
  serviceClient: SupabaseClient,
  employeeId: number,
  now = new Date()
) {
  const rows = await loadRecentShiftRows(serviceClient, employeeId, now)
  return resolveWorkWindowShift(rows, now)
}

async function handleGetTodayStatus(
  serviceClient: SupabaseClient,
  employeeId: number,
  now = new Date()
) {
  const context = await resolveShiftContext(serviceClient, employeeId, now)
  const activeShift = context.activeShift
  const status = deriveTrackerStatus(activeShift, now)

  return jsonResponse({
    ok: true,
    shift: activeShift ?? null,
    status,
    previousShiftMissedClockOut: context.previousShiftMissedClockOut,
  })
}

async function handleClockIn(
  serviceClient: SupabaseClient,
  employeeId: number,
  coords: Coords,
  now = new Date()
) {
  const { data, error } = await serviceClient.rpc('attendance_check_in', {
    p_employee_id: employeeId,
    p_latitude: coords.latitude,
    p_longitude: coords.longitude,
    p_accuracy: coords.accuracy,
  })

  if (!error) {
    return jsonResponse({ ok: true, shift: data, idempotent: false })
  }

  const message = extractRpcMessage(error)
  if (isAlreadyCheckedInMessage(message)) {
    const context = await resolveShiftContext(serviceClient, employeeId, now)
    const openShift = context.activeShift
    if (hasOpenAttendance(openShift)) {
      return jsonResponse({ ok: true, shift: openShift, idempotent: true })
    }
  }

  return jsonResponse(
    { ok: false, code: 'attendance_error', message: mapAttendanceError(message, 'clock_in') },
    422
  )
}

async function handleClockOut(
  serviceClient: SupabaseClient,
  employeeId: number,
  coords: Coords,
  now = new Date()
) {
  const context = await resolveShiftContext(serviceClient, employeeId, now)
  const activeShift = context.activeShift

  if (!hasOpenAttendance(activeShift)) {
    if (activeShift?.actual_end_time || activeShift?.actualEndTime) {
      return jsonResponse({ ok: true, shift: activeShift, idempotent: true })
    }
    return jsonResponse(
      { ok: false, code: 'clock_in_required', message: 'Сначала отметьте приход' },
      422
    )
  }

  const { data, error } = await serviceClient.rpc('attendance_check_out', {
    p_employee_id: employeeId,
    p_latitude: coords.latitude,
    p_longitude: coords.longitude,
    p_accuracy: coords.accuracy,
  })

  if (!error) {
    return jsonResponse({ ok: true, shift: data, idempotent: false })
  }

  console.error('Failed to finish shift', {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
    employeeId,
  })

  const message = extractRpcMessage(error)
  if (isAlreadyCheckedOutMessage(message)) {
    const refreshed = await resolveShiftContext(serviceClient, employeeId, now)
    const shift = refreshed.activeShift
    if (shift?.actual_end_time) {
      return jsonResponse({ ok: true, shift, idempotent: true })
    }
  }

  return jsonResponse(
    {
      ok: false,
      code: mapAttendanceErrorCode(message),
      message: mapAttendanceError(message, 'clock_out'),
    },
    422
  )
}

function rejectForbiddenFields(body: Record<string, unknown>): Response | null {
  for (const key of Object.keys(body)) {
    if (FORBIDDEN_TOP_LEVEL.has(key)) {
      return adminErrorResponse('forbidden_field', 400)
    }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()
  if (req.method !== 'POST') return adminErrorResponse('method_not_allowed', 405)

  const auth = await authorizeAuthenticatedEmployee(req)
  if (auth instanceof Response) return auth

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return adminErrorResponse('malformed_json', 400)
  }

  const forbidden = rejectForbiddenFields(body)
  if (forbidden) return forbidden

  const action = body.action
  if (action !== 'clock_in' && action !== 'clock_out' && action !== 'get_today_status') {
    return adminErrorResponse('validation_error', 400)
  }

  const { serviceClient, caller } = auth
  const now = new Date()

  if (action === 'get_today_status') {
    return handleGetTodayStatus(serviceClient, caller.id, now)
  }

  const coords = parseCoords(body.coords)
  if (!coords) {
    return adminErrorResponse('validation_error', 400)
  }

  if (action === 'clock_in') {
    return handleClockIn(serviceClient, caller.id, coords, now)
  }

  return handleClockOut(serviceClient, caller.id, coords, now)
})
