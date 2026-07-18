import { supabase } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
import { coalesceInFlight } from '../lib/requestCoalesce'
import { normalizeEmployee } from '../utils/employeeData'
import {
  extractFunctionErrorBody,
  isGenericInvokeErrorMessage,
} from '../utils/edgeFunctionErrors'

const ERROR_MESSAGES = {
  forbidden: 'У вас нет прав для просмотра сотрудников',
  editForbidden: 'У вас нет прав для редактирования сотрудников',
  inactiveCaller: 'У вас нет прав для выполнения этого действия',
  notFound: 'Сотрудник не найден',
  selfRole: 'Нельзя изменить собственную роль или статус',
  selfStatus: 'Нельзя изменить собственную роль или статус',
  lastAdmin: 'Нельзя уволить последнего администратора',
  validation: 'Проверьте заполненные поля',
  unauthorized: 'Сессия завершена. Войдите повторно',
  listDefault: 'Не удалось загрузить список сотрудников',
  updateDefault: 'Не удалось сохранить изменения',
}

export class EmployeeAdminError extends Error {
  constructor(message, code = 'internal_error') {
    super(message)
    this.name = 'EmployeeAdminError'
    this.code = code
  }
}

function mapAdminError(errorBody, fallbackMessage, { edit = false } = {}) {
  const code = errorBody?.code ?? errorBody?.error?.code

  if (code === 'forbidden' || code === 'inactive_caller') {
    return {
      code: code || 'forbidden',
      message: edit ? ERROR_MESSAGES.editForbidden : ERROR_MESSAGES.forbidden,
    }
  }
  if (code === 'unauthorized') {
    return { code: 'unauthorized', message: ERROR_MESSAGES.unauthorized }
  }
  if (code === 'employee_not_found') {
    return { code: 'employee_not_found', message: ERROR_MESSAGES.notFound }
  }
  if (code === 'self_role_change_forbidden' || code === 'self_status_change_forbidden') {
    return { code, message: ERROR_MESSAGES.selfRole }
  }
  if (code === 'last_admin_protected') {
    return { code, message: ERROR_MESSAGES.lastAdmin }
  }
  if (
    code === 'validation_error' ||
    code === 'malformed_json' ||
    code === 'forbidden_field' ||
    code === 'invalid_role' ||
    code === 'invalid_status' ||
    code === 'invalid_pagination' ||
    code === 'invalid_sort'
  ) {
    return {
      code: code || 'validation_error',
      message: ERROR_MESSAGES.validation,
    }
  }
  if (code === 'internal_error') {
    return {
      code: 'internal_error',
      message: edit ? ERROR_MESSAGES.updateDefault : ERROR_MESSAGES.listDefault,
    }
  }
  return {
    code: code || 'internal_error',
    message: fallbackMessage || (edit ? ERROR_MESSAGES.updateDefault : ERROR_MESSAGES.listDefault),
  }
}

function throwMappedAdminError(errorBody, fallbackMessage, options) {
  const mapped = mapAdminError(errorBody, fallbackMessage, options)
  throw new EmployeeAdminError(mapped.message, mapped.code)
}

function serverEmployeeToUi(row) {
  return normalizeEmployee({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: row.full_name,
    login: row.login,
    role: row.role,
    roleId: row.role_id,
    position: row.position,
    employmentStatus: row.status,
    avatarUrl: row.avatar_url,
    hiredAt: row.hired_at,
    terminatedAt: row.terminated_at,
    workMode: row.work_mode,
    salaryCalculationType: row.salary_calculation_type,
    createdAt: row.created_at,
    authLinked: row.auth_linked === true,
  })
}

async function ensureCloudSession() {
  if (!isCloudMode() || !supabase) {
    throw new EmployeeAdminError('Доступно только в облачном режиме', 'unavailable')
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData?.session?.access_token) {
    throw new EmployeeAdminError(ERROR_MESSAGES.unauthorized, 'unauthorized')
  }

  return sessionData.session.user?.id || 'session'
}

/**
 * Cloud-only: paginated employee list via admin-list-employees Edge Function.
 * Concurrent identical requests share one in-flight invoke.
 */
export async function listEmployeesForAdmin(options = {}) {
  const sessionUserId = await ensureCloudSession()

  const body = {
    page: options.page ?? 1,
    page_size: options.pageSize ?? 50,
    search: options.search?.trim() || undefined,
    status: options.status ?? undefined,
    role_id: options.roleId ?? undefined,
    sort_by: options.sortBy ?? 'full_name',
    sort_direction: options.sortDirection ?? 'asc',
    employee_id: options.employeeId != null ? Number(options.employeeId) : undefined,
  }

  const coalesceKey = `admin-list-employees:${sessionUserId}:${JSON.stringify(body)}`

  return coalesceInFlight(coalesceKey, async () => {
    const { data, error } = await supabase.functions.invoke('admin-list-employees', { body })

    if (error) {
      const contextBody = await extractFunctionErrorBody(error)
      const fallback = isGenericInvokeErrorMessage(error.message)
        ? ERROR_MESSAGES.listDefault
        : error.message
      throwMappedAdminError(contextBody, fallback)
    }

    if (!data?.ok || !Array.isArray(data.employees)) {
      throwMappedAdminError(data, ERROR_MESSAGES.listDefault)
    }

    return {
      employees: data.employees.map(serverEmployeeToUi),
      pagination: data.pagination ?? {
        page: body.page,
        page_size: body.page_size,
        total: data.employees.length,
        total_pages: 1,
      },
    }
  })
}

function isLegacyEmployeeIdRejection(error) {
  return (
    error instanceof EmployeeAdminError &&
    (error.code === 'forbidden_field' || error.code === 'validation_error')
  )
}

/**
 * Cloud-only: load one employee for admin profile (employees.view).
 * Primary path: exact employee_id lookup.
 *
 * Temporary fallback: search by name/login hint when the deployed Edge Function
 * still rejects the employee_id body key (pre-redeploy compatibility).
 * Auth errors (401/403) are never masked by the fallback.
 */
export async function getEmployeeForAdmin(employeeId, { searchHint = '', allowSearchFallback = true } = {}) {
  const normalizedId = Number(employeeId)
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    throw new EmployeeAdminError(ERROR_MESSAGES.notFound, 'employee_not_found')
  }

  try {
    const byId = await listEmployeesForAdmin({
      page: 1,
      pageSize: 1,
      status: 'all',
      employeeId: normalizedId,
    })
    const exact = byId.employees.find((row) => Number(row.id) === normalizedId)
    if (exact) return exact
    throw new EmployeeAdminError(ERROR_MESSAGES.notFound, 'employee_not_found')
  } catch (error) {
    if (
      error instanceof EmployeeAdminError &&
      (error.code === 'unauthorized' ||
        error.code === 'forbidden' ||
        error.code === 'inactive_caller' ||
        error.code === 'employee_not_found')
    ) {
      throw error
    }

    if (!allowSearchFallback || !isLegacyEmployeeIdRejection(error)) {
      throw error
    }

    // Without a search hint the temporary fallback cannot run safely.
    const hint = String(searchHint || '').trim()
    if (!hint) {
      throw error
    }
  }

  // Temporary fallback for older admin-list-employees builds without employee_id support.
  const hint = String(searchHint || '').trim()
  if (!hint) {
    throw new EmployeeAdminError(ERROR_MESSAGES.notFound, 'employee_not_found')
  }

  const bySearch = await listEmployeesForAdmin({
    page: 1,
    pageSize: 50,
    status: 'all',
    search: hint,
  })

  const matched = bySearch.employees.find((row) => Number(row.id) === normalizedId)
  if (!matched) {
    throw new EmployeeAdminError(ERROR_MESSAGES.notFound, 'employee_not_found')
  }
  return matched
}

/**
 * Cloud-only: update employee via admin-update-employee Edge Function.
 */
export async function updateEmployeeAsAdmin(employeeId, changes) {
  await ensureCloudSession()

  const payloadChanges = {}
  if (changes.firstName != null) payloadChanges.first_name = changes.firstName
  if (changes.lastName != null) payloadChanges.last_name = changes.lastName
  if (changes.position != null) payloadChanges.position = changes.position
  if (changes.avatarUrl !== undefined) payloadChanges.avatar_url = changes.avatarUrl
  if (changes.roleId != null) payloadChanges.role_id = changes.roleId
  if (changes.employmentStatus != null) payloadChanges.status = changes.employmentStatus
  if (changes.status != null) payloadChanges.status = changes.status
  if (changes.hiredAt !== undefined) payloadChanges.hired_at = changes.hiredAt
  if (changes.terminatedAt !== undefined) payloadChanges.terminated_at = changes.terminatedAt
  if (changes.workMode !== undefined) payloadChanges.work_mode = changes.workMode
  if (changes.salaryCalculationType !== undefined) {
    payloadChanges.salary_calculation_type = changes.salaryCalculationType
  }

  const { data, error } = await supabase.functions.invoke('admin-update-employee', {
    body: {
      employee_id: employeeId,
      changes: payloadChanges,
    },
  })

  if (error) {
    const contextBody = await extractFunctionErrorBody(error)
    const fallback = isGenericInvokeErrorMessage(error.message)
      ? ERROR_MESSAGES.updateDefault
      : error.message
    throwMappedAdminError(contextBody, fallback, { edit: true })
  }

  if (!data?.ok || !data?.employee) {
    throwMappedAdminError(data, ERROR_MESSAGES.updateDefault, { edit: true })
  }

  return serverEmployeeToUi(data.employee)
}
