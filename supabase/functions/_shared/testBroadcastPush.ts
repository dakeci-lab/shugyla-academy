import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverNotificationToSubscription, type PushSubscriptionRow } from './notificationDelivery.ts'
import { isWebPushConfigured } from './webPushSender.ts'

export const TEST_BROADCAST_COOLDOWN_SECONDS = 60
export const TEST_BROADCAST_CONCURRENCY = 5

export const TEST_BROADCAST_TITLE = 'Тестовое уведомление Shugyla Platform'
export const TEST_BROADCAST_BODY =
  'Если вы видите это сообщение, push-уведомления работают корректно.'

export type BroadcastSubscriptionRow = PushSubscriptionRow & {
  employee_id: number
  auth_user_id: string | null
}

export type BroadcastSummary = {
  active_employees: number
  employees_with_subscriptions: number
  connected_devices: number
  web_push_configured: boolean
  ready_to_send: boolean
}

export type BroadcastSendResult = {
  broadcast_id: string
  active_employees: number
  employees_with_subscriptions: number
  connected_devices: number
  sent_count: number
  failed_count: number
  invalidated_count: number
}

export function isActiveEmployeeStatus(status: string | null | undefined): boolean {
  if (!status) return false
  const normalized =
    status === 'deactivated'
      ? 'inactive'
      : status === 'internship' || status === 'trainee'
        ? 'active'
        : status
  return normalized === 'active'
}

export function getTestBroadcastAppUrl(): string {
  return '/shugyla-academy/platform/settings/notifications'
}

export function buildTestBroadcastPayload(notificationId: string, broadcastId: string) {
  const shortId = broadcastId.replace(/-/g, '').slice(0, 8)
  const appUrl = getTestBroadcastAppUrl()

  return {
    title: TEST_BROADCAST_TITLE,
    body: TEST_BROADCAST_BODY,
    icon: '/shugyla-academy/icons/icon-192.png',
    badge: '/shugyla-academy/icons/icon-192.png',
    tag: `test-broadcast-${shortId}`,
    data: {
      url: appUrl,
      notification_id: notificationId,
      type: 'test_broadcast',
      broadcast_id: broadcastId,
    },
    requireInteraction: false,
    timestamp: Date.now(),
  }
}

function isValidSubscriptionRow(row: Record<string, unknown>): row is BroadcastSubscriptionRow {
  return (
    typeof row.id === 'string' &&
    typeof row.endpoint === 'string' &&
    row.endpoint.trim().length > 0 &&
    typeof row.p256dh_key === 'string' &&
    row.p256dh_key.trim().length > 0 &&
    typeof row.auth_key === 'string' &&
    row.auth_key.trim().length > 0 &&
    typeof row.employee_id === 'number'
  )
}

function dedupeSubscriptionsByEndpoint(
  rows: BroadcastSubscriptionRow[]
): BroadcastSubscriptionRow[] {
  const byEndpoint = new Map<string, BroadcastSubscriptionRow>()

  for (const row of rows) {
    const endpoint = row.endpoint.trim()
    const existing = byEndpoint.get(endpoint)
    if (!existing) {
      byEndpoint.set(endpoint, row)
      continue
    }

    const existingFailures = existing.failure_count ?? 0
    const nextFailures = row.failure_count ?? 0
    if (nextFailures < existingFailures) {
      byEndpoint.set(endpoint, row)
    }
  }

  return [...byEndpoint.values()]
}

export async function countActiveEmployees(serviceClient: SupabaseClient): Promise<number> {
  const { data, error } = await serviceClient.from('academy_users').select('id, status')

  if (error) throw new Error('active_employee_count_error')

  return (data ?? []).filter((row) => isActiveEmployeeStatus(row.status)).length
}

export async function loadDeliverableBroadcastSubscriptions(
  serviceClient: SupabaseClient
): Promise<BroadcastSubscriptionRow[]> {
  const { data: subscriptions, error: subscriptionError } = await serviceClient
    .from('notification_push_subscriptions')
    .select('id, employee_id, auth_user_id, endpoint, p256dh_key, auth_key, failure_count')
    .eq('is_active', true)
    .eq('permission_status', 'granted')

  if (subscriptionError) throw new Error('subscription_load_error')

  const { data: employees, error: employeeError } = await serviceClient
    .from('academy_users')
    .select('id, status')

  if (employeeError) throw new Error('employee_load_error')

  const activeEmployeeIds = new Set(
    (employees ?? [])
      .filter((row) => isActiveEmployeeStatus(row.status))
      .map((row) => row.id)
  )

  const filtered = (subscriptions ?? []).filter(
    (row) =>
      activeEmployeeIds.has(row.employee_id) && isValidSubscriptionRow(row as Record<string, unknown>)
  ) as BroadcastSubscriptionRow[]

  return dedupeSubscriptionsByEndpoint(filtered)
}

export async function getTestBroadcastSummary(
  serviceClient: SupabaseClient
): Promise<BroadcastSummary> {
  const [activeEmployees, subscriptions] = await Promise.all([
    countActiveEmployees(serviceClient),
    loadDeliverableBroadcastSubscriptions(serviceClient),
  ])

  const employeeIds = new Set(subscriptions.map((row) => row.employee_id))
  const webPushConfigured = isWebPushConfigured()

  return {
    active_employees: activeEmployees,
    employees_with_subscriptions: employeeIds.size,
    connected_devices: subscriptions.length,
    web_push_configured: webPushConfigured,
    ready_to_send: webPushConfigured && subscriptions.length > 0,
  }
}

export async function findRecentBroadcastCooldown(
  serviceClient: SupabaseClient,
  employeeId: number
): Promise<{ retry_after_seconds: number } | null> {
  const since = new Date(Date.now() - TEST_BROADCAST_COOLDOWN_SECONDS * 1000).toISOString()

  const { data, error } = await serviceClient
    .from('notification_test_broadcast_audits')
    .select('started_at')
    .eq('initiated_by_employee_id', employeeId)
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error('broadcast_cooldown_check_error')
  if (!data?.started_at) return null

  const elapsedMs = Date.now() - Date.parse(data.started_at)
  const remainingMs = TEST_BROADCAST_COOLDOWN_SECONDS * 1000 - elapsedMs
  if (remainingMs <= 0) return null

  return {
    retry_after_seconds: Math.ceil(remainingMs / 1000),
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  let index = 0

  async function runWorker() {
    while (index < items.length) {
      const currentIndex = index
      index += 1
      results[currentIndex] = await worker(items[currentIndex])
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  await Promise.all(workers)
  return results
}

export async function sendTestBroadcast(
  serviceClient: SupabaseClient,
  params: {
    broadcastId: string
    initiatedByEmployeeId: number
    initiatedByAuthUserId: string
  }
): Promise<BroadcastSendResult> {
  const summary = await getTestBroadcastSummary(serviceClient)
  const subscriptions = await loadDeliverableBroadcastSubscriptions(serviceClient)

  const { data: auditRow, error: auditInsertError } = await serviceClient
    .from('notification_test_broadcast_audits')
    .insert({
      id: params.broadcastId,
      request_id: params.broadcastId,
      initiated_by_employee_id: params.initiatedByEmployeeId,
      active_employee_count: summary.active_employees,
      employees_with_subscriptions_count: summary.employees_with_subscriptions,
      subscription_count: subscriptions.length,
      status: 'processing',
    })
    .select('id')
    .single()

  if (auditInsertError || !auditRow?.id) {
    throw new Error('broadcast_audit_create_error')
  }

  if (!isWebPushConfigured()) {
    await serviceClient
      .from('notification_test_broadcast_audits')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', params.broadcastId)
    throw new Error('web_push_not_configured')
  }

  if (subscriptions.length === 0) {
    await serviceClient
      .from('notification_test_broadcast_audits')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', params.broadcastId)

    return {
      broadcast_id: params.broadcastId,
      active_employees: summary.active_employees,
      employees_with_subscriptions: 0,
      connected_devices: 0,
      sent_count: 0,
      failed_count: 0,
      invalidated_count: 0,
    }
  }

  const appUrl = getTestBroadcastAppUrl()

  const { data: notification, error: notificationError } = await serviceClient
    .from('notifications')
    .insert({
      employee_id: params.initiatedByEmployeeId,
      auth_user_id: params.initiatedByAuthUserId,
      module_code: 'web_push',
      event_code: 'web_push_test_broadcast',
      title: TEST_BROADCAST_TITLE,
      body: TEST_BROADCAST_BODY,
      action_url: appUrl,
      priority: 'normal',
      status: 'processing',
      metadata: {
        source: 'admin-notification-settings',
        broadcast_id: params.broadcastId,
        channel: 'web_push',
        test: true,
        broadcast: true,
      },
      deduplication_key: `web_push_test_broadcast:${params.broadcastId}`,
    })
    .select('id, title, body, action_url')
    .single()

  if (notificationError || !notification?.id) {
    await serviceClient
      .from('notification_test_broadcast_audits')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', params.broadcastId)
    throw new Error('broadcast_notification_create_error')
  }

  let sentCount = 0
  let failedCount = 0
  let invalidatedCount = 0

  await runWithConcurrency(subscriptions, TEST_BROADCAST_CONCURRENCY, async (subscription) => {
    const deliveryRequestId = crypto.randomUUID()

    try {
      const outcome = await deliverNotificationToSubscription({
        serviceClient,
        notification,
        subscription,
        requestId: deliveryRequestId,
        attemptNumber: 1,
        buildPayload: buildTestBroadcastPayload,
        pushOptions: { ttl: 180, urgency: 'normal' },
        updateNotificationStatus: false,
      })

      if (outcome.status === 'accepted') {
        sentCount += 1
      } else {
        failedCount += 1
        if (outcome.classification === 'subscription_expired') {
          invalidatedCount += 1
        }
      }
    } catch {
      failedCount += 1
    }
  })

  const finalNotificationStatus =
    failedCount > 0 && sentCount === 0 ? 'failed' : 'dispatched'

  await serviceClient
    .from('notifications')
    .update({ status: finalNotificationStatus })
    .eq('id', notification.id)

  await serviceClient
    .from('notification_test_broadcast_audits')
    .update({
      sent_count: sentCount,
      failed_count: failedCount,
      invalidated_count: invalidatedCount,
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', params.broadcastId)

  return {
    broadcast_id: params.broadcastId,
    active_employees: summary.active_employees,
    employees_with_subscriptions: summary.employees_with_subscriptions,
    connected_devices: subscriptions.length,
    sent_count: sentCount,
    failed_count: failedCount,
    invalidated_count: invalidatedCount,
  }
}
