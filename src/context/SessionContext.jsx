import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getUser, saveUser, clearUser } from '../utils/storage'
import { getUserPermissionCodes, resolveUserRole } from '../config/permissions'
import { getRole } from '../data/roles'
import { ensureRbacLoaded } from '../services/rbacService'

const SessionContext = createContext(null)

function normalizeSessionUser(raw) {
  if (!raw) return null
  const roleSlug = resolveUserRole(raw)
  const role = getRole(roleSlug)
  const enriched = {
    ...raw,
    role: roleSlug,
    roleId: raw.roleId ?? raw.role_id ?? null,
    roleName: role?.label || roleSlug,
    permissions: role?.permissions || raw.permissions || [],
  }
  const permissionSlugs = [...getUserPermissionCodes(enriched)]
  return {
    ...enriched,
    permissionSlugs,
    permissionCodes: permissionSlugs,
  }
}

export function SessionProvider({ children }) {
  const [user, setUser] = useState(() => normalizeSessionUser(getUser()))
  const [rbacReady, setRbacReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ensureRbacLoaded()
      .catch(() => null)
      .finally(() => {
        if (cancelled) return
        setRbacReady(true)
        setUser(normalizeSessionUser(getUser()))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const refreshSession = useCallback(() => {
    setUser(normalizeSessionUser(getUser()))
  }, [])

  const setSessionUser = useCallback((sessionUser) => {
    const normalized = normalizeSessionUser(sessionUser)
    saveUser(normalized)
    setUser(normalized)
  }, [])

  const updateSessionUser = useCallback((patch) => {
    const current = getUser()
    if (!current) return null
    const next = normalizeSessionUser({ ...current, ...patch })
    saveUser(next)
    setUser(next)
    return next
  }, [])

  const logout = useCallback(() => {
    clearUser()
    setUser(null)
  }, [])

  return (
    <SessionContext.Provider
      value={{ user, rbacReady, setSessionUser, updateSessionUser, refreshSession, logout }}
    >
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used within SessionProvider')
  }
  return context
}
