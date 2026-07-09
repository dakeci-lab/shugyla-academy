import { ROLE_IDS } from '../data/roles'
import { canManageAdmin } from '../utils/auth'
import { canViewSuppliers, ROLE_RECEIVER } from './supplierAccess'
import { canViewPurchases } from './purchaseAccess'

/** Типы доступа к разделам платформы */
export const ACCESS = {
  ADMIN: 'admin',
  PROCUREMENT: 'procurement',
  PURCHASE_VIEW: 'purchase_view',
  SUPPLIERS_VIEW: 'suppliers_view',
  ALL: 'all',
}

/** Роли с доступом к закупкам, приёмке, поставщикам и ценникам */
export const PROCUREMENT_ROLES = new Set([
  ROLE_IDS.ADMIN,
  ROLE_IDS.BUYER,
  'receiver',
])

export function canAccessNavItem(role, access = ACCESS.ALL) {
  if (!role) return false
  if (access === ACCESS.ALL) return true
  if (access === ACCESS.ADMIN) return canManageAdmin(role)
  if (access === ACCESS.PROCUREMENT) {
    return canManageAdmin(role) || PROCUREMENT_ROLES.has(role)
  }
  if (access === ACCESS.SUPPLIERS_VIEW) {
    return canViewSuppliers({ role })
  }
  if (access === ACCESS.PURCHASE_VIEW) {
    return canViewPurchases({ role })
  }
  return false
}

export function getDefaultPlatformPath(role) {
  if (canManageAdmin(role)) return '/platform'
  if (role === ROLE_RECEIVER) return '/platform/receiving'
  if (role === ROLE_IDS.BUYER) return '/platform/procurement'
  if (PROCUREMENT_ROLES.has(role)) return '/platform/receiving'
  return '/platform/academy'
}

export function filterPlatformNav(nav, role) {
  return nav
    .map((item) => {
      if (item.children) {
        const children = item.children.filter((child) =>
          canAccessNavItem(role, child.access)
        )
        if (children.length === 0) return null
        return { ...item, children }
      }
      if (!canAccessNavItem(role, item.access)) return null
      return item
    })
    .filter(Boolean)
}
