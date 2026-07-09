import { Navigate } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import {
  canAccessNavItem,
  getDefaultPlatformPath,
  ACCESS,
} from '../../platform/platformAccess'

/** Маршрут раздела платформы с проверкой доступа по роли */
export default function PlatformRoute({ children, access = ACCESS.ALL }) {
  const { user } = useSession()

  if (!canAccessNavItem(user?.role, access)) {
    return <Navigate to={getDefaultPlatformPath(user?.role)} replace />
  }

  return children
}
