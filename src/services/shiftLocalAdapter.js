import { normalizeShift } from '../utils/shiftData'

const STORAGE_KEY = 'shugyla_employee_shifts'

function readShifts() {
  const data = localStorage.getItem(STORAGE_KEY)
  return data ? JSON.parse(data) : []
}

function writeShifts(shifts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shifts))
}

function genId() {
  return crypto.randomUUID()
}

function inDateRange(shiftDate, start, end) {
  return shiftDate >= start && shiftDate <= end
}

export function getShiftsForEmployeeMonth(employeeId, year, month) {
  const { start, end } = getMonthRange(year, month)
  return readShifts()
    .filter((row) => row.employee_id === employeeId && inDateRange(row.shift_date, start, end))
    .map(normalizeShift)
}

export function getShiftsForMonth(year, month, employeeIds = null) {
  const { start, end } = getMonthRange(year, month)
  const idSet = employeeIds ? new Set(employeeIds.map(Number)) : null
  return readShifts()
    .filter((row) => {
      if (!inDateRange(row.shift_date, start, end)) return false
      if (idSet && !idSet.has(Number(row.employee_id))) return false
      return true
    })
    .map(normalizeShift)
}

function getMonthRange(year, month) {
  const lastDay = new Date(year, month, 0).getDate()
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

export async function upsertEmployeeShift(employeeId, payload, createdBy = null) {
  const shifts = readShifts()
  const idx = shifts.findIndex(
    (row) => row.employee_id === employeeId && row.shift_date === payload.shiftDate
  )

  const existing = idx >= 0 ? shifts[idx] : null

  const row = {
    id: existing?.id || genId(),
    employee_id: employeeId,
    shift_date: payload.shiftDate,
    status: payload.status,
    planned_start_time: payload.plannedStartTime,
    planned_end_time: payload.plannedEndTime,
    planned_break_start: payload.plannedBreakStart,
    planned_break_end: payload.plannedBreakEnd,
    actual_start_time: payload.actualStartTime ?? existing?.actual_start_time ?? null,
    actual_end_time: payload.actualEndTime ?? existing?.actual_end_time ?? null,
    actual_break_start: payload.actualBreakStart ?? existing?.actual_break_start ?? null,
    actual_break_end: payload.actualBreakEnd ?? existing?.actual_break_end ?? null,
    comment: payload.comment || existing?.comment || '',
    created_by: existing?.created_by ?? createdBy,
    created_at: existing?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    check_in_latitude: existing?.check_in_latitude ?? null,
    check_in_longitude: existing?.check_in_longitude ?? null,
    check_in_accuracy: existing?.check_in_accuracy ?? null,
    check_out_latitude: existing?.check_out_latitude ?? null,
    check_out_longitude: existing?.check_out_longitude ?? null,
    check_out_accuracy: existing?.check_out_accuracy ?? null,
    late_minutes: existing?.late_minutes ?? 0,
    early_leave_minutes: existing?.early_leave_minutes ?? 0,
    worked_minutes: existing?.worked_minutes ?? 0,
    missing_check_in: existing?.missing_check_in ?? false,
    missing_check_out: existing?.missing_check_out ?? false,
    attendance_status: existing?.attendance_status ?? null,
    work_location_id: existing?.work_location_id ?? null,
  }

  if (idx >= 0) {
    shifts[idx] = row
  } else {
    shifts.push(row)
  }

  writeShifts(shifts)
  return normalizeShift(row)
}

export async function bulkApplyEmployeeShifts(
  employeeId,
  entries,
  { overwrite = false, createdBy = null } = {}
) {
  const shifts = readShifts()
  const now = new Date().toISOString()

  entries.forEach((entry) => {
    const idx = shifts.findIndex(
      (row) => row.employee_id === employeeId && row.shift_date === entry.shiftDate
    )
    if (idx >= 0 && !overwrite) return

    const row = {
      id: idx >= 0 ? shifts[idx].id : genId(),
      employee_id: employeeId,
      shift_date: entry.shiftDate,
      status: entry.status,
      planned_start_time: entry.plannedStartTime,
      planned_end_time: entry.plannedEndTime,
      planned_break_start: entry.plannedBreakStart,
      planned_break_end: entry.plannedBreakEnd,
      actual_start_time: idx >= 0 ? shifts[idx].actual_start_time : null,
      actual_end_time: idx >= 0 ? shifts[idx].actual_end_time : null,
      actual_break_start: idx >= 0 ? shifts[idx].actual_break_start : null,
      actual_break_end: idx >= 0 ? shifts[idx].actual_break_end : null,
      comment: idx >= 0 ? shifts[idx].comment : '',
      created_by: idx >= 0 ? shifts[idx].created_by : createdBy,
      created_at: idx >= 0 ? shifts[idx].created_at : now,
      updated_at: now,
    }

    if (idx >= 0) {
      shifts[idx] = row
    } else {
      shifts.push(row)
    }
  })

  writeShifts(shifts)
  return entries.length
}
