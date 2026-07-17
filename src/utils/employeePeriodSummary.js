import {
  computeEarlyLeaveMinutesFromTimes,
  computeLateMinutesFromTimes,
  computeWorkedMinutesFromTimes,
  isWorkingShiftStatus,
} from './shiftData'

/**
 * Period stats from existing shift facts (same late/early/worked rules as schedule UI).
 * Incomplete shifts (no actual end) are excluded from worked hours and completed count.
 */
export function summarizeEmployeePeriod(shifts = []) {
  let workedMinutes = 0
  let completedShifts = 0
  let lateCount = 0
  let earlyLeaveCount = 0

  for (const shift of shifts) {
    if (!isWorkingShiftStatus(shift?.status)) continue

    const worked = computeWorkedMinutesFromTimes(shift)
    if (worked > 0) {
      workedMinutes += worked
      completedShifts += 1
    }

    if (computeLateMinutesFromTimes(shift) > 0) {
      lateCount += 1
    }
    if (computeEarlyLeaveMinutesFromTimes(shift) > 0) {
      earlyLeaveCount += 1
    }
  }

  return {
    workedMinutes,
    workedHours: Math.round((workedMinutes / 60) * 10) / 10,
    completedShifts,
    lateCount,
    earlyLeaveCount,
  }
}

export function formatWorkedHoursLabel(hours) {
  if (hours == null || Number.isNaN(hours)) return '—'
  const rounded = Math.round(hours * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}
