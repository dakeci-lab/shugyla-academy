#!/usr/bin/env node
/**
 * Unit + static verification for Stage 3 device permissions onboarding.
 *
 * Usage:
 *   npm run verify:device-permissions-onboarding
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  aggregateSubscriptionReadiness,
  evaluateDevicePermissionState,
  isDeviceFullyReady,
  shouldShowDeviceSetupBanner,
  shouldShowDeviceSetupOnboarding,
  SUBSCRIPTION_STATUS,
  UI_CONNECTION_STATE,
} from '../src/services/devicePermissionsLogic.js'

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

function baseState(overrides = {}) {
  return evaluateDevicePermissionState({
    isIosLike: false,
    standalone: true,
    serviceWorkerSupported: true,
    pushSupported: true,
    notificationSupported: true,
    notificationPermission: 'default',
    browserSubscriptionPresent: false,
    browserVapidMatches: false,
    frontendVapidFingerprint: '71653018b9bcdd1b',
    serverVapidFingerprint: '71653018b9bcdd1b',
    subscriptionVapidFingerprint: null,
    backendRegistered: false,
    backendActive: false,
    geolocationSupported: true,
    geolocationPermission: 'prompt',
    lastSuccessAt: null,
    ...overrides,
  })
}

function stageUnit() {
  console.log('Stage 1: Permission state matrix')

  const permissionDefault = baseState({ notificationPermission: 'default' })
  assert('permission default → missing subscription', permissionDefault.subscriptionStatus === SUBSCRIPTION_STATUS.MISSING)
  assert('permission default → show onboarding', shouldShowDeviceSetupOnboarding(permissionDefault))

  const grantedNoSub = baseState({
    notificationPermission: 'granted',
    browserSubscriptionPresent: false,
  })
  assert('granted + no subscription → missing', grantedNoSub.subscriptionStatus === SUBSCRIPTION_STATUS.MISSING)
  assert('granted + no subscription → show onboarding', shouldShowDeviceSetupOnboarding(grantedNoSub))

  const current = baseState({
    notificationPermission: 'granted',
    browserSubscriptionPresent: true,
    browserVapidMatches: true,
    subscriptionVapidFingerprint: '71653018b9bcdd1b',
    backendRegistered: true,
    backendActive: true,
    geolocationPermission: 'granted',
  })
  assert('granted + current → current', current.subscriptionStatus === SUBSCRIPTION_STATUS.CURRENT)
  assert('current + geo granted → no onboarding', !shouldShowDeviceSetupOnboarding(current))
  assert('current + geo granted → fully ready', isDeviceFullyReady(current))
  assert('current ui = connected', current.uiConnectionState === UI_CONNECTION_STATE.CONNECTED)

  const outdated = baseState({
    notificationPermission: 'granted',
    browserSubscriptionPresent: true,
    browserVapidMatches: false,
    subscriptionVapidFingerprint: 'a2027241e05d32fd',
    backendRegistered: true,
    backendActive: true,
  })
  assert('outdated fingerprint → outdated', outdated.subscriptionStatus === SUBSCRIPTION_STATUS.OUTDATED)
  assert('outdated → show onboarding', shouldShowDeviceSetupOnboarding(outdated))
  assert('outdated ui = reconnect', outdated.uiConnectionState === UI_CONNECTION_STATE.RECONNECTION_REQUIRED)

  const denied = baseState({ notificationPermission: 'denied' })
  assert('denied → show onboarding', shouldShowDeviceSetupOnboarding(denied))
  assert('denied ui', denied.uiConnectionState === UI_CONNECTION_STATE.DENIED)

  const unsupported = baseState({
    serviceWorkerSupported: false,
    pushSupported: false,
    notificationSupported: false,
  })
  assert('unsupported browser', unsupported.subscriptionStatus === SUBSCRIPTION_STATUS.UNSUPPORTED)

  const iosSafari = baseState({
    isIosLike: true,
    standalone: false,
    notificationPermission: 'default',
  })
  assert('iPhone Safari tab → needs PWA', iosSafari.needsPwaInstall)
  assert('iPhone Safari tab → install_pwa ui', iosSafari.uiConnectionState === UI_CONNECTION_STATE.INSTALL_PWA)
  assert('iPhone Safari tab → show onboarding', shouldShowDeviceSetupOnboarding(iosSafari))

  const iosPwa = baseState({
    isIosLike: true,
    standalone: true,
    notificationPermission: 'granted',
    browserSubscriptionPresent: true,
    browserVapidMatches: true,
    subscriptionVapidFingerprint: '71653018b9bcdd1b',
    backendRegistered: true,
    backendActive: true,
    geolocationPermission: 'unknown',
  })
  assert('iPhone PWA current + geo unknown → no forced onboarding', !shouldShowDeviceSetupOnboarding(iosPwa))

  const dismissed = baseState({ notificationPermission: 'default' })
  assert('Не сейчас hides onboarding same session', !shouldShowDeviceSetupOnboarding(dismissed, { sessionDismissed: true }))
  assert('Не сейчас keeps banner', shouldShowDeviceSetupBanner(dismissed, { sessionDismissed: true }))

  const geoGranted = baseState({
    notificationPermission: 'granted',
    browserSubscriptionPresent: true,
    browserVapidMatches: true,
    subscriptionVapidFingerprint: '71653018b9bcdd1b',
    backendRegistered: true,
    backendActive: true,
    geolocationPermission: 'granted',
  })
  assert('geo granted ready', geoGranted.geolocationReady)

  const geoDenied = baseState({
    notificationPermission: 'granted',
    browserSubscriptionPresent: true,
    browserVapidMatches: true,
    subscriptionVapidFingerprint: '71653018b9bcdd1b',
    backendRegistered: true,
    backendActive: true,
    geolocationPermission: 'denied',
  })
  assert('geo denied shows onboarding', shouldShowDeviceSetupOnboarding(geoDenied))

  const geoUnsupported = baseState({
    geolocationSupported: false,
    geolocationPermission: 'unsupported',
  })
  assert('geo unsupported state', geoUnsupported.geolocationPermission === 'unsupported')

  console.log('')
}

function stageAggregate() {
  console.log('Stage 2: Admin readiness aggregation')
  const result = aggregateSubscriptionReadiness({
    activeEmployees: [
      { id: 1, full_name: 'Admin', position_name: 'Админ' },
      { id: 2, full_name: 'Staff', position_name: 'Продавец' },
      { id: 3, full_name: 'Missing', position_name: null },
    ],
    subscriptions: [
      {
        employee_id: 1,
        device_id: 'd1',
        is_active: true,
        permission_status: 'granted',
        vapid_key_fingerprint: '71653018b9bcdd1b',
        last_success_at: '2026-08-04T15:54:13Z',
      },
      {
        employee_id: 1,
        device_id: 'd2',
        is_active: true,
        permission_status: 'granted',
        vapid_key_fingerprint: 'a2027241e05d32fd',
        last_success_at: null,
      },
      {
        employee_id: 2,
        device_id: 'd3',
        is_active: true,
        permission_status: 'granted',
        vapid_key_fingerprint: 'a2027241e05d32fd',
        last_success_at: null,
      },
    ],
    currentFingerprint: '71653018b9bcdd1b',
    lastAcceptedDeliveryAt: '2026-08-04T15:54:13Z',
  })

  assert('active employees counted', result.summary.active_employees === 3)
  assert('employees with current', result.summary.employees_with_current === 1)
  assert('employees only outdated', result.summary.employees_only_outdated === 1)
  assert('employees missing', result.summary.employees_without_subscriptions === 1)
  assert('current devices', result.summary.current_devices === 1)
  assert('outdated devices', result.summary.outdated_devices === 2)
  assert('multi-device employee kept current', result.employees_needing_setup.every((e) => e.employee_id !== 1))
  assert('needs setup includes outdated + missing', result.employees_needing_setup.length === 2)
  console.log('')
}

function stageStatic() {
  console.log('Stage 3: Static wiring')
  const onboarding = read('src/components/platform/DeviceSetupOnboarding.jsx')
  const banner = read('src/components/platform/DeviceSetupBanner.jsx')
  const layout = read('src/layouts/PlatformLayout.jsx')
  const service = read('src/services/devicePermissionsService.js')
  const edge = read('supabase/functions/admin-notification-settings/index.ts')
  const readiness = read('supabase/functions/_shared/subscriptionReadiness.ts')
  const profile = read('src/pages/Profile.jsx')
  const settingsPage = read('src/pages/platform/PlatformSettingsNotifications.jsx')
  const geo = read('src/utils/geolocation.js')

  assert('onboarding title', onboarding.includes('Настройте приложение для работы'))
  assert('notifications CTA', onboarding.includes('Разрешить уведомления'))
  assert('geolocation CTA', onboarding.includes('Разрешить геолокацию'))
  assert('not now CTA', onboarding.includes('Не сейчас'))
  assert('no auto requestPermission in onboarding mount', !/useEffect\([\s\S]*requestPermission/.test(onboarding))
  assert('enable notifications only via gesture helper', onboarding.includes('enableNotificationsFromUserGesture'))
  assert('enable geo only via gesture helper', onboarding.includes('enableGeolocationFromUserGesture'))
  assert('ios install instruction', onboarding.includes('На экран „Домой“') || onboarding.includes('На экран «Домой»'))
  assert('denied recheck button', onboarding.includes('Проверить снова'))

  assert('banner requires setup label', banner.includes('Требуется настройка'))
  assert('layout mounts provider', layout.includes('DevicePermissionsProvider'))
  assert('layout mounts onboarding', layout.includes('DeviceSetupOnboarding'))
  assert('layout mounts banner', layout.includes('DeviceSetupBanner'))

  assert('service does not log endpoints', !service.includes('console.log') || !service.includes('endpoint'))
  assert('session dismiss key', service.includes('shugyla.device_setup.session_dismissed'))
  assert('connect uses canonical web push service', service.includes('connectDeviceNotifications'))

  assert('edge readiness action', edge.includes('get_subscription_readiness'))
  assert('readiness shared module', readiness.includes('export async function getSubscriptionReadiness'))
  assert('no endpoint in readiness response shape', !readiness.includes('endpoint:') && !readiness.includes('p256dh'))

  assert('profile hosts push settings', profile.includes('PushNotificationSettings'))
  assert('admin readiness panel mounted', settingsPage.includes('NotificationSubscriptionReadinessPanel'))
  assert('geo probe exists', geo.includes('requestGeolocationPermissionProbe'))
  assert('geo query exists', geo.includes('queryGeolocationPermission'))
  console.log('')
}

function main() {
  console.log('verify-device-permissions-onboarding\n')
  stageUnit()
  stageAggregate()
  stageStatic()
  console.log(`Passed ${testsPassed}/${testsRun}`)
}

try {
  main()
} catch (error) {
  console.error(`\nFAIL: ${error.message}`)
  process.exit(1)
}
