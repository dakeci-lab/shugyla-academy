import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWebPush, type WebPushSendInput, type WebPushSendResult } from './webPushSender.ts'
import type { PushClassification } from './webPushClassification.ts'

export type PushSubscriptionRow = {
  id: string
  endpoint: string
  p256dh_key: string
  auth_key: string
  failure_count?: number | null
}

export type NotificationDeliveryRow = {
  id: string
  title: string
  body: string
  action_url?: string | null
}

export type WebPushSenderFn = (input: WebPushSendInput) => Promise<WebPushSendResult>

export type DeliveryOutcome = {
  deliveryId: string
  status: 'accepted' | 'pending' | 'retryable' | 'permanently_failed' | 'failed'
  classification: PushClassification
}

export type DeliverNotificationInput = {
  serviceClient: SupabaseClient
  notification: NotificationDeliveryRow
  subscription: PushSubscriptionRow
  requestId: string
  attemptNumber: number
  sender?: WebPushSenderFn
  buildPayload: (notificationId: string, requestId: string) => Record<string, unknown>
  pushOptions?: Pick<WebPushSendInput, 'ttl' | 'urgency' | 'topic'>
  updateNotificationStatus?: boolean
}

export async function deliverNotificationToSubscription(
  input: DeliverNotificationInput
): Promise<DeliveryOutcome> {
  const sender = input.sender ?? sendWebPush
  const now = new Date().toISOString()

  const { data: delivery, error: deliveryError } = await input.serviceClient
    .from('notification_deliveries')
    .insert({
      notification_id: input.notification.id,
      subscription_id: input.subscription.id,
      channel: 'web_push',
      provider: 'web_push',
      status: 'pending',
      attempt_number: input.attemptNumber,
      request_id: input.requestId,
      queued_at: now,
    })
    .select('id')
    .single()

  if (deliveryError || !delivery?.id) {
    throw new Error('delivery_tracking_error')
  }

  const pushPayload = input.buildPayload(input.notification.id, input.requestId)
  const pushResult = await sender({
    endpoint: input.subscription.endpoint,
    p256dh: input.subscription.p256dh_key,
    auth: input.subscription.auth_key,
    payload: pushPayload,
    ttl: input.pushOptions?.ttl ?? 180,
    urgency: input.pushOptions?.urgency ?? 'normal',
    topic: input.pushOptions?.topic ?? (typeof pushPayload.tag === 'string' ? pushPayload.tag : undefined),
  })

  console.info('Web Push delivery result', {
    requestId: input.requestId,
    subscriptionId: input.subscription.id,
    status: pushResult.statusCode,
    ok: pushResult.ok,
    classification: pushResult.classification,
    provider: pushResult.provider ?? 'unknown',
  })

  if (pushResult.classification === 'accepted') {
    await input.serviceClient
      .from('notification_deliveries')
      .update({
        status: 'accepted',
        provider_status_code: pushResult.statusCode,
        sent_at: now,
        error_code: null,
        error_message: null,
        failed_at: null,
      })
      .eq('id', delivery.id)

    if (input.updateNotificationStatus !== false) {
      await input.serviceClient
        .from('notifications')
        .update({ status: 'dispatched' })
        .eq('id', input.notification.id)
    }

    await input.serviceClient
      .from('notification_push_subscriptions')
      .update({
        last_used_at: now,
        last_success_at: now,
        failure_count: 0,
        is_active: true,
        revoked_at: null,
      })
      .eq('id', input.subscription.id)

    return {
      deliveryId: delivery.id,
      status: 'accepted',
      classification: pushResult.classification,
    }
  }

  if (pushResult.classification === 'subscription_expired') {
    await input.serviceClient
      .from('notification_deliveries')
      .update({
        status: 'permanently_failed',
        provider_status_code: pushResult.statusCode,
        error_code: 'subscription_expired',
        error_message: 'Push subscription expired',
        failed_at: now,
      })
      .eq('id', delivery.id)

    await input.serviceClient
      .from('notification_push_subscriptions')
      .update({
        is_active: false,
        permission_status: 'revoked',
        revoked_at: now,
        failure_count: (input.subscription.failure_count ?? 0) + 1,
        last_failure_at: now,
      })
      .eq('id', input.subscription.id)

    if (input.updateNotificationStatus !== false) {
      await input.serviceClient
        .from('notifications')
        .update({ status: 'failed' })
        .eq('id', input.notification.id)
    }

    return {
      deliveryId: delivery.id,
      status: 'permanently_failed',
      classification: pushResult.classification,
    }
  }

  if (pushResult.classification === 'configuration_error') {
    const configErrorCode =
      pushResult.statusCode === 403 ? 'vapid_rejected' : 'web_push_not_configured'
    await input.serviceClient
      .from('notification_deliveries')
      .update({
        status: 'failed',
        provider_status_code: pushResult.statusCode,
        error_code: configErrorCode,
        error_message:
          configErrorCode === 'vapid_rejected'
            ? 'Push provider rejected VAPID credentials'
            : 'Web push configuration error',
        failed_at: now,
      })
      .eq('id', delivery.id)

    if (input.updateNotificationStatus !== false) {
      await input.serviceClient
        .from('notifications')
        .update({ status: 'failed' })
        .eq('id', input.notification.id)
    }

    return {
      deliveryId: delivery.id,
      status: 'failed',
      classification: pushResult.classification,
    }
  }

  if (pushResult.classification === 'retryable_failure') {
    await input.serviceClient
      .from('notification_deliveries')
      .update({
        status: 'retryable',
        provider_status_code: pushResult.statusCode,
        error_code: 'provider_unavailable',
        error_message: 'Push provider temporarily unavailable',
        failed_at: now,
      })
      .eq('id', delivery.id)

    await input.serviceClient
      .from('notification_push_subscriptions')
      .update({
        failure_count: (input.subscription.failure_count ?? 0) + 1,
        last_failure_at: now,
      })
      .eq('id', input.subscription.id)

    if (input.updateNotificationStatus !== false) {
      await input.serviceClient
        .from('notifications')
        .update({ status: 'failed' })
        .eq('id', input.notification.id)
    }

    return {
      deliveryId: delivery.id,
      status: 'retryable',
      classification: pushResult.classification,
    }
  }

  await input.serviceClient
    .from('notification_deliveries')
    .update({
      status: 'failed',
      provider_status_code: pushResult.statusCode,
      error_code: pushResult.classification,
      error_message: 'Push delivery failed',
      failed_at: now,
    })
    .eq('id', delivery.id)

  await input.serviceClient
    .from('notification_push_subscriptions')
    .update({
      failure_count: (input.subscription.failure_count ?? 0) + 1,
      last_failure_at: now,
    })
    .eq('id', input.subscription.id)

  if (input.updateNotificationStatus !== false) {
    await input.serviceClient
      .from('notifications')
      .update({ status: 'failed' })
      .eq('id', input.notification.id)
  }

  return {
    deliveryId: delivery.id,
    status: 'failed',
    classification: pushResult.classification,
  }
}
