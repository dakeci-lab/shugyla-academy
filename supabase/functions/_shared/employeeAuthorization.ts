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

async function roleHasPermission(
  serviceClient: SupabaseClient,
  roleId: string | null,
  permissionCode: string
): Promise<boolean> {
  if (!roleId) return false

  const { data: permission, error: permError } = await serviceClient
    .from('permissions')
    .select('id')
    .eq('code', permissionCode)
    .maybeSingle()

  if (permError || !permission?.id) return false

  const { data: link, error: linkError } = await serviceClient
    .from('role_permissions')
    .select('role_id')
    .eq('role_id', roleId)
    .eq('permission_id', permission.id)
    .maybeSingle()

  if (linkError) return false
  return Boolean(link)
}

export async function authorizeAuthenticatedEmployee(
  req: Request
): Promise<AuthorizedContext | Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return adminErrorResponse('internal_error', 500)
  }

  const bearer = getBearerToken(req)
  if (!bearer) {
    return adminErrorResponse('unauthorized', 401)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user?.id) {
    return adminErrorResponse('unauthorized', 401)
  }

  const { data: callerProfile, error: callerProfileError } = await serviceClient
    .from('academy_users')
    .select('id, status, role, role_id, auth_user_id')
    .eq('auth_user_id', authData.user.id)
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

  return {
    serviceClient,
    caller: callerProfile as CallerProfile,
  }
}

export async function authorizeEmployeeAdmin(
  req: Request,
  permissionCode: string
): Promise<AuthorizedContext | Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return adminErrorResponse('internal_error', 500)
  }

  const bearer = getBearerToken(req)
  if (!bearer) {
    return adminErrorResponse('unauthorized', 401)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user?.id) {
    return adminErrorResponse('unauthorized', 401)
  }

  const { data: callerProfile, error: callerProfileError } = await serviceClient
    .from('academy_users')
    .select('id, status, role, role_id, auth_user_id')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle()

  if (callerProfileError || !callerProfile) {
    return adminErrorResponse('forbidden', 403)
  }

  if (!canEmployeeLogin(callerProfile.status)) {
    return adminErrorResponse('inactive_caller', 403)
  }

  if (!callerProfile.role_id) {
    return adminErrorResponse('forbidden', 403)
  }

  const permitted = await roleHasPermission(serviceClient, callerProfile.role_id, permissionCode)
  if (!permitted) {
    return adminErrorResponse('forbidden', 403)
  }

  return {
    serviceClient,
    caller: callerProfile as CallerProfile,
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
