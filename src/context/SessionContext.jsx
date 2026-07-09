import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getUser, saveUser, clearUser } from '../utils/storage'
import {
  usesSupabaseAuth,
  getCurrentAuthSession,
  resolveSessionUser,
  subscribeToAuthChanges,
  signOut as authSignOut,
} from '../services/authService'

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [user, setUser] = useState(() => (usesSupabaseAuth() ? null : getUser()))
  const [authSession, setAuthSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const syncFromSupabaseSession = useCallback(async (session) => {
    setAuthSession(session)
    if (!session) {
      clearUser()
      setUser(null)
      return
    }

    try {
      const profile = await resolveSessionUser(session)
      if (profile) {
        saveUser(profile)
        setUser(profile)
      } else {
        clearUser()
        setUser(null)
      }
    } catch (error) {
      console.error('Failed to resolve session user:', error)
      clearUser()
      setUser(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function initAuth() {
      if (!usesSupabaseAuth()) {
        setUser(getUser())
        setAuthSession(null)
        setAuthLoading(false)
        return
      }

      try {
        const session = await getCurrentAuthSession()
        if (!cancelled) {
          await syncFromSupabaseSession(session)
        }
      } catch (error) {
        console.error('Auth init failed:', error)
        if (!cancelled) {
          clearUser()
          setUser(null)
          setAuthSession(null)
        }
      } finally {
        if (!cancelled) setAuthLoading(false)
      }
    }

    initAuth()

    const unsubscribe = subscribeToAuthChanges((session) => {
      if (!cancelled) {
        syncFromSupabaseSession(session)
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [syncFromSupabaseSession])

  const refreshSession = useCallback(() => {
    if (usesSupabaseAuth()) return
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

  const logout = useCallback(async () => {
    try {
      await authSignOut()
    } catch (error) {
      console.warn('Sign out failed:', error)
    } finally {
      clearUser()
      setUser(null)
      setAuthSession(null)
    }
  }, [])

  const completeLogin = useCallback((sessionUser, session = null) => {
    saveUser(sessionUser)
    setUser(sessionUser)
    if (session) setAuthSession(session)
  }, [])

  const isAuthenticated = usesSupabaseAuth() ? Boolean(authSession && user) : Boolean(user)

  return (
    <SessionContext.Provider
      value={{
        user,
        authSession,
        authLoading,
        isAuthenticated,
        setSessionUser,
        completeLogin,
        updateSessionUser,
        refreshSession,
        logout,
      }}
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
