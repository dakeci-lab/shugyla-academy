import { createContext, useCallback, useContext, useState } from 'react'
import { getUser, saveUser, clearUser } from '../utils/storage'

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [user, setUser] = useState(() => getUser())

  const refreshSession = useCallback(() => {
    setUser(getUser())
  }, [])

  const setSessionUser = useCallback((sessionUser) => {
    saveUser(sessionUser)
    setUser(sessionUser)
  }, [])

  const updateSessionUser = useCallback((patch) => {
    const current = getUser()
    if (!current) return null
    const next = { ...current, ...patch }
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
