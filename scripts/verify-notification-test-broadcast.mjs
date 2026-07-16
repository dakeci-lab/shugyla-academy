#!/usr/bin/env node
/**
 * Verification for admin test notification broadcast.
 *
 * Usage:
 *   npm run verify:notification-test-broadcast
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let testsRun = 0
let testsPassed = 0

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  testsRun += 1
  if (!condition) fail(`${name}${detail ? `: ${detail}` : ''}`)
  testsPassed += 1
  console.log(`  ✓ ${name}`)
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function main() {
  console.log('=== Notification test broadcast verification ===\n')

  const edgeFn = read('supabase/functions/admin-notification-settings/index.ts')
  const shared = read('supabase/functions/_shared/testBroadcastPush.ts')
  const delivery = read('supabase/functions/_shared/notificationDelivery.ts')
  const service = read('src/services/notificationSettingsAdminService.js')
  const section = read('src/components/admin/NotificationTestBroadcastSection.jsx')
  const sectionCss = read('src/components/admin/NotificationTestBroadcastSection.css')
  const page = read('src/pages/platform/PlatformSettingsNotifications.jsx')
  const migration = read('supabase/migrations/20260718220000_notification_test_broadcast_audits.sql')
  const sw = read('public/sw.js')
  const adminVerify = read('scripts/verify-notification-settings-admin.mjs')

  console.log('Stage 1: Server actions and shared push reuse')

  assert('get_test_broadcast_summary action', edgeFn.includes("'get_test_broadcast_summary'"))
  assert('send_test_broadcast action', edgeFn.includes("'send_test_broadcast'"))
  assert('notifications.manage permission', edgeFn.includes("'notifications.manage'"))
  assert('reuses deliverNotificationToSubscription', shared.includes('deliverNotificationToSubscription'))
  assert('reuses isWebPushConfigured', shared.includes('isWebPushConfigured'))
  assert('does not duplicate VAPID sender', !shared.includes('sendWebPush'))
  assert('fixed broadcast title', shared.includes('Тестовое уведомление Shugyla Platform'))
  assert('fixed broadcast body', shared.includes('push-уведомления работают корректно'))
  assert('test_broadcast payload type', shared.includes('webPushPayload') || read('supabase/functions/_shared/webPushPayload.ts').includes("'test_broadcast'"))
  assert('shugyla-academy base url', shared.includes('/shugyla-academy/platform/settings/notifications'))
  assert('endpoint dedupe', shared.includes('dedupeSubscriptionsByEndpoint'))
  assert('vapid fingerprint migration', fs.existsSync(path.join(ROOT, 'supabase/migrations/20260718230000_push_subscription_vapid_fingerprint.sql')))
  assert('summary counts outdated subscriptions', shared.includes('outdated_subscriptions'))
  assert('summary exposes will_send', shared.includes('will_send'))
  assert('60s cooldown constant', shared.includes('TEST_BROADCAST_COOLDOWN_SECONDS = 60'))
  assert('404/410 handled via delivery module', delivery.includes("'subscription_expired'"))
  assert('forbidden recipient fields', edgeFn.includes("'subscription_id'"))
  assert('no admin exclusion filter', !shared.includes(".neq('employee_id'"))

  console.log('Stage 2: Audit migration')

  assert('audit table exists', migration.includes('notification_test_broadcast_audits'))
  assert('audit request_id unique', migration.includes('request_id uuid not null unique'))
  assert('audit initiated_by employee', migration.includes('initiated_by_employee_id'))
  assert('audit sent/failed/invalidated counts', migration.includes('invalidated_count'))
  assert('service_role grant', migration.includes('grant all on table public.notification_test_broadcast_audits to service_role'))
  assert('no endpoint storage', !migration.includes('endpoint'))

  console.log('Stage 3: Admin UI')

  assert('section title', section.includes('Проверка уведомлений'))
  assert('section button label', section.includes('Отправить тестовое уведомление'))
  assert('confirmation modal', section.includes('BroadcastConfirmModal'))
  assert('modal stats labels', section.includes('Актуальных подписок'))
  assert('modal will send label', section.includes('Будет отправлено'))
  assert('modal confirm button', section.includes('Отправить всем'))
  assert('empty subscriptions message', section.includes('Нет подключённых устройств'))
  assert('permission gate via Can', section.includes('NOTIFICATIONS_MANAGE'))
  assert('sending state disables button', section.includes("sending ? 'Отправка…'"))
  assert('page renders section', page.includes('NotificationTestBroadcastSection'))
  assert('mobile 48px button', sectionCss.includes('min-height: 48px'))
  assert('no secret fields in UI', !section.includes('endpoint') && !section.includes('p256dh'))

  console.log('Stage 4: Frontend service')

  assert('fetch summary action', service.includes("'get_test_broadcast_summary'"))
  assert('send broadcast action', service.includes("'send_test_broadcast'"))
  assert('cooldown message', service.includes('уже отправлялось недавно'))
  assert('partial success message', service.includes('отправлено частично'))
  assert('no raw edge function message', !service.includes('Edge Function returned a non-2xx'))

  console.log('Stage 5: Service worker compatibility')

  assert('sw push handler exists', sw.includes("addEventListener('push'"))
  assert('sw showNotification', sw.includes('showNotification'))
  assert('sw normalizes app url', sw.includes('normalizeNotificationDestination'))

  console.log('Stage 6: Existing admin verify updated')

  assert('admin verify includes broadcast section', adminVerify.includes('NotificationTestBroadcastSection'))
  assert('admin verify includes broadcast actions', adminVerify.includes('get_test_broadcast_summary'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
