import '@supabase/functions-js/edge-runtime.d.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  adminErrorResponse,
  authorizeAuthenticatedEmployee,
} from '../_shared/employeeAuthorization.ts'
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'

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

function getDateKeyInTimezone(date: Date, timeZone = APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value ?? '0000'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}

function addDaysToDateKey(dateKey: string, delta: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + delta))
  return date.toISOString().slice(0, 10)
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

async function loadActiveShiftRows(
  serviceClient: SupabaseClient,
  employeeId: number
): Promise<Record<string, unknown> | null> {
  const todayKey = getDateKeyInTimezone(new Date())
  const yesterdayKey = addDaysToDateKey(todayKey, -1)

  const { data, error } = await serviceClient
    .from('academy_employee_shifts')
    .select('*')
    .eq('employee_id', employeeId)
    .in('shift_date', [todayKey, yesterdayKey])
    .order('shift_date', { ascending: false })

  if (error) return null

  const rows = data ?? []
  const byDate = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    if (row.shift_date) byDate.set(String(row.shift_date), row)
  }

  const yesterdayShift = byDate.get(yesterdayKey) ?? null
  if (yesterdayShift?.actual_start_time && !yesterdayShift?.actual_end_time) {
    return yesterdayShift
  }

  return byDate.get(todayKey) ?? null
}

async function handleGetTodayStatus(serviceClient: SupabaseClient, employeeId: number) {
  const shift = await loadActiveShiftRows(serviceClient, employeeId)
  return jsonResponse({ ok: true, shift: shift ?? null })
}

async function handleClockIn(
  serviceClient: SupabaseClient,
  employeeId: number,
  coords: Coords
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
    const shift = await loadActiveShiftRows(serviceClient, employeeId)
    if (shift?.actual_start_time) {
      return jsonResponse({ ok: true, shift, idempotent: true })
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
  coords: Coords
) {
  const { data, error } = await serviceClient.rpc('attendance_check_out', {
    p_employee_id: employeeId,
    p_latitude: coords.latitude,
    p_longitude: coords.longitude,
    p_accuracy: coords.accuracy,
  })

  if (!error) {
    return jsonResponse({ ok: true, shift: data, idempotent: false })
  }

  const message = extractRpcMessage(error)
  if (isAlreadyCheckedOutMessage(message)) {
    const shift = await loadActiveShiftRows(serviceClient, employeeId)
    if (shift?.actual_end_time) {
      return jsonResponse({ ok: true, shift, idempotent: true })
    }
  }

  return jsonResponse(
    { ok: false, code: 'attendance_error', message: mapAttendanceError(message, 'clock_out') },
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

  if (action === 'get_today_status') {
    return handleGetTodayStatus(serviceClient, caller.id)
  }

  const coords = parseCoords(body.coords)
  if (!coords) {
    return adminErrorResponse('validation_error', 400)
  }

  if (action === 'clock_in') {
    return handleClockIn(serviceClient, caller.id, coords)
  }

  return handleClockOut(serviceClient, caller.id, coords)
})
