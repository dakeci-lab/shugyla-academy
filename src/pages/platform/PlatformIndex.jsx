import { Navigate } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import {
  ACCESS,
  canAccessNavItem,
  getDefaultPlatformPath,
} from '../../platform/platformAccess'
import PlatformHome from './PlatformHome'

/** Точка входа /platform — главная только для админа */
export default function PlatformIndex() {
  const { user } = useSession()

  if (!canAccessNavItem(user?.role, ACCESS.ADMIN)) {
    return <Navigate to={getDefaultPlatformPath(user?.role)} replace />
  }

  return <PlatformHome />
}
