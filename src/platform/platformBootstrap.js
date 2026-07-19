import { PLATFORM_NAV } from './platformNav'
import {
  ROUTE_KEYS,
  canAccessRoute,
  resolveUserRole,
  getFirstAllowedPathFromNav,
} from '../config/permissions'
import { isAcademyModuleEnabled } from '../config/featureFlags'
import { normalizeRoleId } from '../data/roles'

/** Первый разрешённый маршрут по конфигурации меню платформы. */
export function getFirstAllowedPlatformPath(user) {
  return getFirstAllowedPathFromNav(PLATFORM_NAV, user)
}

/** Безопасный стартовый маршрут с учётом RBAC и навигации. */
export function getDefaultPlatformPath(userOrRole) {
  const user =
    typeof userOrRole === 'object' && userOrRole !== null
      ? userOrRole
      : { role: normalizeRoleId(userOrRole) }

  if (!resolveUserRole(user)) return '/platform/profile'
  if (canAccessRoute(user, ROUTE_KEYS.HOME)) return '/platform'

  const firstAllowed = getFirstAllowedPlatformPath(user)
  if (firstAllowed) return firstAllowed

  if (isAcademyModuleEnabled() && canAccessRoute(user, ROUTE_KEYS.ACADEMY)) {
    return '/platform/academy/cabinet'
  }
  return '/platform/profile'
}

/**
 * Редirect с /platform, если HOME недоступен.
 * Возвращает path или null, если текущий маршрут оставить без изменений.
 */
export function resolvePlatformStartPath(user, pathname = '/platform') {
  if (!user || !resolveUserRole(user)) return null

  const normalized = pathname.replace(/\/+$/, '') || '/platform'
  if (normalized !== '/platform') return null

  if (canAccessRoute(user, ROUTE_KEYS.HOME)) return '/platform'
  return getFirstAllowedPlatformPath(user)
}

export function isPlatformProfileReady(user) {
  return Boolean(user && resolveUserRole(user))
}
