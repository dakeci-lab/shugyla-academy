import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { isCloudMode } from '../lib/dataMode'
import {
  initializeData,
  refreshProcurementData,
  ensureModulesLoaded,
  getRouteCriticalModules,
  setCloudBootstrapListener,
  resetCloudBootstrapState,
} from '../services/academyDataService'
import { getAllModuleLoadStates } from '../lib/cloudStore'
import { isPublicAppPath } from '../router/authRoutes'
import { useSession, AUTH_STATUS } from './SessionContext'
import { toUserErrorMessage } from '../utils/userErrorMessage'
import './AcademyDataContext.css'

const AcademyDataContext = createContext({
  ready: true,
  loading: false,
  loadError: null,
  version: 0,
  moduleStates: {},
  reload: async () => {},
  reloadProcurement: async () => {},
  ensureModules: async () => {},
  notifyChange: () => {},
})

function DataLoadingScreen() {
  return (
    <div className="academy-data-loading">
      <div className="academy-data-loading__card">
        <div className="academy-data-loading__logo" aria-hidden="true">S</div>
        <h1 className="academy-data-loading__brand">Shugyla Platform</h1>
        <span className="academy-data-loading__spinner" aria-hidden />
        <p>Загрузка…</p>
      </div>
    </div>
  )
}

function classifyDataLoadError(error) {
  const message = error?.message || String(error || '')
  const lower = message.toLowerCase()

  if (
    lower.includes('jwt') ||
    lower.includes('not authenticated') ||
    lower.includes('unauthorized') ||
    lower.includes('401')
  ) {
    return {
      code: 'auth',
      message: 'Сессия недействительна. Войдите снова.',
    }
  }

  if (
    lower.includes('permission denied') ||
    lower.includes('row-level security') ||
    lower.includes('rls') ||
    lower.includes('42501') ||
    lower.includes('403')
  ) {
    return {
      code: 'access',
      message: 'Нет доступа к данным закупа. Обратитесь к администратору.',
    }
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('offline')
  ) {
    return {
      code: 'network',
      message: 'Нет соединения с сервером. Проверьте интернет и повторите.',
    }
  }

  return {
    code: 'server',
    message: toUserErrorMessage(error, 'Не удалось загрузить данные с сервера.'),
  }
}

export function AcademyDataProvider({ children }) {
  const { pathname } = useLocation()
  const isPublicRoute = isPublicAppPath(pathname)
  const { authStatus, supabaseAuthenticated, user } = useSession()
  const cloudMode = isCloudMode()

  const [ready, setReady] = useState(!cloudMode)
  const [loading, setLoading] = useState(cloudMode)
  const [loadError, setLoadError] = useState(null)
  const [version, setVersion] = useState(0)
  const [moduleStates, setModuleStates] = useState(() => getAllModuleLoadStates())

  const bumpVersion = useCallback(() => {
    setVersion((v) => v + 1)
    setModuleStates(getAllModuleLoadStates())
  }, [])

  const reload = useCallback(async () => {
    if (cloudMode) {
      await initializeData({ mode: 'full', pathname, userId: user?.id })
      setLoadError(null)
    }
    bumpVersion()
  }, [cloudMode, pathname, user?.id, bumpVersion])

  const reloadProcurement = useCallback(async () => {
    if (cloudMode) {
      await refreshProcurementData()
      setLoadError(null)
    }
    bumpVersion()
  }, [cloudMode, bumpVersion])

  const ensureModules = useCallback(
    async (moduleNames = []) => {
      if (!cloudMode) return
      try {
        await ensureModulesLoaded(moduleNames)
        setLoadError(null)
      } catch (error) {
        // Module errors stay in module state; do not gate the whole shell.
        if (import.meta.env.DEV) {
          console.error('[AcademyDataEnsureModules]', error)
        }
      } finally {
        bumpVersion()
      }
    },
    [cloudMode, bumpVersion]
  )

  const notifyChange = useCallback(() => {
    bumpVersion()
  }, [bumpVersion])

  useEffect(() => {
    setCloudBootstrapListener(bumpVersion)
    return () => setCloudBootstrapListener(null)
  }, [bumpVersion])

  useEffect(() => {
    let cancelled = false

    async function syncShell() {
      if (!cloudMode) {
        setReady(true)
        setLoading(false)
        setLoadError(null)
        return
      }

      if (authStatus === AUTH_STATUS.LOADING) {
        setLoading(true)
        setReady(false)
        return
      }

      if (authStatus !== AUTH_STATUS.AUTHENTICATED || !supabaseAuthenticated) {
        if (!cancelled) {
          resetCloudBootstrapState()
          setReady(true)
          setLoading(false)
          setLoadError(null)
          setModuleStates(getAllModuleLoadStates())
        }
        return
      }

      // Shell-critical: Auth + profile + RBAC already handled by Session/PlatformSessionGate.
      // Unblock layout immediately; load modules progressively.
      if (!cancelled) {
        setReady(true)
        setLoading(false)
        setLoadError(null)
      }

      try {
        await initializeData({
          mode: 'progressive',
          pathname,
          userId: user?.id,
        })
        if (!cancelled) {
          bumpVersion()
        }
      } catch (error) {
        console.error('Academy progressive bootstrap failed:', error)
        if (!cancelled) {
          // Progressive bootstrap should not hard-fail the shell.
          setLoadError(classifyDataLoadError(error))
          bumpVersion()
        }
      }
    }

    void syncShell()

    return () => {
      cancelled = true
    }
  }, [cloudMode, authStatus, supabaseAuthenticated, user?.id, bumpVersion])

  // Route changes: prioritize modules for the active page (no full re-bootstrap).
  useEffect(() => {
    if (!cloudMode) return
    if (authStatus !== AUTH_STATUS.AUTHENTICATED || !supabaseAuthenticated) return

    const modules = getRouteCriticalModules(pathname)
    if (modules.length === 0) return

    let cancelled = false
    void ensureModulesLoaded(modules)
      .catch((error) => {
        if (import.meta.env.DEV) {
          console.error('[AcademyRouteModules]', error)
        }
      })
      .finally(() => {
        if (!cancelled) bumpVersion()
      })

    return () => {
      cancelled = true
    }
  }, [cloudMode, authStatus, supabaseAuthenticated, pathname, bumpVersion])

  // Auth loading only — never block the shell on background module sync.
  if (cloudMode && authStatus === AUTH_STATUS.LOADING && !isPublicRoute) {
    return <DataLoadingScreen />
  }

  return (
    <AcademyDataContext.Provider
      value={{
        ready,
        loading,
        loadError,
        version,
        moduleStates,
        reload,
        reloadProcurement,
        ensureModules,
        notifyChange,
      }}
    >
      {children}
    </AcademyDataContext.Provider>
  )
}

export function useAcademyData() {
  return useContext(AcademyDataContext)
}
