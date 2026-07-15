#!/usr/bin/env node
/**
 * Static + unit checks for Web Push sync-before-send prepare flow.
 *
 * Usage:
 *   npm run verify:web-push-test-send-prepare
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
  console.log('Stage 1: Prepare flow wiring')
  const service = read('src/services/webPushSubscriptionService.js')
  const ui = read('src/components/platform/notifications/PushNotificationSettings.jsx')
  const edge = read('supabase/functions/manage-push-subscription/index.ts')

  assert('prepareDeviceForTestSend exported', service.includes('export async function prepareDeviceForTestSend'))
  assert('evaluateTestSendReadiness exported', service.includes('export function evaluateTestSendReadiness'))
  assert('getDeviceTestSendStatus exported', service.includes('export async function getDeviceTestSendStatus'))
  assert('prepare success message', service.includes('Устройство готово к тестовому уведомлению'))
  assert('request persistence key', service.includes('shugyla.web_push.test_send_request_id'))
  assert('hasAttemptedSendTestRequest exported', service.includes('export function hasAttemptedSendTestRequest'))
  assert('persist request before invoke', service.includes('persistSendTestRequest(requestId)'))
  assert('send blocks repeated request', service.includes('request_already_attempted'))
  assert('send checks readiness before invoke', service.includes('getDeviceTestSendStatus()'))
  assert('send checks backend gate state', service.includes('test_sender_disabled'))
  assert('status returns matching_subscriptions', edge.includes('matching_subscriptions'))
  assert('status returns test_sender_enabled', edge.includes('test_sender_enabled'))
  assert('prepare button in UI', ui.includes('Подготовить устройство к тесту'))
  assert('send disabled until testReady', ui.includes('!testReady'))
  assert('send disabled until testSenderEnabled', ui.includes('!testSenderEnabled'))
  assert('preflight button present', ui.includes('Проверить готовность сервера'))
  console.log('')
}

function stageUnit() {
  console.log('Stage 2: Readiness unit tests')
  const service = read('src/services/webPushSubscriptionService.js')
  const evaluateSource = service
    .slice(
      service.indexOf('export function evaluateTestSendReadiness'),
      service.indexOf('export async function fingerprintDeviceId')
    )
    .replace('export function evaluateTestSendReadiness', 'function evaluateTestSendReadiness')

  const evaluate = new Function(`${evaluateSource}; return evaluateTestSendReadiness`)()

  const ready = evaluate({
    permission: 'granted',
    browserSubscriptionPresent: true,
    registered: true,
    active: true,
    matchingSubscriptions: 1,
  })
  assert('matching = 1 enables testReady', ready.testReady === true)

  const missingBrowser = evaluate({
    permission: 'granted',
    browserSubscriptionPresent: false,
    registered: true,
    active: true,
    matchingSubscriptions: 1,
  })
  assert('missing browser subscription blocks testReady', missingBrowser.testReady === false)

  const inactive = evaluate({
    permission: 'granted',
    browserSubscriptionPresent: true,
    registered: true,
    active: false,
    matchingSubscriptions: 0,
  })
  assert('inactive backend row blocks testReady', inactive.testReady === false)

  const multiMatch = evaluate({
    permission: 'granted',
    browserSubscriptionPresent: true,
    registered: true,
    active: true,
    matchingSubscriptions: 2,
  })
  assert('matching > 1 blocks testReady', multiMatch.testReady === false)

  const zeroMatch = evaluate({
    permission: 'granted',
    browserSubscriptionPresent: true,
    registered: false,
    active: false,
    matchingSubscriptions: 0,
  })
  assert('matching = 0 blocks testReady', zeroMatch.testReady === false)

  const prepareSource = service.slice(
    service.indexOf('export async function prepareDeviceForTestSend'),
    service.indexOf('function throwSendTestFailure')
  )
  assert('prepare does not invoke send-test-web-push', !prepareSource.includes("invoke('send-test-web-push'"))
  assert('prepare reuses resolveBrowserSubscription', prepareSource.includes('resolveBrowserSubscription(registration, vapidPublicKey)'))
  assert('UI blocks after persisted request', uiIncludesBlockedState())
  console.log('')
}

function uiIncludesBlockedState() {
  const ui = read('src/components/platform/notifications/PushNotificationSettings.jsx')
  return ui.includes('SERVER_SEND_STATE.BLOCKED') && ui.includes('hasAttemptedSendTestRequest()')
}

const PREPARE_TEST_SUCCESS_MESSAGE = 'Устройство готово к тестовому уведомлению'

async function main() {
  try {
    console.log('=== Web Push test-send prepare verification ===\n')
    stageStatic()
    stageUnit()
    console.log(`Prepare verification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
  } catch (err) {
    console.error(`\nFAILED: ${err.message}\n`)
    process.exitCode = 1
  }
}

main()
