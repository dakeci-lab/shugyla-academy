import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'

const DEBOUNCE_MS = 400
const STALE_MS = 12_000
const RECONNECT_BASE_MS = 1_500
const RECONNECT_MAX_MS = 30_000
const CHANNEL_NAME = 'procurement-sync'

/** Tables that drive procurement / receiving UI in cloudStore. */
export const PROCUREMENT_REALTIME_TABLES = [
  'purchase_orders',
  'purchase_order_items',
  'receiving_documents',
  'receiving_items',
]

/**
 * @typedef {'idle' | 'subscribed' | 'reconnecting' | 'error' | 'offline'} ProcurementRealtimeStatus
 */

/**
 * Subscribe to procurement/receiving postgres_changes with debounced refetch.
 * No 5–15s polling. Foreground / online / reconnect triggers a stale-guarded refresh.
 *
 * @param {(meta: { source: string }) => void | Promise<void>} onSync
 * @param {{ onStatus?: (status: ProcurementRealtimeStatus, detail?: string) => void }} [options]
 * @returns {() => void} cleanup
 */
export function subscribeProcurementRealtime(onSync, options = {}) {
  if (!isCloudMode() || !isSupabaseConfigured() || !supabase) {
    return () => {}
  }

  const { onStatus } = options
  let disposed = false
  let debounceTimer = null
  let reconnectTimer = null
  let reconnectAttempt = 0
  let inFlight = null
  let queuedAfterInFlight = false
  let lastSuccessfulSyncAt = 0
  let channel = null

  function setStatus(status, detail) {
    if (disposed) return
    try {
      onStatus?.(status, detail)
    } catch {
      /* ignore UI status errors */
    }
  }

  function markSyncSuccess() {
    lastSuccessfulSyncAt = Date.now()
  }

  function isFresh(maxAgeMs = STALE_MS) {
    return lastSuccessfulSyncAt > 0 && Date.now() - lastSuccessfulSyncAt < maxAgeMs
  }

  async function runSync(source) {
    if (disposed) return
    if (inFlight) {
      queuedAfterInFlight = true
      return
    }

    inFlight = Promise.resolve()
      .then(() => onSync({ source }))
      .then(() => {
        markSyncSuccess()
      })
      .catch((error) => {
        console.error('[ProcurementRealtime] sync failed', error)
      })
      .finally(() => {
        inFlight = null
        if (disposed) return
        if (queuedAfterInFlight) {
          queuedAfterInFlight = false
          scheduleSync('coalesced')
        }
      })

    await inFlight
  }

  function scheduleSync(source) {
    if (disposed) return
    clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      void runSync(source)
    }, DEBOUNCE_MS)
  }

  function scheduleSyncImmediateIfStale(source) {
    if (disposed) return
    if (isFresh()) return
    scheduleSync(source)
  }

  function clearReconnectTimer() {
    if (!reconnectTimer) return
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  function teardownChannel() {
    if (!channel) return
    const current = channel
    channel = null
    void supabase.removeChannel(current)
  }

  function attachTableListeners(nextChannel) {
    for (const table of PROCUREMENT_REALTIME_TABLES) {
      nextChannel = nextChannel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => scheduleSync(`realtime:${table}`)
      )
    }
    return nextChannel
  }

  function subscribeChannel() {
    if (disposed) return
    teardownChannel()
    clearReconnectTimer()

    channel = attachTableListeners(supabase.channel(CHANNEL_NAME)).subscribe((status, err) => {
      if (disposed) return

      if (status === 'SUBSCRIBED') {
        reconnectAttempt = 0
        setStatus('subscribed')
        // Catch changes between initial page load and subscription readiness.
        scheduleSyncImmediateIfStale('realtime:subscribed')
        return
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setStatus('reconnecting', status)
        console.warn('[ProcurementRealtime] channel issue, will reconnect', status, err)
        scheduleReconnect()
        return
      }

      if (status === 'CLOSED') {
        if (!disposed) {
          setStatus('reconnecting', status)
          scheduleReconnect()
        }
      }
    })
  }

  function scheduleReconnect() {
    if (disposed) return
    clearReconnectTimer()
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * 2 ** Math.min(reconnectAttempt, 4)
    )
    reconnectAttempt += 1
    reconnectTimer = window.setTimeout(() => {
      if (disposed) return
      subscribeChannel()
      scheduleSync('realtime:reconnect')
    }, delay)
  }

  function handleVisibility() {
    if (document.visibilityState !== 'visible') return
    scheduleSyncImmediateIfStale('visibility')
  }

  function handleFocus() {
    scheduleSyncImmediateIfStale('focus')
  }

  function handleOnline() {
    if (!navigator.onLine) {
      setStatus('offline')
      return
    }
    setStatus('reconnecting')
    scheduleSync('online')
    subscribeChannel()
  }

  function handleOffline() {
    setStatus('offline')
  }

  document.addEventListener('visibilitychange', handleVisibility)
  window.addEventListener('focus', handleFocus)
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  if (!navigator.onLine) {
    setStatus('offline')
  } else {
    setStatus('reconnecting')
  }

  subscribeChannel()

  return () => {
    disposed = true
    clearTimeout(debounceTimer)
    clearReconnectTimer()
    document.removeEventListener('visibilitychange', handleVisibility)
    window.removeEventListener('focus', handleFocus)
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    teardownChannel()
    setStatus('idle')
  }
}
