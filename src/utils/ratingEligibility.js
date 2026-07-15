import { RATING_STATUS } from './attendanceData'

export { RATING_STATUS, isShiftCompletedForRating, buildEmployeeRatingResult } from './attendanceData'

export function compareEligibleRatingRows(a, b) {
  const scoreDiff = (Number(b.totalPoints) || 0) - (Number(a.totalPoints) || 0)
  if (scoreDiff !== 0) return scoreDiff

  const completedDiff =
    (Number(b.completedShiftCount) || 0) - (Number(a.completedShiftCount) || 0)
  if (completedDiff !== 0) return completedDiff

  const nameA = a.employee?.name || ''
  const nameB = b.employee?.name || ''
  return nameA.localeCompare(nameB, 'ru')
}

export function compareInsufficientRatingRows(a, b) {
  const completedDiff =
    (Number(b.completedShiftCount) || 0) - (Number(a.completedShiftCount) || 0)
  if (completedDiff !== 0) return completedDiff

  const scoreDiff = (Number(b.totalPoints) || 0) - (Number(a.totalPoints) || 0)
  if (scoreDiff !== 0) return scoreDiff

  const nameA = a.employee?.name || ''
  const nameB = b.employee?.name || ''
  return nameA.localeCompare(nameB, 'ru')
}

export function buildRatingDisplayRows(employees, ratingsByEmployee) {
  const eligibleRows = []
  const insufficientRows = []
  let excludedNoScheduleCount = 0

  employees.forEach((employee) => {
    const rating = ratingsByEmployee.get(Number(employee.id))
    const stats = rating?.stats
    const ratingStatus = stats?.ratingStatus || RATING_STATUS.NO_SCHEDULE

    if (
      ratingStatus === RATING_STATUS.NO_SCHEDULE ||
      ratingStatus === RATING_STATUS.NO_COMPLETED
    ) {
      if (ratingStatus === RATING_STATUS.NO_SCHEDULE) {
        excludedNoScheduleCount += 1
      }
      return
    }

    const row = {
      employee,
      ...stats,
      totalPoints: stats.totalPoints,
      completedShiftCount: stats.completedShiftCount ?? 0,
      ratingStatus,
    }

    if (ratingStatus === RATING_STATUS.INSUFFICIENT_DATA) {
      insufficientRows.push(row)
      return
    }

    eligibleRows.push(row)
  })

  eligibleRows.sort(compareEligibleRatingRows)
  insufficientRows.sort(compareInsufficientRatingRows)

  const rankedEligibleRows = eligibleRows.map((row, index) => ({
    ...row,
    place: index + 1,
    showTopPlace: index < 3,
  }))

  const rankedInsufficientRows = insufficientRows.map((row) => ({
    ...row,
    place: null,
    showTopPlace: false,
  }))

  return {
    eligibleRows: rankedEligibleRows,
    insufficientRows: rankedInsufficientRows,
    excludedNoScheduleCount,
  }
}
