import '@supabase/functions-js/edge-runtime.d.ts'
import {
  adminErrorResponse,
  authorizeAuthenticatedEmployee,
} from '../_shared/employeeAuthorization.ts'
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import { getCurrentServerVapidFingerprint } from '../_shared/vapidFingerprint.ts'

const MAX_ENDPOINT_LENGTH = 2048
const MAX_KEY_LENGTH = 512
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/

const FORBIDDEN_TOP_LEVEL = new Set([
  'employee_id',
  'auth_user_id',
  'user_id',
  'login',
  'role',
  'status',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'service_role',
  'vapid_private_key',
  'p256dh',
  'auth',
  'endpoint',
])

const FORBIDDEN_SUBSCRIPTION = new Set([
  'employee_id',
  'auth_user_id',
  'user_id',
  'login',
  'role',
  'status',
  'password',
  'token',
  'service_role',
  'vapid_private_key',
])

type Action = 'register' | 'disable' | 'remove' | 'status'

function isTestSenderEnabled(): boolean {
  return (
    Deno.env.get('WEB_PUSH_TEST_ENABLED') === 'true' &&
    Deno.env.get('WEB_PUSH_PRODUCTION_TEST_ENABLED') === 'true'
  )
}

function subscriptionResponse(
  registered: boolean,
  active: boolean,
  permission: string,
  matchingSubscriptions = registered && active ? 1 : 0,
  extras: Record<string, unknown> = {}
) {
  return jsonResponse({
    ok: true,
    subscription: {
      registered,
      active,
      permission,
      matching_subscriptions: matchingSubscriptions,
      ...extras,
    },
    test_sender_enabled: isTestSenderEnabled(),
  })
}

function isValidEndpoint(endpoint: string): boolean {
  if (!endpoint || endpoint.length > MAX_ENDPOINT_LENGTH) return false
  if (/^(javascript|data|file):/i.test(endpoint)) return false
  try {
    const url = new URL(endpoint)
    if (url.protocol === 'https:') return true
    if (url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')) {
      return true
    }
    return false
  } catch {
    return false
  }
}

function isValidKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_KEY_LENGTH &&
    BASE64URL_RE.test(value)
  )
}

function parseDeviceId(value: unknown): string | null {
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) return null
  return value.trim()
}

function parseExpiration(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isNaN(parsed)) return null
    return new Date(parsed).toISOString()
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

  let payload: Record<string, unknown>
  try {
    payload = (await req.json()) as Record<string, unknown>
  } catch {
    return adminErrorResponse('malformed_json', 400)
  }

  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_TOP_LEVEL.has(key)) {
      return adminErrorResponse('forbidden_field', 422)
    }
  }

  const action = typeof payload.action === 'string' ? payload.action.trim() : ''
  if (!['register', 'disable', 'remove', 'status'].includes(action)) {
    return adminErrorResponse('validation_error', 422)
  }

  const deviceId = parseDeviceId(payload.device_id)
  if (!deviceId) {
    return adminErrorResponse('validation_error', 422)
  }

  const authResult = await authorizeAuthenticatedEmployee(req)
  if (authResult instanceof Response) return authResult

  const { serviceClient, caller } = authResult
  const employeeId = caller.id
  const authUserId = caller.auth_user_id

  if (action === 'status') {
    const currentVapidFingerprint = await getCurrentServerVapidFingerprint()

    const { data, error } = await serviceClient
      .from('notification_push_subscriptions')
      .select('is_active, permission_status, last_used_at, vapid_key_fingerprint')
      .eq('employee_id', employeeId)
      .eq('device_id', deviceId)
      .maybeSingle()

    if (error) {
      console.error('push_status_lookup_failed', { category: error.message })
      return adminErrorResponse('internal_error', 500)
    }

    if (!data) {
      return subscriptionResponse(false, false, 'default', 0, {
        vapid_key_current: false,
      })
    }

    const active = Boolean(data.is_active)
    const permission = data.permission_status ?? 'default'
    const vapidKeyCurrent =
      active &&
      permission === 'granted' &&
      Boolean(currentVapidFingerprint) &&
      data.vapid_key_fingerprint === currentVapidFingerprint

    return subscriptionResponse(active && permission === 'granted', vapidKeyCurrent, permission, vapidKeyCurrent ? 1 : 0, {
      vapid_key_current: vapidKeyCurrent,
      vapid_key_fingerprint: data.vapid_key_fingerprint ?? null,
    })
  }

  if (action === 'register') {
    const subscription = payload.subscription
    if (!subscription || typeof subscription !== 'object' || Array.isArray(subscription)) {
      return adminErrorResponse('invalid_subscription', 422)
    }

    const sub = subscription as Record<string, unknown>
    for (const key of Object.keys(sub)) {
      if (FORBIDDEN_SUBSCRIPTION.has(key)) {
        return adminErrorResponse('forbidden_field', 422)
      }
    }

    const endpoint = typeof sub.endpoint === 'string' ? sub.endpoint.trim() : ''
    if (!isValidEndpoint(endpoint)) {
      return adminErrorResponse('invalid_subscription', 422)
    }

    const keys = sub.keys
    if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
      return adminErrorResponse('invalid_subscription', 422)
    }

    const keyRecord = keys as Record<string, unknown>
    const p256dh = keyRecord.p256dh
    const authKey = keyRecord.auth
    if (!isValidKey(p256dh) || !isValidKey(authKey)) {
      return adminErrorResponse('invalid_subscription', 422)
    }

    const expirationTime = parseExpiration(sub.expiration_time)
    const userAgent = req.headers.get('user-agent')?.slice(0, 512) ?? null
    const now = new Date().toISOString()
    const vapidKeyFingerprint = await getCurrentServerVapidFingerprint()

    const row = {
      employee_id: employeeId,
      auth_user_id: authUserId,
      endpoint,
      p256dh_key: p256dh,
      auth_key: authKey,
      device_id: deviceId,
      expiration_time: expirationTime,
      user_agent: userAgent,
      permission_status: 'granted',
      is_active: true,
      revoked_at: null,
      last_used_at: now,
      vapid_key_fingerprint: vapidKeyFingerprint,
    }

    const { data: deviceRow, error: deviceLookupError } = await serviceClient
      .from('notification_push_subscriptions')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('device_id', deviceId)
      .maybeSingle()

    if (deviceLookupError) {
      console.error('push_register_device_lookup_failed', { category: deviceLookupError.message })
      return adminErrorResponse('internal_error', 500)
    }

    if (deviceRow) {
      const { data: endpointRow, error: endpointLookupError } = await serviceClient
        .from('notification_push_subscriptions')
        .select('id, employee_id')
        .eq('endpoint', endpoint)
        .maybeSingle()

      if (endpointLookupError) {
        console.error('push_register_endpoint_lookup_failed', { category: endpointLookupError.message })
        return adminErrorResponse('internal_error', 500)
      }

      if (endpointRow && endpointRow.id !== deviceRow.id) {
        if (endpointRow.employee_id !== employeeId) {
          return adminErrorResponse('forbidden', 403)
        }

        const { error: deleteStaleError } = await serviceClient
          .from('notification_push_subscriptions')
          .delete()
          .eq('id', endpointRow.id)
          .eq('employee_id', employeeId)

        if (deleteStaleError) {
          console.error('push_register_stale_delete_failed', { category: deleteStaleError.message })
          return adminErrorResponse('internal_error', 500)
        }
      }

      const { error: updateError } = await serviceClient
        .from('notification_push_subscriptions')
        .update({
          auth_user_id: authUserId,
          endpoint,
          p256dh_key: p256dh,
          auth_key: authKey,
          expiration_time: expirationTime,
          user_agent: userAgent,
          permission_status: 'granted',
          is_active: true,
          revoked_at: null,
          last_used_at: now,
          vapid_key_fingerprint: vapidKeyFingerprint,
        })
        .eq('id', deviceRow.id)
        .eq('employee_id', employeeId)

      if (updateError) {
        console.error('push_register_update_failed', { category: updateError.message })
        return adminErrorResponse('internal_error', 500)
      }
    } else {
      const { error: upsertError } = await serviceClient
        .from('notification_push_subscriptions')
        .upsert(row, { onConflict: 'endpoint' })

      if (upsertError) {
        console.error('push_register_failed', { category: upsertError.message })
        return adminErrorResponse('internal_error', 500)
      }
    }

    return subscriptionResponse(true, true, 'granted')
  }

  if (action === 'disable') {
    const { data, error } = await serviceClient
      .from('notification_push_subscriptions')
      .select('id, permission_status')
      .eq('employee_id', employeeId)
      .eq('device_id', deviceId)
      .maybeSingle()

    if (error) {
      console.error('push_disable_lookup_failed', { category: error.message })
      return adminErrorResponse('internal_error', 500)
    }

    if (!data) {
      return subscriptionResponse(false, false, 'default')
    }

    const now = new Date().toISOString()
    const { error: updateError } = await serviceClient
      .from('notification_push_subscriptions')
      .update({
        is_active: false,
        last_used_at: now,
      })
      .eq('id', data.id)
      .eq('employee_id', employeeId)

    if (updateError) {
      console.error('push_disable_failed', { category: updateError.message })
      return adminErrorResponse('internal_error', 500)
    }

    return subscriptionResponse(true, false, data.permission_status ?? 'granted')
  }

  // remove
  const { error: deleteError } = await serviceClient
    .from('notification_push_subscriptions')
    .delete()
    .eq('employee_id', employeeId)
    .eq('device_id', deviceId)

  if (deleteError) {
    console.error('push_remove_failed', { category: deleteError.message })
    return adminErrorResponse('internal_error', 500)
  }

  return subscriptionResponse(false, false, 'revoked')
})
