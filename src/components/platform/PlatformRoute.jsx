import { useSession } from '../../context/SessionContext'
import { canAccessRoute, ROUTE_KEYS } from '../../config/permissions'
import PlatformAccessDenied from './PlatformAccessDenied'

/** Маршрут раздела платформы с проверкой доступа по роли */
export default function PlatformRoute({ children, routeKey = ROUTE_KEYS.ACADEMY }) {
  const { user } = useSession()

  if (!canAccessRoute(user, routeKey)) {
    return <PlatformAccessDenied />
  }

  return children
}
