import { useCallback, useEffect, useState } from 'react'
import { ensureRbacLoaded, RBAC_MIGRATION_MESSAGE } from '../../../services/rbacService'

export function useRolesAccessData(enabled = true) {
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(Boolean(enabled))
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return null
    }
    setLoading(true)
    setError('')
    try {
      const snapshot = await ensureRbacLoaded(true)
      setRoles(snapshot.roles)
      setPermissions(snapshot.permissions)
      return snapshot
    } catch (err) {
      setRoles([])
      setPermissions([])
      setError(err.message || 'Не удалось загрузить роли')
      return null
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    load()
  }, [load])

  return {
    roles,
    permissions,
    loading,
    error,
    isMigrationError: error === RBAC_MIGRATION_MESSAGE,
    reload: load,
    setRoles,
  }
}
