import { normalizeShift } from '../utils/shiftData'
import { getEmployeeById } from '../utils/employeeData'
import { canEditEmployeeScheduleDate } from '../utils/employeeSchedulePeriod'

const STORAGE_KEY = 'shugyla_employee_shifts'

function assertWithinEmployment(employeeId, dateKey) {
  const employee = getEmployeeById(Number(employeeId))
  if (!employee) return
  if (!canEditEmployeeScheduleDate(employee, dateKey)) {
    throw new Error('shift_outside_employment')
  }
}

/** Mirror Edge hasShiftAttendanceHistory on raw localStorage rows. */
function rowHasAttendanceHistory(row) {
  if (!row) return false
  if (row.actual_start_time || row.actual_end_time) return true
  if (row.check_in_latitude != null || row.check_out_latitude != null) return true
  return false
}

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
  return getShiftsForEmployeeDateRange(employeeId, start, end)
}

export function getShiftsForEmployeeDateRange(employeeId, dateFrom, dateTo) {
  return readShifts()
    .filter((row) => row.employee_id === employeeId && inDateRange(row.shift_date, dateFrom, dateTo))
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
  assertWithinEmployment(employeeId, payload.shiftDate)
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
  let applied = 0

  entries.forEach((entry) => {
    if (!canEditEmployeeScheduleDate(getEmployeeById(Number(employeeId)), entry.shiftDate)) {
      return
    }
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
    applied += 1
  })

  writeShifts(shifts)
  return applied
}

/** Delete plan row → calendar «Нет смены». Rejects shifts with attendance. */
export async function deleteEmployeeShift(employeeId, shiftDate) {
  assertWithinEmployment(employeeId, shiftDate)
  const shifts = readShifts()
  const idx = shifts.findIndex(
    (row) => Number(row.employee_id) === Number(employeeId) && row.shift_date === shiftDate
  )
  if (idx < 0) {
    return { deleted: false, shiftDate }
  }

  const existing = shifts[idx]
  if (rowHasAttendanceHistory(existing)) {
    throw new Error('По этой смене уже есть фактические данные. Удаление запрещено.')
  }

  shifts.splice(idx, 1)
  writeShifts(shifts)
  return { deleted: true, shiftDate }
}

/**
 * After termination: remove plan rows with shift_date > terminatedAt and no attendance.
 * Idempotent. Does not touch days on/before termination.
 */
export async function clearEmployeeShiftsAfterTermination(employeeId, terminatedAt) {
  return clearEmployeeShiftsFromDate(employeeId, terminatedAt, { inclusive: false })
}

/**
 * Clear plan rows from fromDate without attendance.
 * inclusive true → shift_date >= fromDate; false → shift_date > fromDate.
 * Does not gate on terminated_at (repair for terminated staff).
 */
export async function clearEmployeeShiftsFromDate(
  employeeId,
  fromDate,
  { inclusive = true } = {}
) {
  const fromKey = String(fromDate || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromKey)) {
    return { deleted: 0, retainedWithAttendance: 0 }
  }

  const shifts = readShifts()
  let deleted = 0
  let retainedWithAttendance = 0
  const next = []

  for (const row of shifts) {
    if (Number(row.employee_id) !== Number(employeeId)) {
      next.push(row)
      continue
    }
    const dateKey = String(row.shift_date)
    const beforeFrom = inclusive ? dateKey < fromKey : dateKey <= fromKey
    if (beforeFrom) {
      next.push(row)
      continue
    }
    if (rowHasAttendanceHistory(row)) {
      retainedWithAttendance += 1
      next.push(row)
      continue
    }
    deleted += 1
  }

  writeShifts(next)
  return { deleted, retainedWithAttendance }
}
