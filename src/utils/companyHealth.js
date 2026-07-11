import {
  calculateShiftRatingEntries,
  clampRatingScore,
  getMonthRange,
} from './attendanceData'
import {
  computeShiftStatus,
  isWorkingShiftStatus,
  SHIFT_RESULT_CODE,
  toDateKey,
  buildWeekDates,
} from './shiftData'

/** Цвет шкалы здоровья компании */
export function getCompanyHealthColor(score) {
  const value = clampRatingScore(score)
  if (value <= 30) return '#dc2626'
  if (value <= 60) return '#ea580c'
  if (value <= 80) return '#ca8a04'
  return '#2a9d5c'
}

function hasRecordedCheckIn(shift) {
  return Boolean(shift?.actualStartTime)
}

function hasRecordedCheckOut(shift) {
  return Boolean(shift?.actualEndTime)
}

function getShiftDayScore(shift, settings, now) {
  const entries = calculateShiftRatingEntries(shift, settings, now)
  if (entries.length === 0) {
    const result = computeShiftStatus(shift, now)
    if (result?.code === SHIFT_RESULT_CODE.SCHEDULED) return 100
  }
  const points = entries.reduce((sum, entry) => sum + (Number(entry.points) || 0), 0)
  return clampRatingScore(100 + points)
}

function emptyStats() {
  return {
    scheduled: 0,
    workingNow: 0,
    late: 0,
    absent: 0,
    earlyLeave: 0,
    missingCheckIn: 0,
    missingCheckOut: 0,
    onTime: 0,
  }
}

/** Анализ одной рабочей смены для дашборда */
export function analyzeWorkingShift(shift, settings, now = new Date()) {
  if (!shift || !isWorkingShiftStatus(shift.status)) return null

  const result = computeShiftStatus(shift, now)
  const entries = calculateShiftRatingEntries(shift, settings, now)
  const dayScore = getShiftDayScore(shift, settings, now)
  const hasCheckIn = hasRecordedCheckIn(shift)
  const hasCheckOut = hasRecordedCheckOut(shift)

  const stats = {
    scheduled: 1,
    workingNow: hasCheckIn && !hasCheckOut ? 1 : 0,
    late: result?.code === SHIFT_RESULT_CODE.LATE ? 1 : 0,
    absent: result?.code === SHIFT_RESULT_CODE.ABSENCE ? 1 : 0,
    earlyLeave: result?.code === SHIFT_RESULT_CODE.EARLY_LEAVE ? 1 : 0,
    missingCheckIn: entries.some((e) => e.eventType === 'missing_check_in') ? 1 : 0,
    missingCheckOut: result?.code === SHIFT_RESULT_CODE.MISSING_CHECKOUT ? 1 : 0,
    onTime: result?.code === SHIFT_RESULT_CODE.ON_TIME ? 1 : 0,
  }

  return { shift, result, dayScore, stats }
}

function mergeStats(target, source) {
  Object.keys(source).forEach((key) => {
    target[key] += source[key] || 0
  })
}

/** Здоровье компании и сводка по набору смен */
export function computeCompanyHealthMetrics(shifts, settings, now = new Date()) {
  const workingShifts = (shifts || []).filter((shift) => isWorkingShiftStatus(shift.status))
  const stats = emptyStats()

  if (!workingShifts.length) {
    return { health: 100, stats, shiftCount: 0 }
  }

  let scoreSum = 0
  workingShifts.forEach((shift) => {
    const analysis = analyzeWorkingShift(shift, settings, now)
    if (!analysis) return
    scoreSum += analysis.dayScore
    mergeStats(stats, analysis.stats)
  })

  return {
    health: clampRatingScore(Math.round(scoreSum / workingShifts.length)),
    stats,
    shiftCount: workingShifts.length,
  }
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
