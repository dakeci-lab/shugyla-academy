import { Navigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { canManageAdmin, roleHasPermission } from '../utils/auth'

/**
 * Защищённый маршрут — перенаправляет на /login, если пользователь не авторизован
 * requireAdmin — доступ только для роли с manage_users
 * requiredPermission — доступ при наличии конкретного разрешения
 */
export default function ProtectedRoute({
  children,
  requireAdmin = false,
  requiredPermission = null,
}) {
  const { user } = useSession()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (requireAdmin && !canManageAdmin(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  if (requiredPermission && !roleHasPermission(user.role, requiredPermission)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
