import { supabase } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
import { coalesceInFlight } from '../lib/requestCoalesce'
import { normalizeEmployee } from '../utils/employeeData'
import { normalizeShift } from '../utils/shiftData'
import {
  extractFunctionErrorBody,
  isGenericInvokeErrorMessage,
} from '../utils/edgeFunctionErrors'

const APP_TIMEZONE = 'Asia/Almaty'

const ERROR_MESSAGES = {
  forbidden: 'Нет доступа',
  inactiveCaller: 'У вас нет прав для выполнения этого действия',
  unauthorized: 'Сессия истекла. Войдите в аккаунт заново',
  validation: 'Проверьте параметры запроса',
  default: 'Не удалось загрузить данные',
}


async function resolveFunctionError(error, fallbackMessage = ERROR_MESSAGES.default) {
  const contextBody = await extractFunctionErrorBody(error)
  const fallback = isGenericInvokeErrorMessage(error?.message) ? fallbackMessage : error?.message
  return mapWorkforceError(contextBody, fallback)
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

  return sessionData.session.user?.id || 'session'
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
    hiredAt: row.hired_at,
    terminatedAt: row.terminated_at,
    createdAt: row.created_at,
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
 * Cloud-only Home dashboard summary (view=home-summary).
 * One selected day; employees limited to those with shifts that day.
 */
export async function fetchHomeWorkforceSummary(dateKey) {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error(ERROR_MESSAGES.validation)
  }
  return fetchTeamWorkforceData({
    dateFrom: dateKey,
    dateTo: dateKey,
    view: 'home-summary',
  })
}

/**
 * Cloud-only team workforce bundle via admin-team-workforce-data Edge Function.
 * Concurrent identical requests share one in-flight invoke.
 *
 * @param {{
 *   dateFrom: string,
 *   dateTo: string,
 *   view: 'dashboard'|'schedule'|'rating'|'home-summary',
 *   employeeId?: number|null,
 * }} params
 */
export async function fetchTeamWorkforceData({ dateFrom, dateTo, view, employeeId = null } = {}) {
  const sessionUserId = await ensureCloudSession()
  const normalizedEmployeeId =
    employeeId == null || employeeId === ''
      ? null
      : Number.isFinite(Number(employeeId))
        ? Number(employeeId)
        : null
  const coalesceKey = `admin-team-workforce-data:${sessionUserId}:${dateFrom}:${dateTo}:${view}:${normalizedEmployeeId ?? 'team'}`

  return coalesceInFlight(coalesceKey, async () => {
    const body = {
      date_from: dateFrom,
      date_to: dateTo,
      view,
      timezone: APP_TIMEZONE,
    }
    if (normalizedEmployeeId != null) {
      body.employee_id = normalizedEmployeeId
    }

    const { data, error } = await supabase.functions.invoke('admin-team-workforce-data', {
      body,
    })

    if (error) {
      throw new Error(await resolveFunctionError(error, ERROR_MESSAGES.default))
    }

    if (!data?.ok || !Array.isArray(data.employees) || !Array.isArray(data.shifts)) {
      throw new Error(mapWorkforceError(data, ERROR_MESSAGES.default))
    }

    return {
      employees: data.employees.map(workforceEmployeeToUi),
      shifts: data.shifts.map(workforceShiftToUi),
      teamScope: data.team_scope === true,
    }
  })
}

export async function fetchTeamWorkforceForMonth(year, month, view, employeeId = null) {
  const { dateFrom, dateTo } = monthToDateRange(year, month)
  return fetchTeamWorkforceData({ dateFrom, dateTo, view, employeeId })
}

/** Canonical workforce employee id (`academy_users.id`). */
export function normalizeWorkforceEmployeeId(value) {
  const id = Number(value)
  return Number.isFinite(id) ? id : null
}

/**
 * Resolve one employee and their shifts for a calendar month via workforce Edge Function.
 * Cloud-only; callers should fall back to local adapters when not in cloud mode.
 * Passes employee_id so the Edge Function scopes DB queries (not a full-team fetch).
 */
export async function fetchEmployeeWorkforceBundle(employeeId, year, month, view = 'schedule') {
  const normalizedId = normalizeWorkforceEmployeeId(employeeId)
  if (normalizedId == null) {
    return { employee: null, shifts: [], teamScope: false }
  }

  const bundle = await fetchTeamWorkforceForMonth(year, month, view, normalizedId)
  const employee = bundle.employees.find((row) => Number(row.id) === normalizedId) ?? null
  const shifts = bundle.shifts.filter((row) => Number(row.employeeId) === normalizedId)

  return {
    employee,
    shifts,
    teamScope: bundle.teamScope,
  }
}
