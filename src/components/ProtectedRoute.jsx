import { Navigate, useLocation } from 'react-router-dom'
import { useSession, AUTH_STATUS } from '../context/SessionContext'
import { canManageAdmin, roleHasPermission } from '../utils/auth'
import { getDefaultPlatformPath } from '../platform/platformAccess'
import { getLoginUrl } from '../router/authRoutes'
import { isCloudMode } from '../lib/dataMode'
import { usesSupabaseAuth } from '../services/authService'
import AuthLoadingScreen from './AuthLoadingScreen'

/**
 * Защищённый маршрут — cloud mode требует Supabase Auth + platform session.
 */
export default function ProtectedRoute({
  children,
  requireAdmin = false,
  requiredPermission = null,
}) {
  const { user, authStatus, supabaseAuthenticated, rbacReady } = useSession()
  const location = useLocation()
  const cloudAuthRequired = isCloudMode() && usesSupabaseAuth()

  if (authStatus === AUTH_STATUS.LOADING) {
    return <AuthLoadingScreen />
  }

  const sessionValid =
    user &&
    (!cloudAuthRequired || supabaseAuthenticated)

  if (!sessionValid) {
    const redirectPath = `${location.pathname}${location.search}`
    return <Navigate to={getLoginUrl(redirectPath)} replace />
  }

  if (!rbacReady) {
    return <AuthLoadingScreen />
  }

  if (requireAdmin && !canManageAdmin(user.role)) {
    return <Navigate to={getDefaultPlatformPath(user)} replace />
  }

  if (requiredPermission && !roleHasPermission(user.role, requiredPermission)) {
    return <Navigate to={getDefaultPlatformPath(user)} replace />
  }

  return children
}
