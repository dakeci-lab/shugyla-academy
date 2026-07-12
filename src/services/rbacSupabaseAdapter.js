import { supabase } from '../lib/supabaseClient'
import { PERMISSION_CATALOG } from '../config/permissionCatalog'
import { normalizePermission, normalizeRole, normalizeRolePermission } from '../utils/rbacData'

const ROLE_TABLE = 'roles'
const PERMISSION_TABLE = 'permissions'
const ROLE_PERMISSION_TABLE = 'role_permissions'

export const RBAC_MIGRATION_MESSAGE =
  'Таблицы системы ролей ещё не созданы в Supabase. Необходимо применить миграцию RBAC.'

function isMissingRbacTableError(error) {
  if (!error) return false
  const msg = String(error.message || '')
  return (
    error.code === 'PGRST205' ||
    msg.includes('public.roles') ||
    msg.includes('schema cache') ||
    msg.includes('Could not find the table')
  )
}

function toUserError(error, fallback) {
  if (isMissingRbacTableError(error)) return new Error(RBAC_MIGRATION_MESSAGE)
  return new Error(error.message || fallback)
}

async function throwIfError(result, message) {
  if (result.error) {
    throw toUserError(result.error, message)
  }
  return result.data
}

function mergeCatalogPermissions(permissions) {
  const byCode = new Map((permissions || []).map((perm) => [perm.code, perm]))
  PERMISSION_CATALOG.forEach((item) => {
    if (!byCode.has(item.code)) {
      byCode.set(
        item.code,
        normalizePermission({
          code: item.code,
          name: item.name,
          description: item.description || '',
          module: item.module,
          sort_order: item.sortOrder,
        })
      )
    }
  })
  return [...byCode.values()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
}

async function loadEmployeeCountsByRoleCode() {
  const result = await supabase.from('academy_users').select('role, role_id')
  if (result.error) return { byCode: new Map(), byId: new Map() }

  const byCode = new Map()
  const byId = new Map()
  ;(result.data || []).forEach((row) => {
    const code = row.role?.trim()
    if (code) byCode.set(code, (byCode.get(code) || 0) + 1)
    if (row.role_id) byId.set(row.role_id, (byId.get(row.role_id) || 0) + 1)
  })
  return { byCode, byId }
}

function attachEmployeeCounts(roles, counts) {
  return roles.map((role) => ({
    ...role,
    employeeCount: counts.byCode.get(role.code) || counts.byId.get(role.id) || 0,
  }))
}

export async function loadRbacSnapshot() {
  const [rolesRes, permissionsRes, rolePermissionsRes, employeeCounts] = await Promise.all([
    supabase.from(ROLE_TABLE).select('*').order('name'),
    supabase.from(PERMISSION_TABLE).select('*').order('sort_order'),
    supabase.from(ROLE_PERMISSION_TABLE).select('role_id, permission_id'),
    loadEmployeeCountsByRoleCode(),
  ])

  if (rolesRes.error && isMissingRbacTableError(rolesRes.error)) {
    throw new Error(RBAC_MIGRATION_MESSAGE)
  }

  const roles = attachEmployeeCounts(
    (await throwIfError(rolesRes, 'Загрузка ролей')).map((row) => normalizeRole(row)),
    employeeCounts
  )

  let permissions = []
  if (permissionsRes.error && isMissingRbacTableError(permissionsRes.error)) {
    throw new Error(RBAC_MIGRATION_MESSAGE)
  }
  if (!permissionsRes.error) {
    permissions = (permissionsRes.data || []).map(normalizePermission)
  }
  permissions = mergeCatalogPermissions(permissions)

  let rolePermissions = []
  if (!rolePermissionsRes.error) {
    rolePermissions = (rolePermissionsRes.data || []).map(normalizeRolePermission)
  } else if (isMissingRbacTableError(rolePermissionsRes.error)) {
    throw new Error(RBAC_MIGRATION_MESSAGE)
  } else {
    await throwIfError(rolePermissionsRes, 'Загрузка связей ролей')
  }

  return { roles, permissions, rolePermissions }
}

export async function saveRolePermissions(roleId, permissionIds) {
  await throwIfError(
    await supabase.rpc('rbac_save_role_permissions', {
      p_role_id: roleId,
      p_permission_ids: permissionIds,
    }),
    'Сохранение прав роли'
  )
  return loadRbacSnapshot()
}

export async function upsertRole(roleId, { name, description = '', isActive = true, permissionIds = [] }) {
  await throwIfError(
    await supabase.rpc('rbac_update_role', {
      p_role_id: roleId,
      p_name: name,
      p_description: description,
      p_is_active: isActive,
      p_permission_ids: permissionIds,
    }),
    'Сохранение роли'
  )
  return loadRbacSnapshot()
}

export async function updateRole(roleId, patch) {
  const row = {}
  if (patch.name != null) row.name = patch.name
  if (patch.description != null) row.description = patch.description
  if (patch.code != null) row.code = patch.code
  if (patch.isActive != null) row.is_active = patch.isActive

  if (Object.keys(row).length > 0) {
    await throwIfError(
      await supabase.from(ROLE_TABLE).update(row).eq('id', roleId).select().single(),
      'Обновление роли'
    )
  }

  const result = await supabase.from(ROLE_TABLE).select('*').eq('id', roleId).single()
  return normalizeRole(await throwIfError(result, 'Загрузка роли'))
}

export async function createRole({ code, name, description = '', permissionIds = [] }) {
  const result = await supabase.rpc('rbac_create_role', {
    p_code: code,
    p_name: name,
    p_description: description,
    p_permission_ids: permissionIds,
  })
  const roleId = await throwIfError(result, 'Создание роли')
  const snapshot = await loadRbacSnapshot()
  return snapshot.roles.find((role) => role.id === roleId) || { id: roleId, code, name }
}

export async function duplicateRole(sourceRoleId, { code, name }) {
  const result = await supabase.rpc('rbac_duplicate_role', {
    p_source_role_id: sourceRoleId,
    p_code: code,
    p_name: name,
  })
  const roleId = await throwIfError(result, 'Дублирование роли')
  const snapshot = await loadRbacSnapshot()
  return snapshot.roles.find((role) => role.id === roleId)
}

export async function setRoleActive(roleId, isActive) {
  await throwIfError(
    await supabase.rpc('rbac_set_role_active', { p_role_id: roleId, p_is_active: isActive }),
    'Изменение статуса роли'
  )
  return loadRbacSnapshot()
}

export async function syncUserRoleId(userId, roleCode) {
  if (!userId || !roleCode) return null

  const roleRes = await supabase.from(ROLE_TABLE).select('id, code').eq('code', roleCode).maybeSingle()
  if (roleRes.error && isMissingRbacTableError(roleRes.error)) return null
  const roleRow = await throwIfError(roleRes, 'Поиск роли')
  if (!roleRow?.id) return null

  await throwIfError(
    await supabase
      .from('academy_users')
      .update({ role_id: roleRow.id, role: roleRow.code })
      .eq('id', userId),
    'Синхронизация role_id'
  )

  return roleRow.id
}

export async function resolveRoleIdByCode(roleCode) {
  const result = await supabase.from(ROLE_TABLE).select('id').eq('code', roleCode).maybeSingle()
  if (result.error && isMissingRbacTableError(result.error)) return null
  const row = await throwIfError(result, 'Поиск роли')
  return row?.id || null
}

/** @deprecated */
export async function resolveRoleIdBySlug(roleSlug) {
  return resolveRoleIdByCode(roleSlug)
}

export async function getActiveRolesForAssignment() {
  const snapshot = await loadRbacSnapshot()
  return snapshot.roles
    .filter((role) => role.isActive)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export async function getRolesForEmployeeForm(currentRoleCode, currentRoleId) {
  const snapshot = await loadRbacSnapshot()
  const active = snapshot.roles
    .filter((role) => role.isActive)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  const current =
    snapshot.roles.find((role) => role.id === currentRoleId) ||
    snapshot.roles.find((role) => role.code === currentRoleCode)

  if (current && !current.isActive && !active.some((role) => role.id === current.id)) {
    return [...active, current].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }

  return active
}
