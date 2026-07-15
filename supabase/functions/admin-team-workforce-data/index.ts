import '@supabase/functions-js/edge-runtime.d.ts'
import {
  authorizeAuthenticatedEmployee,
  adminErrorResponse,
  roleHasPermissionCode,
} from '../_shared/employeeAuthorization.ts'
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import {
  WORKFORCE_EMPLOYEE_SELECT,
  WORKFORCE_SHIFT_SELECT,
  mapSafeWorkforceEmployee,
  mapSafeWorkforceShift,
  type DbWorkforceEmployeeRow,
} from '../_shared/workforceFields.ts'

const ALLOWED_BODY_KEYS = new Set(['date_from', 'date_to', 'timezone', 'view'])
const ALLOWED_VIEWS = new Set(['dashboard', 'schedule', 'rating'])
const ALLOWED_TIMEZONE = 'Asia/Almaty'
const MAX_RANGE_DAYS = 62

const PERMISSION_SCHEDULE_TEAM = 'schedule.view_team'
const PERMISSION_SCHEDULE_OWN = 'schedule.view_own'
const PERMISSION_RATING_VIEW = 'rating.view'

type WorkforceView = 'dashboard' | 'schedule' | 'rating'

function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function parseUtcDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`)
}

function daysInclusive(fromKey: string, toKey: string): number {
  const from = parseUtcDate(fromKey)
  const to = parseUtcDate(toKey)
  const diffMs = to.getTime() - from.getTime()
  return Math.floor(diffMs / 86_400_000) + 1
}

async function resolveWorkforceScope(
  serviceClient: Parameters<typeof roleHasPermissionCode>[0],
  caller: { id: number; role_id: string | null },
  view: WorkforceView
): Promise<{ teamScope: boolean } | Response> {
  const hasTeam = await roleHasPermissionCode(serviceClient, caller.role_id, PERMISSION_SCHEDULE_TEAM)
  const hasOwn = await roleHasPermissionCode(serviceClient, caller.role_id, PERMISSION_SCHEDULE_OWN)
  const hasRating = await roleHasPermissionCode(serviceClient, caller.role_id, PERMISSION_RATING_VIEW)

  switch (view) {
    case 'dashboard':
      if (!hasTeam) return adminErrorResponse('forbidden', 403)
      return { teamScope: true }
    case 'schedule':
      if (hasTeam) return { teamScope: true }
      if (hasOwn) return { teamScope: false }
      return adminErrorResponse('forbidden', 403)
    case 'rating':
      if (!hasRating) return adminErrorResponse('forbidden', 403)
      if (hasTeam) return { teamScope: true }
      return { teamScope: false }
    default:
      return adminErrorResponse('validation_error', 422)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse()
  }

  if (req.method !== 'POST') {
    return adminErrorResponse('method_not_allowed', 405)
  }

  let payload: Record<string, unknown>
  try {
    payload = (await req.json()) as Record<string, unknown>
  } catch {
    return adminErrorResponse('malformed_json', 400)
  }

  for (const key of Object.keys(payload)) {
    if (!ALLOWED_BODY_KEYS.has(key)) {
      return adminErrorResponse('forbidden_field', 422)
    }
  }

  const dateFrom = payload.date_from
  const dateTo = payload.date_to
  if (!isDateKey(dateFrom) || !isDateKey(dateTo)) {
    return adminErrorResponse('invalid_date_range', 422)
  }
  if (dateTo < dateFrom) {
    return adminErrorResponse('invalid_date_range', 422)
  }
  const rangeDays = daysInclusive(dateFrom, dateTo)
  if (rangeDays < 1 || rangeDays > MAX_RANGE_DAYS) {
    return adminErrorResponse('invalid_date_range', 422)
  }

  const timezone =
    typeof payload.timezone === 'string' && payload.timezone.trim()
      ? payload.timezone.trim()
      : ALLOWED_TIMEZONE
  if (timezone !== ALLOWED_TIMEZONE) {
    return adminErrorResponse('invalid_timezone', 422)
  }

  const viewRaw = typeof payload.view === 'string' ? payload.view.trim() : ''
  if (!ALLOWED_VIEWS.has(viewRaw)) {
    return adminErrorResponse('invalid_view', 422)
  }
  const view = viewRaw as WorkforceView

  const authResult = await authorizeAuthenticatedEmployee(req)
  if (authResult instanceof Response) return authResult

  const { serviceClient, caller } = authResult
  const scopeResult = await resolveWorkforceScope(serviceClient, caller, view)
  if (scopeResult instanceof Response) return scopeResult

  let employeeQuery = serviceClient
    .from('academy_users')
    .select(WORKFORCE_EMPLOYEE_SELECT)
    .neq('role', 'admin')
    .eq('status', 'active')
    .order('full_name', { ascending: true })
    .order('id', { ascending: true })

  if (!scopeResult.teamScope) {
    employeeQuery = employeeQuery.eq('id', caller.id)
  }

  const { data: employeeRows, error: employeeError } = await employeeQuery
  if (employeeError) {
    console.error('admin_team_workforce_employees_failed', { category: employeeError.message })
    return adminErrorResponse('internal_error', 500)
  }

  const employees = (employeeRows ?? []).map((row) =>
    mapSafeWorkforceEmployee(row as DbWorkforceEmployeeRow)
  )
  const employeeIds = employees.map((employee) => employee.id)

  let shiftQuery = serviceClient
    .from('academy_employee_shifts')
    .select(WORKFORCE_SHIFT_SELECT)
    .gte('shift_date', dateFrom)
    .lte('shift_date', dateTo)
    .order('shift_date', { ascending: true })
    .order('employee_id', { ascending: true })

  if (!scopeResult.teamScope) {
    shiftQuery = shiftQuery.eq('employee_id', caller.id)
  } else if (employeeIds.length > 0) {
    shiftQuery = shiftQuery.in('employee_id', employeeIds)
  } else {
    return jsonResponse({
      ok: true,
      view,
      timezone,
      date_from: dateFrom,
      date_to: dateTo,
      team_scope: scopeResult.teamScope,
      employees: [],
      shifts: [],
    })
  }

  const { data: shiftRows, error: shiftError } = await shiftQuery
  if (shiftError) {
    console.error('admin_team_workforce_shifts_failed', { category: shiftError.message })
    return adminErrorResponse('internal_error', 500)
  }

  const shifts = (shiftRows ?? []).map((row) => mapSafeWorkforceShift(row as Record<string, unknown>))

  return jsonResponse({
    ok: true,
    view,
    timezone,
    date_from: dateFrom,
    date_to: dateTo,
    team_scope: scopeResult.teamScope,
    employees,
    shifts,
  })
})
