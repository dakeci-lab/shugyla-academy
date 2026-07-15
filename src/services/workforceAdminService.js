import { supabase } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
import { normalizeEmployee } from '../utils/employeeData'
import { normalizeShift } from '../utils/shiftData'

const APP_TIMEZONE = 'Asia/Almaty'

const ERROR_MESSAGES = {
  forbidden: 'Нет доступа',
  inactiveCaller: 'У вас нет прав для выполнения этого действия',
  unauthorized: 'Сессия истекла. Войдите в аккаунт заново',
  validation: 'Проверьте параметры запроса',
  default: 'Не удалось загрузить данные',
}

function extractFunctionError(error) {
  const contextBody = error?.context?.json ?? error?.context?.body
  if (contextBody && typeof contextBody === 'object') {
    return contextBody
  }
  return null
}

function mapWorkforceError(errorBody, fallbackMessage = ERROR_MESSAGES.default) {
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
    code === 'forbidden_field' ||
    code === 'invalid_date_range' ||
    code === 'invalid_timezone' ||
    code === 'invalid_view'
  ) {
    return ERROR_MESSAGES.validation
  }
  if (code === 'internal_error') {
    return ERROR_MESSAGES.default
  }
  return fallbackMessage
}

async function ensureCloudSession() {
  if (!isCloudMode() || !supabase) {
    throw new Error('Доступно только в облачном режиме')
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData?.session?.access_token) {
    throw new Error(ERROR_MESSAGES.unauthorized)
  }
}

function workforceEmployeeToUi(row) {
  return normalizeEmployee({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: row.full_name,
    role: row.role,
    roleId: row.role_id,
    position: row.position,
    employmentStatus: row.status,
    avatarUrl: row.avatar_url,
  })
}

function workforceShiftToUi(row) {
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
  })
}

export function monthToDateRange(year, month) {
  const lastDay = new Date(year, month, 0).getDate()
  const monthPart = String(month).padStart(2, '0')
  return {
    dateFrom: `${year}-${monthPart}-01`,
    dateTo: `${year}-${monthPart}-${String(lastDay).padStart(2, '0')}`,
  }
}

/**
 * Cloud-only team workforce bundle via admin-team-workforce-data Edge Function.
 *
 * @param {{ dateFrom: string, dateTo: string, view: 'dashboard'|'schedule'|'rating' }} params
 */
export async function fetchTeamWorkforceData({ dateFrom, dateTo, view }) {
  await ensureCloudSession()

  const { data, error } = await supabase.functions.invoke('admin-team-workforce-data', {
    body: {
      date_from: dateFrom,
      date_to: dateTo,
      view,
      timezone: APP_TIMEZONE,
    },
  })

  if (error) {
    const mapped = mapWorkforceError(extractFunctionError(error), ERROR_MESSAGES.default)
    throw new Error(mapped)
  }

  if (!data?.ok || !Array.isArray(data.employees) || !Array.isArray(data.shifts)) {
    throw new Error(mapWorkforceError(data, ERROR_MESSAGES.default))
  }

  return {
    employees: data.employees.map(workforceEmployeeToUi),
    shifts: data.shifts.map(workforceShiftToUi),
    teamScope: data.team_scope === true,
  }
}

export async function fetchTeamWorkforceForMonth(year, month, view) {
  const { dateFrom, dateTo } = monthToDateRange(year, month)
  return fetchTeamWorkforceData({ dateFrom, dateTo, view })
}
