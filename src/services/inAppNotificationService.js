import { supabase } from '../lib/supabaseClient'

/** Поля in-app уведомления — RLS ограничивает строки текущим пользователем */
export const NOTIFICATION_SELECT_FIELDS =
  'id, module_code, event_code, title, body, action_url, priority, status, created_at, scheduled_for, expires_at, read_at, metadata'

export const PAGE_SIZE = 20

export function normalizeNotification(row) {
  if (!row) return null
  return {
    id: row.id,
    module_code: row.module_code,
    event_code: row.event_code,
    title: row.title ?? '',
    body: row.body ?? '',
    action_url: row.action_url ?? null,
    priority: row.priority ?? 'normal',
    status: row.status ?? 'pending',
    created_at: row.created_at,
    scheduled_for: row.scheduled_for ?? null,
    expires_at: row.expires_at ?? null,
    read_at: row.read_at ?? null,
    metadata: row.metadata ?? {},
  }
}

export function isNotificationUnread(notification) {
  return !notification?.read_at
}

function isNetworkError(error) {
  if (!error) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const message = String(error.message || error).toLowerCase()
  return (
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('failed to fetch')
  )
}

async function getAuthenticatedClient() {
  if (!supabase) {
    return { client: null, error: new Error('Supabase not configured') }
  }

  const { data, error } = await supabase.auth.getSession()
  if (error) return { client: null, error }
  if (!data?.session?.access_token) {
    return { client: null, error: new Error('No auth session') }
  }

  return { client: supabase, error: null }
}

function currentIsoTimestamp() {
  return new Date().toISOString()
}

export async function loadNotifications(options = {}) {
  const { limit = PAGE_SIZE, offset = 0, unreadOnly = false } = options
  const now = currentIsoTimestamp()

  const { client, error: authError } = await getAuthenticatedClient()
  if (authError || !client) {
    return { items: [], hasMore: false, error: authError }
  }

  try {
    let query = client
      .from('notifications')
      .select(NOTIFICATION_SELECT_FIELDS, { count: 'exact' })
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (unreadOnly) {
      query = query.is('read_at', null)
    }

    const { data, error, count } = await query
    if (error) {
      return { items: [], hasMore: false, error, offline: isNetworkError(error) }
    }

    const items = (data ?? []).map(normalizeNotification).filter(Boolean)
    const loadedCount = offset + items.length
    const total = typeof count === 'number' ? count : loadedCount
    const hasMore = loadedCount < total

    return { items, hasMore, error: null }
  } catch (error) {
    return { items: [], hasMore: false, error, offline: isNetworkError(error) }
  }
}

export async function loadUnreadNotificationCount() {
  const now = currentIsoTimestamp()
  const { client, error: authError } = await getAuthenticatedClient()
  if (authError || !client) return 0

  try {
    const { count, error } = await client
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .is('read_at', null)
      .or(`expires_at.is.null,expires_at.gt.${now}`)

    if (error) return 0
    return Math.max(0, count ?? 0)
  } catch {
    return 0
  }
}

export async function markNotificationRead(notificationId) {
  if (!notificationId) {
    return { ok: false, error: new Error('Missing notification id') }
  }

  const { client, error: authError } = await getAuthenticatedClient()
  if (authError || !client) {
    return { ok: false, error: authError ?? new Error('No auth session') }
  }

  try {
    const { data, error } = await client.rpc('mark_notification_read', {
      p_notification_id: notificationId,
    })

    if (error) return { ok: false, error }
    if (data !== true) return { ok: false, error: new Error('RPC returned false') }

    return { ok: true, error: null }
  } catch (error) {
    return { ok: false, error }
  }
}

export function validateNotificationActionUrl(actionUrl) {
  if (typeof actionUrl !== 'string') return null

  const trimmed = actionUrl.trim()
  if (!trimmed.startsWith('/')) return null
  if (trimmed.startsWith('//')) return null
  if (/^(https?:|javascript:|data:)/i.test(trimmed)) return null

  return trimmed
}
