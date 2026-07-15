#!/usr/bin/env node
/**
 * Verifier for simplified PushNotificationSettings production UI.
 *
 * Usage:
 *   npm run verify:push-notification-settings-ui
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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function stageStatic() {
  console.log('Stage 1: Production UI structure')
  const ui = read('src/components/platform/notifications/PushNotificationSettings.jsx')
  const diagnostics = read('src/components/platform/notifications/PushNotificationDiagnostics.jsx')
  const css = read('src/components/platform/notifications/PushNotificationSettings.css')
  const service = read('src/services/webPushSubscriptionService.js')

  assert('title unchanged', ui.includes('Уведомления на этом устройстве'))
  assert('new subtitle', ui.includes('Получайте напоминания о начале и завершении смены'))
  assert('connect button label', ui.includes('Подключить уведомления'))
  assert('reconnect button label', ui.includes('Переподключить уведомления'))
  assert('disconnect button label', ui.includes('Отключить уведомления'))
  assert('connected status', ui.includes('Уведомления подключены'))
  assert('reconnection status', ui.includes('Требуется переподключение'))
  assert('not connected status', ui.includes('Уведомления не подключены'))
  assert('denied status with iphone hint', ui.includes('Настройки → Уведомления → Shugyla Platform'))
  assert('unsupported status', ui.includes('Уведомления не поддерживаются на этом устройстве'))
  assert('error status', ui.includes('CONNECTION_ERROR_MESSAGE'))
  assert('success hint', ui.includes('CONNECT_SUCCESS_HINT'))
  assert('disconnect confirm', ui.includes('Напоминания о смене больше не будут приходить'))

  assert('main UI hides prepare test button', !ui.includes('Подготовить устройство к тесту'))
  assert('main UI hides permit button', !ui.includes('Создать одноразовое разрешение'))
  assert('main UI hides test send button', !ui.includes('Отправить тестовое уведомление'))
  assert('main UI hides preflight button', !ui.includes('Проверить готовность сервера'))
  assert('main UI hides permit expiry message', !ui.includes('Срок одноразового разрешения истёк'))

  assert('diagnostics component exists', diagnostics.includes('Диагностика уведомлений'))
  assert('diagnostics keeps prepare button', diagnostics.includes('Подготовить устройство к тесту'))
  assert('diagnostics keeps permit button', diagnostics.includes('Создать одноразовое разрешение'))
  assert('diagnostics keeps test send button', diagnostics.includes('Отправить тестовое уведомление'))

  assert('admin + env gate', ui.includes('isWebPushDiagnosticsEnabled'))
  assert('admin role gate', ui.includes('isAdmin(user?.role)'))
  assert('clear test session when diagnostics hidden', ui.includes('clearTestUiSessionState'))
  assert('diagnostics component imported', ui.includes('PushNotificationDiagnostics'))

  assert('primary button full width', css.includes('push-settings__primary-btn'))
  assert('min button height 44px', css.includes('min-height: 44px'))
  assert('no monospace preflight in main css default', !css.includes('font-family: monospace'))

  assert('connection status helper exported', service.includes('export function evaluateDeviceConnectionStatus'))
  assert('diagnostics flag helper exported', service.includes('export function isWebPushDiagnosticsEnabled'))
  assert('clear test ui helper exported', service.includes('export function clearTestUiSessionState'))
  assert('connect helper exported', service.includes('export async function connectDeviceNotifications'))
  console.log('')
}

function stageUnit() {
  console.log('Stage 2: Connection status unit tests')
  const service = read('src/services/webPushSubscriptionService.js')
  const statusConstSource = service.slice(
    service.indexOf('export const DEVICE_CONNECTION_STATUS'),
    service.indexOf('export const CONNECT_SUCCESS_MESSAGE')
  )
  const evaluateSource = service.slice(
    service.indexOf('export function evaluateDeviceConnectionStatus'),
    service.indexOf('export async function getDeviceConnectionStatus')
  )
  const evaluate = new Function(
    `${statusConstSource.replace('export const DEVICE_CONNECTION_STATUS', 'const DEVICE_CONNECTION_STATUS')}\n${evaluateSource.replace('export function evaluateDeviceConnectionStatus', 'function evaluateDeviceConnectionStatus')}; return evaluateDeviceConnectionStatus`
  )()

  const connected = evaluate({
    permission: 'granted',
    browserSubscriptionPresent: true,
    browserVapidMatches: true,
    storedVapidFingerprintPresent: true,
    storedVapidFingerprintMatches: true,
    backendRegistered: true,
    backendActive: true,
  })
  assert('connected status', connected === 'connected')

  const missing = evaluate({
    permission: 'default',
    browserSubscriptionPresent: false,
    browserVapidMatches: false,
    storedVapidFingerprintPresent: false,
    storedVapidFingerprintMatches: false,
    backendRegistered: false,
    backendActive: false,
  })
  assert('missing subscription -> not connected', missing === 'not_connected')

  const oldVapid = evaluate({
    permission: 'granted',
    browserSubscriptionPresent: true,
    browserVapidMatches: false,
    storedVapidFingerprintPresent: true,
    storedVapidFingerprintMatches: false,
    backendRegistered: true,
    backendActive: true,
  })
  assert('old vapid fingerprint -> reconnection', oldVapid === 'reconnection_required')

  const inactiveBackend = evaluate({
    permission: 'granted',
    browserSubscriptionPresent: true,
    browserVapidMatches: true,
    storedVapidFingerprintPresent: true,
    storedVapidFingerprintMatches: true,
    backendRegistered: true,
    backendActive: false,
  })
  assert('backend inactive with browser sub -> reconnection', inactiveBackend === 'reconnection_required')

  const denied = evaluate({
    permission: 'denied',
    browserSubscriptionPresent: false,
    browserVapidMatches: false,
    storedVapidFingerprintPresent: false,
    storedVapidFingerprintMatches: false,
    backendRegistered: false,
    backendActive: false,
  })
  assert('permission denied status', denied === 'denied')

  const clearSource = service.slice(
    service.indexOf('export function clearTestUiSessionState'),
    service.indexOf('export function evaluateDeviceConnectionStatus')
  )
  assert('clear test ui removes permit storage', clearSource.includes('clearPersistedTestSendPermit'))
  assert('clear test ui removes request storage', clearSource.includes('SEND_TEST_REQUEST_STORAGE_KEY'))

  const edge = read('supabase/functions/manage-push-subscription/index.ts')
  assert('disable keeps permission_status unchanged', edge.includes('.select(\'id, permission_status\')'))
  assert('disable only sets is_active false', edge.includes('is_active: false,\n        last_used_at: now,'))
  assert('disable does not set revoked permission', !edge.includes('permission_status: \'revoked\''))

  console.log('')
}

function main() {
  console.log('verify-push-notification-settings-ui\n')
  stageStatic()
  stageUnit()
  console.log(`Result: ${testsPassed}/${testsRun} passed`)
}

try {
  main()
} catch (err) {
  console.error(`FAILED: ${err.message}`)
  process.exit(1)
}
