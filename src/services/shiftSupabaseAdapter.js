import { supabase } from '../lib/supabaseClient'
import { normalizeShift, SHIFT_ATTENDANCE_DEFAULTS } from '../utils/shiftData'

async function throwIfError(result, context) {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`)
  }
  return result.data
}

function getMonthRange(year, month) {
  const lastDay = new Date(year, month, 0).getDate()
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

function rowToShift(row) {
  return normalizeShift({
    id: row.id,
    employee_id: row.employee_id,
    shift_date: row.shift_date,
    status: row.status,
    planned_start_time: row.planned_start_time,
    planned_end_time: row.planned_end_time,
    planned_break_start: row.planned_break_start,
    planned_break_end: row.planned_break_end,
    actual_start_time: row.actual_start_time,
    actual_end_time: row.actual_end_time,
    actual_break_start: row.actual_break_start,
    actual_break_end: row.actual_break_end,
    comment: row.comment,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    check_in_latitude: row.check_in_latitude,
    check_in_longitude: row.check_in_longitude,
    check_in_accuracy: row.check_in_accuracy,
    check_out_latitude: row.check_out_latitude,
    check_out_longitude: row.check_out_longitude,
    check_out_accuracy: row.check_out_accuracy,
    late_minutes: row.late_minutes,
    early_leave_minutes: row.early_leave_minutes,
    worked_minutes: row.worked_minutes,
    missing_check_in: row.missing_check_in,
    missing_check_out: row.missing_check_out,
    attendance_status: row.attendance_status,
    work_location_id: row.work_location_id,
  })
}

function pickExistingValue(payloadValue, existingValue, defaultValue) {
  if (payloadValue !== undefined) return payloadValue
  if (existingValue !== undefined && existingValue !== null) return existingValue
  return defaultValue
}

function payloadToRow(employeeId, payload, createdBy = null, existing = null) {
  const defaults = SHIFT_ATTENDANCE_DEFAULTS

  return {
    employee_id: employeeId,
    shift_date: payload.shiftDate,
    status: payload.status,
    planned_start_time: payload.plannedStartTime,
    planned_end_time: payload.plannedEndTime,
    planned_break_start: pickExistingValue(
      payload.plannedBreakStart,
      existing?.planned_break_start,
      null
    ),
    planned_break_end: pickExistingValue(payload.plannedBreakEnd, existing?.planned_break_end, null),
    actual_start_time: pickExistingValue(
      payload.actualStartTime,
      existing?.actual_start_time,
      null
    ),
    actual_end_time: pickExistingValue(payload.actualEndTime, existing?.actual_end_time, null),
    actual_break_start: pickExistingValue(
      payload.actualBreakStart,
      existing?.actual_break_start,
      null
    ),
    actual_break_end: pickExistingValue(payload.actualBreakEnd, existing?.actual_break_end, null),
    comment: payload.comment ?? existing?.comment ?? '',
    created_by: existing?.created_by ?? createdBy,
    check_in_latitude: pickExistingValue(
      payload.checkInLatitude,
      existing?.check_in_latitude,
      null
    ),
    check_in_longitude: pickExistingValue(
      payload.checkInLongitude,
      existing?.check_in_longitude,
      null
    ),
    check_in_accuracy: pickExistingValue(payload.checkInAccuracy, existing?.check_in_accuracy, null),
    check_out_latitude: pickExistingValue(
      payload.checkOutLatitude,
      existing?.check_out_latitude,
      null
    ),
    check_out_longitude: pickExistingValue(
      payload.checkOutLongitude,
      existing?.check_out_longitude,
      null
    ),
    check_out_accuracy: pickExistingValue(
      payload.checkOutAccuracy,
      existing?.check_out_accuracy,
      null
    ),
    late_minutes: pickExistingValue(payload.lateMinutes, existing?.late_minutes, defaults.lateMinutes),
    early_leave_minutes: pickExistingValue(
      payload.earlyLeaveMinutes,
      existing?.early_leave_minutes,
      defaults.earlyLeaveMinutes
    ),
    worked_minutes: pickExistingValue(
      payload.workedMinutes,
      existing?.worked_minutes,
      defaults.workedMinutes
    ),
    missing_check_in: pickExistingValue(
      payload.missingCheckIn,
      existing?.missing_check_in,
      defaults.missingCheckIn
    ),
    missing_check_out: pickExistingValue(
      payload.missingCheckOut,
      existing?.missing_check_out,
      defaults.missingCheckOut
    ),
    attendance_status: pickExistingValue(
      payload.attendanceStatus,
      existing?.attendance_status,
      defaults.attendanceStatus
    ),
    work_location_id: pickExistingValue(payload.workLocationId, existing?.work_location_id, null),
  }
}

async function fetchExistingShiftsByDates(employeeId, dates) {
  if (!dates.length) return new Map()
  const rows = await throwIfError(
    await supabase
      .from('academy_employee_shifts')
      .select('*')
      .eq('employee_id', employeeId)
      .in('shift_date', dates),
    'Загрузка существующих смен'
  )
  return new Map(rows.map((row) => [row.shift_date, row]))
}

export async function getShiftsForEmployeeMonth(employeeId, year, month) {
  const { start, end } = getMonthRange(year, month)
  const rows = await throwIfError(
    await supabase
      .from('academy_employee_shifts')
      .select('*')
      .eq('employee_id', employeeId)
      .gte('shift_date', start)
      .lte('shift_date', end)
      .order('shift_date'),
    'Загрузка графика сотрудника'
  )
  return rows.map(rowToShift)
}

export async function getShiftsForMonth(year, month, employeeIds = null) {
  const { start, end } = getMonthRange(year, month)
  let query = supabase
    .from('academy_employee_shifts')
    .select('*')
    .gte('shift_date', start)
    .lte('shift_date', end)
    .order('shift_date')

  if (employeeIds?.length) {
    query = query.in('employee_id', employeeIds.map(Number))
  }

  const rows = await throwIfError(await query, 'Загрузка графика')
  return rows.map(rowToShift)
}

export async function upsertEmployeeShift(employeeId, payload, createdBy = null) {
  const existingMap = await fetchExistingShiftsByDates(employeeId, [payload.shiftDate])
  const existing = existingMap.get(payload.shiftDate) || null
  const row = payloadToRow(employeeId, payload, createdBy, existing)
  const inserted = await throwIfError(
    await supabase
      .from('academy_employee_shifts')
      .upsert(row, { onConflict: 'employee_id,shift_date' })
      .select()
      .single(),
    'Сохранение смены'
  )
  return rowToShift(inserted)
}

export async function bulkApplyEmployeeShifts(
  employeeId,
  entries,
  { overwrite = false, createdBy = null } = {}
) {
  if (!entries.length) return 0

  const dates = entries.map((entry) => entry.shiftDate)
  const existingMap = await fetchExistingShiftsByDates(employeeId, dates)

  if (!overwrite) {
    entries = entries.filter((entry) => !existingMap.has(entry.shiftDate))
  }

  if (!entries.length) return 0

  const rows = entries.map((entry) =>
    payloadToRow(employeeId, entry, createdBy, existingMap.get(entry.shiftDate) || null)
  )

  await throwIfError(
    await supabase
      .from('academy_employee_shifts')
      .upsert(rows, { onConflict: 'employee_id,shift_date' }),
    'Массовое сохранение графика'
  )

  return rows.length
}
