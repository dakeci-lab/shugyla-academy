import { Navigate } from 'react-router-dom'
import { AUTH_STATUS, useSession } from '../../context/SessionContext'
import { canAccessRoute, ROUTE_KEYS } from '../../config/permissions'
import { getDefaultPlatformPath } from '../../platform/platformAccess'

/** HR-маршруты — только администратор; иначе редирект без отображения контента */
export default function HrPlatformRoute({ children, routeKey = ROUTE_KEYS.HR_VACANCIES }) {
  const { user, rbacReady, authStatus } = useSession()

  if (authStatus === AUTH_STATUS.LOADING || !rbacReady) {
    return <div className="platform-loading">Проверка доступа…</div>
  }

  if (!canAccessRoute(user, routeKey)) {
    return <Navigate to={getDefaultPlatformPath(user)} replace />
  }

  return children
}
