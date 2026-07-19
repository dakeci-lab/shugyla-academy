import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { canonicalLogin, loginToTechnicalEmail } from '../_shared/loginToTechnicalEmail.ts'
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import {
  authorizeEmployeeAdmin,
  getBearerToken,
} from '../_shared/employeeAuthorization.ts'
import {
  buildFullName,
  MAX_NAME_LENGTH,
  todayDateKeyAlmaty,
} from '../_shared/employeeFields.ts'

const PERMISSION_CREATE = 'employees.create'
const ACTIVE_STATUS = 'active'
const MIN_PASSWORD_LENGTH = 6
const MAX_PASSWORD_LENGTH = 128
const MAX_LOGIN_LENGTH = 128

const EMPLOYEE_RETURN_SELECT =
  'id, login, full_name, first_name, last_name, role, role_id, status, position, avatar_url, hired_at, terminated_at, work_mode, salary_calculation_type, payroll_participation, created_at, auth_user_id'

const FORBIDDEN_BODY_KEYS = new Set([
  'id',
  'employee_id',
  'auth_user_id',
  'role',
  'status',
  'password',
  'created_at',
  'updated_at',
  'permissions',
  'app_metadata',
  'user_metadata',
  'service_role',
  'email_confirm',
  'is_admin',
])

type ErrorCode =
  | 'malformed_json'
  | 'unauthorized'
  | 'forbidden'
  | 'method_not_allowed'
  | 'conflict'
  | 'validation_error'
  | 'provisioning_error'
  | 'rollback_failed'

function errorResponse(code: ErrorCode, message: string, status: number) {
  return jsonResponse({ ok: false, error: { code, message } }, status)
}

function buildFullNameFromPayload(payload: Record<string, unknown>): string {
  const explicit = typeof payload.full_name === 'string' ? payload.full_name.trim() : ''
  if (explicit) return explicit.slice(0, MAX_NAME_LENGTH)
  const first = typeof payload.first_name === 'string' ? payload.first_name.trim() : ''
  const last = typeof payload.last_name === 'string' ? payload.last_name.trim() : ''
  return buildFullName(first, last)
}

async function nextEmployeeId(serviceClient: SupabaseClient): Promise<number> {
  const { data, error } = await serviceClient
    .from('academy_users')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error('employee_id_lookup_failed')
  return (data?.id ?? 0) + 1
}

async function rollbackAuthUser(serviceClient: SupabaseClient, authUserId: string) {
  const { error } = await serviceClient.auth.admin.deleteUser(authUserId)
  if (error) {
    console.error('provisioning_rollback_failed', { authUserId, category: error.message })
    throw new Error('rollback_failed')
  }
}

async function findEmployeeByLogin(serviceClient: SupabaseClient, login: string) {
  const { data, error } = await serviceClient
    .from('academy_users')
    .select(EMPLOYEE_RETURN_SELECT)
    .eq('login', login)
    .maybeSingle()

  if (error) throw error
  return data
}

async function findEmployeeByCandidateId(serviceClient: SupabaseClient, candidateId: string) {
  const { data, error } = await serviceClient
    .from('academy_candidates')
    .select('created_user_id')
    .eq('id', candidateId)
    .maybeSingle()

  if (error) throw error
  if (!data?.created_user_id) return null

  const { data: employee, error: employeeError } = await serviceClient
    .from('academy_users')
    .select(EMPLOYEE_RETURN_SELECT)
    .eq('id', data.created_user_id)
    .maybeSingle()

  if (employeeError) throw employeeError
  return employee
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID()

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse()
  }

  if (req.method !== 'POST') {
    return errorResponse('method_not_allowed', 'Method not allowed', 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return errorResponse('provisioning_error', 'Service unavailable', 500)
  }

  const bearer = getBearerToken(req)
  if (!bearer) {
    return errorResponse('unauthorized', 'Unauthorized', 401)
  }

  let payload: Record<string, unknown>
  try {
    payload = (await req.json()) as Record<string, unknown>
  } catch {
    return errorResponse('malformed_json', 'Invalid JSON body', 400)
  }

  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_BODY_KEYS.has(key)) {
      return errorResponse('validation_error', 'Request contains forbidden fields', 422)
    }
  }

  const loginRaw = typeof payload.login === 'string' ? payload.login : ''
  const temporaryPassword =
    typeof payload.temporary_password === 'string' ? payload.temporary_password : ''
  const roleId = typeof payload.role_id === 'string' ? payload.role_id.trim() : ''
  const sourceCandidateId =
    typeof payload.source_candidate_id === 'string' ? payload.source_candidate_id.trim() : ''

  const canonical = canonicalLogin(loginRaw)
  if (!canonical || canonical.length > MAX_LOGIN_LENGTH) {
    return errorResponse('validation_error', 'Invalid login', 422)
  }

  if (!temporaryPassword || temporaryPassword.length > MAX_PASSWORD_LENGTH) {
    return errorResponse('validation_error', 'Invalid temporary password', 422)
  }
  if (temporaryPassword.length < MIN_PASSWORD_LENGTH) {
    return errorResponse('validation_error', 'Password must be at least 6 characters', 422)
  }

  if (!roleId) {
    return errorResponse('validation_error', 'role_id is required', 422)
  }

  const fullName = buildFullNameFromPayload(payload)
  if (!fullName || fullName.length < 2) {
    return errorResponse('validation_error', 'full_name is required', 422)
  }

  const firstName =
    typeof payload.first_name === 'string' ? payload.first_name.trim().slice(0, MAX_NAME_LENGTH) : ''
  const lastName =
    typeof payload.last_name === 'string' ? payload.last_name.trim().slice(0, MAX_NAME_LENGTH) : ''
  const position =
    typeof payload.position === 'string' ? payload.position.trim().slice(0, MAX_NAME_LENGTH) : ''
  const avatarUrl =
    typeof payload.avatar_url === 'string' && payload.avatar_url.trim()
      ? payload.avatar_url.trim().slice(0, 2048)
      : null

  const technicalEmail = loginToTechnicalEmail(loginRaw)
  if (!technicalEmail) {
    return errorResponse('validation_error', 'Invalid login', 422)
  }

  const authResult = await authorizeEmployeeAdmin(req, PERMISSION_CREATE)
  if (authResult instanceof Response) {
    const clone = authResult.clone()
    try {
      const body = await clone.json()
      const code = body?.code ?? body?.error?.code
      if (code === 'inactive_caller') {
        return errorResponse('forbidden', 'Forbidden', 403)
      }
      if (code === 'forbidden') {
        return errorResponse('forbidden', 'Forbidden', 403)
      }
      if (code === 'unauthorized') {
        return errorResponse('unauthorized', 'Unauthorized', 401)
      }
    } catch {
      // fall through
    }
    return errorResponse('provisioning_error', 'Service unavailable', 500)
  }

  const { serviceClient } = authResult

  try {
    if (sourceCandidateId) {
      const candidateEmployee = await findEmployeeByCandidateId(serviceClient, sourceCandidateId)
      if (candidateEmployee?.auth_user_id) {
        return jsonResponse({ ok: true, employee: candidateEmployee, idempotent: true }, 200)
      }
    }

    const { data: targetRole, error: roleError } = await serviceClient
      .from('roles')
      .select('id, code, is_active')
      .eq('id', roleId)
      .maybeSingle()

    if (roleError || !targetRole?.id || targetRole.is_active === false) {
      return errorResponse('validation_error', 'Invalid role', 422)
    }

    const existingEmployee = await findEmployeeByLogin(serviceClient, canonical)
    if (existingEmployee?.auth_user_id) {
      return jsonResponse({ ok: true, employee: existingEmployee, idempotent: true }, 200)
    }
    if (existingEmployee) {
      return errorResponse('conflict', 'Login already exists', 409)
    }

    const { data: createdAuth, error: createAuthError } = await serviceClient.auth.admin.createUser({
      email: technicalEmail,
      password: temporaryPassword,
      email_confirm: true,
    })

    if (createAuthError || !createdAuth.user?.id) {
      const message = createAuthError?.message?.toLowerCase() ?? ''
      if (
        message.includes('already') ||
        message.includes('exists') ||
        message.includes('registered') ||
        createAuthError?.status === 422
      ) {
        const { data: authUsers } = await serviceClient.auth.admin.listUsers()
        const existingAuth = authUsers.users.find(
          (user) => user.email?.toLowerCase() === technicalEmail.toLowerCase()
        )
        if (existingAuth?.id) {
          const { data: linkedEmployee } = await serviceClient
            .from('academy_users')
            .select(EMPLOYEE_RETURN_SELECT)
            .eq('auth_user_id', existingAuth.id)
            .maybeSingle()
          if (linkedEmployee?.id) {
            return jsonResponse({ ok: true, employee: linkedEmployee, idempotent: true }, 200)
          }
        }
        return errorResponse('conflict', 'Auth account already exists', 409)
      }
      console.error('auth_user_create_failed', {
        requestId,
        category: createAuthError?.message ?? 'unknown',
      })
      return errorResponse('provisioning_error', 'Could not create employee', 500)
    }

    const createdAuthUserId = createdAuth.user.id

    try {
      const employeeId = await nextEmployeeId(serviceClient)

      const insertRow = {
        id: employeeId,
        first_name: firstName || fullName.split(' ')[0] || '',
        last_name: lastName || fullName.split(' ').slice(1).join(' ') || '',
        full_name: fullName,
        login: canonical,
        role: targetRole.code,
        role_id: targetRole.id,
        position: position || '',
        status: ACTIVE_STATUS,
        hired_at: todayDateKeyAlmaty(),
        terminated_at: null,
        work_mode: 'offline',
        salary_calculation_type: 'shift_based',
        payroll_participation: 'active',
        auth_user_id: createdAuthUserId,
        avatar_url: avatarUrl,
      }

      const { data: inserted, error: insertError } = await serviceClient
        .from('academy_users')
        .insert(insertRow)
        .select(EMPLOYEE_RETURN_SELECT)
        .single()

      if (insertError || !inserted) {
        console.error('academy_user_insert_failed', {
          requestId,
          code: insertError?.code,
          message: insertError?.message,
          details: insertError?.details,
          hint: insertError?.hint,
        })
        try {
          await rollbackAuthUser(serviceClient, createdAuthUserId)
        } catch {
          return errorResponse('rollback_failed', 'Could not create employee', 500)
        }
        return errorResponse('provisioning_error', 'Could not create employee', 500)
      }

      return jsonResponse({ ok: true, employee: inserted }, 201)
    } catch (err) {
      console.error('provisioning_unexpected', {
        requestId,
        category: err instanceof Error ? err.message : 'unknown',
        stack: err instanceof Error ? err.stack : undefined,
      })
      try {
        await rollbackAuthUser(serviceClient, createdAuthUserId)
      } catch {
        return errorResponse('rollback_failed', 'Could not create employee', 500)
      }
      return errorResponse('provisioning_error', 'Could not create employee', 500)
    }
  } catch (err) {
    console.error('admin_create_employee_failed', {
      requestId,
      code: (err as { code?: string })?.code,
      message: err instanceof Error ? err.message : 'unknown',
      details: (err as { details?: string })?.details,
      hint: (err as { hint?: string })?.hint,
      stack: err instanceof Error ? err.stack : undefined,
    })
    return errorResponse('provisioning_error', 'Could not create employee', 500)
  }
})
