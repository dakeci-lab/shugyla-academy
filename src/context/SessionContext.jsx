import { createContext, useCallback, useContext, useState } from 'react'
import { getUser, saveUser, clearUser } from '../utils/storage'
import { resolveUserRole } from '../config/permissions'
import { getRole } from '../data/roles'

const SessionContext = createContext(null)

function normalizeSessionUser(raw) {
  if (!raw) return null
  const roleId = resolveUserRole(raw)
  const role = getRole(roleId)
  return {
    ...raw,
    role: roleId,
    roleName: role?.label || roleId,
    permissions: role?.permissions || raw.permissions || [],
  }
}

export function SessionProvider({ children }) {
  const [user, setUser] = useState(() => normalizeSessionUser(getUser()))

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
      value={{ user, setSessionUser, updateSessionUser, refreshSession, logout }}
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
