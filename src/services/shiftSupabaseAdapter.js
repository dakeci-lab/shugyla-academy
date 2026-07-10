import { supabase } from '../lib/supabaseClient'
import { normalizeShift } from '../utils/shiftData'

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

function payloadToRow(employeeId, payload, createdBy = null) {
  return {
    employee_id: employeeId,
    shift_date: payload.shiftDate,
    status: payload.status,
    planned_start_time: payload.plannedStartTime,
    planned_end_time: payload.plannedEndTime,
    planned_break_start: payload.plannedBreakStart,
    planned_break_end: payload.plannedBreakEnd,
    actual_start_time: payload.actualStartTime,
    actual_end_time: payload.actualEndTime,
    actual_break_start: payload.actualBreakStart,
    actual_break_end: payload.actualBreakEnd,
    comment: payload.comment || '',
    created_by: createdBy,
    check_in_latitude: payload.checkInLatitude,
    check_in_longitude: payload.checkInLongitude,
    check_in_accuracy: payload.checkInAccuracy,
    check_out_latitude: payload.checkOutLatitude,
    check_out_longitude: payload.checkOutLongitude,
    check_out_accuracy: payload.checkOutAccuracy,
    late_minutes: payload.lateMinutes,
    early_leave_minutes: payload.earlyLeaveMinutes,
    worked_minutes: payload.workedMinutes,
    missing_check_in: payload.missingCheckIn,
    missing_check_out: payload.missingCheckOut,
    attendance_status: payload.attendanceStatus,
    work_location_id: payload.workLocationId,
  }
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
  const row = payloadToRow(employeeId, payload, createdBy)
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

  if (!overwrite) {
    const dates = entries.map((entry) => entry.shiftDate)
    const existing = await throwIfError(
      await supabase
        .from('academy_employee_shifts')
        .select('shift_date')
        .eq('employee_id', employeeId)
        .in('shift_date', dates),
      'Проверка существующих смен'
    )
    const existingDates = new Set(existing.map((row) => row.shift_date))
    entries = entries.filter((entry) => !existingDates.has(entry.shiftDate))
  }

  if (!entries.length) return 0

  const rows = entries.map((entry) =>
    payloadToRow(employeeId, entry, createdBy)
  )

  await throwIfError(
    await supabase
      .from('academy_employee_shifts')
      .upsert(rows, { onConflict: 'employee_id,shift_date' }),
    'Массовое сохранение графика'
  )

  return rows.length
}
