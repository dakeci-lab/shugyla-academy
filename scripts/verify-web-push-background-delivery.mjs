#!/usr/bin/env node
/**
 * Verification for background Web Push system delivery pipeline.
 *
 * Usage:
 *   npm run verify:web-push-background-delivery
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
  console.log('=== Web Push background delivery verification ===\n')

  const sw = read('public/sw.js')
  const payload = read('supabase/functions/_shared/webPushPayload.ts')
  const sender = read('supabase/functions/_shared/webPushSender.ts')
  const delivery = read('supabase/functions/_shared/notificationDelivery.ts')
  const broadcast = read('supabase/functions/_shared/testBroadcastPush.ts')
  const dispatch = read('supabase/functions/_shared/timeTrackerNotificationDispatch.ts')
  const service = read('src/services/webPushSubscriptionService.js')
  const session = read('src/context/SessionContext.jsx')
  const swRegister = read('src/pwa/registerServiceWorker.js')
  const section = read('src/components/admin/NotificationTestBroadcastSection.jsx')
  const envExample = fs.existsSync(path.join(ROOT, '.env.local'))
    ? read('.env.local')
    : ''

  console.log('Stage 1: Service Worker push handler')

  assert('push listener exists', sw.includes("addEventListener('push'"))
  assert('uses event.waitUntil', sw.includes('event.waitUntil(handlePushEvent(event))'))
  assert('calls showNotification', sw.includes('self.registration.showNotification'))
  assert('push handler error logging', sw.includes('push_show_notification_failed'))
  assert('json and text payload fallback', sw.includes('event.data.text()'))
  assert('nested notification payload support', sw.includes('raw?.notification'))
  assert('absolute icon urls', sw.includes('resolveAssetUrl'))
  assert('postMessage is secondary only', sw.includes('notifyOpenClients'))
  assert('notificationclick uses base path', sw.includes('normalizeNotificationDestination'))
  assert('sw cache v5', sw.includes('shugyla-academy-shell-v5'))

  console.log('Stage 2: Unified server payload')

  assert('shared payload builder', payload.includes('buildWebPushPayload'))
  assert('flat title/body shape', payload.includes('title: input.title'))
  assert('broadcast uses shared builder', broadcast.includes("from './webPushPayload.ts'"))
  assert('time tracker uses shared builder', dispatch.includes("from './webPushPayload.ts'"))

  console.log('Stage 3: Sender and delivery logging')

  assert('delivery logs provider result', delivery.includes("console.info('Web Push delivery result'"))
  assert('vapid 403 classified separately', delivery.includes("'vapid_rejected'"))
  assert('404/410 invalidates subscription', delivery.includes("'subscription_expired'"))
  assert('resolve push provider helper', sender.includes('resolvePushProvider'))
  assert('accepted only on sender ok', delivery.includes('pushResult.classification === \'accepted\''))

  console.log('Stage 4: Subscription lifecycle')

  assert('ensurePushNotificationsReady export', service.includes('export async function ensurePushNotificationsReady'))
  assert('creates subscription when missing', service.includes('createBrowserSubscription(registration, vapidPublicKey)'))
  assert('session uses ensure not sync only', session.includes('ensurePushNotificationsReady'))
  assert('sw controllerchange resync', swRegister.includes("addEventListener('controllerchange'"))
  assert('device diagnostics export', service.includes('export async function getDevicePushDiagnostics'))
  assert('diagnostics vapid key status', service.includes('vapidKeyStatus'))
  assert('reconnect export', service.includes('export async function reconnectDevicePushNotifications'))
  assert('ios standalone check', service.includes('ios_not_standalone'))

  console.log('Stage 5: Admin diagnostics UI')

  assert('device status block', section.includes('Это устройство'))
  assert('vapid key status label', section.includes('VAPID-ключ подписки'))
  assert('reconnect button', section.includes('Переподключить уведомления'))
  assert('no endpoint in UI', !section.includes('endpoint'))

  console.log('Stage 6: Frontend VAPID safety')

  assert('frontend uses public vapid env', service.includes('VITE_WEB_PUSH_VAPID_PUBLIC_KEY'))
  assert('no private vapid in frontend service', !service.includes('VAPID_PRIVATE_KEY'))
  if (envExample) {
    assert('.env.local has no private vapid', !envExample.includes('VAPID_PRIVATE_KEY'))
  }

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
