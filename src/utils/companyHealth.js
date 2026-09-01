import { clampPercentScore, getMonthRange } from './attendanceData'
import { toDateKey, buildWeekDates } from './shiftData'

/** Цвет шкалы здоровья компании */
export function getCompanyHealthColor(score) {
  const value = clampPercentScore(score)
  if (value <= 30) return '#dc2626'
  if (value <= 60) return '#ea580c'
  if (value <= 80) return '#ca8a04'
  return '#059669'
}

export function filterShiftsByDate(shifts, dateKey) {
  return (shifts || []).filter((shift) => shift.shiftDate === dateKey)
}

export function filterShiftsByDateRange(shifts, startKey, endKey) {
  return (shifts || []).filter(
    (shift) => shift.shiftDate >= startKey && shift.shiftDate <= endKey
  )
}

export function filterShiftsByMonth(shifts, year, month) {
  const { start, end } = getMonthRange(year, month)
  return filterShiftsByDateRange(shifts, start, end)
}

export function getWeekDateKeys(weekStartKey) {
  return buildWeekDates(weekStartKey).map((date) => toDateKey(date))
}

export function getUniqueMonthsFromShifts(shifts) {
  const keys = new Set()
  ;(shifts || []).forEach((shift) => {
    const [year, month] = shift.shiftDate.split('-').map(Number)
    keys.add(`${year}-${month}`)
  })
  return [...keys].map((key) => {
    const [year, month] = key.split('-').map(Number)
    return { year, month }
  })
}

export async function fetchShiftsForDateKeys(getTeamShiftsForMonth, dateKeys, employeeIds) {
  const months = new Map()
  dateKeys.forEach((dateKey) => {
    const [year, month] = dateKey.split('-').map(Number)
    months.set(`${year}-${month}`, { year, month })
  })

  const results = await Promise.all(
    [...months.values()].map(({ year, month }) =>
      getTeamShiftsForMonth(year, month, employeeIds)
    )
  )

  const dateSet = new Set(dateKeys)
  return results.flat().filter((shift) => dateSet.has(shift.shiftDate))
}

export async function fetchShiftsForMonthRange(
  getTeamShiftsForMonth,
  year,
  month,
  employeeIds
) {
  return getTeamShiftsForMonth(year, month, employeeIds)
}
