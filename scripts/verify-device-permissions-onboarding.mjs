#!/usr/bin/env node
/**
 * Unit + static verification for notifications-only device setup onboarding.
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
  assert('notifications ready → no onboarding', !shouldShowDeviceSetupOnboarding(current))
  assert('notifications ready → fully ready', isDeviceFullyReady(current))
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
  assert('iPhone PWA current → no onboarding', !shouldShowDeviceSetupOnboarding(iosPwa))

  const dismissed = baseState({ notificationPermission: 'default' })
  assert('Не сейчас hides onboarding same session', !shouldShowDeviceSetupOnboarding(dismissed, { sessionDismissed: true }))

  const geoDeniedButNotificationsReady = baseState({
    notificationPermission: 'granted',
    browserSubscriptionPresent: true,
    browserVapidMatches: true,
    subscriptionVapidFingerprint: '71653018b9bcdd1b',
    backendRegistered: true,
    backendActive: true,
    geolocationPermission: 'denied',
  })
  assert(
    'geo denied does NOT show onboarding when notifications ready',
    !shouldShowDeviceSetupOnboarding(geoDeniedButNotificationsReady)
  )

  const geoPromptButNotificationsReady = baseState({
    notificationPermission: 'granted',
    browserSubscriptionPresent: true,
    browserVapidMatches: true,
    subscriptionVapidFingerprint: '71653018b9bcdd1b',
    backendRegistered: true,
    backendActive: true,
    geolocationPermission: 'prompt',
  })
  assert(
    'geo prompt does NOT show onboarding when notifications ready',
    !shouldShowDeviceSetupOnboarding(geoPromptButNotificationsReady)
  )

  const sessionDismissedDoesNotMarkConnected = baseState({
    notificationPermission: 'default',
  })
  assert(
    'dismiss is not notificationsReady',
    !sessionDismissedDoesNotMarkConnected.notificationsReady
  )

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
  console.log('')
}

function stageStatic() {
  console.log('Stage 3: Static wiring')
  const onboarding = read('src/components/platform/DeviceSetupOnboarding.jsx')
  const layout = read('src/layouts/PlatformLayout.jsx')
  const service = read('src/services/devicePermissionsService.js')
  const logic = read('src/services/devicePermissionsLogic.js')
  const hook = read('src/hooks/useDevicePermissions.js')
  const timeTracker = read('src/components/admin/sections/TimeTrackerSection.jsx')
  const geo = read('src/utils/geolocation.js')

  assert('onboarding title is Уведомления', onboarding.includes('>Уведомления<') || onboarding.includes('Уведомления'))
  assert('enable CTA', onboarding.includes('Включить уведомления'))
  assert('not now CTA', onboarding.includes('Не сейчас'))
  assert('no geolocation CTA', !onboarding.includes('Разрешить геолокацию'))
  assert('no geo lead copy', !onboarding.includes('геолокацию'))
  assert('no old setup title', !onboarding.includes('Настройте приложение для работы'))
  assert('no reminder lead copy', !onboarding.includes('напоминания о начале'))
  assert('no enableGeolocation import', !onboarding.includes('enableGeolocationFromUserGesture'))
  assert('no confirm notification CTA in modal', !onboarding.includes('Проверить уведомление'))
  assert('enable notifications via gesture helper', onboarding.includes('enableNotificationsFromUserGesture'))
  assert('no auto requestPermission on mount', !/useEffect\([\s\S]*requestPermission/.test(onboarding))

  assert('onboarding visibility ignores geo', logic.includes('Geolocation never affects visibility'))
  assert('notificationsReady short-circuits hide', logic.includes('if (state.notificationsReady) return false'))
  assert('banner visibility helper removed', !logic.includes('shouldShowDeviceSetupBanner'))

  assert('service skips geo query on load', service.includes("geolocationPermission = 'unknown'"))
  assert('service does not call queryGeolocationPermission in getDevicePermissionState', (() => {
    const fnStart = service.indexOf('export async function getDevicePermissionState')
    const fnEnd = service.indexOf('export function getOnboardingVisibility')
    const body = service.slice(fnStart, fnEnd)
    return !body.includes('queryGeolocationPermission(')
  })())

  assert('layout mounts onboarding modal', layout.includes('DeviceSetupOnboarding'))
  assert('layout does not mount setup banner', !layout.includes('DeviceSetupBanner'))
  assert('hook does not expose showBanner', !hook.includes('showBanner'))
  assert(
    'banner component deleted',
    !fs.existsSync(path.join(ROOT, 'src/components/platform/DeviceSetupBanner.jsx'))
  )
  assert(
    'banner css deleted',
    !fs.existsSync(path.join(ROOT, 'src/components/platform/DeviceSetupBanner.css'))
  )

  assert('time tracker still requests position on action', timeTracker.includes('getCurrentPosition'))
  assert('geo helpers remain for time tracker', geo.includes('getCurrentPosition'))
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
