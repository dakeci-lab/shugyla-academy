import { Navigate, useLocation } from 'react-router-dom'
import { useSession, AUTH_STATUS } from '../context/SessionContext'
import { canManageAdmin, roleHasPermission } from '../utils/auth'
import { getDefaultPlatformPath } from '../platform/platformAccess'
import { getLoginUrl } from '../router/authRoutes'
import AuthLoadingScreen from './AuthLoadingScreen'

/**
 * Защищённый маршрут — проверяет внутреннюю сессию пользователя
 */
export default function ProtectedRoute({
  children,
  requireAdmin = false,
  requiredPermission = null,
}) {
  const { user, authStatus } = useSession()
  const location = useLocation()

  if (authStatus === AUTH_STATUS.LOADING) {
    return <AuthLoadingScreen />
  }

  if (!user) {
    const redirectPath = `${location.pathname}${location.search}`
    return <Navigate to={getLoginUrl(redirectPath)} replace />
  }

  if (requireAdmin && !canManageAdmin(user.role)) {
    return <Navigate to={getDefaultPlatformPath(user.role)} replace />
  }

  if (requiredPermission && !roleHasPermission(user.role, requiredPermission)) {
    return <Navigate to={getDefaultPlatformPath(user.role)} replace />
  }

  return children
}
