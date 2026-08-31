import { formatRoleDisplayLabel } from '../../../utils/roleDisplay'

export const TEAM_TABS = [
  { id: 'roles', label: 'Роли и доступы' },
  { id: 'groups', label: 'Группы должностей' },
  { id: 'positions', label: 'Должности' },
]

export function idsEqual(a = [], b = []) {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((id) => setB.has(id))
}

export function getPermissionIdsForRole(roleId, rolePermissions = []) {
  if (!roleId) return []
  return rolePermissions
    .filter((rp) => rp.roleId === roleId)
    .map((rp) => rp.permissionId)
}

export function isProtectedAdminRole(role) {
  return role?.code === 'admin' || role?.code === 'administrator'
}

export function sortRolesForSidebar(roles = []) {
  return [...roles].sort((a, b) => {
    const rank = (role) => {
      if (role.isActive && role.isSystem) return 0
      if (role.isActive) return 1
      return 2
    }
    const rankDiff = rank(a) - rank(b)
    if (rankDiff !== 0) return rankDiff
    return formatRoleDisplayLabel(a, roles).localeCompare(formatRoleDisplayLabel(b, roles), 'ru')
  })
}

export function resolveInitialRoleId(roles = [], requestedId) {
  if (requestedId && roles.some((role) => role.id === requestedId)) {
    return requestedId
  }
  const sorted = sortRolesForSidebar(roles)
  const firstActive = sorted.find((role) => role.isActive)
  return firstActive?.id || sorted[0]?.id || ''
}
