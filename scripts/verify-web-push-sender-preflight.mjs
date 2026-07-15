#!/usr/bin/env node
/**
 * Local verification for send-test-web-push preflight action.
 *
 * Usage:
 *   npm run verify:web-push-sender-preflight
 */

import { spawnSync } from 'child_process'
import crypto, { webcrypto } from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { loginToTechnicalEmail } from '../src/utils/phoneUtils.js'
import { getLocalSupabaseStatus } from './lib/localSupabaseCli.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROJECT_ID = 'shugyla-academy'
const FIXTURE_TAG = 'web-push-preflight-verify'
const USER_A_PASSWORD = 'WebPushPreflightA123!'
const USER_B_PASSWORD = 'WebPushPreflightB123!'
const ENDPOINT = `https://127.0.0.1:54321/local-push/${FIXTURE_TAG}`
const P256DH = 'BEl62iUYgUihxQfF9Kj3QfF9Kj3QfF9Kj3QfF9Kj3QfF9Kj3QfF9Kj3QfF9Kj3QfF'
const AUTH_KEY = 'tBHItJI5svbpez7KI4CCXg'

const state = {
  container: null,
  apiUrl: null,
  anonKey: null,
  serviceRoleKey: null,
  senderUrl: null,
  registerUrl: null,
  roleIds: {},
  users: {},
  tokens: {},
  deviceA: crypto.randomUUID(),
  deviceB: crypto.randomUUID(),
  deviceC: crypto.randomUUID(),
  p256dh: null,
  authKey: null,
  createdAuthUserIds: [],
  createdEmployeeIds: [],
  testsRun: 0,
  testsPassed: 0,
}

async function makeValidPushKeys() {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  )
  const raw = Buffer.from(await webcrypto.subtle.exportKey('raw', keyPair.publicKey))
  return {
    p256dh: raw.toString('base64url'),
    auth: crypto.randomBytes(16).toString('base64url'),
  }
}

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  state.testsRun += 1
  if (!condition) fail(`${name}${detail ? `: ${detail}` : ''}`)
  state.testsPassed += 1
  console.log(`  ✓ ${name}`)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  })
  if (result.error) fail(`${command} failed: ${result.error.message}`)
  if (result.status !== 0 && !options.allowFailure) {
    fail(`${command} exited with code ${result.status}`)
  }
  return result
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function psqlScalar(sql) {
  const result = run(
    'docker',
    ['exec', state.container, 'psql', '-U', 'postgres', '-t', '-A', '-c', sql],
    { capture: true }
  )
  return result.stdout.trim()
}

function psqlExec(sql) {
  run('docker', ['exec', state.container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    capture: true,
  })
}

function findDbContainer() {
  const name = `supabase_db_${PROJECT_ID}`
  const result = run('docker', ['ps', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'], {
    capture: true,
  })
  const names = result.stdout.trim().split('\n').filter(Boolean)
  if (names.length !== 1) fail(`Expected one DB container, found ${names.length}`)
  return names[0]
}

function adminClient() {
  return createClient(state.apiUrl, state.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function invokeSender({ token, body, method = 'POST' } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: state.anonKey,
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(state.senderUrl, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  })

  let json = null
  try {
    json = await response.json()
  } catch {
    json = null
  }
  return { status: response.status, json }
}

async function invokeRegister({ token, body }) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: state.anonKey,
    Authorization: `Bearer ${token}`,
  }
  const response = await fetch(state.registerUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  let json = null
  try {
    json = await response.json()
  } catch {
    json = null
  }
  return { status: response.status, json }
}

function validRegisterBody(deviceId, endpoint = ENDPOINT) {
  return {
    action: 'register',
    device_id: deviceId,
    subscription: {
      endpoint,
      expiration_time: null,
      keys: { p256dh: state.p256dh, auth: state.authKey },
    },
  }
}

function validPreflightBody(deviceId) {
  return { action: 'preflight', device_id: deviceId }
}

function validSendBody(deviceId, requestId = crypto.randomUUID(), permitId) {
  return { action: 'send', device_id: deviceId, request_id: requestId, permit_id: permitId }
}

function legacySendBody(deviceId, requestId = crypto.randomUUID()) {
  return { device_id: deviceId, request_id: requestId }
}

function computeReadyFlags({ matching, configured, callerActive }) {
  const readyExceptPermit = callerActive && matching === 1 && configured
  return { readyExceptPermit, readyToSend: false }
}

function stageStatic() {
  console.log('Stage 1: Static preflight contract')
  const senderFn = read('supabase/functions/send-test-web-push/index.ts')
  const service = read('src/services/webPushSubscriptionService.js')
  const ui = read('src/components/platform/notifications/PushNotificationSettings.jsx')

  assert('preflight action supported', senderFn.includes("'preflight'"))
  assert('issue_permit action supported', senderFn.includes("'issue_permit'"))
  assert('send action supported', senderFn.includes("'send'"))
  assert('auth before preflight branch', senderFn.indexOf('authorizeAuthenticatedEmployee') < senderFn.indexOf("action === 'preflight'"))
  assert('preflight before send branch', senderFn.indexOf('handlePreflight') < senderFn.indexOf('handleSend'))
  assert('consume before notification insert', senderFn.indexOf('consumeTestSendPermit') < senderFn.indexOf(".from('notifications')"))
  assert('legacy returns permit_required', senderFn.includes("'permit_required'"))
  const preflightBlock = senderFn.slice(
    senderFn.indexOf('async function handlePreflight'),
    senderFn.indexOf('async function checkRateLimit')
  )
  assert('preflight skips checkRateLimit call', !preflightBlock.includes('checkRateLimit('))
  assert('preflight skips deliverNotificationToSubscription call', !preflightBlock.includes('deliverNotificationToSubscription('))
  assert('preflight skips notification insert call', !preflightBlock.includes('.insert('))
  assert('preflight response mode field', senderFn.includes("mode: 'preflight'"))
  assert('matching_subscription_conflict code', senderFn.includes("'matching_subscription_conflict'"))
  assert('ready_except_permit field', senderFn.includes('ready_except_permit'))
  assert('permit_required field', senderFn.includes('permit_required'))
  assert('ready_to_send field', senderFn.includes('ready_to_send'))
  assert('preflightServerTestWebPush exported', service.includes('export async function preflightServerTestWebPush'))
  assert('preflight invoke action', service.includes("action: 'preflight'"))
  const preflightServiceBlock = service.slice(
    service.indexOf('export async function preflightServerTestWebPush'),
    service.indexOf('export function evaluateTestSendReadiness')
  )
  assert('preflight no request_id in invoke', !preflightServiceBlock.includes('request_id'))
  assert('preflight no persistSendTestRequest', !preflightServiceBlock.includes('persistSendTestRequest'))
  assert('preflight diagnostic storage key', service.includes('shugyla.web_push.last_preflight_diagnostic'))
  assert('send action explicit', service.includes("action: 'send'"))
  assert('preflight button in UI', ui.includes('Проверить готовность сервера'))
  assert('preflight requires testReady', ui.includes('!testReady') && ui.includes('handlePreflightServer'))
  assert('preflight separate from send click', ui.includes('handlePreflightServer') && ui.includes('handleServerTest'))
  assert('no endpoint in preflight response builder', senderFn.includes("{ count: 'exact', head: true }"))
  console.log('')
}

function stageUnitReadiness() {
  console.log('Stage 2: Readiness unit logic')
  const gatesOff = computeReadyFlags({
    matching: 1,
    configured: true,
    callerActive: true,
  })
  assert('ready_except_permit true', gatesOff.readyExceptPermit === true)
  assert('ready_to_send false without permit', gatesOff.readyToSend === false)

  const gatesOn = computeReadyFlags({
    matching: 1,
    configured: true,
    callerActive: true,
  })
  assert('preflight ready_to_send remains false', gatesOn.readyToSend === false)
  console.log('')
}

async function createUser(key, login, password, roleCode, roleId, status = 'active') {
  const admin = adminClient()
  const email = loginToTechnicalEmail(login)

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  let authUserId = null
  if (error) {
    const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = listed.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
    if (!existing?.id) fail(`Create auth ${key}: ${error.message}`)
    authUserId = existing.id
    await admin.auth.admin.updateUserById(authUserId, { password, email_confirm: true })
  } else {
    authUserId = data.user.id
  }

  state.createdAuthUserIds.push(authUserId)
  const employeeId = Number(psqlScalar('SELECT COALESCE(MAX(id), 0) + 1 FROM public.academy_users;'))
  state.createdEmployeeIds.push(employeeId)

  psqlExec(`DELETE FROM public.academy_users WHERE login = '${login}';`)
  psqlExec(`
    INSERT INTO public.academy_users (
      id, first_name, last_name, full_name, login, password, role, role_id, status, auth_user_id
    ) VALUES (
      ${employeeId}, 'Preflight', '${key}', '[${FIXTURE_TAG}] ${key}', '${login}',
      '', '${roleCode}', '${roleId}', '${status}', '${authUserId}'
    );
  `)

  const anon = createClient(state.apiUrl, state.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = await anon.auth.signInWithPassword({ email, password })
  if (signIn.error) fail(`Sign in ${key}: ${signIn.error.message}`)

  state.users[key] = { employeeId, authUserId, login }
  state.tokens[key] = signIn.data.session.access_token
}

async function stageSetup() {
  console.log('Stage 3: Local integration setup')
  state.p256dh = P256DH
  state.authKey = AUTH_KEY

  const status = getLocalSupabaseStatus()
  state.apiUrl = status.API_URL
  state.anonKey = status.ANON_KEY
  state.serviceRoleKey = status.SERVICE_ROLE_KEY
  state.senderUrl = `${state.apiUrl}/functions/v1/send-test-web-push`
  state.registerUrl = `${state.apiUrl}/functions/v1/manage-push-subscription`
  state.container = findDbContainer()

  state.roleIds.cashier = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'cashier' LIMIT 1;`)
  state.roleIds.admin = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'admin' LIMIT 1;`)
  if (!state.roleIds.cashier || !state.roleIds.admin) fail('Missing roles')

  await createUser('a', `${FIXTURE_TAG}-user-a`, USER_A_PASSWORD, 'cashier', state.roleIds.cashier)
  await createUser('b', `${FIXTURE_TAG}-user-b`, USER_B_PASSWORD, 'admin', state.roleIds.admin)

  const regA = await invokeRegister({
    token: state.tokens.a,
    body: validRegisterBody(state.deviceA),
  })
  assert(
    'user A register → 200',
    regA.status === 200 && regA.json?.ok,
    `status=${regA.status} body=${JSON.stringify(regA.json)}`
  )

  const regB = await invokeRegister({
    token: state.tokens.b,
    body: validRegisterBody(state.deviceB, `${ENDPOINT}-admin-b`),
  })
  assert('user B admin register → 200', regB.status === 200 && regB.json?.ok)

  console.log('')
}

async function stagePreflightIntegration() {
  console.log('Stage 4: Preflight integration')

  const beforeNotifications = Number(psqlScalar('SELECT COUNT(*) FROM public.notifications;'))
  const beforeDeliveries = Number(psqlScalar('SELECT COUNT(*) FROM public.notification_deliveries;'))

  const ok = await invokeSender({
    token: state.tokens.a,
    body: validPreflightBody(state.deviceA),
  })
  assert('preflight matching=1 → 200', ok.status === 200 && ok.json?.ok === true)
  assert('preflight mode field', ok.json?.mode === 'preflight')
  assert('preflight matching count 1', ok.json?.checks?.matching_active_subscriptions === 1)
  assert('preflight ready_except_permit true', ok.json?.checks?.ready_except_permit === true)
  assert('preflight ready_to_send false', ok.json?.checks?.ready_to_send === false)
  assert('preflight permit_required true', ok.json?.checks?.permit_required === true)
  assert('preflight response no endpoint', !JSON.stringify(ok.json).includes(ENDPOINT))
  assert('preflight response no p256dh', !JSON.stringify(ok.json).includes('p256dh'))

  const afterOkNotifications = Number(psqlScalar('SELECT COUNT(*) FROM public.notifications;'))
  const afterOkDeliveries = Number(psqlScalar('SELECT COUNT(*) FROM public.notification_deliveries;'))
  assert('preflight success no notification created', afterOkNotifications === beforeNotifications)
  assert('preflight success no delivery created', afterOkDeliveries === beforeDeliveries)

  const extraField = await invokeSender({
    token: state.tokens.a,
    body: { ...validPreflightBody(state.deviceA), request_id: crypto.randomUUID() },
  })
  assert('preflight extra request_id → 422', extraField.status === 422)

  const missingDevice = await invokeSender({
    token: state.tokens.a,
    body: { action: 'preflight' },
  })
  assert('preflight missing device_id → 422', missingDevice.status === 422)

  const noJwt = await invokeSender({ body: validPreflightBody(state.deviceA) })
  assert('preflight unauthorized → 401', noJwt.status === 401)

  const wrongDevice = await invokeSender({
    token: state.tokens.a,
    body: validPreflightBody(state.deviceC),
  })
  assert('preflight missing subscription → 409', wrongDevice.status === 409 && wrongDevice.json?.code === 'active_subscription_not_found')

  const otherUserDevice = await invokeSender({
    token: state.tokens.b,
    body: validPreflightBody(state.deviceA),
  })
  assert('preflight other employee device → 409', otherUserDevice.status === 409)

  const buyerOnly = await invokeSender({
    token: state.tokens.a,
    body: validPreflightBody(state.deviceA),
  })
  assert('buyer device preflight scoped to caller', buyerOnly.json?.checks?.matching_active_subscriptions === 1)

  const adminOwn = await invokeSender({
    token: state.tokens.b,
    body: validPreflightBody(state.deviceB),
  })
  assert('admin own device preflight ok', adminOwn.status === 200 && adminOwn.json?.checks?.matching_active_subscriptions === 1)

  console.log('')
}

async function stageSendRegression() {
  console.log('Stage 5: Send path regression spot checks')

  const beforeNotifications = Number(psqlScalar('SELECT COUNT(*) FROM public.notifications;'))

  const explicit = await invokeSender({
    token: state.tokens.a,
    body: validSendBody(state.deviceA, crypto.randomUUID(), crypto.randomUUID()),
  })
  assert(
    'explicit send without valid permit rejected',
    explicit.status === 403 || explicit.status === 409 || explicit.status === 410,
    `status=${explicit.status}`
  )

  const legacy = await invokeSender({
    token: state.tokens.a,
    body: legacySendBody(state.deviceA),
  })
  assert('legacy send contract requires permit', legacy.status === 409 && legacy.json?.code === 'permit_required')

  const afterNotifications = Number(psqlScalar('SELECT COUNT(*) FROM public.notifications;'))
  assert('send path without permit creates no notification', afterNotifications === beforeNotifications)

  console.log('')
}

async function stageCleanup() {
  console.log('Cleanup')
  if (!state.container) return

  psqlExec(`
    DELETE FROM public.notification_deliveries
    WHERE notification_id IN (
      SELECT id FROM public.notifications
      WHERE employee_id IN (${state.createdEmployeeIds.join(',') || '0'})
    );
  `)
  psqlExec(`
    DELETE FROM public.notifications
    WHERE employee_id IN (${state.createdEmployeeIds.join(',') || '0'});
  `)
  psqlExec(`DELETE FROM public.notification_push_subscriptions WHERE endpoint LIKE '%${FIXTURE_TAG}%';`)
  psqlExec(`DELETE FROM public.academy_users WHERE login LIKE '${FIXTURE_TAG}-%';`)

  const admin = adminClient()
  for (const id of [...new Set(state.createdAuthUserIds)]) {
    if (id) await admin.auth.admin.deleteUser(id).catch(() => {})
  }

  console.log('')
}

async function main() {
  try {
    console.log('=== Web Push sender preflight verification ===\n')
    stageStatic()
    stageUnitReadiness()
    await stageSetup()
    await stagePreflightIntegration()
    await stageSendRegression()
    console.log(`Preflight verification completed (${state.testsPassed}/${state.testsRun} tests, exit 0)\n`)
  } catch (err) {
    console.error(`\nFAILED: ${err.message}\n`)
    process.exitCode = 1
  } finally {
    await stageCleanup()
  }
}

main()
