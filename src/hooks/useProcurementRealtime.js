import { useEffect, useRef, useState } from 'react'
import { subscribeProcurementRealtime } from '../services/procurementRealtimeService'
import { useAcademyData } from '../context/AcademyDataContext'
import { isCloudMode } from '../lib/dataMode'

/**
 * Event-driven sync for Закуп / Приёмка via Supabase Realtime.
 * No 5–15s polling — refresh only on postgres_changes, visibility/focus/online, or reconnect.
 */
export function useProcurementRealtime(enabled = true) {
  const { reloadProcurement } = useAcademyData()
  const reloadRef = useRef(reloadProcurement)
  reloadRef.current = reloadProcurement
  const [connectionStatus, setConnectionStatus] = useState('idle')

  useEffect(() => {
    if (!enabled || !isCloudMode()) {
      setConnectionStatus('idle')
      return undefined
    }

    return subscribeProcurementRealtime(
      async () => {
        await reloadRef.current()
      },
      {
        onStatus: (status) => setConnectionStatus(status),
      }
    )
  }, [enabled])

  return { connectionStatus }
}
