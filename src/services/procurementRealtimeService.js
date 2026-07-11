import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'

const DEBOUNCE_MS = 350
const POLL_INTERVAL_MS = 15000
const CHANNEL_PREFIX = 'procurement-sync'

let channelCounter = 0

/**
 * Подписка на изменения закупов и приёмки через Supabase Realtime.
 * Realtime + резервный polling каждые 15 с (на случай недоступности Realtime).
 */
export function subscribeProcurementRealtime(onSync) {
  if (!isCloudMode() || !isSupabaseConfigured() || !supabase) {
    return () => {}
  }

  const channelName = `${CHANNEL_PREFIX}-${++channelCounter}`
  let debounceTimer = null
  let pollTimer = null
  let disposed = false

  function scheduleSync(source) {
    clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      if (disposed) return
      void Promise.resolve(onSync({ source })).catch((error) => {
        console.error('[ProcurementRealtime] sync failed', error)
      })
    }, DEBOUNCE_MS)
  }

  function startPolling() {
    if (pollTimer || disposed) return
    pollTimer = window.setInterval(() => {
      scheduleSync('poll')
    }, POLL_INTERVAL_MS)
  }

  function stopPolling() {
    if (!pollTimer) return
    clearInterval(pollTimer)
    pollTimer = null
  }

  startPolling()

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'purchase_orders' },
      () => scheduleSync('realtime:purchase_orders')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'receiving_documents' },
      () => scheduleSync('realtime:receiving_documents')
    )
    .subscribe((status, err) => {
      if (disposed) return

      if (status === 'SUBSCRIBED') {
        return
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[ProcurementRealtime] Realtime unavailable, polling only', err)
      }
    })

  return () => {
    disposed = true
    clearTimeout(debounceTimer)
    stopPolling()
    void supabase.removeChannel(channel)
  }
}
