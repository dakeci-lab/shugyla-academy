import { Navigate } from 'react-router-dom'
import { getUser } from '../utils/storage'

/**
 * Защищённый маршрут — перенаправляет на /login, если пользователь не авторизован
 * requireAdmin — если true, доступ только для роли admin
 */
export default function ProtectedRoute({ children, requireAdmin = false }) {
  const user = getUser()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (requireAdmin && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
