import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { canManageAdmin, roleHasPermission } from '../utils/auth'
import { getDefaultPlatformPath } from '../platform/platformAccess'

/**
 * Защищённый маршрут — проверяет внутреннюю сессию пользователя
 */
export default function ProtectedRoute({
  children,
  requireAdmin = false,
  requiredPermission = null,
}) {
  const { user } = useSession()
  const location = useLocation()

  if (!user) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }

  if (requireAdmin && !canManageAdmin(user.role)) {
    return <Navigate to={getDefaultPlatformPath(user.role)} replace />
  }

  if (requiredPermission && !roleHasPermission(user.role, requiredPermission)) {
    return <Navigate to={getDefaultPlatformPath(user.role)} replace />
  }

  return children
}
