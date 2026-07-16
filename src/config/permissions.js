/**
 * Единая система прав доступа Shugyla Platform
 */

import { ROLE_IDS, isAdmin, normalizeRoleId, getRole } from '../data/roles'
import {
  PERMISSION_CODES,
  PERMISSION_KEYS,
  RBAC_DEFAULT_ROLE_PERMISSIONS,
  resolvePermissionCode,
} from './permissionCatalog'
import {
  getPermissionCodesForUserRole,
  getRbacCache,
  getRbacLoadState,
  RBAC_LOAD_STATE,
} from '../services/rbacService'

export { ROLE_IDS, PERMISSION_CODES, PERMISSION_KEYS }

/** Ключи маршрутов / пунктов меню */
export const ROUTE_KEYS = {
  HOME: 'home',
  EMPLOYEES_GROUP: 'employees_group',
  EMPLOYEES_LIST: 'employees_list',
  EMPLOYEES_SCHEDULE: 'employees_schedule',
  EMPLOYEES_RATING: 'employees_rating',
  EMPLOYEES_PAYROLL: 'employees_payroll',
  HR_GROUP: 'hr_group',
  HR_VACANCIES: 'hr_vacancies',
  HR_CANDIDATES: 'hr_candidates',
  PROCUREMENT_GROUP: 'procurement_group',
  PROCUREMENT: 'procurement',
  RECEIVING: 'receiving',
  SUPPLIERS: 'suppliers',
  PRICE_TAGS: 'price_tags',
  ACADEMY: 'academy',
  ACADEMY_GROUP: 'academy_group',
  ACADEMY_MANAGE: 'academy_manage',
  STANDARDS_GROUP: 'standards_group',
  STANDARDS: 'standards',
  STANDARDS_MANAGE: 'standards_manage',
  SETTINGS: 'settings',
  SETTINGS_GENERAL: 'settings_general',
  SETTINGS_ROLES: 'settings_roles',
}

const ALL_PLATFORM_ROLES = [
  ROLE_IDS.ADMIN,
  ROLE_IDS.PURCHASER,
  ROLE_IDS.RECEIVER,
  ROLE_IDS.FLOOR_ADMIN,
  ROLE_IDS.CASHIER,
  ROLE_IDS.SELLER,
]

const STAFF_EMPLOYEES_ROLES = [
  ROLE_IDS.FLOOR_ADMIN,
  ROLE_IDS.CASHIER,
  ROLE_IDS.SELLER,
  ROLE_IDS.PURCHASER,
  ROLE_IDS.RECEIVER,
]

const ROUTE_ACCESS = {
  [ROUTE_KEYS.HOME]: ALL_PLATFORM_ROLES,
  [ROUTE_KEYS.EMPLOYEES_GROUP]: [ROLE_IDS.ADMIN, ...STAFF_EMPLOYEES_ROLES],
  [ROUTE_KEYS.EMPLOYEES_LIST]: [ROLE_IDS.ADMIN],
  [ROUTE_KEYS.EMPLOYEES_SCHEDULE]: [ROLE_IDS.ADMIN, ...STAFF_EMPLOYEES_ROLES],
  [ROUTE_KEYS.EMPLOYEES_RATING]: [ROLE_IDS.ADMIN, ...STAFF_EMPLOYEES_ROLES],
  [ROUTE_KEYS.EMPLOYEES_PAYROLL]: [ROLE_IDS.ADMIN],
  [ROUTE_KEYS.HR_GROUP]: [ROLE_IDS.ADMIN],
  [ROUTE_KEYS.HR_VACANCIES]: [ROLE_IDS.ADMIN],
  [ROUTE_KEYS.HR_CANDIDATES]: [ROLE_IDS.ADMIN],
  [ROUTE_KEYS.PROCUREMENT_GROUP]: [
    ROLE_IDS.ADMIN,
    ROLE_IDS.PURCHASER,
    ROLE_IDS.RECEIVER,
  ],
  [ROUTE_KEYS.PROCUREMENT]: [ROLE_IDS.ADMIN, ROLE_IDS.PURCHASER],
  [ROUTE_KEYS.RECEIVING]: [
    ROLE_IDS.ADMIN,
    ROLE_IDS.PURCHASER,
    ROLE_IDS.RECEIVER,
  ],
  [ROUTE_KEYS.SUPPLIERS]: [ROLE_IDS.ADMIN, ROLE_IDS.PURCHASER],
  [ROUTE_KEYS.PRICE_TAGS]: [
    ROLE_IDS.ADMIN,
    ROLE_IDS.PURCHASER,
    ROLE_IDS.RECEIVER,
    ROLE_IDS.FLOOR_ADMIN,
  ],
  [ROUTE_KEYS.ACADEMY]: ALL_PLATFORM_ROLES,
  [ROUTE_KEYS.ACADEMY_GROUP]: ALL_PLATFORM_ROLES,
  [ROUTE_KEYS.ACADEMY_MANAGE]: [ROLE_IDS.ADMIN],
  [ROUTE_KEYS.STANDARDS_GROUP]: ALL_PLATFORM_ROLES,
  [ROUTE_KEYS.STANDARDS]: ALL_PLATFORM_ROLES,
  [ROUTE_KEYS.STANDARDS_MANAGE]: [ROLE_IDS.ADMIN],
  [ROUTE_KEYS.SETTINGS]: [ROLE_IDS.ADMIN],
  [ROUTE_KEYS.SETTINGS_GENERAL]: [ROLE_IDS.ADMIN],
  [ROUTE_KEYS.SETTINGS_ROLES]: [ROLE_IDS.ADMIN],
}

/** Определение роли пользователя с учётом legacy, RBAC role_id и admin по умолчанию */
export function resolveUserRole(user) {
  if (!user) return null
  if (user.role) return normalizeRoleId(user.role)
  const roleId = user.roleId ?? user.role_id
  if (roleId) {
    const rbacRole = getRbacCache()?.roles?.find((item) => item.id === roleId)
    if (rbacRole?.code) return normalizeRoleId(rbacRole.code)
  }
  if (user.login === 'admin') return ROLE_IDS.ADMIN
  return null
}

const MINIMAL_SAFE_PERMISSIONS = [
  PERMISSION_CODES.DASHBOARD_VIEW,
  PERMISSION_CODES.ACADEMY_VIEW,
]

function getLegacyPermissionCodes(user) {
  const role = resolveUserRole(user)
  if (!role) return new Set()
  if (isAdmin(role)) {
    const adminPerms = getRbacCache()?.permissions?.map((p) => p.code || p.slug)
    if (adminPerms?.length) return new Set(adminPerms.map(resolvePermissionCode))
    return new Set((RBAC_DEFAULT_ROLE_PERMISSIONS.admin || []).map(resolvePermissionCode))
  }
  return new Set((RBAC_DEFAULT_ROLE_PERMISSIONS[role] || []).map(resolvePermissionCode))
}

/** Набор code-прав пользователя (RBAC-кэш или legacy seed) */
export function getUserPermissionCodes(user) {
  if (!user) return new Set()

  const rbacState = getRbacLoadState()
  const fromCache = getPermissionCodesForUserRole(user)

  if (rbacState === RBAC_LOAD_STATE.LOADED) {
    if (fromCache.length > 0) {
      return new Set(fromCache.map(resolvePermissionCode))
    }
    if (isAdmin(resolveUserRole(user))) {
      return getLegacyPermissionCodes(user)
    }
    return new Set()
  }

  if (rbacState === RBAC_LOAD_STATE.ERROR) {
    if (fromCache.length > 0) {
      return new Set(fromCache.map(resolvePermissionCode))
    }
    if (isAdmin(resolveUserRole(user))) {
      return getLegacyPermissionCodes(user)
    }
    return new Set(MINIMAL_SAFE_PERMISSIONS.map(resolvePermissionCode))
  }

  if (fromCache.length > 0) {
    return new Set(fromCache.map(resolvePermissionCode))
  }

  return getLegacyPermissionCodes(user)
}

/** @deprecated */
export function getUserPermissionSlugs(user) {
  return getUserPermissionCodes(user)
}

/**
 * Универсальная проверка права доступа.
 * Admin всегда имеет доступ. При отсутствии RBAC-кэша — fallback на legacy seed.
 */
export function can(user, permission) {
  if (!user || !permission) return false
  const role = resolveUserRole(user)
  if (isAdmin(role)) return true
  const code = resolvePermissionCode(permission)
  const permissions = getUserPermissionCodes(user)
  if (permissions.has(code)) return true
  return permissions.has(permission)
}

export function canAny(user, permissions) {
  return permissions.some((permission) => can(user, permission))
}

export function canAll(user, permissions) {
  return permissions.every((permission) => can(user, permission))
}

export function hasRole(user, roles) {
  const role = resolveUserRole(user)
  if (!role) return false
  const list = Array.isArray(roles) ? roles.map(normalizeRoleId) : [normalizeRoleId(roles)]
  return list.includes(role)
}

export function canAccessRoute(user, routeKey) {
  if (!user) return false
  const role = resolveUserRole(user)
  if (role && isAdmin(role)) return true

  const P = PERMISSION_CODES

  const routePermissionMap = {
    [ROUTE_KEYS.HOME]: [P.DASHBOARD_VIEW, P.ATTENDANCE_VIEW],
    [ROUTE_KEYS.EMPLOYEES_LIST]: [P.EMPLOYEES_VIEW],
    [ROUTE_KEYS.EMPLOYEES_SCHEDULE]: [P.SCHEDULE_VIEW_TEAM, P.SCHEDULE_VIEW_OWN],
    [ROUTE_KEYS.EMPLOYEES_RATING]: [P.RATING_VIEW],
    [ROUTE_KEYS.EMPLOYEES_PAYROLL]: [P.PAYROLL_VIEW, P.FINANCE_VIEW],
    [ROUTE_KEYS.HR_VACANCIES]: [P.RECRUITMENT_VIEW, P.RECRUITMENT_MANAGE_VACANCIES],
    [ROUTE_KEYS.HR_CANDIDATES]: [P.RECRUITMENT_VIEW, P.RECRUITMENT_MANAGE_CANDIDATES],
    [ROUTE_KEYS.PROCUREMENT]: [P.PROCUREMENT_VIEW],
    [ROUTE_KEYS.RECEIVING]: [P.RECEIVING_VIEW],
    [ROUTE_KEYS.SUPPLIERS]: [P.SUPPLIERS_VIEW],
    [ROUTE_KEYS.PRICE_TAGS]: [P.PRICE_TAGS_VIEW, P.PRICE_TAGS_MANAGE],
    [ROUTE_KEYS.ACADEMY]: [P.ACADEMY_VIEW],
    [ROUTE_KEYS.ACADEMY_MANAGE]: [P.ACADEMY_MANAGE_COURSES, P.ACADEMY_ASSIGN_COURSES],
    [ROUTE_KEYS.STANDARDS]: [P.STANDARDS_VIEW],
    [ROUTE_KEYS.STANDARDS_MANAGE]: [P.STANDARDS_MANAGE],
    [ROUTE_KEYS.SETTINGS]: [P.SETTINGS_VIEW, P.SETTINGS_MANAGE],
    [ROUTE_KEYS.SETTINGS_GENERAL]: [P.SETTINGS_VIEW, P.SETTINGS_MANAGE],
    [ROUTE_KEYS.SETTINGS_ROLES]: [P.ROLES_VIEW, P.ROLES_EDIT, P.ROLES_ASSIGN_PERMISSIONS],
  }

  const permissions = routePermissionMap[routeKey]
  if (permissions?.some((perm) => can(user, perm))) return true

  if (!role) return false

  const allowed = ROUTE_ACCESS[routeKey]
  return Boolean(allowed?.includes(role))
}

export function canViewMenuItem(user, menuItem) {
  if (!menuItem?.routeKey) return false
  return canAccessRoute(user, menuItem.routeKey)
}

/** Первый доступный path из отфильтрованной навигации (порядок = PLATFORM_NAV). */
export function getFirstAllowedPathFromNav(nav, user) {
  const filtered = filterPlatformNav(nav, user)
  for (const item of filtered) {
    if (item.path) return item.path
    const child = item.children?.find((entry) => entry.path)
    if (child?.path) return child.path
  }
  return null
}

export function getDefaultPlatformPath(userOrRole) {
  const user =
    typeof userOrRole === 'object' && userOrRole !== null
      ? userOrRole
      : { role: normalizeRoleId(userOrRole) }

  if (!resolveUserRole(user)) return '/platform/profile'
  if (canAccessRoute(user, ROUTE_KEYS.HOME)) return '/platform'
  if (canAccessRoute(user, ROUTE_KEYS.ACADEMY)) return '/platform/academy/cabinet'
  return '/platform/profile'
}

export function filterPlatformNav(nav, user) {
  return nav
    .map((item) => {
      if (item.children) {
        const children = item.children
          .filter((child) => canViewMenuItem(user, child))
          .map((child) => adaptEmployeesNavItem(child, user, item))
        if (children.length === 0) return null
        const adapted = adaptEmployeesNavItem(item, user, item)
        return { ...adapted, children }
      }
      if (!canViewMenuItem(user, item)) return null
      return adaptEmployeesNavItem(item, user, item)
    })
    .filter(Boolean)
}

function adaptEmployeesNavItem(item, user, group) {
  if (group?.id !== 'employees' || canManageEmployees(user)) return item

  if (item.routeKey === ROUTE_KEYS.EMPLOYEES_SCHEDULE) {
    return {
      ...item,
      label: 'Мой график',
      title: 'Мой график',
      description: 'Ваш график работы и фактические отметки.',
    }
  }

  if (item.routeKey === ROUTE_KEYS.EMPLOYEES_RATING) {
    return {
      ...item,
      label: 'Рейтинг сотрудников',
      title: 'Рейтинг сотрудников',
      description: 'Общий рейтинг компании и ваше место в списке.',
    }
  }

  return item
}

// --- Действия: поставщики ---

export function canViewSuppliers(user) {
  return canAccessRoute(user, ROUTE_KEYS.SUPPLIERS)
}

export function canEditSuppliers(user) {
  return canAny(user, [PERMISSION_CODES.SUPPLIERS_EDIT, PERMISSION_CODES.SUPPLIERS_CREATE])
}

export function canArchiveSuppliers(user) {
  return canEditSuppliers(user)
}

export function canDeleteSuppliers(user) {
  return canEditSuppliers(user)
}

// --- Действия: закуп ---

export function canViewPurchases(user) {
  return canAccessRoute(user, ROUTE_KEYS.PROCUREMENT)
}

export function canCreatePurchase(user) {
  return can(user, PERMISSION_CODES.PROCUREMENT_CREATE)
}

export function canEditPurchase(user) {
  return canCreatePurchase(user)
}

/** @deprecated используйте canEditPurchase */
export function canEditPurchases(user) {
  return canEditPurchase(user)
}

export function canTransferToReceiving(user) {
  return canCreatePurchase(user)
}

export function canViewReceivingDocuments(user) {
  return canAccessRoute(user, ROUTE_KEYS.RECEIVING)
}

export function canReceiveGoods(user) {
  return can(user, PERMISSION_CODES.RECEIVING_MANAGE)
}

export function isSimplePurchaseReceived(order) {
  return order?.status === 'received'
}

export function canEditSimplePurchase(user, order) {
  const role = resolveUserRole(user)
  if (isAdmin(role)) return true
  if (isSimplePurchaseReceived(order)) return false
  if (role !== ROLE_IDS.PURCHASER) return false
  const author = order?.createdBy ?? order?.created_by ?? ''
  const userKey = user?.login || String(user?.id || '')
  return author === userKey
}

export function canDeleteSimplePurchase(user, order) {
  return canEditSimplePurchase(user, order)
}

export function canAcceptSimpleDelivery(user) {
  return canViewReceivingDocuments(user)
}

// --- Действия: сотрудники и настройки ---

export function canManageEmployees(user) {
  return canAny(user, [
    PERMISSION_CODES.EMPLOYEES_EDIT,
    PERMISSION_CODES.EMPLOYEES_CREATE,
    PERMISSION_CODES.EMPLOYEES_VIEW,
  ])
}

export function canCreateEmployees(user) {
  return can(user, PERMISSION_CODES.EMPLOYEES_CREATE)
}

export function canManageSettings(user) {
  return can(user, PERMISSION_CODES.SETTINGS_MANAGE)
}

export function canManageAcademy(user) {
  return canAny(user, [PERMISSION_CODES.ACADEMY_MANAGE_COURSES, PERMISSION_CODES.ACADEMY_ASSIGN_COURSES])
}

export function canManageStandards(user) {
  return can(user, PERMISSION_CODES.STANDARDS_MANAGE)
}

export function canManageRoles(user) {
  return canAny(user, [PERMISSION_CODES.ROLES_ASSIGN_PERMISSIONS, PERMISSION_CODES.ROLES_EDIT])
}

export function canViewRoles(user) {
  return can(user, PERMISSION_CODES.ROLES_VIEW) || canManageRoles(user)
}

export function canChangeEmployeeRoles(user) {
  return can(user, PERMISSION_CODES.EMPLOYEES_MANAGE_ROLES) || canManageEmployees(user)
}

export function canViewTeamSchedule(user) {
  return can(user, PERMISSION_CODES.SCHEDULE_VIEW_TEAM)
}

export function canViewOwnSchedule(user) {
  return can(user, PERMISSION_CODES.SCHEDULE_VIEW_OWN)
}

export function canViewEmployeeSchedule(user, employeeId) {
  if (canViewTeamSchedule(user)) return true
  if (canViewOwnSchedule(user) && Number(user?.id) === Number(employeeId)) return true
  return Number(user?.id) === Number(employeeId)
}

export function canEditEmployeeSchedule(user) {
  return canAny(user, [PERMISSION_CODES.SCHEDULE_EDIT, PERMISSION_CODES.SCHEDULE_BULK_EDIT])
}

export function getEmployeeSchedulePath(user, employeeId = null) {
  if (canViewTeamSchedule(user)) {
    return employeeId
      ? `/platform/employees/${employeeId}/schedule`
      : '/platform/employees/schedule'
  }
  return '/platform/employees/schedule'
}

export function getEmployeesSectionPath(user) {
  if (canManageEmployees(user)) return '/platform/employees/list'
  if (canAccessRoute(user, ROUTE_KEYS.EMPLOYEES_SCHEDULE)) {
    return '/platform/employees/schedule'
  }
  return getDefaultPlatformPath(user)
}

export function canEditEmployeeAvatar(user, employeeId) {
  if (canManageEmployees(user)) return true
  return Number(user?.id) === Number(employeeId)
}

export function getRoleDisplayName(user) {
  const role = resolveUserRole(user)
  return getRole(role)?.label || role || '—'
}
