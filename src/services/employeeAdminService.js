import { supabase } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
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
  lastAdmin: 'Нельзя деактивировать последнего администратора',
  validation: 'Проверьте заполненные поля',
  unauthorized: 'Сессия завершена. Войдите повторно',
  listDefault: 'Не удалось загрузить список сотрудников',
  updateDefault: 'Не удалось сохранить изменения',
}

function mapAdminError(errorBody, fallbackMessage, { edit = false } = {}) {
  const code = errorBody?.code ?? errorBody?.error?.code

  if (code === 'forbidden' || code === 'inactive_caller') {
    return edit ? ERROR_MESSAGES.editForbidden : ERROR_MESSAGES.forbidden
  }
  if (code === 'unauthorized') return ERROR_MESSAGES.unauthorized
  if (code === 'employee_not_found') return ERROR_MESSAGES.notFound
  if (code === 'self_role_change_forbidden' || code === 'self_status_change_forbidden') {
    return ERROR_MESSAGES.selfRole
  }
  if (code === 'last_admin_protected') return ERROR_MESSAGES.lastAdmin
  if (
    code === 'validation_error' ||
    code === 'malformed_json' ||
    code === 'forbidden_field' ||
    code === 'invalid_role' ||
    code === 'invalid_status' ||
    code === 'invalid_pagination' ||
    code === 'invalid_sort'
  ) {
    return ERROR_MESSAGES.validation
  }
  if (code === 'internal_error') {
    return edit ? ERROR_MESSAGES.updateDefault : ERROR_MESSAGES.listDefault
  }
  return fallbackMessage || (edit ? ERROR_MESSAGES.updateDefault : ERROR_MESSAGES.listDefault)
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
    authLinked: row.auth_linked === true,
  })
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

/**
 * Cloud-only: paginated employee list via admin-list-employees Edge Function.
 */
export async function listEmployeesForAdmin(options = {}) {
  await ensureCloudSession()

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

  const { data, error } = await supabase.functions.invoke('admin-list-employees', { body })

  if (error) {
    const contextBody = await extractFunctionErrorBody(error)
    const fallback = isGenericInvokeErrorMessage(error.message)
      ? ERROR_MESSAGES.listDefault
      : error.message
    throw new Error(mapAdminError(contextBody, fallback))
  }

  if (!data?.ok || !Array.isArray(data.employees)) {
    throw new Error(mapAdminError(data, ERROR_MESSAGES.listDefault))
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
}

/**
 * Cloud-only: load one employee for admin profile (employees.view).
 * Prefers employee_id filter; falls back to search hint for older Edge Function builds.
 */
export async function getEmployeeForAdmin(employeeId, { searchHint = '' } = {}) {
  const normalizedId = Number(employeeId)
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    return null
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
  } catch {
    // Older admin-list-employees builds reject unknown employee_id.
  }

  const hint = String(searchHint || '').trim()
  if (!hint) return null

  const bySearch = await listEmployeesForAdmin({
    page: 1,
    pageSize: 50,
    status: 'all',
    search: hint,
  })

  return bySearch.employees.find((row) => Number(row.id) === normalizedId) ?? null
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
    throw new Error(mapAdminError(contextBody, fallback, { edit: true }))
  }

  if (!data?.ok || !data?.employee) {
    throw new Error(mapAdminError(data, ERROR_MESSAGES.updateDefault, { edit: true }))
  }

  return serverEmployeeToUi(data.employee)
}
