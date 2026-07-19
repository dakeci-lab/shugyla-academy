import '@supabase/functions-js/edge-runtime.d.ts'
import {
  authorizeWorkforceRequest,
  adminErrorResponse,
  trackDbCall,
  type DbCallCounter,
} from '../_shared/employeeAuthorization.ts'
import {
  buildServerTimingHeader,
  corsPreflightResponse,
  jsonResponse,
} from '../_shared/cors.ts'
import {
  HOME_SUMMARY_SHIFT_WITH_EMPLOYEE_SELECT,
  WORKFORCE_EMPLOYEE_WITH_SHIFTS_SELECT,
  mapHomeSummaryEmployee,
  mapSafeWorkforceEmployee,
  mapSafeWorkforceShift,
  type DbWorkforceEmployeeRow,
} from '../_shared/workforceFields.ts'

const ALLOWED_BODY_KEYS = new Set(['date_from', 'date_to', 'timezone', 'view', 'employee_id'])
const ALLOWED_VIEWS = new Set(['dashboard', 'schedule', 'rating', 'home-summary', 'payroll'])
const ALLOWED_TIMEZONE = 'Asia/Almaty'
const MAX_RANGE_DAYS = 62

const PERMISSION_SCHEDULE_TEAM = 'schedule.view_team'
const PERMISSION_SCHEDULE_OWN = 'schedule.view_own'
const PERMISSION_RATING_VIEW = 'rating.view'
const PERMISSION_PAYROLL_VIEW = 'payroll.view'

type WorkforceView = 'dashboard' | 'schedule' | 'rating' | 'home-summary' | 'payroll'

/** Server-fixed permission codes per view — never taken from request body. */
function permissionCodesForView(view: WorkforceView): string[] {
  switch (view) {
    case 'dashboard':
    case 'home-summary':
      return [PERMISSION_SCHEDULE_TEAM]
    case 'schedule':
      return [PERMISSION_SCHEDULE_TEAM, PERMISSION_SCHEDULE_OWN]
    case 'rating':
      return [PERMISSION_RATING_VIEW, PERMISSION_SCHEDULE_TEAM]
    case 'payroll':
      // Payroll UI is team-scoped; schedule.view_team covers admins who already load team shifts.
      return [PERMISSION_PAYROLL_VIEW, PERMISSION_SCHEDULE_TEAM]
    default:
      return []
  }
}

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
  dbCalls: DbCallCounter,
  status = 200
) {
  return jsonResponse(body, status, {
    'Server-Timing': buildServerTimingHeader(phases),
    'X-Workforce-DB-Calls': String(dbCalls.count),
  })
}

function resolveWorkforceScope(
  view: WorkforceView,
  perms: Record<string, boolean>
): { teamScope: boolean } | Response {
  const hasTeam = perms[PERMISSION_SCHEDULE_TEAM] === true
  const hasOwn = perms[PERMISSION_SCHEDULE_OWN] === true
  const hasRating = perms[PERMISSION_RATING_VIEW] === true
  const hasPayroll = perms[PERMISSION_PAYROLL_VIEW] === true

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
    case 'payroll':
      // Mid-month terminations must still load shifts for the selected period.
      if (hasPayroll || hasTeam) return { teamScope: true }
      return adminErrorResponse('forbidden', 403)
    default:
      return adminErrorResponse('validation_error', 422)
  }
}

type HomeShiftEmbedRow = Record<string, unknown> & {
  academy_users?: {
    id: number
    first_name: string
    last_name: string
    full_name: string
    role: string
    position: string
  } | null
}

type EmployeeWithShiftsRow = DbWorkforceEmployeeRow & {
  academy_employee_shifts?: Record<string, unknown>[] | null
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

  const requiredCodes = permissionCodesForView(view)
  if (requiredCodes.length === 0) {
    return adminErrorResponse('invalid_view', 422)
  }

  const authzResult = await authorizeWorkforceRequest(req, requiredCodes)
  if (authzResult instanceof Response) return authzResult

  const {
    serviceClient,
    caller,
    permissions,
    timings: authzTimings,
    authMethod,
    dbCalls,
  } = authzResult
  const scopeResult = resolveWorkforceScope(view, permissions)
  if (scopeResult instanceof Response) return scopeResult

  // --- Home summary: one nested shifts→employees query ---
  if (view === 'home-summary') {
    if (rangeDays !== 1 || dateFrom !== dateTo) {
      return adminErrorResponse('invalid_date_range', 422)
    }
    if (requestedEmployeeId != null) {
      return adminErrorResponse('forbidden_field', 422)
    }

    const workforceDbStart = performance.now()
    trackDbCall(dbCalls)
    const workforceRes = await serviceClient
      .from('academy_employee_shifts')
      .select(HOME_SUMMARY_SHIFT_WITH_EMPLOYEE_SELECT)
      .eq('shift_date', dateFrom)
      .eq('academy_users.status', 'active')
      .eq('academy_users.work_mode', 'offline')
      .order('employee_id', { ascending: true })
    const workforceDbMs = Math.round(performance.now() - workforceDbStart)

    if (workforceRes.error) {
      console.error('admin_team_workforce_home_fusion_failed', {
        requestId,
        code: workforceRes.error.code,
        message: workforceRes.error.message,
      })
      return adminErrorResponse('internal_error', 500)
    }

    const transformStart = performance.now()
    const employeeById = new Map<number, ReturnType<typeof mapHomeSummaryEmployee>>()
    const shifts = []
    for (const row of (workforceRes.data ?? []) as HomeShiftEmbedRow[]) {
      const nested = row.academy_users
      if (!nested?.id) {
        console.error('admin_team_workforce_home_missing_employee', { requestId })
        continue
      }
      try {
        if (!employeeById.has(nested.id)) {
          employeeById.set(nested.id, mapHomeSummaryEmployee(nested))
        }
        const mapped = mapSafeWorkforceShift(row)
        if (mapped.employee_id !== nested.id) continue
        shifts.push(mapped)
      } catch (mapError) {
        console.error('admin_team_workforce_home_map_failed', {
          requestId,
          category: mapError instanceof Error ? mapError.message : 'unknown',
        })
      }
    }
    const employees = [...employeeById.values()].sort((a, b) => {
      const byName = a.full_name.localeCompare(b.full_name, 'ru')
      return byName !== 0 ? byName : a.id - b.id
    })
    const transformMs = Math.round(performance.now() - transformStart)
    const totalMs = Math.round(performance.now() - t0)

    console.log('admin_team_workforce_timing', {
      requestId,
      view,
      rangeDays,
      scoped: false,
      teamScope: true,
      authMethod,
      tokenMs: authzTimings.tokenMs,
      authMs: authzTimings.authMs,
      authorizationDbMs: authzTimings.authorizationDbMs,
      authorizationMs: authzTimings.authorizationMs,
      workforceDbMs,
      transformMs,
      totalMs,
      dbCalls: dbCalls.count,
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
        token: authzTimings.tokenMs,
        auth: authzTimings.authMs,
        authorization_db: authzTimings.authorizationDbMs,
        authorization: authzTimings.authorizationMs,
        workforce_db: workforceDbMs,
        transform: transformMs,
        total: totalMs,
      },
      dbCalls
    )
  }

  // Profile / Schedule / dashboard / rating: employees with outer nested shifts.
  let scopedEmployeeId: number | null = null
  if (requestedEmployeeId != null) {
    if (!scopeResult.teamScope && requestedEmployeeId !== caller.id) {
      return adminErrorResponse('forbidden', 403)
    }
    scopedEmployeeId = requestedEmployeeId
  } else if (!scopeResult.teamScope) {
    scopedEmployeeId = caller.id
  }

  const workforceDbStart = performance.now()
  trackDbCall(dbCalls)
  // Role is RBAC only — do not exclude role=admin from schedule/payroll workforce.
  let employeeQuery = serviceClient
    .from('academy_users')
    .select(WORKFORCE_EMPLOYEE_WITH_SHIFTS_SELECT)
    .gte('academy_employee_shifts.shift_date', dateFrom)
    .lte('academy_employee_shifts.shift_date', dateTo)
    .order('full_name', { ascending: true })
    .order('id', { ascending: true })
    .order('shift_date', {
      ascending: true,
      referencedTable: 'academy_employee_shifts',
    })
    .order('employee_id', {
      ascending: true,
      referencedTable: 'academy_employee_shifts',
    })

  if (view === 'payroll') {
    // Payroll is period-based: include terminated staff whose employment overlaps the range.
    // Do NOT filter status=active — that zeros Plan/Worked for mid-month terminations.
    employeeQuery = employeeQuery
      .lte('hired_at', dateTo)
      .or(`terminated_at.is.null,terminated_at.gte.${dateFrom}`)
  } else {
    employeeQuery = employeeQuery.eq('status', 'active')
  }

  if (scopedEmployeeId != null) {
    // Single-employee profile/own lookup keeps online staff (card still loads).
    employeeQuery = employeeQuery.eq('id', scopedEmployeeId)
  } else {
    // Team schedule / dashboard / rating / payroll: online (remote) staff are not in store presence.
    employeeQuery = employeeQuery.eq('work_mode', 'offline')
  }

  const workforceRes = await employeeQuery
  const workforceDbMs = Math.round(performance.now() - workforceDbStart)

  if (workforceRes.error) {
    console.error('admin_team_workforce_employees_fusion_failed', {
      requestId,
      code: workforceRes.error.code,
      message: workforceRes.error.message,
    })
    return adminErrorResponse('internal_error', 500)
  }

  // Scoped profile/own: missing employee → controlled empty (same as prior empty scope).
  if (scopedEmployeeId != null && (!workforceRes.data || workforceRes.data.length === 0)) {
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
        token: authzTimings.tokenMs,
        auth: authzTimings.authMs,
        authorization_db: authzTimings.authorizationDbMs,
        authorization: authzTimings.authorizationMs,
        workforce_db: workforceDbMs,
        transform: 0,
        total: totalMs,
      },
      dbCalls
    )
  }

  const transformStart = performance.now()
  const employees = []
  const shifts = []
  for (const row of (workforceRes.data ?? []) as EmployeeWithShiftsRow[]) {
    try {
      const { academy_employee_shifts: nestedShifts, ...employeeRow } = row
      employees.push(mapSafeWorkforceEmployee(employeeRow as DbWorkforceEmployeeRow))
      for (const shiftRow of nestedShifts ?? []) {
        try {
          const mapped = mapSafeWorkforceShift(shiftRow)
          if (mapped.employee_id !== employeeRow.id) continue
          shifts.push(mapped)
        } catch (mapError) {
          console.error('admin_team_workforce_shift_map_failed', {
            requestId,
            category: mapError instanceof Error ? mapError.message : 'unknown',
          })
        }
      }
    } catch (mapError) {
      console.error('admin_team_workforce_map_failed', {
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
    authMethod,
    tokenMs: authzTimings.tokenMs,
    authMs: authzTimings.authMs,
    authorizationDbMs: authzTimings.authorizationDbMs,
    authorizationMs: authzTimings.authorizationMs,
    workforceDbMs,
    transformMs,
    totalMs,
    dbCalls: dbCalls.count,
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
      token: authzTimings.tokenMs,
      auth: authzTimings.authMs,
      authorization_db: authzTimings.authorizationDbMs,
      authorization: authzTimings.authorizationMs,
      workforce_db: workforceDbMs,
      transform: transformMs,
      total: totalMs,
    },
    dbCalls
  )
})
