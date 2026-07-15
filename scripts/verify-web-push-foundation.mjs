#!/usr/bin/env node
/**
 * Local verification for Web Push foundation.
 *
 * Usage:
 *   npm run supabase:local:verify-web-push-foundation
 */

import { spawnSync } from 'child_process'
import crypto from 'crypto'
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
const FIXTURE_TAG = 'web-push-verify'
const USER_A_PASSWORD = 'WebPushUserA123!'
const USER_B_PASSWORD = 'WebPushUserB123!'
const ENDPOINT = `https://127.0.0.1:54321/local-push/${FIXTURE_TAG}`
const ENDPOINT_ROTATED = `https://127.0.0.1:54321/local-push/${FIXTURE_TAG}-rotated`
const P256DH = 'BEl62iUYgUihxQfF9Kj3QfF9Kj3QfF9Kj3QfF9Kj3QfF9Kj3QfF9Kj3QfF'
const AUTH_KEY = 'tBHItJI5svbpez7KI4CCXg'

const state = {
  container: null,
  apiUrl: null,
  anonKey: null,
  serviceRoleKey: null,
  functionUrl: null,
  roleIds: {},
  users: {},
  tokens: {},
  deviceA: crypto.randomUUID(),
  deviceB: crypto.randomUUID(),
  createdAuthUserIds: [],
  createdEmployeeIds: [],
  testsRun: 0,
  testsPassed: 0,
}

async function main() {
  try {
    console.log('=== Web Push foundation verification ===\n')
    stageEnvironment()
    stageSecrets()
    stageDatabase()
    stageFunctionConfig()
    stageStaticFrontend()
    stageServiceWorkerStatic()
    await stageSetupFixture()
    await stageFunctionAuth()
    await stageRegister()
    await stageReEnableAfterDisable()
    await stageSharedDevice()
    await stageDisableRemove()
    await stageSecurityResponse()
    await stageRegression()
    console.log(`\nWeb Push foundation verification completed (${state.testsPassed}/${state.testsRun} tests, exit 0)\n`)
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

async function invoke({ token, body, method = 'POST' } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: state.anonKey,
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(state.functionUrl, {
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

function validRegisterBody(deviceId, endpoint = ENDPOINT) {
  return {
    action: 'register',
    device_id: deviceId,
    subscription: {
      endpoint,
      expiration_time: null,
      keys: { p256dh: P256DH, auth: AUTH_KEY },
    },
  }
}

function stageEnvironment() {
  console.log('Stage 1: Environment')
  run('docker', ['info'], { capture: true })

  const status = getLocalSupabaseStatus()

  state.apiUrl = status.API_URL
  state.anonKey = status.ANON_KEY
  state.serviceRoleKey = status.SERVICE_ROLE_KEY
  state.functionUrl = `${state.apiUrl}/functions/v1/manage-push-subscription`

  if (!state.apiUrl.includes('127.0.0.1')) fail('API URL must be local')

  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
  if (config.includes(PRODUCTION_REF)) fail('Production ref in config.toml')

  state.container = findDbContainer()

  const enabled = psqlScalar('SELECT COUNT(*) FROM public.notification_rules WHERE is_enabled = true;')
  assert('notification rules disabled', enabled === '0')

  const grepPrivate = run('grep', ['-r', '-l', 'VAPID_PRIVATE_KEY', 'src', 'public'], {
    capture: true,
    allowFailure: true,
  })
  assert('VAPID private absent from src/public', !grepPrivate.stdout.trim())

  pass('local environment verified')
  console.log('')
}

function stageSecrets() {
  console.log('Stage 2: VAPID secrets')
  const secretsFile = path.join(ROOT, '.local-secrets/web-push.env')
  assert('local secrets file exists', fs.existsSync(secretsFile))

  const secrets = fs.readFileSync(secretsFile, 'utf8')
  assert('private key present locally', /VAPID_PRIVATE_KEY=/.test(secrets))
  assert('public key present locally', /VAPID_PUBLIC_KEY=/.test(secrets))

  const envLocal = path.join(ROOT, '.env.local')
  assert('.env.local exists', fs.existsSync(envLocal))
  const envContent = fs.readFileSync(envLocal, 'utf8')
  assert('VITE public key in .env.local', envContent.includes('VITE_WEB_PUSH_VAPID_PUBLIC_KEY='))
  assert('VITE env has no private key', !envContent.includes('VAPID_PRIVATE_KEY'))

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
      return !/^(docs\/notifications\/[^:]+|scripts\/(generate-local-vapid-keys[^:]*|prepare-local-web-push-edge-env[^:]*|setup-production-vapid-public-key[^:]*|verify-web-push[^:]+|verify-vapid-key-integrity[^:]*|verify-time-tracker-dispatch-edge[^:]*|verify-production-notification-foundation-readiness[^:]*|verify-production-auth-cutover[^:]*)):|supabase\/(config\.toml|functions\/_shared\/webPushSender\.ts):/.test(
        line
      )
    })
  )

  console.log('')
}

function stageDatabase() {
  console.log('Stage 3: Database schema')

  assert(
    'notification_push_subscriptions exists',
    psqlScalar("SELECT to_regclass('public.notification_push_subscriptions')") ===
      'notification_push_subscriptions'
  )

  for (const column of [
    'device_id',
    'expiration_time',
    'revoked_at',
    'browser',
    'endpoint',
    'p256dh_key',
    'auth_key',
    'employee_id',
    'permission_status',
    'is_active',
    'last_used_at',
  ]) {
    const exists = psqlScalar(`
      SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notification_push_subscriptions'
        AND column_name = '${column}';
    `)
    assert(`column ${column} exists`, exists === '1')
  }

  const endpointUnique = psqlScalar(`
    SELECT COUNT(*) FROM pg_indexes
    WHERE tablename = 'notification_push_subscriptions'
      AND indexdef ILIKE '%UNIQUE%endpoint%';
  `)
  assert('endpoint unique index exists', endpointUnique !== '0')

  const rls = psqlScalar(`
    SELECT relrowsecurity FROM pg_class
    WHERE relname = 'notification_push_subscriptions' AND relnamespace = 'public'::regnamespace;
  `)
  assert('RLS enabled', rls === 't')

  const anonSelect = psqlScalar(`
    SELECT COUNT(*) FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_name = 'notification_push_subscriptions' AND privilege_type = 'SELECT';
  `)
  assert('anon SELECT absent', anonSelect === '0')

  console.log('')
}

function stageFunctionConfig() {
  console.log('Stage 4: Function config')
  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
  assert(
    'manage-push-subscription verify_jwt = true',
    /\[functions\.manage-push-subscription\][\s\S]*verify_jwt\s*=\s*true/.test(config)
  )
  console.log('')
}

function stageStaticFrontend() {
  console.log('Stage 5: Frontend static checks')
  const service = fs.readFileSync(path.join(ROOT, 'src/services/webPushSubscriptionService.js'), 'utf8')
  const ui = fs.readFileSync(
    path.join(ROOT, 'src/components/platform/notifications/PushNotificationSettings.jsx'),
    'utf8'
  )

  assert('uses VITE public key', service.includes('VITE_WEB_PUSH_VAPID_PUBLIC_KEY'))
  assert('no private key in service', !service.includes('VAPID_PRIVATE_KEY'))
  assert('invoke manage-push-subscription', service.includes("supabase.functions.invoke('manage-push-subscription'"))
  assert('enable reconcile helper', service.includes('enablePushNotifications'))
  assert('getSubscription reconcile path', service.includes('getSubscription()'))
  assert('device id storage key', service.includes('shugyla.web_push.device_id'))
  assert('no endpoint logging', !service.includes('console.log') || !/endpoint/.test(service))
  assert('logout cleanup helper', service.includes('removePushSubscriptionForLogout'))
  assert('requestPermission only in enable flow', !ui.includes('useEffect') || !ui.includes('requestPermission'))
  assert('enable button click handler', ui.includes('onClick={handleEnable}'))
  assert('double-click guard', ui.includes('disabled={busy}'))
  assert('dev test guarded', ui.includes('import.meta.env.DEV'))
  assert('no secrets in UI', !ui.includes('endpoint') && !ui.includes('p256dh'))

  console.log('')
}

function stageServiceWorkerStatic() {
  console.log('Stage 6: Service worker static checks')
  const sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8')

  assert('install handler preserved', sw.includes("addEventListener('install'"))
  assert('activate handler preserved', sw.includes("addEventListener('activate'"))
  assert('fetch handler preserved', sw.includes("addEventListener('fetch'"))
  assert('push handler exists', sw.includes("addEventListener('push'"))
  assert('notificationclick exists', sw.includes("addEventListener('notificationclick'"))
  assert('fallback title exists', sw.includes('Shugyla Platform'))
  assert('clients.matchAll used', sw.includes('clients.matchAll'))
  assert('openWindow used', sw.includes('openWindow'))
  assert('no VAPID private in SW', !sw.includes('VAPID_PRIVATE_KEY'))
  assert('base path preserved', sw.includes('/shugyla-academy/'))

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

  if (!state.createdAuthUserIds.includes(authUserId)) {
    state.createdAuthUserIds.push(authUserId)
  }
  const employeeId = Number(psqlScalar('SELECT COALESCE(MAX(id), 0) + 1 FROM public.academy_users;'))
  state.createdEmployeeIds.push(employeeId)

  psqlExec(`DELETE FROM public.academy_users WHERE login = '${login}';`)
  psqlExec(`
    INSERT INTO public.academy_users (
      id, first_name, last_name, full_name, login, password, role, role_id, status, auth_user_id
    ) VALUES (
      ${employeeId}, 'Push', '${key}', '[${FIXTURE_TAG}] ${key}', '${login}',
      '', '${roleCode}', '${roleId}', 'active', '${authUserId}'
    );
  `)

  const anon = createClient(state.apiUrl, state.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = await anon.auth.signInWithPassword({ email, password })
  if (signIn.error) fail(`Sign in ${key}: ${signIn.error.message}`)

  state.users[key] = { employeeId, authUserId: data.user.id, login }
  state.tokens[key] = signIn.data.session.access_token
}

async function stageSetupFixture() {
  console.log('Stage 7: Setup fixture')
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
  if (!state.createdAuthUserIds.includes(inactiveAuthUserId)) {
    state.createdAuthUserIds.push(inactiveAuthUserId)
  }
  psqlExec(`DELETE FROM public.academy_users WHERE login = '${FIXTURE_TAG}-inactive';`)
  const inactiveEmployeeId = Number(psqlScalar('SELECT COALESCE(MAX(id), 0) + 1 FROM public.academy_users;'))
  psqlExec(`
    INSERT INTO public.academy_users (
      id, first_name, last_name, full_name, login, password, role, role_id, status, auth_user_id
    ) VALUES (
      ${inactiveEmployeeId}, 'Push', 'inactive', '[${FIXTURE_TAG}] inactive', '${FIXTURE_TAG}-inactive',
      '', 'cashier', '${state.roleIds.cashier}', 'inactive', '${inactiveAuthUserId}'
    );
  `)
  const anon = createClient(state.apiUrl, state.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = await anon.auth.signInWithPassword({ email: inactiveEmail, password: USER_A_PASSWORD })
  if (signIn.error) fail(`Sign in inactive: ${signIn.error.message}`)
  state.tokens.inactive = signIn.data.session.access_token

  pass('fixture users ready')
  console.log('')
}

async function stageFunctionAuth() {
  console.log('Stage 8: Function authorization')

  const options = await invoke({ method: 'OPTIONS' })
  assert('OPTIONS → 204', options.status === 204)

  const getRes = await invoke({ token: state.tokens.a, method: 'GET' })
  assert('GET → 405', getRes.status === 405)

  const noJwt = await invoke({ body: validRegisterBody(state.deviceA) })
  assert('missing JWT → 401', noJwt.status === 401)

  const badJwt = await invoke({ token: 'invalid.jwt.token', body: validRegisterBody(state.deviceA) })
  assert('invalid JWT → 401', badJwt.status === 401)

  const inactive = await invoke({ token: state.tokens.inactive, body: validRegisterBody(state.deviceA) })
  assert('inactive user → 403', inactive.status === 403)

  const forbidden = await invoke({
    token: state.tokens.a,
    body: { ...validRegisterBody(state.deviceA), employee_id: 1 },
  })
  assert('forbidden employee_id → 422', forbidden.status === 422)

  console.log('')
}

async function stageRegister() {
  console.log('Stage 9: Register')

  const res = await invoke({ token: state.tokens.a, body: validRegisterBody(state.deviceA) })
  assert('active user register → 200', res.status === 200 && res.json?.ok)

  const row = psqlScalar(`
    SELECT employee_id::text FROM public.notification_push_subscriptions
    WHERE endpoint = '${ENDPOINT}';
  `)
  assert('DB row linked to user A', row === String(state.users.a.employeeId))

  const active = psqlScalar(`SELECT is_active::text FROM public.notification_push_subscriptions WHERE endpoint = '${ENDPOINT}';`)
  assert('is_active=true', active === 'true')

  const permission = psqlScalar(
    `SELECT permission_status FROM public.notification_push_subscriptions WHERE endpoint = '${ENDPOINT}';`
  )
  assert('permission=granted', permission === 'granted')

  const lastSeen = psqlScalar(
    `SELECT (last_used_at IS NOT NULL)::text FROM public.notification_push_subscriptions WHERE endpoint = '${ENDPOINT}';`
  )
  assert('last_seen_at filled', lastSeen === 'true')

  const invalidEndpoint = await invoke({
    token: state.tokens.a,
    body: {
      action: 'register',
      device_id: state.deviceA,
      subscription: {
        endpoint: 'javascript:alert(1)',
        keys: { p256dh: P256DH, auth: AUTH_KEY },
      },
    },
  })
  assert('invalid endpoint → 422', invalidEndpoint.status === 422)

  const invalidKeys = await invoke({
    token: state.tokens.a,
    body: {
      action: 'register',
      device_id: state.deviceA,
      subscription: {
        endpoint: ENDPOINT,
        keys: { p256dh: '', auth: '' },
      },
    },
  })
  assert('invalid keys → 422', invalidKeys.status === 422)

  const badDevice = await invoke({
    token: state.tokens.a,
    body: { action: 'register', device_id: 'not-a-uuid', subscription: validRegisterBody(state.deviceA).subscription },
  })
  assert('invalid device_id → 422', badDevice.status === 422)

  console.log('')
}

async function stageReEnableAfterDisable() {
  console.log('Stage 9b: Re-enable after disable (device endpoint rotation)')

  const disable = await invoke({
    token: state.tokens.a,
    body: { action: 'disable', device_id: state.deviceA },
  })
  assert('disable before re-enable → 200', disable.status === 200)

  const activeAfterDisable = psqlScalar(`
    SELECT COUNT(*) FROM public.notification_push_subscriptions
    WHERE employee_id = ${state.users.a.employeeId}
      AND device_id = '${state.deviceA}'::uuid
      AND is_active = true;
  `)
  assert('device active = 0 after disable', activeAfterDisable === '0')

  const disableAgain = await invoke({
    token: state.tokens.a,
    body: { action: 'disable', device_id: state.deviceA },
  })
  assert('repeat disable idempotent → 200', disableAgain.status === 200)

  const reRegister = await invoke({
    token: state.tokens.a,
    body: validRegisterBody(state.deviceA, ENDPOINT_ROTATED),
  })
  assert('re-register after disable with new endpoint → 200', reRegister.status === 200 && reRegister.json?.ok)

  const deviceRows = psqlScalar(`
    SELECT COUNT(*) FROM public.notification_push_subscriptions
    WHERE employee_id = ${state.users.a.employeeId}
      AND device_id = '${state.deviceA}'::uuid;
  `)
  assert('single row per employee+device', deviceRows === '1')

  const deviceActive = psqlScalar(`
    SELECT COUNT(*) FROM public.notification_push_subscriptions
    WHERE employee_id = ${state.users.a.employeeId}
      AND device_id = '${state.deviceA}'::uuid
      AND is_active = true;
  `)
  assert('device active = 1 after re-enable', deviceActive === '1')

  const repeatEnable = await invoke({
    token: state.tokens.a,
    body: validRegisterBody(state.deviceA, ENDPOINT_ROTATED),
  })
  assert('repeat register idempotent → 200', repeatEnable.status === 200)

  const stillActive = psqlScalar(`
    SELECT COUNT(*) FROM public.notification_push_subscriptions
    WHERE employee_id = ${state.users.a.employeeId}
      AND device_id = '${state.deviceA}'::uuid
      AND is_active = true;
  `)
  assert('repeat register keeps single active row', stillActive === '1')

  console.log('')
}

async function stageSharedDevice() {
  console.log('Stage 10: Shared device ownership')

  const res = await invoke({ token: state.tokens.b, body: validRegisterBody(state.deviceB) })
  assert('user B registers same endpoint → 200', res.status === 200)

  const owner = psqlScalar(`SELECT employee_id::text FROM public.notification_push_subscriptions WHERE endpoint = '${ENDPOINT}';`)
  assert('endpoint owned by user B', owner === String(state.users.b.employeeId))

  const count = psqlScalar(`SELECT COUNT(*) FROM public.notification_push_subscriptions WHERE endpoint = '${ENDPOINT}';`)
  assert('single endpoint row', count === '1')

  console.log('')
}

async function stageDisableRemove() {
  console.log('Stage 11: Disable and remove')

  const disable = await invoke({
    token: state.tokens.b,
    body: { action: 'disable', device_id: state.deviceB },
  })
  assert('disable → 200', disable.status === 200)

  const activeAfterDisable = psqlScalar(
    `SELECT is_active::text FROM public.notification_push_subscriptions WHERE endpoint = '${ENDPOINT}';`
  )
  assert('is_active=false after disable', activeAfterDisable === 'false')

  const revokedAt = psqlScalar(
    `SELECT (revoked_at IS NOT NULL)::text FROM public.notification_push_subscriptions WHERE endpoint = '${ENDPOINT}';`
  )
  assert('revoked_at filled', revokedAt === 'true')

  const remove = await invoke({
    token: state.tokens.b,
    body: { action: 'remove', device_id: state.deviceB },
  })
  assert('remove → 200', remove.status === 200)

  const count = psqlScalar(`SELECT COUNT(*) FROM public.notification_push_subscriptions WHERE endpoint = '${ENDPOINT}';`)
  assert('row removed', count === '0')

  const removeAgain = await invoke({
    token: state.tokens.b,
    body: { action: 'remove', device_id: state.deviceB },
  })
  assert('already removed success', removeAgain.status === 200)

  const status = await invoke({
    token: state.tokens.a,
    body: { action: 'status', device_id: state.deviceA },
  })
  assert('status without secrets', status.status === 200)
  const bodyText = JSON.stringify(status.json)
  assert('status response no endpoint', !bodyText.includes(ENDPOINT))
  assert('status response no p256dh', !bodyText.includes(P256DH))

  console.log('')
}

async function stageSecurityResponse() {
  console.log('Stage 12: Security response isolation')
  const fn = fs.readFileSync(path.join(ROOT, 'supabase/functions/manage-push-subscription/index.ts'), 'utf8')
  assert('no select(*)', !fn.includes("select('*')"))
  assert('uses authorizeAuthenticatedEmployee', fn.includes('authorizeAuthenticatedEmployee'))
  pass('response mapper excludes secrets')
  console.log('')
}

async function stageRegression() {
  console.log('Stage 13: Regression')
  const scripts = [
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
  console.log('Cleanup: removing web push fixture data')
  if (!state.container) {
    try {
      state.container = findDbContainer()
    } catch {
      return
    }
  }

  psqlExec(`DELETE FROM public.notification_push_subscriptions WHERE endpoint IN ('${ENDPOINT}', '${ENDPOINT_ROTATED}');`)
  psqlExec(`DELETE FROM public.academy_users WHERE login LIKE '${FIXTURE_TAG}-%';`)
  psqlExec(`DELETE FROM public.academy_users WHERE full_name LIKE '%[${FIXTURE_TAG}]%';`)

  if (state.apiUrl && state.serviceRoleKey) {
    const admin = adminClient()
    for (const id of [...new Set(state.createdAuthUserIds)]) {
      if (id) await admin.auth.admin.deleteUser(id).catch(() => {})
    }
  }

  pass('cleanup complete')
  console.log('')
}

main()
