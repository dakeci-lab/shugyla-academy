import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { isCloudMode } from '../lib/dataMode'
import { initializeData, refreshProcurementData } from '../services/academyDataService'
import { isPublicAppPath } from '../router/authRoutes'
import { useSession, AUTH_STATUS } from './SessionContext'
import { toUserErrorMessage } from '../utils/userErrorMessage'
import './AcademyDataContext.css'

const AcademyDataContext = createContext({
  ready: true,
  loading: false,
  loadError: null,
  version: 0,
  reload: async () => {},
  reloadProcurement: async () => {},
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
  const { authStatus, supabaseAuthenticated } = useSession()
  const cloudMode = isCloudMode()

  const [ready, setReady] = useState(!cloudMode)
  const [loading, setLoading] = useState(cloudMode)
  const [loadError, setLoadError] = useState(null)
  const [version, setVersion] = useState(0)

  const reload = useCallback(async () => {
    if (cloudMode) {
      await initializeData()
      setLoadError(null)
    }
    setVersion((v) => v + 1)
  }, [cloudMode])

  const reloadProcurement = useCallback(async () => {
    if (cloudMode) {
      await refreshProcurementData()
      setLoadError(null)
    }
    setVersion((v) => v + 1)
  }, [cloudMode])

  const notifyChange = useCallback(() => {
    setVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    let loadId = 0

    async function load() {
      const currentLoadId = ++loadId

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
        if (currentLoadId === loadId && !cancelled) {
          setReady(true)
          setLoading(false)
          setLoadError(null)
        }
        return
      }

      setLoading(true)
      try {
        await initializeData()
        if (!cancelled && currentLoadId === loadId) {
          setLoadError(null)
        }
      } catch (error) {
        console.error('Academy data load failed:', error)
        if (import.meta.env.DEV) {
          console.error('[AcademyDataLoad]', {
            code: error?.code,
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
          })
        }
        if (!cancelled && currentLoadId === loadId) {
          setLoadError(classifyDataLoadError(error))
        }
      } finally {
        if (!cancelled && currentLoadId === loadId) {
          setReady(true)
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [cloudMode, authStatus, supabaseAuthenticated])

  if ((loading || !ready) && !isPublicRoute) {
    return <DataLoadingScreen />
  }

  return (
    <AcademyDataContext.Provider
      value={{ ready, loading, loadError, version, reload, reloadProcurement, notifyChange }}
    >
      {children}
    </AcademyDataContext.Provider>
  )
}

export function useAcademyData() {
  return useContext(AcademyDataContext)
}
