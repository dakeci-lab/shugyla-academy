import { isWorkingShiftStatus } from './shiftData'

/** Есть фактические данные посещаемости по смене */
export function hasShiftAttendanceHistory(shift) {
  if (!shift) return false

  if (shift.actualStartTime || shift.actualEndTime) return true
  if (shift.actual_start_time || shift.actual_end_time) return true
  if (shift.checkInLatitude != null || shift.check_in_latitude != null) return true
  if (shift.checkOutLatitude != null || shift.check_out_latitude != null) return true
  if (Number(shift.lateMinutes) > 0 || Number(shift.earlyLeaveMinutes) > 0) return true
  if (shift.missingCheckIn || shift.missingCheckOut) return true

  const code = shift.computedStatus?.code
  if (
    code === 'late' ||
    code === 'early_leave' ||
    code === 'missing_checkout' ||
    code === 'on_time' ||
    code === 'absence'
  ) {
    return true
  }

  return false
}

/** Попытка заменить рабочую смену с историей на выходной/удаление графика */
export function isDestructiveScheduleChange(existingShift, nextPayload) {
  if (!existingShift || !hasShiftAttendanceHistory(existingShift)) return false

  const wasWorking = isWorkingShiftStatus(existingShift.status)
  const willBeWorking = isWorkingShiftStatus(nextPayload?.status)

  if (wasWorking && !willBeWorking) return true

  return false
}

export function getDestructiveScheduleChangeMessage() {
  return 'По этой смене уже есть фактические данные (отметки прихода/ухода или посещаемость). Удаление или замена на выходной может повлиять на историю и рейтинг. Продолжить?'
}
