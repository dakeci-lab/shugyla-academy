import '@supabase/functions-js/edge-runtime.d.ts'
import {
  authorizeAuthenticatedEmployee,
  adminErrorResponse,
  roleHasPermissionCodes,
} from '../_shared/employeeAuthorization.ts'
import {
  buildServerTimingHeader,
  corsPreflightResponse,
  jsonResponse,
} from '../_shared/cors.ts'
import {
  HOME_SUMMARY_EMPLOYEE_SELECT,
  HOME_SUMMARY_SHIFT_SELECT,
  WORKFORCE_EMPLOYEE_SELECT,
  WORKFORCE_SHIFT_SELECT,
  mapHomeSummaryEmployee,
  mapSafeWorkforceEmployee,
  mapSafeWorkforceShift,
  type DbWorkforceEmployeeRow,
} from '../_shared/workforceFields.ts'

const ALLOWED_BODY_KEYS = new Set(['date_from', 'date_to', 'timezone', 'view', 'employee_id'])
const ALLOWED_VIEWS = new Set(['dashboard', 'schedule', 'rating', 'home-summary'])
const ALLOWED_TIMEZONE = 'Asia/Almaty'
const MAX_RANGE_DAYS = 62

const PERMISSION_SCHEDULE_TEAM = 'schedule.view_team'
const PERMISSION_SCHEDULE_OWN = 'schedule.view_own'
const PERMISSION_RATING_VIEW = 'rating.view'

type WorkforceView = 'dashboard' | 'schedule' | 'rating' | 'home-summary'

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

function parseOptionalEmployeeId(value: unknown): number | null | Response {
  if (value === undefined || value === null || value === '') return null
  const id = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) {
    return adminErrorResponse('validation_error', 422)
  }
  return id
}

function timingResponse(
  body: Record<string, unknown>,
  phases: Record<string, number>,
  status = 200
) {
  return jsonResponse(body, status, {
    'Server-Timing': buildServerTimingHeader(phases),
  })
}

async function resolveWorkforceScope(
  serviceClient: Parameters<typeof roleHasPermissionCodes>[0],
  caller: { id: number; role_id: string | null },
  view: WorkforceView
): Promise<{ teamScope: boolean } | Response> {
  const perms = await roleHasPermissionCodes(serviceClient, caller.role_id, [
    PERMISSION_SCHEDULE_TEAM,
    PERMISSION_SCHEDULE_OWN,
    PERMISSION_RATING_VIEW,
  ])
  const hasTeam = perms[PERMISSION_SCHEDULE_TEAM] === true
  const hasOwn = perms[PERMISSION_SCHEDULE_OWN] === true
  const hasRating = perms[PERMISSION_RATING_VIEW] === true

  switch (view) {
    case 'dashboard':
    case 'home-summary':
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
  const requestId = crypto.randomUUID()
  const t0 = performance.now()

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

  const employeeIdResult = parseOptionalEmployeeId(payload.employee_id)
  if (employeeIdResult instanceof Response) return employeeIdResult
  const requestedEmployeeId = employeeIdResult

  const authStart = performance.now()
  const authResult = await authorizeAuthenticatedEmployee(req)
  const authMs = Math.round(performance.now() - authStart)
  if (authResult instanceof Response) return authResult

  const { serviceClient, caller } = authResult

  const authzStart = performance.now()
  const scopeResult = await resolveWorkforceScope(serviceClient, caller, view)
  const authzMs = Math.round(performance.now() - authzStart)
  if (scopeResult instanceof Response) return scopeResult

  // --- Home summary: day shifts first, then only employees who appear that day ---
  if (view === 'home-summary') {
    if (rangeDays !== 1 || dateFrom !== dateTo) {
      return adminErrorResponse('invalid_date_range', 422)
    }
    if (requestedEmployeeId != null) {
      return adminErrorResponse('forbidden_field', 422)
    }

    const shiftStart = performance.now()
    const shiftRes = await serviceClient
      .from('academy_employee_shifts')
      .select(HOME_SUMMARY_SHIFT_SELECT)
      .eq('shift_date', dateFrom)
      .order('employee_id', { ascending: true })
    const shiftsQueryMs = Math.round(performance.now() - shiftStart)

    if (shiftRes.error) {
      console.error('admin_team_workforce_shifts_failed', {
        requestId,
        code: shiftRes.error.code,
        message: shiftRes.error.message,
      })
      return adminErrorResponse('internal_error', 500)
    }

    const shiftIds = new Set<number>()
    for (const row of shiftRes.data ?? []) {
      const id = Number((row as { employee_id?: number }).employee_id)
      if (Number.isFinite(id)) shiftIds.add(id)
    }

    let employeesQueryMs = 0
    let employeeRows: unknown[] = []
    if (shiftIds.size > 0) {
      const empStart = performance.now()
      const empRes = await serviceClient
        .from('academy_users')
        .select(HOME_SUMMARY_EMPLOYEE_SELECT)
        .in('id', [...shiftIds])
        .neq('role', 'admin')
        .eq('status', 'active')
        .order('full_name', { ascending: true })
        .order('id', { ascending: true })
      employeesQueryMs = Math.round(performance.now() - empStart)
      if (empRes.error) {
        console.error('admin_team_workforce_employees_failed', {
          requestId,
          code: empRes.error.code,
          message: empRes.error.message,
        })
        return adminErrorResponse('internal_error', 500)
      }
      employeeRows = empRes.data ?? []
    }

    const transformStart = performance.now()
    const employees = []
    for (const row of employeeRows) {
      try {
        employees.push(
          mapHomeSummaryEmployee(
            row as {
              id: number
              first_name: string
              last_name: string
              full_name: string
              role: string
              position: string
            }
          )
        )
      } catch (mapError) {
        console.error('admin_team_workforce_map_failed', {
          requestId,
          category: mapError instanceof Error ? mapError.message : 'unknown',
        })
      }
    }
    const allowedIds = new Set(employees.map((employee) => employee.id))
    const shifts = []
    for (const row of shiftRes.data ?? []) {
      try {
        const mapped = mapSafeWorkforceShift(row as Record<string, unknown>)
        if (!allowedIds.has(mapped.employee_id)) continue
        shifts.push(mapped)
      } catch (mapError) {
        console.error('admin_team_workforce_shift_map_failed', {
          requestId,
          category: mapError instanceof Error ? mapError.message : 'unknown',
        })
      }
    }
    const transformMs = Math.round(performance.now() - transformStart)
    const totalMs = Math.round(performance.now() - t0)

    console.log('admin_team_workforce_timing', {
      requestId,
      view,
      rangeDays,
      scoped: false,
      teamScope: true,
      authMs,
      authzMs,
      employeesQueryMs,
      shiftsQueryMs,
      transformMs,
      totalMs,
      employeeCount: employees.length,
      shiftCount: shifts.length,
    })

    return timingResponse(
      {
        ok: true,
        view,
        timezone,
        date_from: dateFrom,
        date_to: dateTo,
        team_scope: true,
        employees,
        shifts,
      },
      {
        auth: authMs,
        authorization: authzMs,
        employees: employeesQueryMs,
        shifts: shiftsQueryMs,
        transform: transformMs,
        total: totalMs,
      }
    )
  }

  // Resolve effective employee scope before queries so employees + shifts can run in parallel.
  let scopedEmployeeId: number | null = null
  if (requestedEmployeeId != null) {
    if (!scopeResult.teamScope && requestedEmployeeId !== caller.id) {
      return adminErrorResponse('forbidden', 403)
    }
    scopedEmployeeId = requestedEmployeeId
  } else if (!scopeResult.teamScope) {
    scopedEmployeeId = caller.id
  }

  let employeeQuery = serviceClient
    .from('academy_users')
    .select(WORKFORCE_EMPLOYEE_SELECT)
    .neq('role', 'admin')
    .eq('status', 'active')
    .order('full_name', { ascending: true })
    .order('id', { ascending: true })

  if (scopedEmployeeId != null) {
    employeeQuery = employeeQuery.eq('id', scopedEmployeeId)
  }

  let shiftQuery = serviceClient
    .from('academy_employee_shifts')
    .select(WORKFORCE_SHIFT_SELECT)
    .gte('shift_date', dateFrom)
    .lte('shift_date', dateTo)
    .order('shift_date', { ascending: true })
    .order('employee_id', { ascending: true })

  if (scopedEmployeeId != null) {
    shiftQuery = shiftQuery.eq('employee_id', scopedEmployeeId)
  }

  const queriesStart = performance.now()
  let employeeRows: unknown[] | null = null
  let shiftRows: unknown[] | null = null
  let employeeError: { code?: string; message?: string; details?: string; hint?: string } | null =
    null
  let shiftError: { code?: string; message?: string; details?: string; hint?: string } | null = null
  let employeesQueryMs = 0
  let shiftsQueryMs = 0

  if (scopedEmployeeId != null) {
    const empStart = performance.now()
    const shiftStart = performance.now()
    const [empRes, shiftRes] = await Promise.all([employeeQuery, shiftQuery])
    employeesQueryMs = Math.round(performance.now() - empStart)
    shiftsQueryMs = Math.round(performance.now() - shiftStart)
    employeeRows = empRes.data
    employeeError = empRes.error
    shiftRows = shiftRes.data
    shiftError = shiftRes.error
  } else {
    const empStart = performance.now()
    const empRes = await employeeQuery
    employeesQueryMs = Math.round(performance.now() - empStart)
    employeeRows = empRes.data
    employeeError = empRes.error

    if (!employeeError) {
      const ids: number[] = []
      for (const row of employeeRows ?? []) {
        const id = Number((row as DbWorkforceEmployeeRow)?.id)
        if (Number.isFinite(id)) ids.push(id)
      }
      if (ids.length === 0) {
        const totalMs = Math.round(performance.now() - t0)
        return timingResponse(
          {
            ok: true,
            view,
            timezone,
            date_from: dateFrom,
            date_to: dateTo,
            team_scope: scopeResult.teamScope,
            employees: [],
            shifts: [],
          },
          {
            auth: authMs,
            authorization: authzMs,
            employees: employeesQueryMs,
            shifts: 0,
            transform: 0,
            total: totalMs,
          }
        )
      }
      const shiftStart = performance.now()
      const shiftRes = await shiftQuery.in('employee_id', ids)
      shiftsQueryMs = Math.round(performance.now() - shiftStart)
      shiftRows = shiftRes.data
      shiftError = shiftRes.error
    }
  }
  const queriesMs = Math.round(performance.now() - queriesStart)

  if (employeeError) {
    console.error('admin_team_workforce_employees_failed', {
      requestId,
      code: employeeError.code,
      message: employeeError.message,
      details: employeeError.details,
      hint: employeeError.hint,
    })
    return adminErrorResponse('internal_error', 500)
  }

  if (shiftError) {
    console.error('admin_team_workforce_shifts_failed', {
      requestId,
      code: shiftError.code,
      message: shiftError.message,
      details: shiftError.details,
      hint: shiftError.hint,
    })
    return adminErrorResponse('internal_error', 500)
  }

  const transformStart = performance.now()
  const employees = []
  for (const row of employeeRows ?? []) {
    try {
      employees.push(mapSafeWorkforceEmployee(row as DbWorkforceEmployeeRow))
    } catch (mapError) {
      console.error('admin_team_workforce_map_failed', {
        requestId,
        category: mapError instanceof Error ? mapError.message : 'unknown',
      })
    }
  }

  const allowedIds = new Set(employees.map((employee) => employee.id))
  const shifts = []
  for (const row of shiftRows ?? []) {
    try {
      const mapped = mapSafeWorkforceShift(row as Record<string, unknown>)
      if (!allowedIds.has(mapped.employee_id)) continue
      shifts.push(mapped)
    } catch (mapError) {
      console.error('admin_team_workforce_shift_map_failed', {
        requestId,
        category: mapError instanceof Error ? mapError.message : 'unknown',
      })
    }
  }
  const transformMs = Math.round(performance.now() - transformStart)
  const totalMs = Math.round(performance.now() - t0)

  console.log('admin_team_workforce_timing', {
    requestId,
    view,
    rangeDays,
    scoped: scopedEmployeeId != null,
    teamScope: scopeResult.teamScope,
    authMs,
    authzMs,
    employeesQueryMs,
    shiftsQueryMs,
    queriesMs,
    transformMs,
    totalMs,
    employeeCount: employees.length,
    shiftCount: shifts.length,
  })

  return timingResponse(
    {
      ok: true,
      view,
      timezone,
      date_from: dateFrom,
      date_to: dateTo,
      team_scope: scopeResult.teamScope,
      employees,
      shifts,
    },
    {
      auth: authMs,
      authorization: authzMs,
      employees: employeesQueryMs,
      shifts: shiftsQueryMs,
      transform: transformMs,
      total: totalMs,
    }
  )
})
