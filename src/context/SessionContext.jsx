import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { getUser, saveUser, clearUser } from '../utils/storage'
import { getUserPermissionCodes, resolveUserRole } from '../config/permissions'
import { getRole, normalizeRoleId } from '../data/roles'
import { ensureRbacLoaded, getRoleById, getRoleByCode } from '../services/rbacService'
import {
  restorePlatformSession,
  signOut,
  usesSupabaseAuth,
  subscribeToAuthChanges,
  resolveSessionUser,
  SESSION_TYPE,
} from '../services/authService'
import { isCloudMode } from '../lib/dataMode'

const SessionContext = createContext(null)

export const AUTH_STATUS = {
  LOADING: 'loading',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
}

export { SESSION_TYPE }

function normalizeSessionUser(raw, options = {}) {
  if (!raw) return null
  const { trustPermissionCodes = false } = options

  const rbacRole =
    (raw.roleId && getRoleById(raw.roleId)) ||
    (raw.role && getRoleByCode(normalizeRoleId(raw.role))) ||
    null

  const roleSlug = rbacRole?.code || resolveUserRole(raw) || raw.role || null
  const staticRole = roleSlug ? getRole(roleSlug) : null

  const enriched = {
    ...raw,
    role: roleSlug,
    roleId: raw.roleId ?? rbacRole?.id ?? null,
    roleName: rbacRole?.name || staticRole?.label || raw.roleName || roleSlug,
    permissions: [],
  }

  const permissionSlugs =
    trustPermissionCodes && Array.isArray(raw.permissionCodes) && raw.permissionCodes.length > 0
      ? [...raw.permissionCodes]
      : [...getUserPermissionCodes(enriched)]

  return {
    ...enriched,
    permissionSlugs,
    permissionCodes: permissionSlugs,
  }
}

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authStatus, setAuthStatus] = useState(AUTH_STATUS.LOADING)
  const [sessionType, setSessionType] = useState(null)
  const [supabaseAuthenticated, setSupabaseAuthenticated] = useState(false)
  const [rbacReady, setRbacReady] = useState(false)
  const sessionEstablishedRef = useRef(false)
  const initGenerationRef = useRef(0)

  useEffect(() => {
    const initId = ++initGenerationRef.current
    let cancelled = false
    let unsubscribeAuth = () => {}

    async function applyRestoredSession(restored) {
      if (cancelled || initId !== initGenerationRef.current) {
        return
      }

      const shouldApplyUser = !sessionEstablishedRef.current

      const trustPermissions = restored.sessionType === SESSION_TYPE.LEGACY
      const normalized = restored.user
        ? normalizeSessionUser(
            {
              ...restored.user,
              sessionType: restored.sessionType,
            },
            { trustPermissionCodes: trustPermissions }
          )
        : null

      if (shouldApplyUser) {
        if (normalized) {
          saveUser(normalized)
        }

        if (cancelled || initId !== initGenerationRef.current) {
          return
        }

        setUser(normalized)
        setSessionType(restored.sessionType)
        setSupabaseAuthenticated(restored.supabaseAuthenticated)
        setAuthStatus(
          normalized ? AUTH_STATUS.AUTHENTICATED : AUTH_STATUS.UNAUTHENTICATED
        )
      }

      setRbacReady(true)
    }

    async function initSession() {
      let restored = {
        user: null,
        sessionType: null,
        supabaseAuthenticated: false,
      }

      try {
        restored = await restorePlatformSession()
      } catch {
        if (!sessionEstablishedRef.current) {
          clearUser()
        }
      }

      try {
        await ensureRbacLoaded()
      } catch {
        // RBAC fallback обрабатывается в permissions.js
      }

      await applyRestoredSession(restored)
    }

    if (isCloudMode() && usesSupabaseAuth()) {
      unsubscribeAuth = subscribeToAuthChanges(async (session, event) => {
        if (cancelled || initId !== initGenerationRef.current) return

        if (event === 'SIGNED_OUT') {
          clearUser()
          sessionEstablishedRef.current = false
          setUser(null)
          setSessionType(null)
          setSupabaseAuthenticated(false)
          setAuthStatus(AUTH_STATUS.UNAUTHENTICATED)
          setRbacReady(false)
          return
        }

        if (event === 'TOKEN_REFRESHED' && session?.access_token) {
          setSupabaseAuthenticated(true)
          return
        }

        if (event !== 'SIGNED_IN' || !session?.access_token || !session.user?.id) return
        if (sessionEstablishedRef.current) return

        try {
          const profile = await resolveSessionUser(session)
          if (!profile || cancelled || initId !== initGenerationRef.current) {
            if (!cancelled) {
              await signOut().catch(() => {})
              clearUser()
              setUser(null)
              setSessionType(null)
              setSupabaseAuthenticated(false)
              setAuthStatus(AUTH_STATUS.UNAUTHENTICATED)
              setRbacReady(true)
            }
            return
          }

          await applyRestoredSession({
            user: profile,
            sessionType: SESSION_TYPE.SUPABASE,
            supabaseAuthenticated: true,
          })
        } catch {
          if (!cancelled) {
            await signOut().catch(() => {})
            clearUser()
            setUser(null)
            setSessionType(null)
            setSupabaseAuthenticated(false)
            setAuthStatus(AUTH_STATUS.UNAUTHENTICATED)
            setRbacReady(true)
          }
        }
      })
    }

    initSession()

    return () => {
      cancelled = true
      unsubscribeAuth()
    }
  }, [])

  const refreshSession = useCallback(() => {
    const stored = getUser()
    const normalized = stored
      ? normalizeSessionUser(stored, {
          trustPermissionCodes: stored.sessionType === SESSION_TYPE.LEGACY,
        })
      : null
    setUser(normalized)
    setSessionType(stored?.sessionType ?? null)
    setSupabaseAuthenticated(
      stored?.sessionType === SESSION_TYPE.SUPABASE ||
        Boolean(stored?.supabaseAuthenticated)
    )
    setAuthStatus(
      normalized ? AUTH_STATUS.AUTHENTICATED : AUTH_STATUS.UNAUTHENTICATED
    )
    setRbacReady(true)
  }, [])

  const setSessionUser = useCallback((sessionUser, options = {}) => {
    sessionEstablishedRef.current = true
    const nextSessionType =
      options.sessionType ?? sessionUser?.sessionType ?? SESSION_TYPE.LEGACY
    const nextSupabaseAuthenticated =
      options.supabaseAuthenticated ??
      sessionUser?.supabaseAuthenticated ??
      nextSessionType === SESSION_TYPE.SUPABASE
    const normalized = normalizeSessionUser(
      {
        ...sessionUser,
        sessionType: nextSessionType,
        supabaseAuthenticated: nextSupabaseAuthenticated,
      },
      { trustPermissionCodes: nextSessionType === SESSION_TYPE.LEGACY }
    )
    saveUser(normalized)
    setUser(normalized)
    setSessionType(nextSessionType)
    setSupabaseAuthenticated(nextSupabaseAuthenticated)
    setAuthStatus(AUTH_STATUS.AUTHENTICATED)
    setRbacReady(true)
  }, [])

  const updateSessionUser = useCallback((patch) => {
    const current = getUser()
    if (!current) return null
    const next = normalizeSessionUser(
      { ...current, ...patch },
      { trustPermissionCodes: current.sessionType === SESSION_TYPE.LEGACY }
    )
    saveUser(next)
    setUser(next)
    setSessionType(next.sessionType ?? sessionType)
    setSupabaseAuthenticated(
      next.sessionType === SESSION_TYPE.SUPABASE ||
        Boolean(next.supabaseAuthenticated)
    )
    setAuthStatus(AUTH_STATUS.AUTHENTICATED)
    return next
  }, [sessionType])

  useEffect(() => {
    if (!isCloudMode() || !supabaseAuthenticated) return

    import('../services/webPushSubscriptionService')
      .then(({ ensurePushNotificationsReady }) => ensurePushNotificationsReady())
      .catch(() => {})
  }, [supabaseAuthenticated, user?.id])

  const logout = useCallback(async () => {
    if (isCloudMode() && usesSupabaseAuth()) {
      try {
        const { removePushSubscriptionForLogout } = await import('../services/webPushSubscriptionService')
        await removePushSubscriptionForLogout()
      } catch (err) {
        console.warn('Push subscription cleanup failed during logout')
      }
      try {
        await signOut()
      } catch (err) {
        console.warn('Supabase signOut failed:', err)
      }
    }
    clearUser()
    sessionEstablishedRef.current = false
    setUser(null)
    setSessionType(null)
    setSupabaseAuthenticated(false)
    setAuthStatus(AUTH_STATUS.UNAUTHENTICATED)
    setRbacReady(false)
    if (isCloudMode()) {
      const { resetCloudBootstrapState } = await import('../services/academyDataService')
      resetCloudBootstrapState()
    }
  }, [])

  const sessionReady = authStatus !== AUTH_STATUS.LOADING

  return (
    <SessionContext.Provider
      value={{
        user,
        authStatus,
        sessionReady,
        sessionType,
        supabaseAuthenticated,
        rbacReady,
        setSessionUser,
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
