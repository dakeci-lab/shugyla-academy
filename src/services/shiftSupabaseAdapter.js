import { supabase } from '../lib/supabaseClient'
import { normalizeShift } from '../utils/shiftData'

const ERROR_MESSAGES = {
  forbidden: 'Нет доступа',
  inactiveCaller: 'У вас нет прав для выполнения этого действия',
  unauthorized: 'Сессия истекла. Войдите в аккаунт заново',
  validation: 'Проверьте параметры графика',
  default: 'Не удалось сохранить график',
}

function extractFunctionError(error) {
  const contextBody = error?.context?.json ?? error?.context?.body
  if (contextBody && typeof contextBody === 'object') return contextBody
  return null
}

function mapScheduleWriteError(errorBody, fallbackMessage = ERROR_MESSAGES.default) {
  const code = errorBody?.code ?? errorBody?.error?.code

  if (code === 'forbidden' || code === 'inactive_caller') {
    return ERROR_MESSAGES.forbidden
  }
  if (code === 'unauthorized') {
    return ERROR_MESSAGES.unauthorized
  }
  if (
    code === 'validation_error' ||
    code === 'malformed_json' ||
    code === 'forbidden_field'
  ) {
    return ERROR_MESSAGES.validation
  }
  return fallbackMessage
}

async function invokeScheduleWrite(body) {
  const { data, error } = await supabase.functions.invoke('admin-manage-employee-schedule', {
    body,
  })

  if (error) {
    const mapped = mapScheduleWriteError(extractFunctionError(error))
    throw new Error(mapped)
  }

  if (!data?.ok) {
    throw new Error(mapScheduleWriteError(data))
  }

  return data
}

function payloadToApiShift(payload) {
  return {
    shift_date: payload.shiftDate,
    status: payload.status,
    planned_start_time: payload.plannedStartTime ?? null,
    planned_end_time: payload.plannedEndTime ?? null,
    planned_break_start: payload.plannedBreakStart ?? null,
    planned_break_end: payload.plannedBreakEnd ?? null,
    actual_start_time: payload.actualStartTime ?? null,
    actual_end_time: payload.actualEndTime ?? null,
    actual_break_start: payload.actualBreakStart ?? null,
    actual_break_end: payload.actualBreakEnd ?? null,
    comment: payload.comment ?? '',
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
    work_location_id: row.work_location_id,
  })
}

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
  void createdBy
  const data = await invokeScheduleWrite({
    action: 'upsert_shift',
    employee_id: Number(employeeId),
    shift: payloadToApiShift(payload),
  })
  return rowToShift(data.shift)
}

export async function bulkApplyEmployeeShifts(
  employeeId,
  entries,
  { overwrite = false, createdBy = null } = {}
) {
  void createdBy
  if (!entries.length) return 0

  const data = await invokeScheduleWrite({
    action: 'bulk_upsert_shifts',
    employee_id: Number(employeeId),
    overwrite,
    shifts: entries.map(payloadToApiShift),
  })

  return data.applied ?? 0
}
