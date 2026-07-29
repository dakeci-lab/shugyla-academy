import { toEmployeeDateKey } from './employeeData'
import { getMonthlyWorkMonthBounds } from './employeeMonthlyWorkSummary'

/**
 * Employment-period helpers for employee schedule UI + save guards.
 * Compare calendar date keys (YYYY-MM-DD) only — never UTC Date math.
 */

export function getEmployeeEmploymentBounds(employee) {
  const hiredAt = toEmployeeDateKey(employee?.hiredAt ?? employee?.hired_at)
  const terminatedAt = toEmployeeDateKey(employee?.terminatedAt ?? employee?.terminated_at)
  return { hiredAt, terminatedAt }
}

/**
 * Whether a schedule date may be created/edited for this employee.
 * Inclusive: hire_date <= date <= termination_date (or open-ended if no termination).
 */
export function canEditEmployeeScheduleDate(employee, date) {
  const dateKey = toEmployeeDateKey(date)
  if (!dateKey) return false

  const { hiredAt, terminatedAt } = getEmployeeEmploymentBounds(employee)
  if (!hiredAt) return false
  if (dateKey < hiredAt) return false
  if (terminatedAt && dateKey > terminatedAt) return false
  return true
}

export function getEmployeeScheduleDateRestrictionReason(employee, date) {
  const dateKey = toEmployeeDateKey(date)
  if (!dateKey) return null

  const { hiredAt, terminatedAt } = getEmployeeEmploymentBounds(employee)
  if (!hiredAt) return 'Сотрудник ещё не был принят на работу'
  if (dateKey < hiredAt) return 'Сотрудник ещё не был принят на работу'
  if (terminatedAt && dateKey > terminatedAt) return 'Сотрудник уже уволен'
  return null
}

/** True when any day of the month overlaps the employment window. */
export function doesMonthOverlapEmployeeEmployment(employee, year, month) {
  const { hiredAt, terminatedAt } = getEmployeeEmploymentBounds(employee)
  if (!hiredAt) return false

  const { start, end } = getMonthlyWorkMonthBounds(year, month)
  if (hiredAt > end) return false
  if (terminatedAt && terminatedAt < start) return false
  return true
}

export function getMonthScheduleSetupDisabledReason(employee, year, month) {
  if (doesMonthOverlapEmployeeEmployment(employee, year, month)) return null

  const { hiredAt, terminatedAt } = getEmployeeEmploymentBounds(employee)
  if (!hiredAt) return 'Нет даты приёма — настройка графика недоступна'
  if (terminatedAt && terminatedAt < getMonthlyWorkMonthBounds(year, month).start) {
    return 'Сотрудник уже уволен в этом месяце'
  }
  return 'Сотрудник ещё не был принят на работу в этом месяце'
}

/** Keep only entries whose shiftDate is within employment period. */
export function filterScheduleEntriesToEmployment(employee, entries) {
  const list = Array.isArray(entries) ? entries : []
  const allowed = []
  const skipped = []
  for (const entry of list) {
    const dateKey = entry?.shiftDate ?? entry?.shift_date
    if (canEditEmployeeScheduleDate(employee, dateKey)) {
      allowed.push(entry)
    } else {
      skipped.push(entry)
    }
  }
  return { allowed, skipped }
}
