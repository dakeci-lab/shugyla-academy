import '@supabase/functions-js/edge-runtime.d.ts'
import { authorizeEmployeeAdmin, adminErrorResponse, canEmployeeLogin } from '../_shared/employeeAuthorization.ts'
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import { generateTemporaryPassword } from '../_shared/tempPasswordGenerator.js'

// More sensitive than a routine profile edit — resetting a password gives the
// admin the employee's next login credential, so it requires role-management rights.
const PERMISSION_RESET_PASSWORD = 'employees.manage_roles'

const ALLOWED_BODY_KEYS = new Set(['employee_id'])

function parseEmployeeId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim())
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
  }
  return null
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID()

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse()
  }

  if (req.method !== 'POST') {
    return adminErrorResponse('method_not_allowed', 405)
  }

  // Authenticate and authorize before parsing request fields so unauthorised callers
  // cannot use validation responses to probe this privileged endpoint.
  const authResult = await authorizeEmployeeAdmin(req, PERMISSION_RESET_PASSWORD)
  if (authResult instanceof Response) return authResult

  const { serviceClient, caller } = authResult

  let payload: Record<string, unknown>
  try {
    payload = (await req.json()) as Record<string, unknown>
  } catch {
    return adminErrorResponse('malformed_json', 400)
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return adminErrorResponse('malformed_json', 400)
  }

  for (const key of Object.keys(payload)) {
    if (!ALLOWED_BODY_KEYS.has(key)) {
      return adminErrorResponse('forbidden_field', 422)
    }
  }

  const employeeId = parseEmployeeId(payload.employee_id)
  if (!employeeId) {
    return adminErrorResponse('validation_error', 422)
  }

  const { data: target, error: targetError } = await serviceClient
    .from('academy_users')
    .select('id, status, auth_user_id')
    .eq('id', employeeId)
    .maybeSingle()

  if (targetError) {
    console.error('admin_reset_password_target_lookup_failed', {
      requestId,
      caller_id: caller.id,
      category: targetError.message,
    })
    return adminErrorResponse('internal_error', 500)
  }

  if (!target) {
    return adminErrorResponse('employee_not_found', 404)
  }

  if (!canEmployeeLogin(target.status)) {
    return adminErrorResponse('employee_inactive', 409)
  }

  if (!target.auth_user_id) {
    return adminErrorResponse('auth_not_linked', 409)
  }

  if (caller.id === target.id) {
    return adminErrorResponse('self_reset_forbidden', 403)
  }

  const temporaryPassword = generateTemporaryPassword()

  const { error: updateError } = await serviceClient.auth.admin.updateUserById(
    target.auth_user_id,
    { password: temporaryPassword },
  )

  if (updateError) {
    console.error('admin_reset_password_auth_update_failed', {
      requestId,
      caller_id: caller.id,
      employee_id: target.id,
      category: updateError.message,
    })
    return adminErrorResponse('internal_error', 500)
  }

  console.log('admin_reset_password_success', {
    requestId,
    caller_id: caller.id,
    employee_id: target.id,
  })

  return jsonResponse(
    {
      ok: true,
      employee_id: target.id,
      temporary_password: temporaryPassword,
    },
    200,
    {
      'Cache-Control': 'no-store, private',
      Pragma: 'no-cache',
    },
  )
})
