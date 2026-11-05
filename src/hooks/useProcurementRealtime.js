import { useEffect, useRef, useState } from 'react'
import { subscribeProcurementRealtime } from '../services/procurementRealtimeService'
import { usePlatformData } from '../context/PlatformDataContext'
import { isCloudMode } from '../lib/dataMode'
import { PROCUREMENT_FRESH_MS } from '../lib/procurementFreshness'

/**
 * Event-driven sync for Закуп / Приёмка via Supabase Realtime.
 * No 5–15s polling — refresh only on postgres_changes, visibility/focus/online, or reconnect.
 */
export function useProcurementRealtime(enabled = true) {
  const { reloadProcurement, reloadProcurementOrders } = usePlatformData()
  const reloadRef = useRef(reloadProcurement)
  reloadRef.current = reloadProcurement
  const reloadOrdersRef = useRef(reloadProcurementOrders)
  reloadOrdersRef.current = reloadProcurementOrders
  const [connectionStatus, setConnectionStatus] = useState('idle')

  useEffect(() => {
    if (!enabled || !isCloudMode()) {
      setConnectionStatus('idle')
      return undefined
    }

    return subscribeProcurementRealtime(
      async ({ source, orderIds } = {}) => {
        // The event named the changed orders: re-read just those headers.
        if (orderIds?.length) {
          await reloadOrdersRef.current(orderIds)
          return
        }
        // Passive triggers (focus / visibility / re-subscribe) only top up data that
        // went stale; change events and reconnects always fetch.
        const passive =
          source === 'focus' ||
          source === 'visibility' ||
          source === 'realtime:subscribed'
        await reloadRef.current(passive ? { maxAgeMs: PROCUREMENT_FRESH_MS } : undefined)
      },
      {
        onStatus: (status) => setConnectionStatus(status),
      }
    )
  }, [enabled])

  return { connectionStatus }
}
