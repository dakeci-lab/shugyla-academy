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
  isOpenShiftWorkWindowActive,
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
      ? 'Не удалось отметить уход. Проверьте интернет и повторите попытку.'
      : 'Не удалось отметить приход. Проверьте интернет и повторите попытку.'
  }

  if (/permission denied/i.test(trimmed) || /42501/.test(trimmed)) {
    return action === 'clock_out'
      ? 'Не удалось отметить уход. Проверьте интернет и повторите попытку.'
      : 'Не удалось отметить приход. Проверьте интернет и повторите попытку.'
  }

  if (/^[А-Яа-яЁё]/.test(trimmed)) {
    return trimmed.replace(/^.*?:\s*/, '')
  }

  return action === 'clock_out'
    ? 'Не удалось отметить уход. Проверьте интернет и повторите попытку.'
    : 'Не удалось отметить приход. Проверьте интернет и повторите попытку.'
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

async function validateGeolocation(
  serviceClient: SupabaseClient,
  employeeId: number,
  coords: Coords
): Promise<Response | null> {
  const { data: location, error: locError } = await serviceClient.rpc(
    'platform_get_employee_work_location',
    { p_employee_id: employeeId }
  )

  if (locError || !location?.id) {
    return jsonResponse(
      {
        ok: false,
        code: 'attendance_error',
        message: 'Рабочая территория ещё не настроена. Обратитесь к администратору',
      },
      422
    )
  }

  const { data: distance, error: distanceError } = await serviceClient.rpc(
    'platform_haversine_meters',
    {
      lat1: location.latitude,
      lon1: location.longitude,
      lat2: coords.latitude,
      lon2: coords.longitude,
    }
  )

  if (distanceError) {
    return jsonResponse(
      { ok: false, code: 'attendance_error', message: mapAttendanceError(distanceError.message ?? '', 'clock_in') },
      422
    )
  }

  if (Number(distance) > Number(location.radius_meters)) {
    return jsonResponse(
      {
        ok: false,
        code: 'attendance_error',
        message: `Вы находитесь вне рабочей территории (~${Math.round(Number(distance))} м)`,
      },
      422
    )
  }

  return null
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
    const todayShift = context.todayShift
    if (todayShift?.actual_start_time && isOpenShiftWorkWindowActive(todayShift, now)) {
      return jsonResponse({ ok: true, shift: todayShift, idempotent: true })
    }
  }

  return jsonResponse(
    { ok: false, code: 'attendance_error', message: mapAttendanceError(message, 'clock_in') },
    422
  )
}

async function performClockOutOnShift(
  serviceClient: SupabaseClient,
  employeeId: number,
  shift: ShiftLike,
  coords: Coords
) {
  const geoError = await validateGeolocation(serviceClient, employeeId, coords)
  if (geoError) return geoError

  const shiftId = (shift as Record<string, unknown>).id
  if (!shiftId) {
    return jsonResponse(
      { ok: false, code: 'attendance_error', message: 'Не удалось отметить уход. Проверьте интернет и повторите попытку.' },
      422
    )
  }

  const nowIso = new Date().toISOString()
  const { data, error } = await serviceClient
    .from('academy_employee_shifts')
    .update({
      actual_end_time: nowIso,
      check_out_latitude: coords.latitude,
      check_out_longitude: coords.longitude,
      check_out_accuracy: coords.accuracy,
      updated_at: nowIso,
    })
    .eq('id', shiftId)
    .eq('employee_id', employeeId)
    .is('actual_end_time', null)
    .not('actual_start_time', 'is', null)
    .select('*')
    .maybeSingle()

  if (error) {
    return jsonResponse(
      { ok: false, code: 'attendance_error', message: mapAttendanceError(error.message ?? '', 'clock_out') },
      422
    )
  }

  if (data) {
    return jsonResponse({ ok: true, shift: data, idempotent: false })
  }

  const { data: existing } = await serviceClient
    .from('academy_employee_shifts')
    .select('*')
    .eq('id', shiftId)
    .eq('employee_id', employeeId)
    .maybeSingle()

  if (existing?.actual_end_time) {
    return jsonResponse({ ok: true, shift: existing, idempotent: true })
  }

  return jsonResponse(
    { ok: false, code: 'clock_in_required', message: 'Сначала отметьте приход' },
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

  if (!activeShift?.actual_start_time) {
    return jsonResponse(
      { ok: false, code: 'clock_in_required', message: 'Сначала отметьте приход' },
      422
    )
  }

  if (!isOpenShiftWorkWindowActive(activeShift, now)) {
    return jsonResponse(
      { ok: false, code: 'clock_in_required', message: 'Сначала отметьте приход' },
      422
    )
  }

  if (activeShift.actual_end_time) {
    return jsonResponse({ ok: true, shift: activeShift, idempotent: true })
  }

  return performClockOutOnShift(serviceClient, employeeId, activeShift, coords)
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
