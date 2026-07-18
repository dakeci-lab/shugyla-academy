import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { jsonResponse } from './cors.ts'

export type CallerProfile = {
  id: number
  status: string
  role: string
  role_id: string | null
  auth_user_id: string | null
}

export type AuthorizedContext = {
  serviceClient: SupabaseClient
  caller: CallerProfile
}

/** Request-scoped authz context — never store at module level. */
export type RequestAuthzContext = {
  serviceClient: SupabaseClient
  caller: CallerProfile
  authUserId: string
  authMethod: 'getClaims' | 'getUser'
  permissions: Record<string, boolean>
  timings: {
    tokenMs: number
    authMs: number
    employeeMs: number
    permissionsMs: number
    authorizationMs: number
  }
}

export function adminErrorResponse(code: string, status: number) {
  return jsonResponse({ ok: false, code }, status)
}

export function canEmployeeLogin(status: string | null | undefined): boolean {
  if (!status) return false
  const normalized =
    status === 'deactivated'
      ? 'inactive'
      : status === 'internship' || status === 'trainee'
        ? 'active'
        : status
  return normalized === 'active'
}

export function getBearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token || null
}

function createEdgeClients(bearer: string): {
  userClient: SupabaseClient
  serviceClient: SupabaseClient
} | Response {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return adminErrorResponse('internal_error', 500)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return { userClient, serviceClient }
}

/**
 * Cryptographically verify the bearer JWT via official SDK getClaims().
 * For asymmetric keys this can complete via JWKS (often cached).
 * For symmetric keys the SDK itself falls back to Auth getUser() internally.
 * On getClaims failure, fall back once to getUser(bearer) — never decode without verify.
 */
export async function verifyBearerAuthUserId(
  userClient: SupabaseClient,
  bearer: string
): Promise<{ authUserId: string; authMethod: 'getClaims' | 'getUser' } | Response> {
  const authApi = userClient.auth as {
    getClaims?: (
      jwt?: string,
      options?: Record<string, unknown>
    ) => Promise<{
      data: { claims?: { sub?: string }; header?: { alg?: string } } | null
      error: { message?: string } | null
    }>
    getUser: (jwt?: string) => Promise<{
      data: { user: { id: string } | null }
      error: { message?: string } | null
    }>
  }

  if (typeof authApi.getClaims === 'function') {
    const { data, error } = await authApi.getClaims(bearer)
    const sub = data?.claims?.sub
    if (!error && typeof sub === 'string' && sub.length > 0) {
      const alg = data?.header?.alg ?? ''
      // SDK may have used getUser internally for HS* keys; surface that for timing logs.
      const authMethod: 'getClaims' | 'getUser' =
        typeof alg === 'string' && alg.startsWith('HS') ? 'getUser' : 'getClaims'
      return { authUserId: sub, authMethod }
    }
  }

  const { data: authData, error: authError } = await authApi.getUser(bearer)
  if (authError || !authData.user?.id) {
    return adminErrorResponse('unauthorized', 401)
  }
  return { authUserId: authData.user.id, authMethod: 'getUser' }
}

const CALLER_SELECT = 'id, status, role, role_id, auth_user_id'

export async function loadCallerProfile(
  serviceClient: SupabaseClient,
  authUserId: string
): Promise<CallerProfile | Response> {
  const { data: callerProfile, error: callerProfileError } = await serviceClient
    .from('academy_users')
    .select(CALLER_SELECT)
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (callerProfileError || !callerProfile) {
    return adminErrorResponse('forbidden', 403)
  }

  if (!canEmployeeLogin(callerProfile.status)) {
    return adminErrorResponse('inactive_caller', 403)
  }

  if (!callerProfile.auth_user_id) {
    return adminErrorResponse('forbidden', 403)
  }

  return callerProfile as CallerProfile
}

async function roleHasPermission(
  serviceClient: SupabaseClient,
  roleId: string | null,
  permissionCode: string
): Promise<boolean> {
  if (!roleId) return false
  const map = await roleHasPermissionCodes(serviceClient, roleId, [permissionCode])
  return map[permissionCode] === true
}

/**
 * Batch permission checks for one role.
 * Prefer a single relational PostgREST query; fall back to 2-query path if embed fails.
 */
export async function roleHasPermissionCodes(
  serviceClient: SupabaseClient,
  roleId: string | null,
  permissionCodes: string[]
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {}
  for (const code of permissionCodes) result[code] = false
  if (!roleId || permissionCodes.length === 0) return result

  const uniqueCodes = [...new Set(permissionCodes)]

  // One round-trip: only the requested codes that are linked to this role.
  const { data: linked, error: linkedError } = await serviceClient
    .from('permissions')
    .select('code, role_permissions!inner(role_id)')
    .in('code', uniqueCodes)
    .eq('role_permissions.role_id', roleId)

  if (!linkedError && linked) {
    for (const row of linked) {
      const code = (row as { code?: string }).code
      if (code && code in result) result[code] = true
    }
    return result
  }

  // Fallback: 2 sequential queries (Stage 4 path) if relational select is unavailable.
  const { data: permissions, error: permError } = await serviceClient
    .from('permissions')
    .select('id, code')
    .in('code', uniqueCodes)

  if (permError || !permissions?.length) return result

  const permissionIds = permissions.map((row) => row.id).filter(Boolean)
  if (!permissionIds.length) return result

  const { data: links, error: linkError } = await serviceClient
    .from('role_permissions')
    .select('permission_id')
    .eq('role_id', roleId)
    .in('permission_id', permissionIds)

  if (linkError) return result

  const linkedIds = new Set((links ?? []).map((row) => row.permission_id))
  for (const row of permissions) {
    if (row.code && linkedIds.has(row.id)) {
      result[row.code] = true
    }
  }
  return result
}

/**
 * Full request-scoped authorization for workforce Edge:
 * token → verify once → employee once → permissions once.
 * Context is returned to the caller; never cached across invocations.
 */
export async function authorizeWorkforceRequest(
  req: Request,
  permissionCodes: string[]
): Promise<RequestAuthzContext | Response> {
  const tokenStart = performance.now()
  const bearer = getBearerToken(req)
  const tokenMs = Math.round(performance.now() - tokenStart)
  if (!bearer) {
    return adminErrorResponse('unauthorized', 401)
  }

  const clients = createEdgeClients(bearer)
  if (clients instanceof Response) return clients
  const { userClient, serviceClient } = clients

  const authStart = performance.now()
  const verified = await verifyBearerAuthUserId(userClient, bearer)
  const authMs = Math.round(performance.now() - authStart)
  if (verified instanceof Response) return verified

  const employeeStart = performance.now()
  const caller = await loadCallerProfile(serviceClient, verified.authUserId)
  const employeeMs = Math.round(performance.now() - employeeStart)
  if (caller instanceof Response) return caller

  const permissionsStart = performance.now()
  const permissions = await roleHasPermissionCodes(
    serviceClient,
    caller.role_id,
    permissionCodes
  )
  const permissionsMs = Math.round(performance.now() - permissionsStart)

  return {
    serviceClient,
    caller,
    authUserId: verified.authUserId,
    authMethod: verified.authMethod,
    permissions,
    timings: {
      tokenMs,
      authMs,
      employeeMs,
      permissionsMs,
      authorizationMs: employeeMs + permissionsMs,
    },
  }
}

export async function authorizeAuthenticatedEmployee(
  req: Request
): Promise<AuthorizedContext | Response> {
  const bearer = getBearerToken(req)
  if (!bearer) {
    return adminErrorResponse('unauthorized', 401)
  }

  const clients = createEdgeClients(bearer)
  if (clients instanceof Response) return clients
  const { userClient, serviceClient } = clients

  const verified = await verifyBearerAuthUserId(userClient, bearer)
  if (verified instanceof Response) return verified

  const caller = await loadCallerProfile(serviceClient, verified.authUserId)
  if (caller instanceof Response) return caller

  return {
    serviceClient,
    caller,
  }
}

export async function authorizeEmployeeAdmin(
  req: Request,
  permissionCode: string
): Promise<AuthorizedContext | Response> {
  const authResult = await authorizeAuthenticatedEmployee(req)
  if (authResult instanceof Response) return authResult

  const { serviceClient, caller } = authResult
  if (!caller.role_id) {
    return adminErrorResponse('forbidden', 403)
  }

  const permitted = await roleHasPermission(serviceClient, caller.role_id, permissionCode)
  if (!permitted) {
    return adminErrorResponse('forbidden', 403)
  }

  return {
    serviceClient,
    caller,
  }
}

export async function countActiveUsersWithPermission(
  serviceClient: SupabaseClient,
  permissionCode: string,
  excludeEmployeeId?: number
): Promise<number> {
  const { data: permission, error: permError } = await serviceClient
    .from('permissions')
    .select('id')
    .eq('code', permissionCode)
    .maybeSingle()

  if (permError || !permission?.id) return 0

  const { data: roleLinks, error: linkError } = await serviceClient
    .from('role_permissions')
    .select('role_id')
    .eq('permission_id', permission.id)

  if (linkError || !roleLinks?.length) return 0

  const roleIds = [...new Set(roleLinks.map((row) => row.role_id).filter(Boolean))]

  let query = serviceClient.from('academy_users').select('id, status, role_id').in('role_id', roleIds)

  if (excludeEmployeeId != null) {
    query = query.neq('id', excludeEmployeeId)
  }

  const { data: users, error: usersError } = await query
  if (usersError || !users) return 0

  const activeRoleIds = new Set(roleIds)
  return users.filter(
    (user) => activeRoleIds.has(user.role_id) && canEmployeeLogin(user.status)
  ).length
}

export async function roleHasPermissionCode(
  serviceClient: SupabaseClient,
  roleId: string | null,
  permissionCode: string
): Promise<boolean> {
  return roleHasPermission(serviceClient, roleId, permissionCode)
}
