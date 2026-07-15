export const WORKFORCE_EMPLOYEE_SELECT =
  'id, first_name, last_name, full_name, role, role_id, status, position, avatar_url'

export const WORKFORCE_SHIFT_SELECT =
  'id, employee_id, shift_date, status, planned_start_time, planned_end_time, planned_break_start, planned_break_end, actual_start_time, actual_end_time, actual_break_start, actual_break_end, comment'

export type DbWorkforceEmployeeRow = {
  id: number
  first_name: string
  last_name: string
  full_name: string
  role: string
  role_id: string | null
  status: string
  position: string
  avatar_url: string | null
}

export type SafeWorkforceEmployee = {
  id: number
  first_name: string
  last_name: string
  full_name: string
  role: string
  role_id: string | null
  status: string
  position: string
  avatar_url: string | null
}

export type SafeWorkforceShift = {
  id: string
  employee_id: number
  shift_date: string
  status: string
  planned_start_time: string | null
  planned_end_time: string | null
  planned_break_start: string | null
  planned_break_end: string | null
  actual_start_time: string | null
  actual_end_time: string | null
  actual_break_start: string | null
  actual_break_end: string | null
  comment: string | null
}

export function mapSafeWorkforceEmployee(row: DbWorkforceEmployeeRow): SafeWorkforceEmployee {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    full_name: row.full_name,
    role: row.role,
    role_id: row.role_id,
    status: row.status,
    position: row.position,
    avatar_url: row.avatar_url,
  }
}

export function mapSafeWorkforceShift(row: Record<string, unknown>): SafeWorkforceShift {
  return {
    id: String(row.id),
    employee_id: Number(row.employee_id),
    shift_date: String(row.shift_date),
    status: String(row.status),
    planned_start_time: (row.planned_start_time as string | null) ?? null,
    planned_end_time: (row.planned_end_time as string | null) ?? null,
    planned_break_start: (row.planned_break_start as string | null) ?? null,
    planned_break_end: (row.planned_break_end as string | null) ?? null,
    actual_start_time: (row.actual_start_time as string | null) ?? null,
    actual_end_time: (row.actual_end_time as string | null) ?? null,
    actual_break_start: (row.actual_break_start as string | null) ?? null,
    actual_break_end: (row.actual_break_end as string | null) ?? null,
    comment: (row.comment as string | null) ?? null,
  }
}
