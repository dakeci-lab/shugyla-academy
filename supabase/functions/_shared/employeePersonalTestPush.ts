import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverNotificationToSubscription } from './notificationDelivery.ts'
import { loadCurrentVapidPushSubscriptions } from './pushSubscriptionSelection.ts'
import { buildWebPushPayload } from './webPushPayload.ts'
import { isWebPushConfigured } from './webPushSender.ts'
import { isActiveEmployeeStatus } from './testBroadcastPush.ts'

export const EMPLOYEE_PERSONAL_TEST_COOLDOWN_SECONDS = 60

export const EMPLOYEE_PERSONAL_TEST_TITLE = 'Shugyla Platform'
export const EMPLOYEE_PERSONAL_TEST_BODY =
  'Уведомления успешно подключены. Теперь вы будете получать напоминания о начале и завершении смены.'
export const EMPLOYEE_PERSONAL_TEST_ACTION_URL = '/platform/time-tracker'

export type EmployeePersonalTestResult = {
  employee_id: number
  request_id: string
  outcome: 'accepted' | 'partial' | 'failed' | 'no_current_subscription'
  devices_targeted: number
  accepted_count: number
  failed_count: number
  notification_id: string | null
  device_results: Array<{
    subscription_prefix: string
    status: 'accepted' | 'failed' | 'retryable' | 'permanently_failed'
    provider_status_code: number | null
  }>
}

function buildPayload(notificationId: string, requestId: string): Record<string, unknown> {
  return buildWebPushPayload({
    title: EMPLOYEE_PERSONAL_TEST_TITLE,
    body: EMPLOYEE_PERSONAL_TEST_BODY,
    url: '/shugyla-academy/platform/time-tracker',
    type: 'employee_personal_test',
    tag: `emp-test-${requestId.replace(/-/g, '').slice(0, 8)}`,
    notificationId,
    requestId,
  })
}

export async function sendEmployeePersonalTest(params: {
  serviceClient: SupabaseClient
  targetEmployeeId: number
  actorEmployeeId: number
  requestId: string
}): Promise<
  | { ok: true; result: EmployeePersonalTestResult }
  | { ok: false; code: string; status: number }
> {
  if (!isWebPushConfigured()) {
    return { ok: false, code: 'web_push_not_configured', status: 503 }
  }

  const { data: employee, error: employeeError } = await params.serviceClient
    .from('academy_users')
    .select('id, status, auth_user_id')
    .eq('id', params.targetEmployeeId)
    .maybeSingle()

  if (employeeError) return { ok: false, code: 'internal_error', status: 500 }
  if (!employee?.id) return { ok: false, code: 'employee_not_found', status: 404 }
  if (!isActiveEmployeeStatus(employee.status)) {
    return { ok: false, code: 'employee_not_eligible', status: 422 }
  }
  if (!employee.auth_user_id) {
    return { ok: false, code: 'employee_not_eligible', status: 422 }
  }

  const cooldownSince = new Date(
    Date.now() - EMPLOYEE_PERSONAL_TEST_COOLDOWN_SECONDS * 1000
  ).toISOString()
  const { data: recent } = await params.serviceClient
    .from('notifications')
    .select('id, created_at')
    .eq('employee_id', params.targetEmployeeId)
    .contains('metadata', { source: 'admin_employee_personal_test' })
    .gte('created_at', cooldownSince)
    .limit(1)

  if (recent && recent.length > 0) {
    return { ok: false, code: 'personal_test_cooldown', status: 429 }
  }

  const loaded = await loadCurrentVapidPushSubscriptions(params.serviceClient)
  const current = loaded.current.filter((row) => row.employee_id === params.targetEmployeeId)

  if (current.length === 0) {
    return {
      ok: true,
      result: {
        employee_id: params.targetEmployeeId,
        request_id: params.requestId,
        outcome: 'no_current_subscription',
        devices_targeted: 0,
        accepted_count: 0,
        failed_count: 0,
        notification_id: null,
        device_results: [],
      },
    }
  }

  const deduplicationKey = `admin_employee_personal_test:${params.targetEmployeeId}:${params.requestId}`

  const { data: notification, error: notificationError } = await params.serviceClient
    .from('notifications')
    .insert({
      employee_id: params.targetEmployeeId,
      auth_user_id: employee.auth_user_id,
      module_code: 'web_push',
      event_code: 'employee_personal_test',
      title: EMPLOYEE_PERSONAL_TEST_TITLE,
      body: EMPLOYEE_PERSONAL_TEST_BODY,
      action_url: EMPLOYEE_PERSONAL_TEST_ACTION_URL,
      priority: 'normal',
      status: 'processing',
      metadata: {
        source: 'admin_employee_personal_test',
        request_id: params.requestId,
        actor_employee_id: params.actorEmployeeId,
        test: true,
      },
      deduplication_key: deduplicationKey,
    })
    .select('id')
    .single()

  if (notificationError || !notification?.id) {
    return { ok: false, code: 'internal_error', status: 500 }
  }

  let acceptedCount = 0
  let failedCount = 0
  const deviceResults: EmployeePersonalTestResult['device_results'] = []

  for (const subscription of current) {
    const delivery = await deliverNotificationToSubscription({
      serviceClient: params.serviceClient,
      notification: {
        id: notification.id,
        title: EMPLOYEE_PERSONAL_TEST_TITLE,
        body: EMPLOYEE_PERSONAL_TEST_BODY,
        action_url: EMPLOYEE_PERSONAL_TEST_ACTION_URL,
      },
      subscription,
      requestId: params.requestId,
      attemptNumber: 1,
      buildPayload,
      updateNotificationStatus: false,
      pushOptions: { ttl: 180, urgency: 'normal' },
    })

    if (delivery.status === 'accepted') acceptedCount += 1
    else failedCount += 1

    deviceResults.push({
      subscription_prefix: subscription.id.slice(0, 8),
      status:
        delivery.status === 'accepted'
          ? 'accepted'
          : delivery.status === 'permanently_failed'
            ? 'permanently_failed'
            : delivery.status === 'retryable'
              ? 'retryable'
              : 'failed',
      provider_status_code: null,
    })
  }

  const outcome =
    acceptedCount > 0 && failedCount > 0
      ? 'partial'
      : acceptedCount > 0
        ? 'accepted'
        : 'failed'

  await params.serviceClient
    .from('notifications')
    .update({
      status: acceptedCount > 0 ? 'dispatched' : 'failed',
      metadata: {
        source: 'admin_employee_personal_test',
        request_id: params.requestId,
        actor_employee_id: params.actorEmployeeId,
        test: true,
        web_push_outcome: outcome,
        web_push_accepted_count: acceptedCount,
        web_push_failed_count: failedCount,
      },
    })
    .eq('id', notification.id)

  return {
    ok: true,
    result: {
      employee_id: params.targetEmployeeId,
      request_id: params.requestId,
      outcome,
      devices_targeted: current.length,
      accepted_count: acceptedCount,
      failed_count: failedCount,
      notification_id: notification.id,
      device_results: deviceResults,
    },
  }
}
