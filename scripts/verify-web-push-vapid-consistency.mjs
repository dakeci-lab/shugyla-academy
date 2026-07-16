#!/usr/bin/env node
/**
 * Verify VAPID consistency across frontend, server secrets, subscriptions, and sender.
 *
 * Usage:
 *   npm run verify:web-push-vapid-consistency
 */

import { createECDH, createHash, timingSafeEqual } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { canonicalVapidFingerprint } from './lib/vapid-fingerprint.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const BACKUP_PATH = path.join(os.homedir(), '.shugyla-platform', 'secrets', 'production-vapid.env')

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

function decodeB64url(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  return Buffer.from((value + padding).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function verifyKeyPair(publicB64, privateB64) {
  const pubRaw = decodeB64url(publicB64)
  const privRaw = decodeB64url(privateB64)
  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(privRaw)
  const derived = ecdh.getPublicKey(null, 'uncompressed')
  return {
    matches: derived.length === pubRaw.length && timingSafeEqual(derived, pubRaw),
    derivedPublic: derived.toString('base64url'),
  }
}

function readBackupEnv() {
  if (!fs.existsSync(BACKUP_PATH)) return null
  const content = fs.readFileSync(BACKUP_PATH, 'utf8')
  const get = (name) => (content.match(new RegExp(`^${name}=(.+)$`, 'm')) || [])[1]?.trim()
  return {
    publicKey: get('VAPID_PUBLIC_KEY'),
    privateKey: get('VAPID_PRIVATE_KEY'),
    subject: get('VAPID_SUBJECT'),
  }
}

function main() {
  console.log('=== Web Push VAPID consistency verification ===\n')

  const migration = read('supabase/migrations/20260718230000_push_subscription_vapid_fingerprint.sql')
  const selection = read('supabase/functions/_shared/pushSubscriptionSelection.ts')
  const fingerprint = read('supabase/functions/_shared/vapidFingerprint.ts')
  const broadcast = read('supabase/functions/_shared/testBroadcastPush.ts')
  const manage = read('supabase/functions/manage-push-subscription/index.ts')
  const sendTest = read('supabase/functions/send-test-web-push/index.ts')
  const dispatch = read('supabase/functions/_shared/timeTrackerNotificationDispatch.ts')
  const delivery = read('supabase/functions/_shared/notificationDelivery.ts')
  const service = read('src/services/webPushSubscriptionService.js')
  const adminService = read('src/services/notificationSettingsAdminService.js')
  const section = read('src/components/admin/NotificationTestBroadcastSection.jsx')
  const deploy = read('.github/workflows/deploy.yml')

  console.log('Stage 1: Schema and fingerprint storage')
  assert('migration adds vapid_key_fingerprint', migration.includes('vapid_key_fingerprint'))
  assert('register saves fingerprint', manage.includes('vapid_key_fingerprint: vapidKeyFingerprint'))
  assert('status returns vapid_key_current', manage.includes('vapid_key_current'))

  console.log('Stage 2: Sender filters outdated subscriptions')
  assert('selection splits by fingerprint', selection.includes('splitSubscriptionsByCurrentVapid'))
  assert('broadcast summary counts outdated', broadcast.includes('outdated_subscriptions'))
  assert('broadcast sends only current vapid', broadcast.includes('loadCurrentVapidPushSubscriptions'))
  assert('send-test filters by fingerprint', sendTest.includes("eq('vapid_key_fingerprint', currentVapidFingerprint)"))
  assert('time tracker filters by fingerprint', dispatch.includes('subscription.vapid_key_fingerprint === currentVapidFingerprint'))

  console.log('Stage 3: Client resubscribe lifecycle')
  assert('applicationServerKey comparison', service.includes('subscriptionApplicationServerKey'))
  assert('unsubscribe on mismatch', service.includes('subscription.unsubscribe()'))
  assert('reconnect force resubscribe', service.includes('export async function reconnectDevicePushNotifications'))
  assert('ensure creates missing subscription', service.includes('createBrowserSubscription(registration, vapidPublicKey)'))
  assert('diagnostics expose vapidKeyStatus', service.includes('vapidKeyStatus'))

  console.log('Stage 4: Admin summary and diagnostics UI')
  assert('summary exposes will_send', broadcast.includes('will_send'))
  assert('admin formats outdated message', adminService.includes('Требуют переподключения'))
  assert('modal blocks when all outdated', section.includes('Все зарегистрированные устройства требуют переподключения'))
  assert('device vapid key label', section.includes('VAPID-ключ подписки'))

  console.log('Stage 5: Error classification')
  assert('403 maps to vapid_rejected', delivery.includes("'vapid_rejected'"))
  assert('403 does not invalidate all subscriptions', !delivery.includes('is_active: false') || delivery.indexOf('subscription_expired') < delivery.indexOf('vapid_rejected'))
  assert('404/410 still expire subscription', delivery.includes("'subscription_expired'"))
  assert('send-test returns vapid_rejected', sendTest.includes("'vapid_rejected'"))

  console.log('Stage 6: Frontend/server public key sources')
  assert('deploy reads production public key file', deploy.includes('config/production-vapid-public.key'))
  assert('frontend uses vite public env', service.includes('VITE_WEB_PUSH_VAPID_PUBLIC_KEY'))
  assert('edge fingerprint helper exists', fingerprint.includes('getCurrentServerVapidFingerprint'))

  const frontendPublic = read('config/production-vapid-public.key').trim()
  const backup = readBackupEnv()
  assert('frontend public key present', frontendPublic.length > 20)
  if (backup?.publicKey && backup?.privateKey) {
    const { matches, derivedPublic } = verifyKeyPair(backup.publicKey, backup.privateKey)
    const frontendFp = canonicalVapidFingerprint(frontendPublic)
    const serverFp = canonicalVapidFingerprint(backup.publicKey)
    const derivedFp = canonicalVapidFingerprint(derivedPublic)
    assert('backup pair matches', matches)
    assert('frontend fingerprint equals server public fingerprint', frontendFp === serverFp)
    assert('derived fingerprint equals server public fingerprint', derivedFp === serverFp)
    console.log(`  • frontend/server/derived fingerprint: ${frontendFp}`)
  } else {
    console.log('  • backup env unavailable — skipped live pair fingerprint check')
  }

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
