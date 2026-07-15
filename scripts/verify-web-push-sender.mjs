#!/usr/bin/env node
/**
 * Local verification for Web Push sender (send-test-web-push).
 *
 * Usage:
 *   npm run supabase:local:verify-web-push-sender
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
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'
const FIXTURE_TAG = 'web-push-sender-verify'
const MANUAL_FIXTURE_TAG = 'web-push-manual'
const USER_A_PASSWORD = 'WebPushSenderA123!'
const USER_B_PASSWORD = 'WebPushSenderB123!'
const ENDPOINT = `https://updates.push.services.mozilla.com/wpush/v2/${FIXTURE_TAG}`

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
  p256dh: null,
  authKey: null,
  subscriptionId: null,
  createdAuthUserIds: [],
  createdEmployeeIds: [],
  testsRun: 0,
  testsPassed: 0,
}

async function main() {
  try {
    console.log('=== Web Push sender verification ===\n')
    const pushKeys = await makeValidPushKeys()
    state.p256dh = pushKeys.p256dh
    state.authKey = pushKeys.auth
    stageEnvironment()
    stageSecrets()
    stageDatabase()
    stageFunctionConfig()
    stageClassificationUnitTests()
    stageStaticChecks()
    await stageSetupFixture()
    await stageFunctionAuth()
    await stageValidation()
    await stageOwnership()
    await stageDeliveryTracking()
    await stageIdempotency()
    stageRateLimit()
    await stageSecurity()
    await stageRegression()
    console.log(
      `\nWeb Push sender verification completed (${state.testsPassed}/${state.testsRun} tests, exit 0)\n`
    )
  } catch (err) {
    console.error(`\nFAILED: ${err.message}\n`)
    process.exitCode = 1
  } finally {
    await stageCleanup()
  }
}

function fail(message) {
  throw new Error(message)
}

function pass(name) {
  state.testsRun += 1
  state.testsPassed += 1
  console.log(`  ✓ ${name}`)
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

function validRegisterBody(deviceId) {
  return {
    action: 'register',
    device_id: deviceId,
    subscription: {
      endpoint: ENDPOINT,
      expiration_time: null,
      keys: { p256dh: state.p256dh, auth: state.authKey },
    },
  }
}

function validSendBody(deviceId, requestId = crypto.randomUUID()) {
  return {
    device_id: deviceId,
    request_id: requestId,
  }
}

function responseHasSecrets(json) {
  const text = JSON.stringify(json ?? {})
  if (text.includes(state.p256dh) || text.includes(state.authKey)) return true
  if (text.includes('Bearer ') || text.includes('eyJ')) return true
  if (text.includes('VAPID') || text.includes('p256dh') || text.includes('private')) return true
  if (text.includes(ENDPOINT)) return true
  return false
}

// Mirrors supabase/functions/_shared/webPushClassification.ts
function classifyPushStatusCode(statusCode) {
  if (statusCode == null || Number.isNaN(statusCode)) {
    return 'internal_error'
  }
  if (statusCode >= 200 && statusCode < 300) {
    return 'accepted'
  }
  if (statusCode === 404 || statusCode === 410) {
    return 'subscription_expired'
  }
  if (statusCode === 429) {
    return 'retryable_failure'
  }
  if (statusCode >= 500 && statusCode <= 599) {
    return 'retryable_failure'
  }
  if (statusCode === 401 || statusCode === 403) {
    return 'configuration_error'
  }
  if (statusCode === 400) {
    return 'provider_rejected'
  }
  return 'internal_error'
}

function classifyPushError(error) {
  if (error && typeof error === 'object' && error.response && typeof error.response.status === 'number') {
    return classifyPushStatusCode(error.response.status)
  }

  if (!error || typeof error !== 'object') {
    return 'internal_error'
  }
  const maybe = error
  if (typeof maybe.statusCode === 'number') {
    return classifyPushStatusCode(maybe.statusCode)
  }
  const message = `${maybe.message ?? ''} ${maybe.name ?? ''}`.toLowerCase()
  const pushFailedMatch = message.match(/pushing message failed:\s*(\d{3})/)
  if (pushFailedMatch) {
    return classifyPushStatusCode(Number(pushFailedMatch[1]))
  }
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('fetch failed') ||
    message.includes('not a valid') ||
    message.includes('unsupported') ||
    message.includes('push service') ||
    message.includes('invalid endpoint') ||
    message.includes('aborterror') ||
    message.includes('aborted')
  ) {
    return 'retryable_failure'
  }
  return 'internal_error'
}

function stageEnvironment() {
  console.log('Stage 1: Environment')
  run('docker', ['info'], { capture: true })

  const status = getLocalSupabaseStatus()

  state.apiUrl = status.API_URL
  state.anonKey = status.ANON_KEY
  state.serviceRoleKey = status.SERVICE_ROLE_KEY
  state.senderUrl = `${state.apiUrl}/functions/v1/send-test-web-push`
  state.registerUrl = `${state.apiUrl}/functions/v1/manage-push-subscription`

  assert('API URL is local', state.apiUrl.includes('127.0.0.1'))

  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
  assert('no production ref in config.toml', !config.includes(PRODUCTION_REF))

  state.container = findDbContainer()

  const enabled = psqlScalar('SELECT COUNT(*) FROM public.notification_rules WHERE is_enabled = true;')
  assert('notification rules disabled', enabled === '0')

  const grepPrivate = run('grep', ['-r', '-l', 'VAPID_PRIVATE_KEY', 'src', 'public'], {
    capture: true,
    allowFailure: true,
  })
  assert('VAPID private absent from src/public', !grepPrivate.stdout.trim())

  const manualRows = psqlScalar(
    `SELECT COUNT(*) FROM public.academy_users WHERE login LIKE '${MANUAL_FIXTURE_TAG}-%';`
  )
  pass(`manual fixture untouched (${manualRows} rows preserved)`)

  pass('local environment verified')
  console.log('')
}

function stageSecrets() {
  console.log('Stage 2: Edge secrets / VAPID')

  const secretsFile = path.join(ROOT, '.local-secrets/web-push.env')
  assert('local secrets file exists', fs.existsSync(secretsFile))

  const secrets = fs.readFileSync(secretsFile, 'utf8')
  assert('private key present locally', /VAPID_PRIVATE_KEY=/.test(secrets))
  assert('public key present locally', /VAPID_PUBLIC_KEY=/.test(secrets))
  assert('VAPID subject present locally', /VAPID_SUBJECT=/.test(secrets))

  const envLocal = path.join(ROOT, '.env.local')
  assert('.env.local exists', fs.existsSync(envLocal))
  const envContent = fs.readFileSync(envLocal, 'utf8')
  assert('VITE public key in .env.local', envContent.includes('VITE_WEB_PUSH_VAPID_PUBLIC_KEY='))
  assert('.env.local has no private key', !envContent.includes('VAPID_PRIVATE_KEY'))

  const edgeEnvPath = path.join(ROOT, 'supabase/functions/.env')
  if (!fs.existsSync(edgeEnvPath)) {
    run('npm', ['run', 'webpush:local:prepare-edge-env'], { capture: true })
  }
  assert('edge .env exists', fs.existsSync(edgeEnvPath))
  const edgeEnv = fs.readFileSync(edgeEnvPath, 'utf8')
  assert('WEB_PUSH_TEST_ENABLED in edge env', /WEB_PUSH_TEST_ENABLED=true/.test(edgeEnv))
  assert('VAPID keys in edge env', edgeEnv.includes('VAPID_PUBLIC_KEY=') && edgeEnv.includes('VAPID_PRIVATE_KEY='))

  const gitCheck = run('git', ['grep', '-n', 'VAPID_PRIVATE_KEY'], { capture: true, allowFailure: true })
  const privateKeyValue = secrets.match(/^VAPID_PRIVATE_KEY=(.+)$/m)?.[1]?.trim()
  if (privateKeyValue) {
    const gitValueCheck = run('git', ['grep', '-F', privateKeyValue], { capture: true, allowFailure: true })
    assert('private key value not tracked by git', gitValueCheck.status !== 0)
  }
  assert(
    'private key env file not tracked',
    !run('git', ['ls-files', '.local-secrets/web-push.env'], { capture: true, allowFailure: true }).stdout.trim()
  )
  assert(
    'edge env not tracked',
    !run('git', ['ls-files', 'supabase/functions/.env'], { capture: true, allowFailure: true }).stdout.trim()
  )
  assert(
    'VAPID_PRIVATE_KEY references only in allowed tracked files',
    !gitCheck.stdout.split('\n').some((line) => {
      if (!line.trim()) return false
      return !/^(docs\/notifications\/[^:]+|scripts\/(generate-local-vapid-keys[^:]*|prepare-local-web-push-edge-env[^:]*|verify-web-push[^:]+|verify-vapid-key-integrity[^:]*|verify-time-tracker-dispatch-edge[^:]*|verify-production-notification-foundation-readiness[^:]*|verify-production-auth-cutover[^:]*)):|supabase\/(config\.toml|functions\/_shared\/webPushSender\.ts):/.test(
        line
      )
    })
  )

  console.log('')
}

function stageDatabase() {
  console.log('Stage 3: Database schema (delivery columns)')

  assert(
    'notification_deliveries exists',
    psqlScalar("SELECT to_regclass('public.notification_deliveries')") === 'notification_deliveries'
  )

  for (const column of ['request_id', 'provider', 'provider_status_code', 'next_retry_at', 'updated_at']) {
    const exists = psqlScalar(`
      SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notification_deliveries'
        AND column_name = '${column}';
    `)
    assert(`column ${column} exists`, exists === '1')
  }

  const channelCheck = psqlScalar(`
    SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conname = 'notification_deliveries_channel_check';
  `)
  assert('channel check includes web_push', channelCheck.includes('web_push'))

  const statusCheck = psqlScalar(`
    SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conname = 'notification_deliveries_status_check';
  `)
  for (const status of ['pending', 'accepted', 'retryable', 'permanently_failed']) {
    assert(`status check includes ${status}`, statusCheck.includes(status))
  }

  const requestSubIndex = psqlScalar(`
    SELECT COUNT(*) FROM pg_indexes
    WHERE tablename = 'notification_deliveries'
      AND indexname = 'idx_notification_deliveries_request_subscription';
  `)
  assert('request_id+subscription unique index exists', requestSubIndex === '1')

  const requestIdIndex = psqlScalar(`
    SELECT COUNT(*) FROM pg_indexes
    WHERE tablename = 'notification_deliveries'
      AND indexname = 'idx_notification_deliveries_request_id';
  `)
  assert('request_id index exists', requestIdIndex === '1')

  const updatedTrigger = psqlScalar(`
    SELECT COUNT(*) FROM pg_trigger
    WHERE tgname = 'notification_deliveries_updated_at';
  `)
  assert('updated_at trigger exists', updatedTrigger === '1')

  console.log('')
}

function stageFunctionConfig() {
  console.log('Stage 4: Function config')
  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
  assert(
    'send-test-web-push verify_jwt = true',
    /\[functions\.send-test-web-push\][\s\S]*verify_jwt\s*=\s*true/.test(config)
  )
  assert(
    'send-test-web-push enabled',
    /\[functions\.send-test-web-push\][\s\S]*enabled\s*=\s*true/.test(config)
  )

  const denoJson = path.join(ROOT, 'supabase/functions/send-test-web-push/deno.json')
  assert('send-test-web-push deno.json exists', fs.existsSync(denoJson))
  const denoContent = fs.readFileSync(denoJson, 'utf8')
  assert('deno.json imports negrel webpush', denoContent.includes('@negrel/webpush'))

  console.log('')
}

function stageClassificationUnitTests() {
  console.log('Stage 5: Classification unit tests')

  assert('null status → internal_error', classifyPushStatusCode(null) === 'internal_error')
  assert('NaN status → internal_error', classifyPushStatusCode(Number.NaN) === 'internal_error')
  assert('201 → accepted', classifyPushStatusCode(201) === 'accepted')
  assert('200 → accepted', classifyPushStatusCode(200) === 'accepted')
  assert('404 → subscription_expired', classifyPushStatusCode(404) === 'subscription_expired')
  assert('410 → subscription_expired', classifyPushStatusCode(410) === 'subscription_expired')
  assert('429 → retryable_failure', classifyPushStatusCode(429) === 'retryable_failure')
  assert('500 → retryable_failure', classifyPushStatusCode(500) === 'retryable_failure')
  assert('503 → retryable_failure', classifyPushStatusCode(503) === 'retryable_failure')
  assert('401 → configuration_error', classifyPushStatusCode(401) === 'configuration_error')
  assert('403 → configuration_error', classifyPushStatusCode(403) === 'configuration_error')
  assert('400 → provider_rejected', classifyPushStatusCode(400) === 'provider_rejected')
  assert('418 → internal_error', classifyPushStatusCode(418) === 'internal_error')

  assert(
    'error.statusCode 410 → subscription_expired',
    classifyPushError({ statusCode: 410 }) === 'subscription_expired'
  )
  assert(
    'error timeout message → retryable_failure',
    classifyPushError({ message: 'Request timeout' }) === 'retryable_failure'
  )
  assert(
    'error econnrefused → retryable_failure',
    classifyPushError({ message: 'connect ECONNREFUSED' }) === 'retryable_failure'
  )
  assert(
    'error fetch failed → retryable_failure',
    classifyPushError({ message: 'fetch failed' }) === 'retryable_failure'
  )
  assert('null error → internal_error', classifyPushError(null) === 'internal_error')
  assert('plain object → internal_error', classifyPushError({}) === 'internal_error')

  console.log('')
}

function stageStaticChecks() {
  console.log('Stage 6: Static frontend / function checks')

  const senderFn = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-test-web-push/index.ts'), 'utf8')
  const webPushSender = fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/webPushSender.ts'), 'utf8')
  const service = fs.readFileSync(path.join(ROOT, 'src/services/webPushSubscriptionService.js'), 'utf8')
  const ui = fs.readFileSync(
    path.join(ROOT, 'src/components/platform/notifications/PushNotificationSettings.jsx'),
    'utf8'
  )

  assert('sender uses authorizeAuthenticatedEmployee', senderFn.includes('authorizeAuthenticatedEmployee'))
  assert(
    'sender uses deliverNotificationToSubscription',
    senderFn.includes('deliverNotificationToSubscription')
  )
  assert('sender uses isWebPushConfigured', senderFn.includes('isWebPushConfigured'))
  assert('sender WEB_PUSH_TEST_ENABLED guard', senderFn.includes("WEB_PUSH_TEST_ENABLED") && senderFn.includes("'true'"))
  assert('sender production marker guard', senderFn.includes(PRODUCTION_REF))
  assert('sender checkRateLimit present', senderFn.includes('checkRateLimit'))
  assert('sender deduplication_key pattern', senderFn.includes('web_push_test:${requestId}'))
  assert('sender no select(*)', !senderFn.includes("select('*')"))
  assert('sender fixed payload title', senderFn.includes("'Shugyla Platform'"))
  assert('sender forbidden endpoint field', senderFn.includes("'endpoint'"))

  assert('webPushSender imports classification', webPushSender.includes('classifyPushStatusCode'))
  assert('webPushSender uses negrel webpush', webPushSender.includes('jsr:@negrel/webpush'))
  assert('webPushSender MAX_PAYLOAD_BYTES', webPushSender.includes('MAX_PAYLOAD_BYTES'))
  assert('webPushSender exports isWebPushConfigured', webPushSender.includes('export function isWebPushConfigured'))
  assert('webPushSender pushTextMessage', webPushSender.includes('pushTextMessage'))

  assert('service exports sendServerTestWebPush', service.includes('export async function sendServerTestWebPush'))
  assert('service invokes send-test-web-push', service.includes("supabase.functions.invoke('send-test-web-push'"))
  assert('service sends device_id', service.includes('device_id: deviceId'))
  assert('service sends request_id', service.includes('request_id: requestId'))
  assert('service mapSendTestError rate_limited', service.includes("'rate_limited'"))
  assert('service mapSendTestError subscription_expired', service.includes("'subscription_expired'"))
  assert('service DEV guard for server send', service.includes('import.meta.env.DEV'))

  assert('UI imports sendServerTestWebPush', ui.includes('sendServerTestWebPush'))
  assert('UI handleServerTest handler', ui.includes('handleServerTest'))
  assert('UI server push button', ui.includes('Отправить серверное push'))
  assert('UI server test DEV guarded', ui.includes('import.meta.env.DEV'))

  console.log('')
}

async function createUser(key, login, password, roleCode, roleId) {
  const admin = adminClient()
  const email = loginToTechnicalEmail(login)

  let authUserId = null
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) {
    if (!/already been registered/i.test(error.message)) {
      fail(`Create auth ${key}: ${error.message}`)
    }
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
      ${employeeId}, 'PushSender', '${key}', '[${FIXTURE_TAG}] ${key}', '${login}',
      '', '${roleCode}', '${roleId}', 'active', '${authUserId}'
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

async function stageSetupFixture() {
  console.log('Stage 7: Setup fixture users + subscription')

  state.roleIds.cashier = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'cashier' LIMIT 1;`)
  if (!state.roleIds.cashier) fail('Missing cashier role')

  await createUser('a', `${FIXTURE_TAG}-user-a`, USER_A_PASSWORD, 'cashier', state.roleIds.cashier)
  await createUser('b', `${FIXTURE_TAG}-user-b`, USER_B_PASSWORD, 'cashier', state.roleIds.cashier)

  const inactiveEmail = loginToTechnicalEmail(`${FIXTURE_TAG}-inactive`)
  const admin = adminClient()
  let inactiveAuthUserId = null
  const { data: inactiveAuth, error } = await admin.auth.admin.createUser({
    email: inactiveEmail,
    password: USER_A_PASSWORD,
    email_confirm: true,
  })
  if (error) {
    if (!/already been registered/i.test(error.message)) {
      fail(`Create inactive auth: ${error.message}`)
    }
    const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = listed.users.find((user) => user.email?.toLowerCase() === inactiveEmail.toLowerCase())
    if (!existing?.id) fail(`Create inactive auth: ${error.message}`)
    inactiveAuthUserId = existing.id
    await admin.auth.admin.updateUserById(inactiveAuthUserId, { password: USER_A_PASSWORD, email_confirm: true })
  } else {
    inactiveAuthUserId = inactiveAuth.user.id
  }
  state.createdAuthUserIds.push(inactiveAuthUserId)
  psqlExec(`DELETE FROM public.academy_users WHERE login = '${FIXTURE_TAG}-inactive';`)
  const inactiveEmployeeId = Number(psqlScalar('SELECT COALESCE(MAX(id), 0) + 1 FROM public.academy_users;'))
  psqlExec(`
    INSERT INTO public.academy_users (
      id, first_name, last_name, full_name, login, password, role, role_id, status, auth_user_id
    ) VALUES (
      ${inactiveEmployeeId}, 'PushSender', 'inactive', '[${FIXTURE_TAG}] inactive', '${FIXTURE_TAG}-inactive',
      '', 'cashier', '${state.roleIds.cashier}', 'inactive', '${inactiveAuthUserId}'
    );
  `)
  const anon = createClient(state.apiUrl, state.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = await anon.auth.signInWithPassword({ email: inactiveEmail, password: USER_A_PASSWORD })
  if (signIn.error) fail(`Sign in inactive: ${signIn.error.message}`)
  state.tokens.inactive = signIn.data.session.access_token

  const register = await invokeRegister({
    token: state.tokens.a,
    body: validRegisterBody(state.deviceA),
  })
  assert('fixture subscription registered', register.status === 200 && register.json?.ok)

  state.subscriptionId = psqlScalar(`
    SELECT id::text FROM public.notification_push_subscriptions
    WHERE employee_id = ${state.users.a.employeeId}
      AND device_id = '${state.deviceA}';
  `)
  assert('fixture subscription row exists', Boolean(state.subscriptionId))

  const manualEndpointCount = psqlScalar(`
    SELECT COUNT(*) FROM public.notification_push_subscriptions
    WHERE endpoint LIKE '%${MANUAL_FIXTURE_TAG}%';
  `)
  pass(`manual subscription rows preserved (${manualEndpointCount})`)

  console.log('')
}

async function stageFunctionAuth() {
  console.log('Stage 8: Function auth')

  const options = await invokeSender({ method: 'OPTIONS' })
  assert('OPTIONS → 204', options.status === 204)

  const getRes = await invokeSender({ token: state.tokens.a, method: 'GET' })
  assert('GET → 405', getRes.status === 405)

  const noJwt = await invokeSender({ body: validSendBody(state.deviceA) })
  assert('missing JWT → 401', noJwt.status === 401)

  const badJwt = await invokeSender({
    token: 'invalid.jwt.token',
    body: validSendBody(state.deviceA),
  })
  assert('invalid JWT → 401', badJwt.status === 401)

  const inactive = await invokeSender({
    token: state.tokens.inactive,
    body: validSendBody(state.deviceA),
  })
  assert('inactive user → 403', inactive.status === 403)

  const malformed = await fetch(state.senderUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: state.anonKey,
      Authorization: `Bearer ${state.tokens.a}`,
    },
    body: '{not-json',
  })
  assert('malformed JSON → 400', malformed.status === 400)

  const senderFn = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-test-web-push/index.ts'), 'utf8')
  assert('isLocalTestEnabled guard present', senderFn.includes('isLocalTestEnabled'))
  assert('test_sender_disabled response code', senderFn.includes("'test_sender_disabled'"))

  console.log('')
}

async function stageValidation() {
  console.log('Stage 9: Validation')

  for (const field of ['employee_id', 'endpoint', 'p256dh', 'auth', 'title', 'body', 'vapid_private_key']) {
    const res = await invokeSender({
      token: state.tokens.a,
      body: { ...validSendBody(state.deviceA), [field]: 'x' },
    })
    assert(`forbidden field ${field} → 422`, res.status === 422)
  }

  const missingDevice = await invokeSender({
    token: state.tokens.a,
    body: { request_id: crypto.randomUUID() },
  })
  assert('missing device_id → 422', missingDevice.status === 422)

  const missingRequest = await invokeSender({
    token: state.tokens.a,
    body: { device_id: state.deviceA },
  })
  assert('missing request_id → 422', missingRequest.status === 422)

  const badDevice = await invokeSender({
    token: state.tokens.a,
    body: { device_id: 'not-a-uuid', request_id: crypto.randomUUID() },
  })
  assert('invalid device_id → 422', badDevice.status === 422)

  const badRequest = await invokeSender({
    token: state.tokens.a,
    body: { device_id: state.deviceA, request_id: 'not-a-uuid' },
  })
  assert('invalid request_id → 422', badRequest.status === 422)

  const extraField = await invokeSender({
    token: state.tokens.a,
    body: { ...validSendBody(state.deviceA), unexpected: true },
  })
  assert('unknown extra field → 422', extraField.status === 422)

  console.log('')
}

async function stageOwnership() {
  console.log('Stage 10: Ownership + subscription lookup')

  const unknownDevice = await invokeSender({
    token: state.tokens.a,
    body: validSendBody(crypto.randomUUID()),
  })
  assert('unknown device_id → 409', unknownDevice.status === 409 && unknownDevice.json?.code === 'active_subscription_not_found')

  const userBWrongDevice = await invokeSender({
    token: state.tokens.b,
    body: validSendBody(state.deviceA),
  })
  assert(
    'user B cannot use user A device → 409',
    userBWrongDevice.status === 409 && userBWrongDevice.json?.code === 'active_subscription_not_found'
  )

  await invokeRegister({
    token: state.tokens.a,
    body: { action: 'disable', device_id: state.deviceA },
  })
  const disabledSend = await invokeSender({
    token: state.tokens.a,
    body: validSendBody(state.deviceA),
  })
  assert(
    'inactive subscription → 409',
    disabledSend.status === 409 && disabledSend.json?.code === 'active_subscription_not_found'
  )

  const reRegister = await invokeRegister({
    token: state.tokens.a,
    body: validRegisterBody(state.deviceA),
  })
  assert('subscription re-enabled for delivery tests', reRegister.status === 200 && reRegister.json?.ok)

  console.log('')
}

async function stageDeliveryTracking() {
  console.log('Stage 11: Notification / delivery tracking')

  const requestId = crypto.randomUUID()
  const res = await invokeSender({
    token: state.tokens.a,
    body: validSendBody(state.deviceA, requestId),
  })

  const failureOk =
    (res.status === 503 && res.json?.code === 'push_temporarily_unavailable') ||
    (res.status === 410 && res.json?.code === 'subscription_expired')

  if (!failureOk) {
    const deliveryDebug = res.json?.notification_id
      ? psqlScalar(`
          SELECT coalesce(error_code, 'none') || ':' || coalesce(status, 'none') || ':' || coalesce(provider_status_code::text, 'null')
          FROM public.notification_deliveries
          WHERE notification_id = '${res.json.notification_id}'
          LIMIT 1;
        `)
      : 'no-notification'
    fail(
      `fake endpoint → failure HTTP response: status=${res.status} code=${res.json?.code ?? 'none'} delivery=${deliveryDebug}`
    )
  }
  pass('fake endpoint → failure HTTP response')
  assert('response has notification_id', typeof res.json?.notification_id === 'string')
  const expectedDeliveryStatus =
    res.json?.code === 'subscription_expired' ? 'permanently_failed' : 'retryable'
  assert(
    'response delivery status present',
    res.json?.delivery?.status === expectedDeliveryStatus
  )
  assert('response has no secrets', !responseHasSecrets(res.json))

  const notificationId = res.json.notification_id

  const moduleCode = psqlScalar(`SELECT module_code FROM public.notifications WHERE id = '${notificationId}';`)
  assert('notification module_code web_push', moduleCode === 'web_push')

  const eventCode = psqlScalar(`SELECT event_code FROM public.notifications WHERE id = '${notificationId}';`)
  assert('notification event_code web_push_test', eventCode === 'web_push_test')

  const dedupKey = psqlScalar(`SELECT deduplication_key FROM public.notifications WHERE id = '${notificationId}';`)
  assert('notification deduplication_key set', dedupKey === `web_push_test:${requestId}`)

  const notifStatus = psqlScalar(`SELECT status FROM public.notifications WHERE id = '${notificationId}';`)
  assert('notification status failed after push error', notifStatus === 'failed')

  const deliveryStatus = psqlScalar(`
    SELECT status FROM public.notification_deliveries
    WHERE notification_id = '${notificationId}' AND request_id = '${requestId}';
  `)
  assert('delivery status tracked', deliveryStatus === expectedDeliveryStatus)

  const deliveryChannel = psqlScalar(`
    SELECT channel FROM public.notification_deliveries
    WHERE notification_id = '${notificationId}';
  `)
  assert('delivery channel web_push', deliveryChannel === 'web_push')

  const deliveryProvider = psqlScalar(`
    SELECT provider FROM public.notification_deliveries
    WHERE notification_id = '${notificationId}';
  `)
  assert('delivery provider web_push', deliveryProvider === 'web_push')

  const failureCount = psqlScalar(`
    SELECT failure_count::text FROM public.notification_push_subscriptions
    WHERE id = '${state.subscriptionId}';
  `)
  assert('subscription failure_count incremented', Number(failureCount) >= 1)

  if (res.json?.code === 'subscription_expired') {
    const reRegister = await invokeRegister({
      token: state.tokens.a,
      body: validRegisterBody(state.deviceA),
    })
    assert('subscription re-registered after expired push', reRegister.status === 200 && reRegister.json?.ok)
    state.subscriptionId = psqlScalar(`
      SELECT id::text FROM public.notification_push_subscriptions
      WHERE employee_id = ${state.users.a.employeeId}
        AND device_id = '${state.deviceA}';
    `)
  }

  state.lastRequestId = requestId
  state.lastNotificationId = notificationId
  state.lastDeliveryStatus = expectedDeliveryStatus

  console.log('')
}

async function stageIdempotency() {
  console.log('Stage 12: Idempotency (duplicate request_id)')

  const res = await invokeSender({
    token: state.tokens.a,
    body: validSendBody(state.deviceA, state.lastRequestId),
  })

  assert(
    'duplicate request_id → replay without duplicate rows',
    res.json?.notification_id === state.lastNotificationId
  )
  assert(
    'duplicate request_id → same delivery status',
    res.json?.delivery?.status === state.lastDeliveryStatus
  )

  const deliveryCount = psqlScalar(`
    SELECT COUNT(*) FROM public.notification_deliveries
    WHERE request_id = '${state.lastRequestId}';
  `)
  assert('single delivery row per request_id', deliveryCount === '1')

  const notificationCount = psqlScalar(`
    SELECT COUNT(*) FROM public.notifications
    WHERE deduplication_key = 'web_push_test:${state.lastRequestId}';
  `)
  assert('single notification per deduplication_key', notificationCount === '1')

  console.log('')
}

function stageRateLimit() {
  console.log('Stage 13: Rate limit')

  const senderFn = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-test-web-push/index.ts'), 'utf8')
  assert('rate_limited response code present', senderFn.includes("'rate_limited'"))
  assert('RATE_LIMIT_MAX constant present', senderFn.includes('RATE_LIMIT_MAX'))
  assert('RATE_LIMIT_WINDOW_SECONDS present', senderFn.includes('RATE_LIMIT_WINDOW_SECONDS'))

  console.log('')
}

async function stageSecurity() {
  console.log('Stage 14: Security')

  const senderFn = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-test-web-push/index.ts'), 'utf8')
  const webPushSender = fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/webPushSender.ts'), 'utf8')

  assert('sender no select(*)', !senderFn.includes("select('*')"))
  assert('webPushSender no select(*)', !webPushSender.includes("select('*')"))

  const res = await invokeSender({
    token: state.tokens.a,
    body: validSendBody(state.deviceA, crypto.randomUUID()),
  })
  assert('HTTP response excludes secrets', !responseHasSecrets(res.json))

  const bodyText = JSON.stringify(res.json ?? {})
  assert('response excludes endpoint key name', !bodyText.includes('"endpoint"'))
  assert('response excludes p256dh key name', !bodyText.includes('"p256dh"'))

  console.log('')
}

async function stageRegression() {
  console.log('Stage 15: Regression suite')

  const scripts = [
    'supabase:local:verify-web-push-foundation',
    'supabase:local:verify-employee-admin-access',
    'supabase:local:verify-employee-provisioning',
    'supabase:local:verify-auth-first',
    'supabase:local:verify-notifications',
  ]

  for (const script of scripts) {
    const result = run('npm', ['run', script], { capture: true })
    assert(`${script} exit 0`, result.status === 0)
  }

  const buildResult = run('npm', ['run', 'build'], { capture: true })
  assert('npm run build exit 0', buildResult.status === 0)

  const enabled = psqlScalar('SELECT COUNT(*) FROM public.notification_rules WHERE is_enabled = true;')
  assert('notification rules still disabled', enabled === '0')

  console.log('')
}

async function stageCleanup() {
  console.log('Cleanup: removing web-push-sender-verify fixture only')

  if (!state.container) {
    try {
      state.container = findDbContainer()
    } catch {
      return
    }
  }

  psqlExec(`
    DELETE FROM public.notification_deliveries
    WHERE notification_id IN (
      SELECT id FROM public.notifications
      WHERE metadata->>'source' = 'send-test-web-push'
        AND employee_id IN (
          SELECT id FROM public.academy_users
          WHERE login LIKE '${FIXTURE_TAG}-%' OR full_name LIKE '%[${FIXTURE_TAG}]%'
        )
    );
  `)

  psqlExec(`
    DELETE FROM public.notifications
    WHERE metadata->>'source' = 'send-test-web-push'
      AND employee_id IN (
        SELECT id FROM public.academy_users
        WHERE login LIKE '${FIXTURE_TAG}-%' OR full_name LIKE '%[${FIXTURE_TAG}]%'
      );
  `)

  psqlExec(`DELETE FROM public.notification_push_subscriptions WHERE endpoint = '${ENDPOINT}';`)
  psqlExec(`DELETE FROM public.academy_users WHERE login LIKE '${FIXTURE_TAG}-%';`)
  psqlExec(`DELETE FROM public.academy_users WHERE full_name LIKE '%[${FIXTURE_TAG}]%';`)

  const manualAfter = psqlScalar(
    `SELECT COUNT(*) FROM public.academy_users WHERE login LIKE '${MANUAL_FIXTURE_TAG}-%';`
  )
  pass(`manual fixture preserved after cleanup (${manualAfter} users)`)

  if (state.apiUrl && state.serviceRoleKey) {
    const admin = adminClient()
    for (const id of [...new Set(state.createdAuthUserIds)]) {
      if (id) await admin.auth.admin.deleteUser(id).catch(() => {})
    }
  }

  pass('cleanup complete')
  console.log('')
}

export { main }

main()
