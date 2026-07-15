import type { SupabaseClient } from '@supabase/supabase-js'

export const ALLOWED_SHIFT_STATUSES = new Set([
  'working',
  'day_off',
  'vacation',
  'sick_leave',
  'absence',
])

export const MAX_BULK_SHIFTS = 62

const FORBIDDEN_SHIFT_KEYS = new Set([
  'id',
  'employee_id',
  'auth_user_id',
  'created_at',
  'updated_at',
  'created_by',
])

export type ShiftInput = {
  shift_date: string
  status: string
  planned_start_time?: string | null
  planned_end_time?: string | null
  planned_break_start?: string | null
  planned_break_end?: string | null
  actual_start_time?: string | null
  actual_end_time?: string | null
  actual_break_start?: string | null
  actual_break_end?: string | null
  comment?: string | null
}

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function isTimeValue(value: unknown): boolean {
  if (value == null || value === '') return true
  return typeof value === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(value)
}

export function isIsoTimestamp(value: unknown): boolean {
  if (value == null || value === '') return true
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

export function normalizeEmployeeId(value: unknown): number | null {
  const id = Number(value)
  if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) return null
  return id
}

export function isWorkingStatus(status: string): boolean {
  return status === 'working'
}

export function hasShiftAttendanceHistory(
  existing: Record<string, unknown> | null
): boolean {
  if (!existing) return false
  if (existing.actual_start_time || existing.actual_end_time) return true
  if (existing.check_in_latitude != null || existing.check_out_latitude != null) return true
  return false
}

export function assertScheduleChangeAllowed(
  existing: Record<string, unknown> | null,
  shift: ShiftInput
): string | null {
  if (!existing || !hasShiftAttendanceHistory(existing)) return null
  const previousStatus = String(existing.status || '')
  if (isWorkingStatus(previousStatus) && !isWorkingStatus(shift.status)) {
    return 'shift_has_attendance_history'
  }
  return null
}

export function assertNoForbiddenShiftKeys(shift: Record<string, unknown>): string | null {
  for (const key of Object.keys(shift)) {
    if (FORBIDDEN_SHIFT_KEYS.has(key)) return 'forbidden_field'
  }
  return null
}

export function validateShiftInput(shift: ShiftInput): string | null {
  const forbidden = assertNoForbiddenShiftKeys(shift as Record<string, unknown>)
  if (forbidden) return forbidden

  if (!isDateKey(shift.shift_date)) return 'invalid_shift_date'
  if (!ALLOWED_SHIFT_STATUSES.has(shift.status)) return 'invalid_status'

  if (isWorkingStatus(shift.status)) {
    if (!isTimeValue(shift.planned_start_time) || !shift.planned_start_time) {
      return 'invalid_planned_start'
    }
    if (!isTimeValue(shift.planned_end_time) || !shift.planned_end_time) {
      return 'invalid_planned_end'
    }
  }

  for (const field of [
    'planned_break_start',
    'planned_break_end',
    'planned_start_time',
    'planned_end_time',
  ] as const) {
    if (!isTimeValue(shift[field])) return 'invalid_time'
  }

  for (const field of [
    'actual_start_time',
    'actual_end_time',
    'actual_break_start',
    'actual_break_end',
  ] as const) {
    if (!isIsoTimestamp(shift[field])) return 'invalid_timestamp'
  }

  if (shift.comment != null && typeof shift.comment !== 'string') return 'invalid_comment'
  return null
}

function pickExistingValue<T>(
  payloadValue: T | undefined,
  existingValue: T | null | undefined,
  defaultValue: T | null
): T | null {
  if (payloadValue !== undefined) return payloadValue as T | null
  if (existingValue !== undefined && existingValue !== null) return existingValue
  return defaultValue
}

/** Preserve attendance actuals when client sends null on plan-only edits. */
function pickPreservedActual(
  payloadValue: string | null | undefined,
  existingValue: string | null | undefined
): string | null {
  if (payloadValue === undefined || payloadValue === null) {
    return existingValue ?? null
  }
  return payloadValue
}

export function buildShiftRow(
  employeeId: number,
  shift: ShiftInput,
  existing: Record<string, unknown> | null,
  createdBy: number
): Record<string, unknown> {
  const working = isWorkingStatus(shift.status)

  return {
    employee_id: employeeId,
    shift_date: shift.shift_date,
    status: shift.status,
    planned_start_time: working ? shift.planned_start_time ?? null : null,
    planned_end_time: working ? shift.planned_end_time ?? null : null,
    planned_break_start: pickExistingValue(
      shift.planned_break_start,
      existing?.planned_break_start as string | null,
      null
    ),
    planned_break_end: pickExistingValue(
      shift.planned_break_end,
      existing?.planned_break_end as string | null,
      null
    ),
    actual_start_time: pickPreservedActual(
      shift.actual_start_time,
      existing?.actual_start_time as string | null
    ),
    actual_end_time: pickPreservedActual(
      shift.actual_end_time,
      existing?.actual_end_time as string | null
    ),
    actual_break_start: pickPreservedActual(
      shift.actual_break_start,
      existing?.actual_break_start as string | null
    ),
    actual_break_end: pickPreservedActual(
      shift.actual_break_end,
      existing?.actual_break_end as string | null
    ),
    comment: shift.comment ?? (existing?.comment as string | undefined) ?? '',
    created_by: (existing?.created_by as number | null | undefined) ?? createdBy,
  }
}

export async function fetchExistingShiftsByDates(
  serviceClient: SupabaseClient,
  employeeId: number,
  dates: string[]
): Promise<Map<string, Record<string, unknown>>> {
  if (!dates.length) return new Map()

  const { data, error } = await serviceClient
    .from('academy_employee_shifts')
    .select('*')
    .eq('employee_id', employeeId)
    .in('shift_date', dates)

  if (error) throw new Error('existing_shift_lookup_failed')
  return new Map((data ?? []).map((row) => [String(row.shift_date), row as Record<string, unknown>]))
}

export function parseShiftInput(raw: unknown): ShiftInput | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (typeof record.shift_date !== 'string' || typeof record.status !== 'string') return null

  return {
    shift_date: record.shift_date,
    status: record.status,
    planned_start_time: (record.planned_start_time as string | null | undefined) ?? null,
    planned_end_time: (record.planned_end_time as string | null | undefined) ?? null,
    planned_break_start: (record.planned_break_start as string | null | undefined) ?? null,
    planned_break_end: (record.planned_break_end as string | null | undefined) ?? null,
    actual_start_time: (record.actual_start_time as string | null | undefined) ?? null,
    actual_end_time: (record.actual_end_time as string | null | undefined) ?? null,
    actual_break_start: (record.actual_break_start as string | null | undefined) ?? null,
    actual_break_end: (record.actual_break_end as string | null | undefined) ?? null,
    comment: (record.comment as string | null | undefined) ?? null,
  }
}
