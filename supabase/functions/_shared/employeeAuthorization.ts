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

/** Request-local PostgREST round-trip counter — never module-level. */
export type DbCallCounter = {
  count: number
}

export function createDbCallCounter(): DbCallCounter {
  return { count: 0 }
}

export function trackDbCall(counter: DbCallCounter | undefined): void {
  if (counter) counter.count += 1
}

/** Request-scoped authz context — never store at module level. */
export type RequestAuthzContext = {
  serviceClient: SupabaseClient
  caller: CallerProfile
  authUserId: string
  authMethod: 'getClaims' | 'getUser'
  permissions: Record<string, boolean>
  dbCalls: DbCallCounter
  timings: {
    tokenMs: number
    authMs: number
    authorizationDbMs: number
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

/**
 * Proven PostgREST path (Stage 8):
 * academy_users.role_id → roles!academy_users_role_id_fkey
 *   → role_permissions → permissions!inner(code)
 * Nested permission codes are filtered server-side; empty nested list means no grant.
 */
const CALLER_AUTHZ_SELECT = [
  'id',
  'status',
  'role',
  'role_id',
  'auth_user_id',
  'roles!academy_users_role_id_fkey(role_permissions(permissions!inner(code)))',
].join(', ')

type NestedPermissionRow = {
  permissions?: { code?: string | null } | null
}

type FusedCallerRow = CallerProfile & {
  roles?: {
    role_permissions?: NestedPermissionRow[] | null
  } | null
}

function permissionsFromFusedCaller(
  row: FusedCallerRow,
  permissionCodes: string[]
): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const code of permissionCodes) result[code] = false
  const links = row.roles?.role_permissions ?? []
  for (const link of links) {
    const code = link?.permissions?.code
    if (typeof code === 'string' && code in result) {
      result[code] = true
    }
  }
  return result
}

export async function loadCallerProfile(
  serviceClient: SupabaseClient,
  authUserId: string,
  dbCounter?: DbCallCounter
): Promise<CallerProfile | Response> {
  trackDbCall(dbCounter)
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
  permissionCode: string,
  dbCounter?: DbCallCounter
): Promise<boolean> {
  if (!roleId) return false
  const map = await roleHasPermissionCodes(serviceClient, roleId, [permissionCode], dbCounter)
  return map[permissionCode] === true
}

/**
 * Batch permission checks for one role (non-workforce helpers).
 * Single relational query; on embed failure returns all-false (deny).
 */
export async function roleHasPermissionCodes(
  serviceClient: SupabaseClient,
  roleId: string | null,
  permissionCodes: string[],
  dbCounter?: DbCallCounter
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {}
  for (const code of permissionCodes) result[code] = false
  if (!roleId || permissionCodes.length === 0) return result

  const uniqueCodes = [...new Set(permissionCodes)]
  trackDbCall(dbCounter)
  const { data: linked, error: linkedError } = await serviceClient
    .from('permissions')
    .select('code, role_permissions!inner(role_id)')
    .in('code', uniqueCodes)
    .eq('role_permissions.role_id', roleId)

  if (linkedError || !linked) {
    if (linkedError) {
      console.error('role_permission_lookup_failed', {
        code: linkedError.code,
        message: linkedError.message,
      })
    }
    return result
  }

  for (const row of linked) {
    const code = (row as { code?: string }).code
    if (code && code in result) result[code] = true
  }
  return result
}

/**
 * Full request-scoped authorization for workforce Edge:
 * token → verify once → ONE fused caller+permissions PostgREST call.
 */
export async function authorizeWorkforceRequest(
  req: Request,
  permissionCodes: string[]
): Promise<RequestAuthzContext | Response> {
  const dbCalls = createDbCallCounter()
  const uniqueCodes = [...new Set(permissionCodes)]

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

  if (uniqueCodes.length === 0) {
    return adminErrorResponse('forbidden', 403)
  }

  const authorizationDbStart = performance.now()
  trackDbCall(dbCalls)
  const { data, error } = await serviceClient
    .from('academy_users')
    .select(CALLER_AUTHZ_SELECT)
    .eq('auth_user_id', verified.authUserId)
    .in('roles.role_permissions.permissions.code', uniqueCodes)
    .maybeSingle()
  const authorizationDbMs = Math.round(performance.now() - authorizationDbStart)

  if (error) {
    console.error('workforce_authz_fusion_failed', {
      code: error.code,
      message: error.message,
    })
    return adminErrorResponse('internal_error', 500)
  }

  if (!data) {
    return adminErrorResponse('forbidden', 403)
  }

  const fused = data as FusedCallerRow
  if (!canEmployeeLogin(fused.status)) {
    return adminErrorResponse('inactive_caller', 403)
  }
  if (!fused.auth_user_id) {
    return adminErrorResponse('forbidden', 403)
  }

  const caller: CallerProfile = {
    id: fused.id,
    status: fused.status,
    role: fused.role,
    role_id: fused.role_id,
    auth_user_id: fused.auth_user_id,
  }

  const permissions = permissionsFromFusedCaller(fused, uniqueCodes)

  return {
    serviceClient,
    caller,
    authUserId: verified.authUserId,
    authMethod: verified.authMethod,
    permissions,
    dbCalls,
    timings: {
      tokenMs,
      authMs,
      authorizationDbMs,
      authorizationMs: authorizationDbMs,
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
