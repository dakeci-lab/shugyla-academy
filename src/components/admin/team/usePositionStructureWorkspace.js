import { useCallback, useEffect, useState } from 'react'
import { can, PERMISSION_CODES } from '../../../config/permissions'
import { useSession } from '../../../context/SessionContext'
import {
  loadPositionStructure,
  refreshPositionStructure,
} from '../../../services/positionStructureAdminService'

export function usePositionStructureWorkspace(enabled = true) {
  const { user } = useSession()
  const canView =
    can(user, PERMISSION_CODES.POSITIONS_VIEW) || can(user, PERMISSION_CODES.POSITIONS_MANAGE)
  const canManage = can(user, PERMISSION_CODES.POSITIONS_MANAGE)

  const [groups, setGroups] = useState([])
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(Boolean(enabled && canView))
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!enabled || !canView) {
      setLoading(false)
      return null
    }
    setLoading(true)
    setError('')
    try {
      const snapshot = await refreshPositionStructure({ includeArchived: true }).catch(async () =>
        loadPositionStructure({ includeArchived: true }),
      )
      setGroups(snapshot.groups || [])
      setPositions(snapshot.positions || [])
      return snapshot
    } catch (err) {
      setGroups([])
      setPositions([])
      setError(err.message || 'Не удалось загрузить организационную структуру')
      return null
    } finally {
      setLoading(false)
    }
  }, [enabled, canView])

  useEffect(() => {
    if (!enabled) return
    if (!canView) {
      setLoading(false)
      setError('')
      setGroups([])
      setPositions([])
      return
    }
    reload()
  }, [enabled, canView, reload])

  return {
    groups,
    positions,
    setGroups,
    setPositions,
    loading,
    error,
    reload,
    canView,
    canManage,
  }
}
