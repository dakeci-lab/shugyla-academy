import { Navigate } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { canAccessRoute, getDefaultPlatformPath, ROUTE_KEYS } from '../../config/permissions'

/** HR-маршруты — только администратор; иначе редирект без отображения контента */
export default function HrPlatformRoute({ children, routeKey = ROUTE_KEYS.HR_VACANCIES }) {
  const { user } = useSession()

  if (!canAccessRoute(user, routeKey)) {
    return <Navigate to={getDefaultPlatformPath(user)} replace />
  }

  return children
}
