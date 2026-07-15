import '@supabase/functions-js/edge-runtime.d.ts'
import {
  authorizeAuthenticatedEmployee,
  adminErrorResponse,
  canEmployeeLogin,
  roleHasPermissionCode,
} from '../_shared/employeeAuthorization.ts'
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import {
  MAX_BULK_SHIFTS,
  buildShiftRow,
  fetchExistingShiftsByDates,
  normalizeEmployeeId,
  parseShiftInput,
  validateShiftInput,
  type ShiftInput,
} from '../_shared/employeeScheduleWrite.ts'
import { mapSafeWorkforceShift } from '../_shared/workforceFields.ts'

const PERMISSION_EDIT = 'schedule.edit'
const PERMISSION_BULK_EDIT = 'schedule.bulk_edit'
const PERMISSION_VIEW_TEAM = 'schedule.view_team'

const ALLOWED_BODY_KEYS = new Set(['action', 'employee_id', 'shift', 'shifts', 'overwrite'])
const ALLOWED_ACTIONS = new Set(['upsert_shift', 'bulk_upsert_shifts'])

async function assertTargetInScope(
  serviceClient: Parameters<typeof roleHasPermissionCode>[0],
  caller: { id: number; role_id: string | null },
  targetEmployeeId: number,
  requireBulk: boolean
): Promise<Response | null> {
  const permission = requireBulk ? PERMISSION_BULK_EDIT : PERMISSION_EDIT
  const permitted = await roleHasPermissionCode(serviceClient, caller.role_id, permission)
  if (!permitted) return adminErrorResponse('forbidden', 403)

  if (targetEmployeeId === caller.id) return null

  const hasTeam = await roleHasPermissionCode(serviceClient, caller.role_id, PERMISSION_VIEW_TEAM)
  if (!hasTeam) return adminErrorResponse('forbidden', 403)

  const { data: target, error } = await serviceClient
    .from('academy_users')
    .select('id, status, role')
    .eq('id', targetEmployeeId)
    .maybeSingle()

  if (error || !target || !canEmployeeLogin(target.status) || target.role === 'admin') {
    return adminErrorResponse('forbidden', 403)
  }

  return null
}

function parseShiftList(raw: unknown): ShiftInput[] | Response {
  if (!Array.isArray(raw) || raw.length === 0) {
    return adminErrorResponse('validation_error', 422)
  }
  if (raw.length > MAX_BULK_SHIFTS) {
    return adminErrorResponse('validation_error', 422)
  }

  const shifts: ShiftInput[] = []
  for (const item of raw) {
    const parsed = parseShiftInput(item)
    if (!parsed) return adminErrorResponse('validation_error', 422)
    const validationError = validateShiftInput(parsed)
    if (validationError) return adminErrorResponse('validation_error', 422)
    shifts.push(parsed)
  }

  const uniqueDates = new Set(shifts.map((shift) => shift.shift_date))
  if (uniqueDates.size !== shifts.length) {
    return adminErrorResponse('validation_error', 422)
  }

  return shifts
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

  const action = typeof payload.action === 'string' ? payload.action.trim() : ''
  if (!ALLOWED_ACTIONS.has(action)) {
    return adminErrorResponse('validation_error', 422)
  }

  const employeeId = normalizeEmployeeId(payload.employee_id)
  if (employeeId == null) {
    return adminErrorResponse('validation_error', 422)
  }

  const authResult = await authorizeAuthenticatedEmployee(req)
  if (authResult instanceof Response) return authResult

  const { serviceClient, caller } = authResult
  const scopeError = await assertTargetInScope(
    serviceClient,
    caller,
    employeeId,
    action === 'bulk_upsert_shifts'
  )
  if (scopeError) return scopeError

  if (action === 'upsert_shift') {
    const parsed = parseShiftInput(payload.shift)
    if (!parsed) return adminErrorResponse('validation_error', 422)
    const validationError = validateShiftInput(parsed)
    if (validationError) return adminErrorResponse('validation_error', 422)

    const existingMap = await fetchExistingShiftsByDates(serviceClient, employeeId, [
      parsed.shift_date,
    ])
    const existing = existingMap.get(parsed.shift_date) ?? null
    const row = buildShiftRow(employeeId, parsed, existing, caller.id)

    const { data, error } = await serviceClient
      .from('academy_employee_shifts')
      .upsert(row, { onConflict: 'employee_id,shift_date' })
      .select('*')
      .single()

    if (error) {
      console.error('schedule_upsert_failed', { category: error.message })
      return adminErrorResponse('internal_error', 500)
    }

    return jsonResponse({
      ok: true,
      action,
      shift: mapSafeWorkforceShift(data as Record<string, unknown>),
    })
  }

  const shiftsOrError = parseShiftList(payload.shifts)
  if (shiftsOrError instanceof Response) return shiftsOrError
  const shifts = shiftsOrError

  const overwrite = payload.overwrite === true
  const dates = shifts.map((shift) => shift.shift_date)
  const existingMap = await fetchExistingShiftsByDates(serviceClient, employeeId, dates)

  const entries = overwrite
    ? shifts
    : shifts.filter((shift) => !existingMap.has(shift.shift_date))

  if (!entries.length) {
    return jsonResponse({ ok: true, action, applied: 0 })
  }

  const rows = entries.map((shift) =>
    buildShiftRow(employeeId, shift, existingMap.get(shift.shift_date) ?? null, caller.id)
  )

  const { error } = await serviceClient
    .from('academy_employee_shifts')
    .upsert(rows, { onConflict: 'employee_id,shift_date' })

  if (error) {
    console.error('schedule_bulk_upsert_failed', { category: error.message })
    return adminErrorResponse('internal_error', 500)
  }

  return jsonResponse({ ok: true, action, applied: rows.length })
})
