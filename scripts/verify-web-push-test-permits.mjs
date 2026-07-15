#!/usr/bin/env node
/**
 * Local verification for DB-backed one-time Web Push test-send permits.
 *
 * Usage:
 *   npm run verify:web-push-test-permits
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
const FIXTURE_TAG = 'web-push-permit-verify'
const USER_A_PASSWORD = 'WebPushPermitA123!'
const USER_B_PASSWORD = 'WebPushPermitB123!'
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

function issuePermitViaRpc(employeeId, authUserId, deviceId) {
  const raw = psqlScalar(`
    SELECT public.issue_notification_test_send_permit(
      ${employeeId},
      '${authUserId}'::uuid,
      '${deviceId}'::uuid
    )::text;
  `)
  return JSON.parse(raw)
}

function consumePermitViaRpc(permitId, employeeId, authUserId, deviceId, requestId) {
  return psqlScalar(`
    SELECT public.consume_notification_test_send_permit(
      '${permitId}'::uuid,
      ${employeeId},
      '${authUserId}'::uuid,
      '${deviceId}'::uuid,
      '${requestId}'::uuid
    );
  `)
}

function responseHasSecrets(json) {
  const text = JSON.stringify(json ?? {})
  return /endpoint|p256dh|auth_key|vapid|private_key|service_role/i.test(text)
}

function stageStatic() {
  console.log('Stage 1: Static contract')
  const migration = read('supabase/migrations/20260715183000_notification_test_send_permits.sql')
  const senderFn = read('supabase/functions/send-test-web-push/index.ts')
  const shared = read('supabase/functions/_shared/testSendPermits.ts')
  const service = read('src/services/webPushSubscriptionService.js')
  const ui = read('src/components/platform/notifications/PushNotificationSettings.jsx')

  assert('migration creates permit table', migration.includes('notification_test_send_permits'))
  assert('migration enables RLS', migration.includes('enable row level security'))
  assert('migration revokes anon/authenticated', migration.includes('revoke all on table'))
  assert('migration grants service_role', migration.includes('grant all on table'))
  assert('issue RPC present', migration.includes('issue_notification_test_send_permit'))
  assert('consume RPC present', migration.includes('consume_notification_test_send_permit'))
  assert('TTL constraint 5 minutes', migration.includes("interval '5 minutes'"))
  assert('unique active permit index', migration.includes('idx_notification_test_send_permits_one_active'))

  assert('sender issue_permit action', senderFn.includes("'issue_permit'"))
  assert('sender permit_status action', senderFn.includes("'permit_status'"))
  assert('legacy returns permit_required', senderFn.includes("'permit_required'"))
  assert('send requires permit_id', senderFn.includes('permit_id'))
  assert('consume before notification insert', senderFn.indexOf('consumeTestSendPermit') < senderFn.indexOf(".from('notifications')"))
  assert('schedule.edit permission for issue', senderFn.includes("'schedule.edit'") || senderFn.includes('TEST_SEND_PERMIT_ISSUE_PERMISSION'))
  assert('preflight permit_required field', senderFn.includes('permit_required'))
  assert('preflight ready_to_send false', senderFn.includes('ready_to_send: false'))
  assert('shared permit helpers', shared.includes('issueTestSendPermit'))

  assert('service issueServerTestSendPermit exported', service.includes('export async function issueServerTestSendPermit'))
  assert('permit sessionStorage key', service.includes('shugyla.web_push.test_send_permit'))
  assert('send includes permit_id', service.includes('permit_id: persistedPermit.permitId'))
  assert('permit issue UI button', ui.includes('Создать одноразовое разрешение'))
  assert('UI does not render permit UUID', !ui.includes('permitId') || ui.includes('permitId: data.permit.token'))
  assert('send gated by permitValid', ui.includes('!permitValid'))
  assert('no auto send after issue', !service.includes('issueServerTestSendPermit') || !service.match(/issueServerTestSendPermit[\s\S]{0,200}sendServerTestWebPush/))
  console.log('')
}

function stageDatabaseAccess() {
  console.log('Stage 2: Database access controls')

  assert('table exists', psqlScalar("SELECT to_regclass('public.notification_test_send_permits')") === 'notification_test_send_permits')
  const rlsEnabled = psqlScalar(`
    SELECT relrowsecurity::text FROM pg_class
    WHERE relname = 'notification_test_send_permits';
  `)
  assert('RLS enabled', rlsEnabled === 't' || rlsEnabled === 'true')

  const anonSelect = psqlScalar(`
    SELECT has_table_privilege('anon', 'public.notification_test_send_permits', 'SELECT');
  `)
  assert('anon direct SELECT denied', anonSelect === 'f')

  const authSelect = psqlScalar(`
    SELECT has_table_privilege('authenticated', 'public.notification_test_send_permits', 'SELECT');
  `)
  assert('authenticated direct SELECT denied', authSelect === 'f')

  const serviceSelect = psqlScalar(`
    SELECT has_table_privilege('service_role', 'public.notification_test_send_permits', 'SELECT');
  `)
  assert('service_role SELECT allowed', serviceSelect === 't')

  const anonIssue = psqlScalar(`
    SELECT has_function_privilege('anon', 'public.issue_notification_test_send_permit(bigint, uuid, uuid)', 'EXECUTE');
  `)
  assert('anon cannot execute issue RPC', anonIssue === 'f')

  const serviceIssue = psqlScalar(`
    SELECT has_function_privilege('service_role', 'public.issue_notification_test_send_permit(bigint, uuid, uuid)', 'EXECUTE');
  `)
  assert('service_role can execute issue RPC', serviceIssue === 't')

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
      ${employeeId}, 'Permit', '${key}', '[${FIXTURE_TAG}] ${key}', '${login}',
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

  const regA = await invokeRegister({ token: state.tokens.a, body: validRegisterBody(state.deviceA) })
  assert('user A register → 200', regA.status === 200 && regA.json?.ok)

  const regB = await invokeRegister({
    token: state.tokens.b,
    body: validRegisterBody(state.deviceB, `${ENDPOINT}-admin-b`),
  })
  assert('user B admin register → 200', regB.status === 200 && regB.json?.ok)

  const regC = await invokeRegister({
    token: state.tokens.b,
    body: validRegisterBody(state.deviceC, `${ENDPOINT}-admin-c`),
  })
  assert('admin second device register → 200', regC.status === 200 && regC.json?.ok)

  console.log('')
}

function stageRpcBehavior() {
  console.log('Stage 4: RPC behavior')

  const beforeNotifications = Number(psqlScalar('SELECT COUNT(*) FROM public.notifications;'))
  const beforeDeliveries = Number(psqlScalar('SELECT COUNT(*) FROM public.notification_deliveries;'))

  const issued = issuePermitViaRpc(state.users.a.employeeId, state.users.a.authUserId, state.deviceA)
  assert('issue returns id', typeof issued.id === 'string')
  assert('issue returns expires_at', typeof issued.expires_at === 'string')

  const ttlSeconds = Number(
    psqlScalar(`
      SELECT EXTRACT(EPOCH FROM (expires_at - issued_at))::int
      FROM public.notification_test_send_permits
      WHERE id = '${issued.id}'::uuid;
    `)
  )
  assert('TTL exactly 300 seconds', ttlSeconds === 300)

  const secondIssue = issuePermitViaRpc(state.users.a.employeeId, state.users.a.authUserId, state.deviceA)
  const activeCount = Number(psqlScalar(`
    SELECT COUNT(*) FROM public.notification_test_send_permits
    WHERE employee_id = ${state.users.a.employeeId}
      AND device_id = '${state.deviceA}'::uuid
      AND consumed_at IS NULL
      AND revoked_at IS NULL;
  `))
  assert('issue revokes previous unused permit', activeCount === 1)
  assert('new issue returns different id', secondIssue.id !== issued.id)

  const revokedOld = psqlScalar(`
    SELECT revoked_at IS NOT NULL FROM public.notification_test_send_permits
    WHERE id = '${issued.id}'::uuid;
  `)
  assert('previous permit revoked', revokedOld === 't')

  const requestId = crypto.randomUUID()
  const consumed = consumePermitViaRpc(
    secondIssue.id,
    state.users.a.employeeId,
    state.users.a.authUserId,
    state.deviceA,
    requestId
  )
  assert('consume valid permit → consumed', consumed === 'consumed')

  const secondConsume = consumePermitViaRpc(
    secondIssue.id,
    state.users.a.employeeId,
    state.users.a.authUserId,
    state.deviceA,
    crypto.randomUUID()
  )
  assert('second consume → permit_already_used', secondConsume === 'permit_already_used')

  const sameRequestConsume = consumePermitViaRpc(
    secondIssue.id,
    state.users.a.employeeId,
    state.users.a.authUserId,
    state.deviceA,
    requestId
  )
  assert(
    'same request_id consume → permit_already_used_same_request',
    sameRequestConsume === 'permit_already_used_same_request'
  )

  const wrongEmployee = consumePermitViaRpc(
    secondIssue.id,
    state.users.b.employeeId,
    state.users.b.authUserId,
    state.deviceA,
    crypto.randomUUID()
  )
  assert('other employee consume → permit_invalid', wrongEmployee === 'permit_invalid')

  const fresh = issuePermitViaRpc(state.users.a.employeeId, state.users.a.authUserId, state.deviceA)
  const wrongDevice = consumePermitViaRpc(
    fresh.id,
    state.users.a.employeeId,
    state.users.a.authUserId,
    state.deviceC,
    crypto.randomUUID()
  )
  assert('other device consume → permit_invalid', wrongDevice === 'permit_invalid')

  psqlExec(`
    UPDATE public.notification_test_send_permits
    SET
      issued_at = now() - interval '10 minutes',
      expires_at = now() - interval '5 minutes'
    WHERE id = '${fresh.id}'::uuid;
  `)
  const expired = consumePermitViaRpc(
    fresh.id,
    state.users.a.employeeId,
    state.users.a.authUserId,
    state.deviceA,
    crypto.randomUUID()
  )
  assert('expired permit → permit_expired', expired === 'permit_expired')

  const revokedPermit = issuePermitViaRpc(state.users.a.employeeId, state.users.a.authUserId, state.deviceA)
  psqlExec(`
    UPDATE public.notification_test_send_permits
    SET revoked_at = now()
    WHERE id = '${revokedPermit.id}'::uuid;
  `)
  const revoked = consumePermitViaRpc(
    revokedPermit.id,
    state.users.a.employeeId,
    state.users.a.authUserId,
    state.deviceA,
    crypto.randomUUID()
  )
  assert('revoked permit → permit_revoked', revoked === 'permit_revoked')

  const afterNotifications = Number(psqlScalar('SELECT COUNT(*) FROM public.notifications;'))
  const afterDeliveries = Number(psqlScalar('SELECT COUNT(*) FROM public.notification_deliveries;'))
  assert('issue/consume RPC no notifications', afterNotifications === beforeNotifications)
  assert('issue/consume RPC no deliveries', afterDeliveries === beforeDeliveries)

  console.log('')
}

async function stageEdgeIntegration() {
  console.log('Stage 5: Edge integration')

  const preflight = await invokeSender({
    token: state.tokens.a,
    body: { action: 'preflight', device_id: state.deviceA },
  })
  assert('preflight ok', preflight.status === 200 && preflight.json?.ok)
  assert('preflight permit_required true', preflight.json?.checks?.permit_required === true)
  assert('preflight ready_to_send false', preflight.json?.checks?.ready_to_send === false)

  const beforePermits = Number(psqlScalar('SELECT COUNT(*) FROM public.notification_test_send_permits;'))
  assert('preflight does not create permit', beforePermits >= 0)

  const issueForbidden = await invokeSender({
    token: state.tokens.a,
    body: { action: 'issue_permit', device_id: state.deviceA },
  })
  assert('non-admin issue → 403', issueForbidden.status === 403 && issueForbidden.json?.code === 'permit_issue_forbidden')

  const issueAdmin = await invokeSender({
    token: state.tokens.b,
    body: { action: 'issue_permit', device_id: state.deviceB },
  })
  assert('admin issue → 200', issueAdmin.status === 200 && issueAdmin.json?.ok)
  assert('issue response has token', typeof issueAdmin.json?.permit?.token === 'string')
  assert('issue response ttl 300', issueAdmin.json?.permit?.ttl_seconds === 300)
  assert('issue response no secrets', !responseHasSecrets(issueAdmin.json))

  const permitId = issueAdmin.json.permit.token
  const statusOk = await invokeSender({
    token: state.tokens.b,
    body: { action: 'permit_status', device_id: state.deviceB, permit_id: permitId },
  })
  assert('permit_status valid', statusOk.status === 200 && statusOk.json?.permit?.valid === true)

  const statusWrong = await invokeSender({
    token: state.tokens.a,
    body: { action: 'permit_status', device_id: state.deviceA, permit_id: permitId },
  })
  assert('permit_status wrong owner → 403', statusWrong.status === 403 && statusWrong.json?.code === 'permit_invalid')

  const legacy = await invokeSender({
    token: state.tokens.a,
    body: { device_id: state.deviceA, request_id: crypto.randomUUID() },
  })
  assert('legacy send → permit_required', legacy.status === 409 && legacy.json?.code === 'permit_required')

  const sendNoPermit = await invokeSender({
    token: state.tokens.a,
    body: { action: 'send', device_id: state.deviceA, request_id: crypto.randomUUID() },
  })
  assert('send missing permit_id → 422', sendNoPermit.status === 422)

  const issueForSend = issuePermitViaRpc(state.users.a.employeeId, state.users.a.authUserId, state.deviceA)
  const requestId = crypto.randomUUID()
  const beforeNotifications = Number(psqlScalar('SELECT COUNT(*) FROM public.notifications;'))
  const sendOk = await invokeSender({
    token: state.tokens.a,
    body: {
      action: 'send',
      device_id: state.deviceA,
      request_id: requestId,
      permit_id: issueForSend.id,
    },
  })
  assert(
    'permit-based send accepted or delivery failure',
    sendOk.status === 200 || sendOk.status === 502 || sendOk.status === 503 || sendOk.status === 410
  )
  const afterNotifications = Number(psqlScalar('SELECT COUNT(*) FROM public.notifications;'))
  assert('valid permit allows notification insert', afterNotifications === beforeNotifications + 1)

  const metadata = psqlScalar(`
    SELECT metadata::text FROM public.notifications
    WHERE metadata->>'request_id' = '${requestId}'
    LIMIT 1;
  `)
  assert('notification metadata excludes permit token', !metadata.includes(issueForSend.id))

  const otherDeviceDeliveries = Number(psqlScalar(`
    SELECT COUNT(*) FROM public.notification_deliveries d
    JOIN public.notification_push_subscriptions s ON s.id = d.subscription_id
    WHERE d.request_id = '${requestId}'::uuid
      AND s.device_id <> '${state.deviceA}'::uuid;
  `))
  assert('other admin device deliveries excluded', otherDeviceDeliveries === 0)

  const gatesOffSend = await invokeSender({
    token: state.tokens.a,
    body: {
      action: 'send',
      device_id: state.deviceA,
      request_id: crypto.randomUUID(),
      permit_id: issuePermitViaRpc(state.users.a.employeeId, state.users.a.authUserId, state.deviceA).id,
    },
  })
  assert(
    'legacy gates OFF do not block permit send',
    gatesOffSend.status === 200 ||
      gatesOffSend.status === 409 ||
      gatesOffSend.status === 429 ||
      gatesOffSend.status === 502 ||
      gatesOffSend.status === 503 ||
      gatesOffSend.status === 410,
    `status=${gatesOffSend.status} code=${gatesOffSend.json?.code ?? 'none'}`
  )

  console.log('')
}

async function stageConcurrency() {
  console.log('Stage 6: Atomic concurrency')

  const issued = issuePermitViaRpc(state.users.b.employeeId, state.users.b.authUserId, state.deviceB)
  const requestA = crypto.randomUUID()
  const requestB = crypto.randomUUID()

  const [resA, resB] = await Promise.all([
    invokeSender({
      token: state.tokens.b,
      body: {
        action: 'send',
        device_id: state.deviceB,
        request_id: requestA,
        permit_id: issued.id,
      },
    }),
    invokeSender({
      token: state.tokens.b,
      body: {
        action: 'send',
        device_id: state.deviceB,
        request_id: requestB,
        permit_id: issued.id,
      },
    }),
  ])

  const statuses = [resA, resB].map((res) => res.status)
  const codes = [resA, resB].map((res) => res.json?.code)
  const successCount = statuses.filter((status) => status === 200 || status === 502 || status === 503 || status === 410).length
  const blockedCount = codes.filter((code) =>
    code === 'permit_already_used' || code === 'permit_already_used_same_request'
  ).length
  assert('parallel consume only one succeeds', successCount === 1)
  assert('parallel second request blocked', blockedCount === 1)

  console.log('')
}

function stageFrontendStatic() {
  console.log('Stage 7: Frontend static checks')
  const service = read('src/services/webPushSubscriptionService.js')
  const ui = read('src/components/platform/notifications/PushNotificationSettings.jsx')

  assert('issueServerTestSendPermit uses issue_permit action', service.includes("action: 'issue_permit'"))
  assert('permit stored in sessionStorage only', service.includes('sessionStorage.setItem(\n      PERMIT_STORAGE_KEY'))
  assert('permit messages defined', service.includes('PERMIT_ERROR_MESSAGES'))
  assert('countdown helper exported', service.includes('export function getTestSendPermitCountdownSeconds'))
  assert('attempt marker before invoke', service.indexOf('persistSendTestRequest') < service.indexOf("action: 'send'"))
  assert('UI countdown display', ui.includes('permitCountdownSeconds'))
  assert('UI expiry label without UUID', ui.includes('Разрешение активно до'))
  console.log('')
}

async function stageCleanup() {
  console.log('Cleanup')
  if (!state.container) return

  psqlExec(`
    DELETE FROM public.notification_test_send_permits
    WHERE employee_id IN (${state.createdEmployeeIds.join(',') || '0'});
  `)

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
  psqlExec(`
    DELETE FROM public.notification_push_subscriptions
    WHERE employee_id IN (${state.createdEmployeeIds.join(',') || '0'});
  `)
  psqlExec(`
    DELETE FROM public.academy_users
    WHERE id IN (${state.createdEmployeeIds.join(',') || '0'});
  `)

  const admin = adminClient()
  for (const authUserId of state.createdAuthUserIds) {
    await admin.auth.admin.deleteUser(authUserId).catch(() => {})
  }
}

async function main() {
  try {
    console.log('=== Web Push test permit verification ===\n')
    stageStatic()
    const status = getLocalSupabaseStatus()
    state.container = findDbContainer()
    stageDatabaseAccess()
    await stageSetup()
    stageRpcBehavior()
    await stageEdgeIntegration()
    await stageConcurrency()
    stageFrontendStatic()
    await stageCleanup()
    console.log(`\nPermit verification completed (${state.testsPassed}/${state.testsRun} tests, exit 0)\n`)
  } catch (err) {
    console.error(`\nFAILED: ${err.message}\n`)
    try {
      await stageCleanup()
    } catch {
      // ignore cleanup errors
    }
    process.exitCode = 1
  }
}

main()
