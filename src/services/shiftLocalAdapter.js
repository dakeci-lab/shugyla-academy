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

function buildFactualRow(employeeId, payload, existing, createdBy) {
  return {
    id: existing?.id || genId(),
    employee_id: employeeId,
    shift_date: payload.shiftDate,
    status: payload.status,
    planned_start_time: payload.plannedStartTime,
    planned_end_time: payload.plannedEndTime,
    planned_break_start: payload.plannedBreakStart ?? existing?.planned_break_start ?? null,
    planned_break_end: payload.plannedBreakEnd ?? existing?.planned_break_end ?? null,
    actual_start_time: payload.actualStartTime ?? existing?.actual_start_time ?? null,
    actual_end_time: payload.actualEndTime ?? existing?.actual_end_time ?? null,
    actual_break_start: payload.actualBreakStart ?? existing?.actual_break_start ?? null,
    actual_break_end: payload.actualBreakEnd ?? existing?.actual_break_end ?? null,
    comment: payload.comment ?? existing?.comment ?? '',
    created_by: existing?.created_by ?? createdBy,
    created_at: existing?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    check_in_latitude: payload.checkInLatitude ?? existing?.check_in_latitude ?? null,
    check_in_longitude: payload.checkInLongitude ?? existing?.check_in_longitude ?? null,
    check_in_accuracy: payload.checkInAccuracy ?? existing?.check_in_accuracy ?? null,
    check_out_latitude: payload.checkOutLatitude ?? existing?.check_out_latitude ?? null,
    check_out_longitude: payload.checkOutLongitude ?? existing?.check_out_longitude ?? null,
    check_out_accuracy: payload.checkOutAccuracy ?? existing?.check_out_accuracy ?? null,
    work_location_id: payload.workLocationId ?? existing?.work_location_id ?? null,
  }
}

export async function upsertEmployeeShift(employeeId, payload, createdBy = null) {
  const shifts = readShifts()
  const idx = shifts.findIndex(
    (row) => row.employee_id === employeeId && row.shift_date === payload.shiftDate
  )
  const existing = idx >= 0 ? shifts[idx] : null
  const row = buildFactualRow(employeeId, payload, existing, createdBy)

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

  entries.forEach((entry) => {
    const idx = shifts.findIndex(
      (row) => row.employee_id === employeeId && row.shift_date === entry.shiftDate
    )
    if (idx >= 0 && !overwrite) return

    const existing = idx >= 0 ? shifts[idx] : null
    const row = buildFactualRow(employeeId, entry, existing, createdBy)

    if (idx >= 0) {
      shifts[idx] = row
    } else {
      shifts.push(row)
    }
  })

  writeShifts(shifts)
  return entries.length
}
