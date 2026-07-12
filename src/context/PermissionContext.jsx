import { createContext, useCallback, useContext, useMemo } from 'react'
import { useSession } from './SessionContext'
import {
  can as checkCan,
  canAll as checkCanAll,
  canAny as checkCanAny,
} from '../config/permissions'

const PermissionContext = createContext(null)

export function PermissionProvider({ children }) {
  const { user, rbacReady } = useSession()

  const can = useCallback(
    (permission) => {
      if (!rbacReady && user) {
        return checkCan(user, permission)
      }
      return checkCan(user, permission)
    },
    [user, rbacReady]
  )

  const canAny = useCallback(
    (permissions) => checkCanAny(user, permissions),
    [user]
  )

  const canAll = useCallback(
    (permissions) => checkCanAll(user, permissions),
    [user]
  )

  const value = useMemo(
    () => ({
      user,
      rbacReady,
      can,
      canAny,
      canAll,
      permissionCodes: user?.permissionCodes || user?.permissionSlugs || [],
    }),
    [user, rbacReady, can, canAny, canAll]
  )

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>
}

export function usePermissions() {
  const context = useContext(PermissionContext)
  if (!context) {
    throw new Error('usePermissions must be used within PermissionProvider')
  }
  return context
}

/** Хук без Provider — fallback на SessionContext + permissions.js */
export function usePermissionsOptional() {
  const context = useContext(PermissionContext)
  const session = useSession()
  if (context) return context
  return {
    user: session.user,
    rbacReady: session.rbacReady,
    can: (permission) => checkCan(session.user, permission),
    canAny: (permissions) => checkCanAny(session.user, permissions),
    canAll: (permissions) => checkCanAll(session.user, permissions),
    permissionCodes: session.user?.permissionCodes || [],
  }
}
