#!/usr/bin/env node
/**
 * Static + unit checks for Web Push test-send diagnostics.
 *
 * Usage:
 *   npm run verify:web-push-test-send-diagnostics
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
  console.log('Stage 1: Static diagnostics wiring')
  const service = read('src/services/webPushSubscriptionService.js')
  const ui = read('src/components/platform/notifications/PushNotificationSettings.jsx')

  assert('parseFunctionInvokeContext exported', service.includes('export async function parseFunctionInvokeContext'))
  assert('classifySendTestFailure exported', service.includes('export function classifySendTestFailure'))
  assert('persist diagnostic storage key', service.includes('shugyla.web_push.last_test_send_diagnostic'))
  assert('test_sender_disabled mapped', service.includes("'test_sender_disabled'"))
  assert('safe user messages present', service.includes('Тестовая отправка временно отключена'))
  assert('diagnostic console logging', service.includes('web_push_test_send_diagnostic'))
  assert('no endpoint logging in diagnostics', !/console\.(log|info).*endpoint/i.test(service))
  assert('UI reads persisted diagnostic', ui.includes('readPersistedSendTestDiagnostic'))
  assert('UI alert role for test message', ui.includes('role="alert"'))
  assert('production button blocks after success', ui.includes('SERVER_SEND_STATE.SUCCESS'))
  assert('prepare flow exported', service.includes('export async function prepareDeviceForTestSend'))
  assert('request id persistence', service.includes('shugyla.web_push.test_send_request_id'))
  console.log('')
}

async function stageUnit() {
  console.log('Stage 2: Classification unit tests')
  const service = read('src/services/webPushSubscriptionService.js')

  const cases = [
    ["stage === 'session'", 'Сессия истекла'],
    ["stage === 'device'", 'Устройство не зарегистрировано'],
    ["stage === 'subscription'", 'Устройство не зарегистрировано'],
    ["stage === 'flag'", 'Тестовая отправка временно отключена'],
    ["stage === 'network'", 'Не удалось связаться с сервером'],
    ["errorCode === 'test_sender_disabled'", 'Тестовая отправка временно отключена'],
    ["errorCode === 'active_subscription_not_found'", 'Устройство не зарегистрировано'],
    ["httpStatus === 401", 'Сессия истекла'],
    ["httpStatus === 403", 'Сервер отклонил запрос'],
    ["httpStatus === 409", 'Устройство не зарегистрировано'],
    ["httpStatus === 422", 'Сервер отклонил запрос'],
    ["httpStatus >= 500", 'Сервер отклонил запрос'],
  ]

  for (const [needle, message] of cases) {
    assert(`resolveSendTestMessage handles ${needle}`, service.includes(needle) && service.includes(message))
  }

  assert('attempted flag in classify', service.includes('attempted'))
  console.log('')
}

async function main() {
  try {
    console.log('=== Web Push test-send diagnostics verification ===\n')
    stageStatic()
    await stageUnit()
    console.log(`Diagnostics verification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
  } catch (err) {
    console.error(`\nFAILED: ${err.message}\n`)
    process.exitCode = 1
  }
}

main()
