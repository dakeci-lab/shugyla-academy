import { summarizeEmployeeMonthlyWork } from './employeeMonthlyWorkSummary'

/**
 * Period stats for employee profile cards.
 * Uses the same monthly work aggregator as payroll («Отработано» / «Смены»).
 *
 * Pass `{ year, month }` so adjacent calendar-pad days are excluded.
 */
export function summarizeEmployeePeriod(shifts = [], options = {}) {
  const summary = summarizeEmployeeMonthlyWork(shifts, options)
  return {
    workedMinutes: summary.workedMinutes,
    workedHours: summary.workedHours,
    completedShifts: summary.workedShifts,
    plannedShifts: summary.plannedShifts,
    lateCount: summary.lateCount,
    earlyLeaveCount: summary.earlyLeaveCount,
  }
}

export function formatWorkedHoursLabel(hours) {
  if (hours == null || Number.isNaN(hours)) return '—'
  const rounded = Math.round(hours * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}
