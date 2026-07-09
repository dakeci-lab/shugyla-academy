/**
 * Совместимость: доступ к разделам платформы через config/permissions
 */

import {
  ROUTE_KEYS,
  canAccessRoute,
  canViewMenuItem,
  filterPlatformNav as filterNav,
  getDefaultPlatformPath,
  resolveUserRole,
} from '../config/permissions'

/** @deprecated используйте ROUTE_KEYS */
export const ACCESS = {
  ADMIN: ROUTE_KEYS.EMPLOYEES_LIST,
  PROCUREMENT: ROUTE_KEYS.PROCUREMENT_GROUP,
  PURCHASE_VIEW: ROUTE_KEYS.PROCUREMENT,
  SUPPLIERS_VIEW: ROUTE_KEYS.SUPPLIERS,
  ALL: ROUTE_KEYS.ACADEMY,
  HOME: ROUTE_KEYS.HOME,
  SETTINGS: ROUTE_KEYS.SETTINGS,
  RECEIVING: ROUTE_KEYS.RECEIVING,
  PRICE_TAGS: ROUTE_KEYS.PRICE_TAGS,
  ACADEMY_MANAGE: ROUTE_KEYS.ACADEMY_MANAGE,
  EMPLOYEES_RATING: ROUTE_KEYS.EMPLOYEES_RATING,
}

export { ROUTE_KEYS, getDefaultPlatformPath, resolveUserRole }

export function canAccessNavItem(userOrRole, routeKey = ROUTE_KEYS.ACADEMY) {
  const user =
    typeof userOrRole === 'object' && userOrRole !== null
      ? userOrRole
      : { role: userOrRole }
  return canAccessRoute(user, routeKey)
}

export function filterPlatformNav(nav, userOrRole) {
  const user =
    typeof userOrRole === 'object' && userOrRole !== null
      ? userOrRole
      : { role: userOrRole }
  return filterNav(nav, user)
}

export { canViewMenuItem }
