import { supabase } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
import { normalizeEmployee } from '../utils/employeeData'

const ERROR_MESSAGES = {
  forbidden: 'У вас нет прав для просмотра сотрудников',
  editForbidden: 'У вас нет прав для редактирования сотрудников',
  inactiveCaller: 'У вас нет прав для выполнения этого действия',
  notFound: 'Сотрудник не найден',
  selfRole: 'Нельзя изменить собственную роль или статус',
  selfStatus: 'Нельзя изменить собственную роль или статус',
  lastAdmin: 'Нельзя деактивировать последнего администратора',
  validation: 'Проверьте заполненные поля',
  unauthorized: 'Сессия истекла. Войдите в аккаунт заново',
  listDefault: 'Не удалось загрузить сотрудников',
  updateDefault: 'Не удалось сохранить изменения',
}

function mapAdminError(errorBody, fallbackMessage, { edit = false } = {}) {
  const code = errorBody?.code ?? errorBody?.error?.code

  if (code === 'forbidden' || code === 'inactive_caller') {
    return edit ? 'У вас нет прав для редактирования сотрудников' : ERROR_MESSAGES.forbidden
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

function extractFunctionError(error) {
  const contextBody = error?.context?.json ?? error?.context?.body
  if (contextBody && typeof contextBody === 'object') {
    return contextBody
  }
  return null
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
  }

  const { data, error } = await supabase.functions.invoke('admin-list-employees', { body })

  if (error) {
    throw new Error(mapAdminError(extractFunctionError(error), error.message))
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
    throw new Error(mapAdminError(extractFunctionError(error), error.message, { edit: true }))
  }

  if (!data?.ok || !data?.employee) {
    throw new Error(mapAdminError(data, ERROR_MESSAGES.updateDefault, { edit: true }))
  }

  return serverEmployeeToUi(data.employee)
}
