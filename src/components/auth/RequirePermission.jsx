import { usePermissionsOptional } from '../../context/PermissionContext'
import PlatformAccessDenied from '../platform/PlatformAccessDenied'

/** Guard маршрута или секции по permission code */
export default function RequirePermission({
  permission,
  anyOf,
  allOf,
  children,
  loadingFallback = null,
}) {
  const { can, canAny, canAll, rbacReady } = usePermissionsOptional()

  if (!rbacReady && loadingFallback) return loadingFallback

  let allowed = false
  if (permission) allowed = can(permission)
  else if (anyOf?.length) allowed = canAny(anyOf)
  else if (allOf?.length) allowed = canAll(allOf)

  if (!allowed) return <PlatformAccessDenied />
  return children
}
