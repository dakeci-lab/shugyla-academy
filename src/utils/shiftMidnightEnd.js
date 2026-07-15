/**
 * Локальная обработка смен с окончанием в 00:00 (12:45–00:00).
 * Не меняет shiftData.js — только корректирует расчёт планового конца смены.
 */
import {
  buildEffectivePlannedEndAt,
  isShiftEndingAtMidnight,
} from './shiftWorkWindow'

export { isOvernightPlannedShift, isShiftEndingAtMidnight } from './shiftWorkWindow'

/** Плановое время окончания смены как Date (с учётом overnight/midnight) */
export function buildPlannedShiftEndDateTime(shift) {
  return buildEffectivePlannedEndAt(shift)
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
