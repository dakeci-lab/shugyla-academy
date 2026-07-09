import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { canManageAdmin, roleHasPermission } from '../utils/auth'
import AuthLoadingScreen from './AuthLoadingScreen'

/**
 * Защищённый маршрут — проверяет Supabase Auth session или локальную сессию
 */
export default function ProtectedRoute({
  children,
  requireAdmin = false,
  requiredPermission = null,
}) {
  const { user, authLoading, isAuthenticated } = useSession()
  const location = useLocation()

  if (authLoading) {
    return <AuthLoadingScreen />
  }

  if (!isAuthenticated) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }

  if (requireAdmin && !canManageAdmin(user.role)) {
    return <Navigate to="/platform" replace />
  }

  if (requiredPermission && !roleHasPermission(user.role, requiredPermission)) {
    return <Navigate to="/platform" replace />
  }

  return children
}
