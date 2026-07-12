import { useSession } from '../../context/SessionContext'
import { canAccessRoute, ROUTE_KEYS } from '../../config/permissions'
import PlatformAccessDenied from './PlatformAccessDenied'

/** Маршрут раздела платформы с проверкой доступа по RBAC */
export default function PlatformRoute({ children, routeKey = ROUTE_KEYS.ACADEMY }) {
  const { user, rbacReady } = useSession()

  if (!user) return <PlatformAccessDenied />

  if (!rbacReady) {
    return <div className="platform-loading">Проверка доступа…</div>
  }

  if (!canAccessRoute(user, routeKey)) {
    return <PlatformAccessDenied />
  }

  return children
}
