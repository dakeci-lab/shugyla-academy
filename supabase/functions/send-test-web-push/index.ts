import '@supabase/functions-js/edge-runtime.d.ts'
import {
  adminErrorResponse,
  authorizeAuthenticatedEmployee,
} from '../_shared/employeeAuthorization.ts'
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverNotificationToSubscription } from '../_shared/notificationDelivery.ts'
import { isWebPushConfigured } from '../_shared/webPushSender.ts'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const FORBIDDEN_FIELDS = new Set([
  'employee_id',
  'auth_user_id',
  'user_id',
  'subscription_id',
  'endpoint',
  'p256dh',
  'auth',
  'title',
  'body',
  'url',
  'icon',
  'tag',
  'role',
  'status',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'service_role',
  'vapid_private_key',
  'login',
])

const PRODUCTION_MARKERS = ['supabase.co', 'cxadzerxndlscwvdaymk']
const RATE_LIMIT_WINDOW_SECONDS = 60
const RATE_LIMIT_MAX = 3
const RATE_LIMIT_MIN_INTERVAL_SECONDS = 10

function parseUuid(value: unknown, field: string): string | Response {
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) {
    return adminErrorResponse('validation_error', 422)
  }
  return value.trim()
}

function isLocalTestEnabled(): boolean {
  if (Deno.env.get('WEB_PUSH_TEST_ENABLED') !== 'true') {
    return false
  }

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').toLowerCase()
  for (const marker of PRODUCTION_MARKERS) {
    if (supabaseUrl.includes(marker)) {
      return false
    }
  }

  return true
}

function buildPayload(notificationId: string, requestId: string) {
  const shortId = requestId.replace(/-/g, '').slice(0, 8)
  return {
    title: 'Shugyla Platform',
    body: 'Тестовое push-уведомление отправлено сервером',
    icon: '/shugyla-academy/icons/icon-192.png',
    badge: '/shugyla-academy/icons/icon-192.png',
    tag: `shugyla-server-test-${shortId}`,
    data: {
      url: '/shugyla-academy/platform/profile',
      notification_id: notificationId,
      type: 'web_push_test',
    },
    requireInteraction: false,
    timestamp: Date.now(),
  }
}

async function checkRateLimit(
  serviceClient: SupabaseClient,
  employeeId: number
): Promise<Response | null> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString()

  const { data: recentNotifications, error: countError } = await serviceClient
    .from('notifications')
    .select('id, created_at')
    .eq('employee_id', employeeId)
    .eq('module_code', 'web_push')
    .eq('event_code', 'web_push_test')
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (countError) {
    return adminErrorResponse('internal_error', 500)
  }

  if ((recentNotifications?.length ?? 0) >= RATE_LIMIT_MAX) {
    return jsonResponse(
      { ok: false, code: 'rate_limited', retry_after_seconds: RATE_LIMIT_MIN_INTERVAL_SECONDS },
      429
    )
  }

  const lastCreated = recentNotifications?.[0]?.created_at
  if (lastCreated) {
    const elapsed = Date.now() - Date.parse(lastCreated)
    if (elapsed < RATE_LIMIT_MIN_INTERVAL_SECONDS * 1000) {
      const retryAfter = Math.ceil((RATE_LIMIT_MIN_INTERVAL_SECONDS * 1000 - elapsed) / 1000)
      return jsonResponse({ ok: false, code: 'rate_limited', retry_after_seconds: retryAfter }, 429)
    }
  }

  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse()
  }

  if (req.method !== 'POST') {
    return adminErrorResponse('method_not_allowed', 405)
  }

  if (!isLocalTestEnabled()) {
    return adminErrorResponse('test_sender_disabled', 403)
  }

  let payload: Record<string, unknown>
  try {
    payload = (await req.json()) as Record<string, unknown>
  } catch {
    return adminErrorResponse('malformed_json', 400)
  }

  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_FIELDS.has(key)) {
      return adminErrorResponse('forbidden_field', 422)
    }
  }

  const allowedKeys = new Set(['device_id', 'request_id'])
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      return adminErrorResponse('forbidden_field', 422)
    }
  }

  const authResult = await authorizeAuthenticatedEmployee(req)
  if (authResult instanceof Response) return authResult

  const { serviceClient, caller } = authResult

  const deviceId = parseUuid(payload.device_id, 'device_id')
  if (deviceId instanceof Response) return deviceId

  const requestId = parseUuid(payload.request_id, 'request_id')
  if (requestId instanceof Response) return requestId

  const deduplicationKey = `web_push_test:${requestId}`

  const { data: existingNotification } = await serviceClient
    .from('notifications')
    .select('id')
    .eq('deduplication_key', deduplicationKey)
    .maybeSingle()

  if (existingNotification?.id) {
    const { data: existingDelivery } = await serviceClient
      .from('notification_deliveries')
      .select('status')
      .eq('notification_id', existingNotification.id)
      .eq('request_id', requestId)
      .maybeSingle()

    if (existingDelivery) {
      if (existingDelivery.status === 'accepted') {
        return jsonResponse({
          ok: true,
          notification_id: existingNotification.id,
          delivery: { status: 'accepted' },
        })
      }
      if (existingDelivery.status === 'pending') {
        return jsonResponse({
          ok: true,
          notification_id: existingNotification.id,
          delivery: { status: 'pending' },
        })
      }
      if (existingDelivery.status === 'permanently_failed') {
        return jsonResponse(
          {
            ok: false,
            code: 'subscription_expired',
            notification_id: existingNotification.id,
            delivery: { status: 'permanently_failed' },
          },
          410
        )
      }
      if (existingDelivery.status === 'retryable') {
        return jsonResponse(
          {
            ok: false,
            code: 'push_temporarily_unavailable',
            notification_id: existingNotification.id,
            delivery: { status: 'retryable' },
          },
          503
        )
      }
      if (existingDelivery.status === 'failed') {
        return jsonResponse(
          {
            ok: false,
            code: 'delivery_failed',
            notification_id: existingNotification.id,
            delivery: { status: 'failed' },
          },
          502
        )
      }
    }
  }

  const rateLimited = await checkRateLimit(serviceClient, caller.id)
  if (rateLimited) return rateLimited

  const { data: subscription, error: subscriptionError } = await serviceClient
    .from('notification_push_subscriptions')
    .select('id, endpoint, p256dh_key, auth_key, failure_count')
    .eq('employee_id', caller.id)
    .eq('device_id', deviceId)
    .eq('is_active', true)
    .eq('permission_status', 'granted')
    .maybeSingle()

  if (subscriptionError) {
    return adminErrorResponse('internal_error', 500)
  }

  if (!subscription) {
    return jsonResponse({ ok: false, code: 'active_subscription_not_found' }, 409)
  }

  if (!isWebPushConfigured()) {
    return jsonResponse({ ok: false, code: 'web_push_not_configured' }, 503)
  }

  const { data: notification, error: notificationError } = await serviceClient
    .from('notifications')
    .insert({
      employee_id: caller.id,
      auth_user_id: caller.auth_user_id,
      module_code: 'web_push',
      event_code: 'web_push_test',
      title: 'Shugyla Platform',
      body: 'Тестовое push-уведомление отправлено сервером',
      action_url: '/shugyla-academy/platform/profile',
      priority: 'normal',
      status: 'processing',
      metadata: {
        source: 'send-test-web-push',
        request_id: requestId,
        channel: 'web_push',
        test: true,
      },
      deduplication_key: deduplicationKey,
    })
    .select('id')
    .single()

  if (notificationError || !notification?.id) {
    return adminErrorResponse('internal_error', 500)
  }

  let deliveryOutcome
  try {
    deliveryOutcome = await deliverNotificationToSubscription({
      serviceClient,
      notification: {
        id: notification.id,
        title: 'Shugyla Platform',
        body: 'Тестовое push-уведомление отправлено сервером',
        action_url: '/shugyla-academy/platform/profile',
      },
      subscription,
      requestId,
      attemptNumber: 1,
      buildPayload,
      pushOptions: { ttl: 180, urgency: 'normal' },
    })
  } catch {
    return jsonResponse({ ok: false, code: 'delivery_tracking_error' }, 500)
  }

  if (deliveryOutcome.status === 'accepted') {
    return jsonResponse({
      ok: true,
      notification_id: notification.id,
      delivery: { status: 'accepted' },
    })
  }

  if (deliveryOutcome.classification === 'subscription_expired') {
    return jsonResponse(
      {
        ok: false,
        code: 'subscription_expired',
        notification_id: notification.id,
        delivery: { status: 'permanently_failed' },
      },
      410
    )
  }

  if (deliveryOutcome.classification === 'configuration_error') {
    return jsonResponse(
      {
        ok: false,
        code: 'web_push_not_configured',
        notification_id: notification.id,
        delivery: { status: 'failed' },
      },
      503
    )
  }

  if (deliveryOutcome.classification === 'retryable_failure') {
    return jsonResponse(
      {
        ok: false,
        code: 'push_temporarily_unavailable',
        notification_id: notification.id,
        delivery: { status: 'retryable' },
      },
      503
    )
  }

  return jsonResponse(
    {
      ok: false,
      code: 'delivery_failed',
      notification_id: notification.id,
      delivery: { status: 'failed' },
    },
    502
  )
})
