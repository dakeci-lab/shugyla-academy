import {
  PERMISSION_CATALOG,
  RBAC_DEFAULT_ROLE_PERMISSIONS,
  RBAC_SYSTEM_ROLES,
} from '../config/permissionCatalog'

function genStableId(prefix, code) {
  return `${prefix}-${code}`
}

export function buildDefaultRbacSnapshot() {
  const permissions = PERMISSION_CATALOG.map((item) => ({
    id: genStableId('perm', item.code),
    code: item.code,
    slug: item.code,
    name: item.name,
    description: item.description || '',
    module: item.module,
    category: item.module,
    action: item.action || null,
    sortOrder: item.sortOrder,
  }))

  const permissionIdByCode = new Map(permissions.map((p) => [p.code, p.id]))

  const roles = RBAC_SYSTEM_ROLES.map((role) => ({
    id: genStableId('role', role.code),
    code: role.code,
    slug: role.code,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    isActive: true,
    employeeCount: 0,
  }))

  const rolePermissions = []
  roles.forEach((role) => {
    const codes = RBAC_DEFAULT_ROLE_PERMISSIONS[role.code] || []
    codes.forEach((code) => {
      const permissionId = permissionIdByCode.get(code)
      if (permissionId) rolePermissions.push({ roleId: role.id, permissionId })
    })
  })

  return { roles, permissions, rolePermissions }
}

export function normalizeRole(raw) {
  if (!raw) return null
  const code = raw.code ?? raw.slug
  return {
    id: raw.id,
    code,
    slug: code,
    name: raw.name,
    description: raw.description || '',
    isSystem: Boolean(raw.isSystem ?? raw.is_system),
    isActive: raw.isActive ?? raw.is_active ?? true,
    employeeCount: raw.employeeCount ?? raw.employee_count ?? 0,
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? null,
  }
}

export function normalizePermission(raw) {
  if (!raw) return null
  const code = raw.code ?? raw.slug
  const module = raw.module ?? raw.category ?? 'general'
  return {
    id: raw.id,
    code,
    slug: code,
    name: raw.name,
    description: raw.description || '',
    module,
    category: module,
    action: raw.action || null,
    sortOrder: raw.sortOrder ?? raw.sort_order ?? 0,
  }
}

export function normalizeRolePermission(raw) {
  if (!raw) return null
  return {
    roleId: raw.roleId ?? raw.role_id,
    permissionId: raw.permissionId ?? raw.permission_id,
  }
}

export function resolveRoleIdByCode(roles, code) {
  if (!code) return null
  return roles.find((role) => role.code === code)?.id || null
}

/** @deprecated */
export function resolveRoleIdBySlug(roles, slug) {
  return resolveRoleIdByCode(roles, slug)
}

export function getPermissionCodesForRole(roleId, roles, rolePermissions, permissions) {
  const permIds = new Set(
    rolePermissions.filter((rp) => rp.roleId === roleId).map((rp) => rp.permissionId)
  )
  return permissions.filter((p) => permIds.has(p.id)).map((p) => p.code)
}

export function getPermissionCodesForRoleCode(roleCode, roles, rolePermissions, permissions) {
  const role = roles.find((item) => item.code === roleCode)
  if (!role) return []
  return getPermissionCodesForRole(role.id, roles, rolePermissions, permissions)
}

/** @deprecated */
export function getPermissionSlugsForRole(...args) {
  return getPermissionCodesForRole(...args)
}

export function getPermissionSlugsForRoleSlug(...args) {
  return getPermissionCodesForRoleCode(...args)
}
