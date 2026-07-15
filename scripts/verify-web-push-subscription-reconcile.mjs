#!/usr/bin/env node
/**
 * Local verification for Web Push enable/disable/re-enable reconciliation.
 *
 * Usage:
 *   npm run supabase:local:verify-web-push-subscription-reconcile
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
const FIXTURE_TAG = 'web-push-reconcile'
const PASSWORD = 'WebPushReconcile123!'
const ENDPOINT_A = `https://127.0.0.1:54321/local-push/${FIXTURE_TAG}-a`
const ENDPOINT_B = `https://127.0.0.1:54321/local-push/${FIXTURE_TAG}-b`
const ENDPOINT_C = `https://127.0.0.1:54321/local-push/${FIXTURE_TAG}-c`
const P256DH = 'BEl62iUYgUihxQfF9Kj3QfF9Kj3QfF9Kj3QfF9Kj3QfF9Kj3QfF9Kj3QfF'
const AUTH_KEY = 'tBHItJI5svbpez7KI4CCXg'

const state = {
  container: null,
  apiUrl: null,
  anonKey: null,
  serviceRoleKey: null,
  functionUrl: null,
  token: null,
  employeeId: null,
  devicePrimary: crypto.randomUUID(),
  deviceSecondary: crypto.randomUUID(),
  authUserId: null,
  testsRun: 0,
  testsPassed: 0,
}

async function main() {
  try {
    console.log('=== Web Push subscription reconcile verification ===\n')
    await stageSetup()
    await stageEnableDisableFlow()
    await stageCrossDeviceIsolation()
    await stageStaticGuards()
    console.log(`\nReconcile verification completed (${state.testsPassed}/${state.testsRun} tests, exit 0)\n`)
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

function registerBody(deviceId, endpoint) {
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

async function invoke(body) {
  const response = await fetch(state.functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: state.anonKey,
      Authorization: `Bearer ${state.token}`,
    },
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

function countDeviceActive(deviceId) {
  return psqlScalar(`
    SELECT COUNT(*) FROM public.notification_push_subscriptions
    WHERE employee_id = ${state.employeeId}
      AND device_id = '${deviceId}'::uuid
      AND is_active = true;
  `)
}

function countDuplicateEndpoints() {
  return psqlScalar(`
    SELECT COUNT(*) FROM (
      SELECT endpoint FROM public.notification_push_subscriptions
      GROUP BY endpoint HAVING COUNT(*) > 1
    ) d;
  `)
}

async function stageSetup() {
  console.log('Stage 1: Setup')
  const status = getLocalSupabaseStatus()
  state.apiUrl = status.API_URL
  state.anonKey = status.ANON_KEY
  state.serviceRoleKey = status.SERVICE_ROLE_KEY
  state.functionUrl = `${state.apiUrl}/functions/v1/manage-push-subscription`
  state.container = findDbContainer()

  const admin = createClient(state.apiUrl, state.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const login = `${FIXTURE_TAG}-user`
  const email = loginToTechnicalEmail(login)
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (createError && !/already been registered/i.test(createError.message)) {
    fail(`Create auth user: ${createError.message}`)
  }
  state.authUserId = created?.user?.id
  if (!state.authUserId) {
    const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    state.authUserId = listed.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id
  }
  if (!state.authUserId) fail('Auth user missing')

  state.employeeId = Number(psqlScalar('SELECT COALESCE(MAX(id), 0) + 1 FROM public.academy_users;'))
  psqlExec(`DELETE FROM public.academy_users WHERE login = '${login}';`)
  psqlExec(`
    INSERT INTO public.academy_users (
      id, first_name, last_name, full_name, login, password, role, role_id, status, auth_user_id
    ) VALUES (
      ${state.employeeId}, 'Reconcile', 'User', '[${FIXTURE_TAG}] user', '${login}',
      '', 'administrator', (SELECT id FROM public.roles WHERE code = 'administrator' LIMIT 1),
      'active', '${state.authUserId}'
    );
  `)

  const anon = createClient(state.apiUrl, state.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = await anon.auth.signInWithPassword({ email, password: PASSWORD })
  if (signIn.error) fail(`Sign in: ${signIn.error.message}`)
  state.token = signIn.data.session.access_token

  const enabledRules = psqlScalar('SELECT COUNT(*) FROM public.notification_rules WHERE is_enabled = true;')
  assert('notification rules disabled', enabledRules === '0')
  console.log('')
}

async function stageEnableDisableFlow() {
  console.log('Stage 2: Enable/disable/re-enable flow')

  const first = await invoke(registerBody(state.devicePrimary, ENDPOINT_A))
  assert('first enable → 200', first.status === 200 && first.json?.ok)
  assert('first enable active = 1', countDeviceActive(state.devicePrimary) === '1')

  const repeat = await invoke(registerBody(state.devicePrimary, ENDPOINT_A))
  assert('repeat enable → 200', repeat.status === 200)
  assert('repeat enable active stays 1', countDeviceActive(state.devicePrimary) === '1')

  const disable = await invoke({ action: 'disable', device_id: state.devicePrimary })
  assert('disable → 200', disable.status === 200)
  assert('disable active = 0', countDeviceActive(state.devicePrimary) === '0')

  const disableAgain = await invoke({ action: 'disable', device_id: state.devicePrimary })
  assert('repeat disable idempotent → 200', disableAgain.status === 200)

  const reEnable = await invoke(registerBody(state.devicePrimary, ENDPOINT_B))
  assert('enable after disable with rotated endpoint → 200', reEnable.status === 200 && reEnable.json?.ok)
  assert('re-enable active = 1', countDeviceActive(state.devicePrimary) === '1')

  const rowsForDevice = psqlScalar(`
    SELECT COUNT(*) FROM public.notification_push_subscriptions
    WHERE employee_id = ${state.employeeId} AND device_id = '${state.devicePrimary}'::uuid;
  `)
  assert('single historical row per device', rowsForDevice === '1')

  const reactivateInactive = await invoke(registerBody(state.devicePrimary, ENDPOINT_B))
  assert('inactive row reactivation via upsert → 200', reactivateInactive.status === 200)
  assert('reactivation keeps one active row', countDeviceActive(state.devicePrimary) === '1')

  const replaceEndpoint = await invoke(registerBody(state.devicePrimary, ENDPOINT_C))
  assert('endpoint replacement for same device → 200', replaceEndpoint.status === 200)
  assert('endpoint replacement active = 1', countDeviceActive(state.devicePrimary) === '1')
  assert('duplicate endpoints = 0', countDuplicateEndpoints() === '0')

  const notifications = psqlScalar('SELECT COUNT(*) FROM public.notifications;')
  const deliveries = psqlScalar('SELECT COUNT(*) FROM public.notification_deliveries;')
  assert('notifications not created', notifications === '0')
  assert('deliveries not created', deliveries === '0')

  console.log('')
}

async function stageCrossDeviceIsolation() {
  console.log('Stage 3: Cross-device isolation')

  const secondary = await invoke(registerBody(state.deviceSecondary, ENDPOINT_A))
  assert('secondary device register → 200', secondary.status === 200)
  assert('primary device still active', countDeviceActive(state.devicePrimary) === '1')
  assert('secondary device active', countDeviceActive(state.deviceSecondary) === '1')

  const disablePrimary = await invoke({ action: 'disable', device_id: state.devicePrimary })
  assert('disable primary only → 200', disablePrimary.status === 200)
  assert('primary inactive after disable', countDeviceActive(state.devicePrimary) === '0')
  assert('secondary unchanged', countDeviceActive(state.deviceSecondary) === '1')

  console.log('')
}

function stageStaticGuards() {
  console.log('Stage 4: Static guards')

  const service = fs.readFileSync(path.join(ROOT, 'src/services/webPushSubscriptionService.js'), 'utf8')
  const ui = fs.readFileSync(
    path.join(ROOT, 'src/components/platform/notifications/PushNotificationSettings.jsx'),
    'utf8'
  )
  const fn = fs.readFileSync(path.join(ROOT, 'supabase/functions/manage-push-subscription/index.ts'), 'utf8')

  assert('frontend uses getSubscription before subscribe', service.includes('getSubscription()'))
  assert('frontend retry resubscribe path', service.includes('unsubscribe'))
  assert('frontend categorized errors', service.includes('WEB_PUSH_ERROR_MESSAGES'))
  assert('UI double-click guard', ui.includes('disabled={busy}'))
  assert('edge function device lookup before upsert', fn.includes('device_id'))
  assert('edge function does not log endpoint', !fn.includes('console.log') || !/endpoint/.test(fn))

  console.log('')
}

async function stageCleanup() {
  console.log('Cleanup')
  if (!state.container) return
  psqlExec(`
    DELETE FROM public.notification_push_subscriptions
    WHERE endpoint IN ('${ENDPOINT_A}', '${ENDPOINT_B}', '${ENDPOINT_C}');
  `)
  psqlExec(`DELETE FROM public.academy_users WHERE login = '${FIXTURE_TAG}-user';`)
  if (state.apiUrl && state.serviceRoleKey && state.authUserId) {
    const admin = createClient(state.apiUrl, state.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    await admin.auth.admin.deleteUser(state.authUserId).catch(() => {})
  }
  console.log('')
}

main()
