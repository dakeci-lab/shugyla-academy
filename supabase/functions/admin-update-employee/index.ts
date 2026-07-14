import '@supabase/functions-js/edge-runtime.d.ts'
import {
  authorizeEmployeeAdmin,
  adminErrorResponse,
  canEmployeeLogin,
  countActiveUsersWithPermission,
  roleHasPermissionCode,
} from '../_shared/employeeAuthorization.ts'
import {
  ALLOWED_STATUSES,
  MAX_AVATAR_URL_LENGTH,
  MAX_NAME_LENGTH,
  SAFE_EMPLOYEE_SELECT,
  buildFullName,
  mapSafeEmployee,
  type DbEmployeeRow,
} from '../_shared/employeeFields.ts'
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'

const PERMISSION_EDIT = 'employees.edit'

const ALLOWED_CHANGE_KEYS = new Set([
  'first_name',
  'last_name',
  'position',
  'avatar_url',
  'role_id',
  'status',
])

const FORBIDDEN_CHANGE_KEYS = new Set([
  'login',
  'phone',
  'email',
  'password',
  'temporary_password',
  'auth_user_id',
  'role',
  'id',
  'full_name',
  'created_at',
  'updated_at',
  'permissions',
  'metadata',
  'user_metadata',
  'app_metadata',
])

function parseEmployeeId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim())
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse()
  }

  if (req.method !== 'POST') {
    return adminErrorResponse('method_not_allowed', 405)
  }

  let payload: Record<string, unknown>
  try {
    payload = (await req.json()) as Record<string, unknown>
  } catch {
    return adminErrorResponse('malformed_json', 400)
  }

  const employeeId = parseEmployeeId(payload.employee_id)
  if (!employeeId) {
    return adminErrorResponse('validation_error', 422)
  }

  const changesRaw = payload.changes
  if (!changesRaw || typeof changesRaw !== 'object' || Array.isArray(changesRaw)) {
    return adminErrorResponse('validation_error', 422)
  }

  const changes = changesRaw as Record<string, unknown>
  const changeKeys = Object.keys(changes)
  if (changeKeys.length === 0) {
    return adminErrorResponse('validation_error', 422)
  }

  for (const key of changeKeys) {
    if (FORBIDDEN_CHANGE_KEYS.has(key)) {
      return adminErrorResponse('forbidden_field', 422)
    }
    if (!ALLOWED_CHANGE_KEYS.has(key)) {
      return adminErrorResponse('forbidden_field', 422)
    }
  }

  const authResult = await authorizeEmployeeAdmin(req, PERMISSION_EDIT)
  if (authResult instanceof Response) return authResult

  const { serviceClient, caller } = authResult

  const { data: target, error: targetError } = await serviceClient
    .from('academy_users')
    .select('id, status, role, role_id, auth_user_id, login, password, first_name, last_name')
    .eq('id', employeeId)
    .maybeSingle()

  if (targetError) {
    console.error('admin_update_target_lookup_failed', { category: targetError.message })
    return adminErrorResponse('internal_error', 500)
  }

  if (!target) {
    return adminErrorResponse('employee_not_found', 404)
  }

  const isSelf = caller.id === target.id

  if (isSelf && 'role_id' in changes) {
    return adminErrorResponse('self_role_change_forbidden', 409)
  }

  if (isSelf && 'status' in changes) {
    return adminErrorResponse('self_status_change_forbidden', 409)
  }

  const patch: Record<string, unknown> = {}

  if ('first_name' in changes) {
    if (typeof changes.first_name !== 'string' || !changes.first_name.trim()) {
      return adminErrorResponse('validation_error', 422)
    }
    patch.first_name = changes.first_name.trim().slice(0, MAX_NAME_LENGTH)
  }

  if ('last_name' in changes) {
    if (typeof changes.last_name !== 'string') {
      return adminErrorResponse('validation_error', 422)
    }
    patch.last_name = changes.last_name.trim().slice(0, MAX_NAME_LENGTH)
  }

  if ('first_name' in changes || 'last_name' in changes) {
    const firstName =
      typeof patch.first_name === 'string' ? patch.first_name : (target.first_name ?? '')
    const lastName = typeof patch.last_name === 'string' ? patch.last_name : (target.last_name ?? '')
    patch.full_name = buildFullName(firstName, lastName)
    if (!patch.full_name || String(patch.full_name).length < 2) {
      return adminErrorResponse('validation_error', 422)
    }
  }

  if ('position' in changes) {
    if (typeof changes.position !== 'string') {
      return adminErrorResponse('validation_error', 422)
    }
    patch.position = changes.position.trim().slice(0, MAX_NAME_LENGTH)
  }

  if ('avatar_url' in changes) {
    if (changes.avatar_url === null || changes.avatar_url === '') {
      patch.avatar_url = null
    } else if (typeof changes.avatar_url === 'string') {
      const trimmed = changes.avatar_url.trim()
      if (trimmed.length > MAX_AVATAR_URL_LENGTH) {
        return adminErrorResponse('validation_error', 422)
      }
      patch.avatar_url = trimmed || null
    } else {
      return adminErrorResponse('validation_error', 422)
    }
  }

  let nextRoleId = target.role_id as string | null
  if ('role_id' in changes) {
    if (typeof changes.role_id !== 'string' || !changes.role_id.trim()) {
      return adminErrorResponse('invalid_role', 422)
    }
    nextRoleId = changes.role_id.trim()

    const { data: targetRole, error: roleError } = await serviceClient
      .from('roles')
      .select('id, code, is_active')
      .eq('id', nextRoleId)
      .maybeSingle()

    if (roleError || !targetRole?.id || targetRole.is_active === false) {
      return adminErrorResponse('invalid_role', 422)
    }

    patch.role_id = targetRole.id
    patch.role = targetRole.code
  }

  let nextStatus = target.status as string
  if ('status' in changes) {
    if (typeof changes.status !== 'string' || !ALLOWED_STATUSES.has(changes.status.trim())) {
      return adminErrorResponse('invalid_status', 422)
    }
    nextStatus = changes.status.trim()
    patch.status = nextStatus
  }

  const currentlyActiveEditor =
    canEmployeeLogin(target.status) &&
    (await roleHasPermissionCode(serviceClient, target.role_id, PERMISSION_EDIT))

  const willBeActive = canEmployeeLogin(nextStatus)
  const willHaveEdit = await roleHasPermissionCode(serviceClient, nextRoleId, PERMISSION_EDIT)

  if (currentlyActiveEditor && (!willBeActive || !willHaveEdit)) {
    const remaining = await countActiveUsersWithPermission(
      serviceClient,
      PERMISSION_EDIT,
      target.id
    )
    if (remaining === 0) {
      return adminErrorResponse('last_admin_protected', 409)
    }
  }

  const { data: updated, error: updateError } = await serviceClient
    .from('academy_users')
    .update(patch)
    .eq('id', employeeId)
    .select(SAFE_EMPLOYEE_SELECT)
    .single()

  if (updateError || !updated) {
    console.error('admin_update_employee_failed', { category: updateError?.message ?? 'unknown' })
    return adminErrorResponse('internal_error', 500)
  }

  return jsonResponse({
    ok: true,
    employee: mapSafeEmployee(updated as DbEmployeeRow),
  })
})
