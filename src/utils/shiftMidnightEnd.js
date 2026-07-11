/**
 * Локальная обработка смен с окончанием в 00:00 (12:45–00:00).
 * Не меняет shiftData.js — только корректирует расчёт планового конца смены.
 */
import { formatTimeValue } from './shiftData'
import { addDaysToDateKey } from './timezone'

/** Смена заканчивается в полночь следующего дня (не в 00:00 того же дня) */
export function isShiftEndingAtMidnight(plannedStartTime, plannedEndTime) {
  const end = formatTimeValue(plannedEndTime)
  const start = formatTimeValue(plannedStartTime)
  return end === '00:00' && Boolean(start) && start !== '00:00'
}

/** Плановое время окончания смены как Date (с учётом 00:00 → следующий день) */
export function buildPlannedShiftEndDateTime(shift) {
  if (!shift?.shiftDate) return null
  const endTime = formatTimeValue(shift.plannedEndTime)
  if (!endTime) return null

  let dateKey = shift.shiftDate
  if (isShiftEndingAtMidnight(shift.plannedStartTime, shift.plannedEndTime)) {
    dateKey = addDaysToDateKey(shift.shiftDate, 1)
  }

  const [year, month, day] = dateKey.split('-').map(Number)
  const [hours, minutes] = endTime.split(':').map(Number)
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Наступило ли плановое окончание смены */
export function isShiftPlannedEndReached(shift, now = new Date()) {
  const plannedEnd = buildPlannedShiftEndDateTime(shift)
  if (!plannedEnd) return false
  return now.getTime() >= plannedEnd.getTime()
}

/** Ложное «Отсутствие» из computeShiftStatus для смен 00:00 до реального конца */
export function isFalseMidnightAbsence(shift, computedCode, now = new Date()) {
  if (computedCode !== 'absence') return false
  if (!isShiftEndingAtMidnight(shift?.plannedStartTime, shift?.plannedEndTime)) return false
  return !isShiftPlannedEndReached(shift, now)
}
