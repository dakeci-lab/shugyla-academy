#!/usr/bin/env node
/**
 * Stage 5 readiness + admin personal test static/unit verification.
 *
 * Usage:
 *   npm run verify:subscription-readiness-rollout
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { aggregateSubscriptionReadiness } from '../src/services/devicePermissionsLogic.js'

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

function stageUnit() {
  console.log('Stage 1: Readiness states')
  const fp = '71653018b9bcdd1b'
  const oldFp = 'a2027241e05d32fd'

  const confirmed = aggregateSubscriptionReadiness({
    activeEmployees: [{ id: 1, full_name: 'A', position_name: 'X' }],
    subscriptions: [
      {
        id: 'sub-1',
        employee_id: 1,
        device_id: 'd1',
        is_active: true,
        permission_status: 'granted',
        vapid_key_fingerprint: fp,
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
        last_success_at: null,
      },
    ],
    currentFingerprint: fp,
    lastAcceptedDeliveryAt: '2026-08-04T12:00:00Z',
    acceptedDeliveries: [{ subscription_id: 'sub-1', created_at: '2026-08-04T12:00:00Z' }],
  })
  assert('confirmed after accepted', confirmed.summary.confirmed === 1)
  assert('confirmed not in needs setup', confirmed.employees_needing_setup.length === 0)

  const unconfirmed = aggregateSubscriptionReadiness({
    activeEmployees: [{ id: 2, full_name: 'B', position_name: 'Y' }],
    subscriptions: [
      {
        id: 'sub-2',
        employee_id: 2,
        device_id: 'd2',
        is_active: true,
        permission_status: 'granted',
        vapid_key_fingerprint: fp,
        created_at: '2026-08-04T18:00:00Z',
        updated_at: '2026-08-04T18:00:00Z',
        last_success_at: null,
      },
    ],
    currentFingerprint: fp,
    lastAcceptedDeliveryAt: null,
    acceptedDeliveries: [],
  })
  assert(
    'connected_unconfirmed without accepted',
    unconfirmed.summary.connected_unconfirmed === 1
  )
  assert('unconfirmed needs setup', unconfirmed.employees_needing_setup[0].readiness_state === 'connected_unconfirmed')

  const staleAccept = aggregateSubscriptionReadiness({
    activeEmployees: [{ id: 3, full_name: 'C', position_name: 'Z' }],
    subscriptions: [
      {
        id: 'sub-3',
        employee_id: 3,
        device_id: 'd3',
        is_active: true,
        permission_status: 'granted',
        vapid_key_fingerprint: fp,
        created_at: '2026-08-04T20:00:00Z',
        updated_at: '2026-08-04T20:00:00Z',
        last_success_at: '2026-08-01T00:00:00Z',
      },
    ],
    currentFingerprint: fp,
    lastAcceptedDeliveryAt: '2026-08-01T00:00:00Z',
    acceptedDeliveries: [{ subscription_id: 'sub-3', created_at: '2026-08-01T00:00:00Z' }],
  })
  assert(
    'old accepted does not confirm reconnected sub',
    staleAccept.summary.connected_unconfirmed === 1
  )

  const outdated = aggregateSubscriptionReadiness({
    activeEmployees: [{ id: 4, full_name: 'D', position_name: null }],
    subscriptions: [
      {
        id: 'sub-4',
        employee_id: 4,
        device_id: 'd4',
        is_active: true,
        permission_status: 'granted',
        vapid_key_fingerprint: oldFp,
        last_success_at: null,
      },
    ],
    currentFingerprint: fp,
    lastAcceptedDeliveryAt: null,
    acceptedDeliveries: [],
  })
  assert('outdated only', outdated.summary.outdated_only === 1)

  const missing = aggregateSubscriptionReadiness({
    activeEmployees: [{ id: 5, full_name: 'E', position_name: null }],
    subscriptions: [],
    currentFingerprint: fp,
    lastAcceptedDeliveryAt: null,
  })
  assert('missing', missing.summary.missing === 1)

  const multi = aggregateSubscriptionReadiness({
    activeEmployees: [{ id: 6, full_name: 'F', position_name: null }],
    subscriptions: [
      {
        id: 'sub-6a',
        employee_id: 6,
        device_id: 'da',
        is_active: true,
        permission_status: 'granted',
        vapid_key_fingerprint: fp,
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
        last_success_at: null,
      },
      {
        id: 'sub-6b',
        employee_id: 6,
        device_id: 'db',
        is_active: true,
        permission_status: 'granted',
        vapid_key_fingerprint: fp,
        created_at: '2026-08-04T00:00:00Z',
        updated_at: '2026-08-04T00:00:00Z',
        last_success_at: null,
      },
    ],
    currentFingerprint: fp,
    lastAcceptedDeliveryAt: '2026-08-04T12:00:00Z',
    acceptedDeliveries: [{ subscription_id: 'sub-6a', created_at: '2026-08-04T12:00:00Z' }],
  })
  assert('one accepted confirms employee', multi.summary.confirmed === 1)
  assert('current devices counted', multi.summary.current_devices === 2)
  console.log('')
}

function stageStatic() {
  console.log('Stage 2: Wiring')
  const logic = read('supabase/functions/_shared/subscriptionReadinessLogic.ts')
  const readiness = read('supabase/functions/_shared/subscriptionReadiness.ts')
  const personal = read('supabase/functions/_shared/employeePersonalTestPush.ts')
  const edge = read('supabase/functions/admin-notification-settings/index.ts')
  const sender = read('supabase/functions/send-test-web-push/index.ts')
  const panel = read('src/components/admin/NotificationSubscriptionReadinessPanel.jsx')
  const service = read('src/services/notificationSettingsAdminService.js')
  const onboarding = read('src/components/platform/DeviceSetupOnboarding.jsx')
  const settings = read('src/components/platform/notifications/PushNotificationSettings.jsx')

  assert('confirmed state', logic.includes("'confirmed'"))
  assert('connected_unconfirmed state', logic.includes("'connected_unconfirmed'"))
  assert('delivery_failed state', logic.includes("'delivery_failed'"))
  assert('accepted after baseline', logic.includes('isSubscriptionConfirmed'))
  assert('readiness uses logic', readiness.includes('resolveEmployeeReadiness'))
  assert('warnings built', readiness.includes('buildReadinessWarnings'))
  assert('personal test module', personal.includes('sendEmployeePersonalTest'))
  assert('personal test copy', personal.includes('Уведомления успешно подключены'))
  assert('relative action url', personal.includes("'/platform/time-tracker'"))
  assert('no broadcast in personal test', !personal.includes('sendTestBroadcast'))
  assert('edge personal action', edge.includes('send_employee_personal_test'))
  assert('target_employee_id allowed', edge.includes('target_employee_id'))
  assert('employee_id still forbidden globally', edge.includes("'employee_id'"))
  assert('connection confirm action', sender.includes('send_connection_confirm'))
  assert('panel table', panel.includes('<table'))
  assert('panel personal test', panel.includes('Персональный тест'))
  assert('panel no mass send', !panel.includes('Отправить всем'))
  assert('panel no endpoint field', !panel.includes('endpoint:') && !panel.includes('p256dh'))
  assert('service personal test', service.includes('sendEmployeePersonalTest'))
  assert('onboarding connect CTA', onboarding.includes('Подключить уведомления'))
  assert('onboarding confirm CTA', onboarding.includes('Проверить уведомление'))
  assert('profile missing label', settings.includes('Уведомления не подключены'))
  assert('disconnect warns about shifts', settings.includes('перестанете получать напоминания'))
  console.log('')
}

function stagePackage() {
  console.log('Stage 3: package script')
  const pkg = JSON.parse(read('package.json'))
  assert(
    'verify script registered',
    pkg.scripts['verify:subscription-readiness-rollout'] ===
      'node scripts/verify-subscription-readiness-rollout.mjs'
  )
  console.log('')
}

function main() {
  console.log('verify-subscription-readiness-rollout\n')
  stageUnit()
  stageStatic()
  stagePackage()
  console.log(`Passed ${testsPassed}/${testsRun}`)
}

try {
  main()
} catch (error) {
  console.error(`\nFAIL: ${error.message}`)
  process.exit(1)
}
