import {
  computeEarlyLeaveMinutesFromTimes,
  computeLateMinutesFromTimes,
  computeWorkedMinutesFromTimes,
  isWorkingShiftStatus,
} from './shiftData'
import { deriveTrackerStatus } from './shiftWorkWindow'

/**
 * Shared monthly work summary for payroll + employee profile.
 *
 * Planned = working schedule rows with shift_date inside the selected month.
 * Worked  = same rows completed in the time tracker (check-in + check-out).
 * Night shifts count once by local start date (shift_date).
 *
 * Keep this module free of salaryPayroll imports to avoid circular deps.
 */

function pad2(value) {
  return String(value).padStart(2, '0')
}

export function toMonthlyWorkDateKey(value) {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/)
    return match ? match[1] : null
  }
  return null
}

export function getMonthlyWorkMonthBounds(year, month) {
  const y = Number(year)
  const m = Number(month)
  const start = `${y}-${pad2(m)}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${y}-${pad2(m)}-${pad2(lastDay)}`
  return { start, end }
}

export function getEmployeeShiftDateKey(shift) {
  return toMonthlyWorkDateKey(shift?.shiftDate ?? shift?.shift_date)
}

/** Strict calendar month — never include adjacent pad days from the schedule grid. */
export function filterShiftsToCalendarMonth(shifts, year, month) {
  if (!Number.isFinite(Number(year)) || !Number.isFinite(Number(month))) {
    return Array.isArray(shifts) ? [...shifts] : []
  }
  const { start, end } = getMonthlyWorkMonthBounds(year, month)
  return (shifts || []).filter((shift) => {
    const dateKey = getEmployeeShiftDateKey(shift)
    return Boolean(dateKey && dateKey >= start && dateKey <= end)
  })
}

export function isMonthlyWorkCompletedShift(shift) {
  if (!isWorkingShiftStatus(shift?.status)) return false
  return deriveTrackerStatus(shift) === 'completed'
}

/**
 * Post-termination schedule rows must not pay out.
 * Do NOT clip by hiredAt: hiredAt often fell back to created_at and dropped
 * real early-month schedule rows from payroll while the profile still counted them.
 */
export function isShiftEligibleForMonthlyWork(shift, employee = null) {
  const shiftDate = getEmployeeShiftDateKey(shift)
  if (!shiftDate) return false
  if (!employee) return true

  const terminatedAt = toMonthlyWorkDateKey(employee?.terminatedAt ?? employee?.terminated_at)
  if (terminatedAt && shiftDate > terminatedAt) return false
  return true
}

/**
 * @returns {{
 *   plannedShifts: number,
 *   workedShifts: number,
 *   workedMinutes: number,
 *   workedHours: number,
 *   lateCount: number,
 *   earlyLeaveCount: number,
 *   assigned: number,
 *   completed: number,
 * }}
 */
export function summarizeEmployeeMonthlyWork(
  shifts = [],
  { year = null, month = null, employee = null } = {},
) {
  const scoped =
    year != null && month != null
      ? filterShiftsToCalendarMonth(shifts, year, month)
      : Array.isArray(shifts)
        ? shifts
        : []

  let plannedShifts = 0
  let workedShifts = 0
  let workedMinutes = 0
  let lateCount = 0
  let earlyLeaveCount = 0

  for (const shift of scoped) {
    if (!isShiftEligibleForMonthlyWork(shift, employee)) continue
    if (!isWorkingShiftStatus(shift?.status)) continue

    plannedShifts += 1

    if (isMonthlyWorkCompletedShift(shift)) {
      workedShifts += 1
      workedMinutes += computeWorkedMinutesFromTimes(shift)
    }

    if (computeLateMinutesFromTimes(shift) > 0) lateCount += 1
    if (computeEarlyLeaveMinutesFromTimes(shift) > 0) earlyLeaveCount += 1
  }

  return {
    plannedShifts,
    workedShifts,
    workedMinutes,
    workedHours: Math.round((workedMinutes / 60) * 10) / 10,
    lateCount,
    earlyLeaveCount,
    assigned: plannedShifts,
    completed: workedShifts,
  }
}

/**
 * Batch Map<employeeId, summary> for payroll (one pass, no N+1).
 */
export function buildMonthlyWorkSummaryByEmployee(
  shifts = [],
  { year, month, employeesById = null } = {},
) {
  const monthScoped = filterShiftsToCalendarMonth(shifts, year, month)
  const byEmployee = new Map()
  for (const shift of monthScoped) {
    const id = Number(shift?.employeeId ?? shift?.employee_id)
    if (!Number.isFinite(id)) continue
    if (!byEmployee.has(id)) byEmployee.set(id, [])
    byEmployee.get(id).push(shift)
  }

  const stats = new Map()
  for (const [id, list] of byEmployee) {
    const employee = employeesById
      ? employeesById.get(id) ?? employeesById.get(String(id)) ?? null
      : null
    // Already month-filtered; pass year/month null to avoid double filter cost.
    stats.set(id, summarizeEmployeeMonthlyWork(list, { employee }))
  }
  return stats
}
