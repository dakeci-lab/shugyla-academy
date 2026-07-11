import { useEffect, useRef } from 'react'
import { subscribeProcurementRealtime } from '../services/procurementRealtimeService'
import { useAcademyData } from '../context/AcademyDataContext'
import { isCloudMode } from '../lib/dataMode'

/** Автосинхронизация закупа и приёмки между пользователями (Realtime + polling fallback). */
export function useProcurementRealtime(enabled = true) {
  const { reload } = useAcademyData()
  const reloadRef = useRef(reload)
  reloadRef.current = reload

  useEffect(() => {
    if (!enabled || !isCloudMode()) return undefined

    return subscribeProcurementRealtime(async () => {
      await reloadRef.current()
    })
  }, [enabled])
}
