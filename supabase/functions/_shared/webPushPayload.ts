/** Unified Web Push payload shape for Service Worker push handler. */

export type WebPushPayloadInput = {
  title: string
  body: string
  url: string
  type: string
  tag?: string
  notificationId?: string | null
  broadcastId?: string | null
  requestId?: string | null
}

const DEFAULT_ICON = '/shugyla-academy/icons/icon-192.png'
const DEFAULT_BADGE = '/shugyla-academy/icons/icon-192.png'
const DEFAULT_PLATFORM_URL = '/shugyla-academy/platform'

export function getDefaultPlatformUrl(): string {
  return DEFAULT_PLATFORM_URL
}

export function buildWebPushPayload(input: WebPushPayloadInput): Record<string, unknown> {
  const tag =
    input.tag ??
    (input.requestId
      ? `shugyla-push-${input.requestId.replace(/-/g, '').slice(0, 8)}`
      : 'shugyla-notification')

  return {
    title: input.title,
    body: input.body,
    icon: DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    tag,
    data: {
      url: input.url || DEFAULT_PLATFORM_URL,
      type: input.type,
      notification_id: input.notificationId ?? null,
      broadcast_id: input.broadcastId ?? null,
      request_id: input.requestId ?? null,
    },
    requireInteraction: false,
    timestamp: Date.now(),
  }
}

export function buildTestBroadcastPayload(
  notificationId: string,
  broadcastId: string
): Record<string, unknown> {
  return buildWebPushPayload({
    title: 'Тестовое уведомление Shugyla Platform',
    body: 'Если вы видите это сообщение, push-уведомления работают корректно.',
    url: '/shugyla-academy/platform/settings/notifications',
    type: 'test_broadcast',
    tag: `test-broadcast-${broadcastId.replace(/-/g, '').slice(0, 8)}`,
    notificationId,
    broadcastId,
    requestId: broadcastId,
  })
}

export function buildTimeTrackerPushPayload(
  notificationId: string,
  requestId: string,
  notification: {
    title: string
    body: string
    action_url?: string | null
  }
): Record<string, unknown> {
  return buildWebPushPayload({
    title: notification.title,
    body: notification.body,
    url: notification.action_url ?? DEFAULT_PLATFORM_URL,
    type: 'time_tracker',
    tag: `shugyla-time-tracker-${requestId.replace(/-/g, '').slice(0, 8)}`,
    notificationId,
    requestId,
  })
}
