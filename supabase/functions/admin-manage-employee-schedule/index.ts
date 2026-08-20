import '@supabase/functions-js/edge-runtime.d.ts'
import {
  authorizeAuthenticatedEmployee,
  adminErrorResponse,
  roleHasPermissionCode,
} from '../_shared/employeeAuthorization.ts'
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import {
  MAX_BULK_SHIFTS,
  assertScheduleChangeAllowed,
  assertShiftDeleteAllowed,
  buildShiftRow,
  canEditEmployeeScheduleDate,
  clearPlanShiftsFromDate,
  fetchExistingShiftsByDates,
  isDateKey,
  normalizeEmployeeId,
  parseShiftInput,
  toScheduleDateKey,
  validateShiftInput,
  type ShiftInput,
} from '../_shared/employeeScheduleWrite.ts'
import { mapSafeWorkforceShift } from '../_shared/workforceFields.ts'

const PERMISSION_EDIT = 'schedule.edit'
const PERMISSION_BULK_EDIT = 'schedule.bulk_edit'
const PERMISSION_VIEW_TEAM = 'schedule.view_team'

const ALLOWED_BODY_KEYS = new Set([
  'action',
  'employee_id',
  'shift',
  'shifts',
  'overwrite',
  'shift_date',
  'from_date',
])
const ALLOWED_ACTIONS = new Set([
  'upsert_shift',
  'bulk_upsert_shifts',
  'delete_shift',
  'clear_shifts_from',
])

type SchedulableTarget = {
  id: number
  status: string | null
  work_mode: string | null
  hired_at: string | null
  terminated_at: string | null
}

async function assertTargetInScope(
  serviceClient: Parameters<typeof roleHasPermissionCode>[0],
  caller: { id: number; role_id: string | null },
  targetEmployeeId: number,
  requireBulk: boolean
): Promise<{ error: Response } | { target: SchedulableTarget }> {
  const permission = requireBulk ? PERMISSION_BULK_EDIT : PERMISSION_EDIT
  const permitted = await roleHasPermissionCode(serviceClient, caller.role_id, permission)
  if (!permitted) return { error: adminErrorResponse('forbidden', 403) }

  if (targetEmployeeId !== caller.id) {
    const hasTeam = await roleHasPermissionCode(serviceClient, caller.role_id, PERMISSION_VIEW_TEAM)
    if (!hasTeam) return { error: adminErrorResponse('forbidden', 403) }
  }

  const { data: target, error } = await serviceClient
    .from('academy_users')
    .select('id, status, role, work_mode, hired_at, terminated_at, created_at')
    .eq('id', targetEmployeeId)
    .maybeSingle()

  // Historical schedule edits stay allowed for terminated/inactive staff.
  // Employment dates (not login status) gate which days may change.
  if (error || !target) {
    return { error: adminErrorResponse('forbidden', 403) }
  }

  if (target.work_mode === 'online') {
    return { error: adminErrorResponse('online_employee_not_schedulable', 422) }
  }

  return {
    target: {
      id: Number(target.id),
      status: (target.status as string | null) ?? null,
      work_mode: (target.work_mode as string | null) ?? null,
      hired_at:
        ((target.hired_at as string | null) ?? null) ||
        ((target.created_at as string | null) ?? null),
      terminated_at: (target.terminated_at as string | null) ?? null,
    },
  }
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
  const scopeResult = await assertTargetInScope(
    serviceClient,
    caller,
    employeeId,
    action === 'bulk_upsert_shifts'
  )
  if ('error' in scopeResult) return scopeResult.error
  const { target } = scopeResult

  if (action === 'upsert_shift') {
    const parsed = parseShiftInput(payload.shift)
    if (!parsed) return adminErrorResponse('validation_error', 422)
    const validationError = validateShiftInput(parsed)
    if (validationError) return adminErrorResponse('validation_error', 422)

    if (!canEditEmployeeScheduleDate(target.hired_at, target.terminated_at, parsed.shift_date)) {
      return adminErrorResponse('shift_outside_employment', 422)
    }

    const existingMap = await fetchExistingShiftsByDates(serviceClient, employeeId, [
      parsed.shift_date,
    ])
    const existing = existingMap.get(parsed.shift_date) ?? null
    const blockReason = assertScheduleChangeAllowed(existing, parsed)
    if (blockReason) return adminErrorResponse(blockReason, 409)

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

  if (action === 'delete_shift') {
    const shiftDate = toScheduleDateKey(payload.shift_date)
    if (!shiftDate || !isDateKey(shiftDate)) {
      return adminErrorResponse('validation_error', 422)
    }

    if (!canEditEmployeeScheduleDate(target.hired_at, target.terminated_at, shiftDate)) {
      return adminErrorResponse('shift_outside_employment', 422)
    }

    const existingMap = await fetchExistingShiftsByDates(serviceClient, employeeId, [shiftDate])
    const existing = existingMap.get(shiftDate) ?? null
    const blockReason = assertShiftDeleteAllowed(existing)
    if (blockReason) return adminErrorResponse(blockReason, 409)

    if (!existing) {
      return jsonResponse({ ok: true, action, deleted: false, shift_date: shiftDate })
    }

    const { error } = await serviceClient
      .from('academy_employee_shifts')
      .delete()
      .eq('employee_id', employeeId)
      .eq('shift_date', shiftDate)

    if (error) {
      console.error('schedule_delete_failed', { category: error.message })
      return adminErrorResponse('internal_error', 500)
    }

    return jsonResponse({ ok: true, action, deleted: true, shift_date: shiftDate })
  }

  if (action === 'clear_shifts_from') {
    const fromDate = toScheduleDateKey(payload.from_date)
    if (!fromDate || !isDateKey(fromDate)) {
      return adminErrorResponse('validation_error', 422)
    }

    // Repair / clear may include days after terminated_at — do not gate on employment window.
    try {
      const clearResult = await clearPlanShiftsFromDate(serviceClient, employeeId, fromDate, {
        inclusive: true,
      })
      return jsonResponse({
        ok: true,
        action,
        from_date: fromDate,
        deleted: clearResult.deleted,
        skipped_with_attendance: clearResult.retainedWithAttendance,
      })
    } catch (clearErr) {
      console.error('schedule_clear_from_failed', {
        category: clearErr instanceof Error ? clearErr.message : 'unknown',
      })
      return adminErrorResponse('internal_error', 500)
    }
  }

  const shiftsOrError = parseShiftList(payload.shifts)
  if (shiftsOrError instanceof Response) return shiftsOrError
  const shifts = shiftsOrError

  for (const shift of shifts) {
    if (!canEditEmployeeScheduleDate(target.hired_at, target.terminated_at, shift.shift_date)) {
      return adminErrorResponse('shift_outside_employment', 422)
    }
  }

  const overwrite = payload.overwrite === true
  const dates = shifts.map((shift) => shift.shift_date)
  const existingMap = await fetchExistingShiftsByDates(serviceClient, employeeId, dates)

  const entries = overwrite
    ? shifts
    : shifts.filter((shift) => !existingMap.has(shift.shift_date))

  if (!entries.length) {
    return jsonResponse({ ok: true, action, applied: 0 })
  }

  const rows = []
  for (const shift of entries) {
    const existing = existingMap.get(shift.shift_date) ?? null
    const blockReason = assertScheduleChangeAllowed(existing, shift)
    if (blockReason) return adminErrorResponse(blockReason, 409)
    rows.push(buildShiftRow(employeeId, shift, existing, caller.id))
  }

  const { error } = await serviceClient
    .from('academy_employee_shifts')
    .upsert(rows, { onConflict: 'employee_id,shift_date' })

  if (error) {
    console.error('schedule_bulk_upsert_failed', { category: error.message })
    return adminErrorResponse('internal_error', 500)
  }

  return jsonResponse({ ok: true, action, applied: rows.length })
})
