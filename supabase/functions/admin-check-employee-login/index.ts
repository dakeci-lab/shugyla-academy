import '@supabase/functions-js/edge-runtime.d.ts'
import { canonicalLogin } from '../_shared/loginToTechnicalEmail.ts'
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import { authorizeEmployeeAdmin } from '../_shared/employeeAuthorization.ts'

const PERMISSION_CREATE = 'employees.create'
const MAX_LOGIN_LENGTH = 128

/**
 * Read-only availability check for the employee creation form. Lets the UI warn
 * before submit instead of relying only on the create endpoint's 409 — see
 * docs/hr/login-collision-incident.md for why the hard conflict alone isn't enough.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse()
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: { code: 'method_not_allowed' } }, 405)
  }

  let payload: Record<string, unknown>
  try {
    payload = (await req.json()) as Record<string, unknown>
  } catch {
    return jsonResponse({ ok: false, error: { code: 'malformed_json' } }, 400)
  }

  const loginRaw = typeof payload.login === 'string' ? payload.login : ''
  const canonical = canonicalLogin(loginRaw)
  if (!canonical || canonical.length > MAX_LOGIN_LENGTH) {
    return jsonResponse({ ok: false, error: { code: 'validation_error' } }, 422)
  }

  const authResult = await authorizeEmployeeAdmin(req, PERMISSION_CREATE)
  if (authResult instanceof Response) return authResult

  const { serviceClient } = authResult

  const { data, error } = await serviceClient
    .from('academy_users')
    .select('id')
    .eq('login', canonical)
    .maybeSingle()

  if (error) {
    console.error('admin_check_employee_login_failed', { message: error.message })
    return jsonResponse({ ok: false, error: { code: 'internal_error' } }, 500)
  }

  return jsonResponse({ ok: true, login: canonical, available: !data })
})
