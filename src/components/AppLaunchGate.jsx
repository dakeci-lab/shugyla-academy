import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AUTH_STATUS, useSession } from '../context/SessionContext'
import { isPublicAppPath, LOGIN_PATH } from '../router/authRoutes'
import AuthLoadingScreen from './AuthLoadingScreen'

const EXIT_MS = 280

function getExitDurationMs() {
  if (typeof window === 'undefined' || !window.matchMedia) return EXIT_MS
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : EXIT_MS
}

/**
 * Once-per-session launch overlay under SessionProvider + BrowserRouter.
 * Holds through auth (and RBAC when authenticated), then soft fade-out.
 * Public routes dismiss after first paint so useful content is not blocked.
 * Does not remount on normal in-app navigation after dismiss.
 */
export default function AppLaunchGate() {
  const { authStatus, rbacReady } = useSession()
  const { pathname } = useLocation()
  const [phase, setPhase] = useState('visible')
  const exitStartedRef = useRef(false)

  const isPublic = isPublicAppPath(pathname)
  const canShowPublicContentImmediately = isPublic && pathname !== LOGIN_PATH
  const canExit =
    canShowPublicContentImmediately ||
    (authStatus !== AUTH_STATUS.LOADING &&
      (authStatus !== AUTH_STATUS.AUTHENTICATED || rbacReady))

  useEffect(() => {
    if (phase !== 'visible' || !canExit || exitStartedRef.current) return undefined

    exitStartedRef.current = true
    setPhase('exiting')
    const timeoutId = window.setTimeout(() => {
      setPhase('gone')
    }, getExitDurationMs())

    return () => window.clearTimeout(timeoutId)
  }, [canExit, phase])

  if (phase === 'gone') return null

  return (
    <AuthLoadingScreen exiting={phase === 'exiting'} className="app-launch--gate" />
  )
}
