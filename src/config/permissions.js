/**
 * Единая система прав доступа Shugyla Platform
 */

import { ROLE_IDS, isAdmin, normalizeRoleId, getRole } from '../data/roles'

export { ROLE_IDS }

/** Ключи маршрутов / пунктов меню */
export const ROUTE_KEYS = {
  HOME: 'home',
  EMPLOYEES_GROUP: 'employees_group',
  EMPLOYEES_LIST: 'employees_list',
  EMPLOYEES_SCHEDULE: 'employees_schedule',
  EMPLOYEES_RATING: 'employees_rating',
  EMPLOYEES_PAYROLL: 'employees_payroll',
  PROCUREMENT_GROUP: 'procurement_group',
  PROCUREMENT: 'procurement',
  RECEIVING: 'receiving',
  SUPPLIERS: 'suppliers',
  PRICE_TAGS: 'price_tags',
  ACADEMY: 'academy',
  ACADEMY_MANAGE: 'academy_manage',
  SETTINGS: 'settings',
}

const ALL_PLATFORM_ROLES = [
  ROLE_IDS.ADMIN,
  ROLE_IDS.PURCHASER,
  ROLE_IDS.RECEIVER,
  ROLE_IDS.FLOOR_ADMIN,
  ROLE_IDS.CASHIER,
  ROLE_IDS.SELLER,
]

const ROUTE_ACCESS = {
  [ROUTE_KEYS.HOME]: ALL_PLATFORM_ROLES,
  [ROUTE_KEYS.EMPLOYEES_GROUP]: [
    ROLE_IDS.ADMIN,
    ROLE_IDS.FLOOR_ADMIN,
    ROLE_IDS.CASHIER,
    ROLE_IDS.SELLER,
  ],
  [ROUTE_KEYS.EMPLOYEES_LIST]: [ROLE_IDS.ADMIN],
  [ROUTE_KEYS.EMPLOYEES_SCHEDULE]: [ROLE_IDS.ADMIN],
  [ROUTE_KEYS.EMPLOYEES_RATING]: [
    ROLE_IDS.ADMIN,
    ROLE_IDS.FLOOR_ADMIN,
    ROLE_IDS.CASHIER,
    ROLE_IDS.SELLER,
  ],
  [ROUTE_KEYS.EMPLOYEES_PAYROLL]: [ROLE_IDS.ADMIN],
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
  [ROUTE_KEYS.ACADEMY_MANAGE]: [ROLE_IDS.ADMIN],
  [ROUTE_KEYS.SETTINGS]: [ROLE_IDS.ADMIN],
}

/** Определение роли пользователя с учётом legacy и admin по умолчанию */
export function resolveUserRole(user) {
  if (!user) return null
  if (user.role) return normalizeRoleId(user.role)
  if (user.login === 'admin') return ROLE_IDS.ADMIN
  return null
}

export function hasRole(user, roles) {
  const role = resolveUserRole(user)
  if (!role) return false
  const list = Array.isArray(roles) ? roles.map(normalizeRoleId) : [normalizeRoleId(roles)]
  return list.includes(role)
}

export function canAccessRoute(user, routeKey) {
  const role = resolveUserRole(user)
  if (!role) return false
  if (isAdmin(role)) return true
  const allowed = ROUTE_ACCESS[routeKey]
  return Boolean(allowed?.includes(role))
}

export function canViewMenuItem(user, menuItem) {
  if (!menuItem?.routeKey) return false
  return canAccessRoute(user, menuItem.routeKey)
}

export function getDefaultPlatformPath(userOrRole) {
  const role =
    typeof userOrRole === 'object'
      ? resolveUserRole(userOrRole)
      : normalizeRoleId(userOrRole)

  if (!role) return '/platform/academy'
  if (canAccessRoute({ role }, ROUTE_KEYS.HOME)) return '/platform'
  if (canAccessRoute({ role }, ROUTE_KEYS.ACADEMY)) return '/platform/academy'
  return '/platform/profile'
}

export function filterPlatformNav(nav, user) {
  return nav
    .map((item) => {
      if (item.children) {
        const children = item.children.filter((child) => canViewMenuItem(user, child))
        if (children.length === 0) return null
        return { ...item, children }
      }
      if (!canViewMenuItem(user, item)) return null
      return item
    })
    .filter(Boolean)
}

// --- Действия: поставщики ---

export function canViewSuppliers(user) {
  return canAccessRoute(user, ROUTE_KEYS.SUPPLIERS)
}

export function canEditSuppliers(user) {
  const role = resolveUserRole(user)
  return isAdmin(role) || role === ROLE_IDS.PURCHASER
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
  const role = resolveUserRole(user)
  return isAdmin(role) || role === ROLE_IDS.PURCHASER
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
  const role = resolveUserRole(user)
  return isAdmin(role) || role === ROLE_IDS.RECEIVER
}

// --- Действия: сотрудники и настройки ---

export function canManageEmployees(user) {
  return canAccessRoute(user, ROUTE_KEYS.EMPLOYEES_LIST)
}

export function canManageSettings(user) {
  return canAccessRoute(user, ROUTE_KEYS.SETTINGS)
}

export function canManageAcademy(user) {
  return canAccessRoute(user, ROUTE_KEYS.ACADEMY_MANAGE)
}

export function canChangeEmployeeRoles(user) {
  return canManageEmployees(user)
}

export function getRoleDisplayName(user) {
  const role = resolveUserRole(user)
  return getRole(role)?.label || role || '—'
}
