import { usePermissionsOptional } from '../../context/PermissionContext'

/** Условный рендер по праву доступа */
export default function Can({ permission, anyOf, allOf, fallback = null, children }) {
  const { can, canAny, canAll } = usePermissionsOptional()

  let allowed = false
  if (permission) allowed = can(permission)
  else if (anyOf?.length) allowed = canAny(anyOf)
  else if (allOf?.length) allowed = canAll(allOf)

  if (!allowed) return fallback
  return children
}
