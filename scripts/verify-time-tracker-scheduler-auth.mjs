#!/usr/bin/env node
/**
 * Targeted verification for scheduler HMAC auth Edge Function.
 *
 * Usage:
 *   npm run supabase:local:verify-time-tracker-scheduler-auth
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getLocalSupabaseStatus } from './lib/localSupabaseCli.mjs'
import {
  generateSchedulerSecret,
  parseEdgeEnv,
  signSchedulerRequest,
} from './lib/scheduler-request-signing.mjs'
import { canonicalVapidFingerprint } from './lib/vapid-fingerprint.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROJECT_ID = 'shugyla-academy'
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'
const MANUAL_LOGIN = 'web-push-manual-staff'
const EDGE_ENV = path.join(ROOT, 'supabase/functions/.env')
const FUNCTION_NAME = 'run-time-tracker-notification-scheduler'

const state = {
  container: null,
  apiUrl: null,
  anonKey: null,
  functionUrl: null,
  currentSecret: null,
  previousSecret: null,
  edgeEnvBackup: null,
  vapidFingerprintBefore: null,
  countsBefore: null,
  testsRun: 0,
  testsPassed: 0,
}

async function main() {
  try {
    console.log('=== Time tracker scheduler auth verification ===\n')
    stageStaticEnvironment()
    await stageEdgeEnv()
    await stageHttpAuth()
    await stageValidation()
    await stageExecution()
    stageSecurityStatic()
    await stagePreservation()
    console.log(
      `\nTime tracker scheduler auth verification completed (${state.testsPassed}/${state.testsRun} tests, exit 0)\n`
    )
  } catch (err) {
    console.error(`\nFAILED: ${err.message}\n`)
    process.exitCode = 1
  } finally {
    restoreEdgeEnv()
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
    fail(`${command} exited with code ${result.status}${result.stderr ? `: ${result.stderr.trim()}` : ''}`)
  }
  return result
}

function upsertLine(content, key, value) {
  const lines = content.split('\n')
  let found = false
  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true
      return `${key}=${value}`
    }
    return line
  })
  if (!found) next.push(`${key}=${value}`)
  return `${next.join('\n').replace(/\n?$/, '\n')}`
}

function removeLine(content, key) {
  return content
    .split('\n')
    .filter((line) => !line.startsWith(`${key}=`))
    .join('\n')
    .replace(/\n?$/, '\n')
}

function writeEdgeEnv(content) {
  fs.writeFileSync(EDGE_ENV, content, { mode: 0o600 })
  fs.writeFileSync(path.join(ROOT, 'supabase/.env.local'), content, { mode: 0o600 })
}

function restartEdgeRuntime(force = false) {
  if (process.env.SKIP_SUPABASE_RESTART === '1' && !force) return
  console.log('Restarting Edge runtime to load env (DB preserved)...')
  run('npm', ['exec', '--yes', 'supabase@2.109.1', '--', 'stop'], { capture: false, allowFailure: true })
  run('npm', ['exec', '--yes', 'supabase@2.109.1', '--', 'start'], { capture: false, allowFailure: true })
}

function restoreEdgeEnv() {
  if (!state.edgeEnvBackup) return
  try {
    const current = fs.readFileSync(EDGE_ENV, 'utf8')
    if (current === state.edgeEnvBackup) return
    writeEdgeEnv(state.edgeEnvBackup)
    restartEdgeRuntime(false)
  } catch {
    // best-effort restore; verification already recorded failure/success
  }
}

function psqlScalar(sql) {
  const result = run(
    'docker',
    ['exec', state.container, 'psql', '-U', 'postgres', '-t', '-A', '-c', sql],
    { capture: true }
  )
  return result.stdout.trim()
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

function vapidFingerprint(edgeEnvContent) {
  const match = edgeEnvContent.match(/^VAPID_PUBLIC_KEY=(.+)$/m)
  if (!match) return null
  return canonicalVapidFingerprint(match[1].trim())
}

function captureCounts() {
  return {
    notifications: Number(psqlScalar('SELECT COUNT(*) FROM public.notifications;')),
    deliveries: Number(psqlScalar('SELECT COUNT(*) FROM public.notification_deliveries;')),
    subscriptions: Number(
      psqlScalar('SELECT COUNT(*) FROM public.notification_push_subscriptions WHERE is_active = true;')
    ),
    rulesEnabled: Number(
      psqlScalar("SELECT COUNT(*) FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%' AND is_enabled = true;")
    ),
  }
}

async function invoke({
  body = '{}',
  secret = state.currentSecret,
  timestamp,
  signature,
  method = 'POST',
  extraHeaders = {},
}) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: state.anonKey,
    ...extraHeaders,
  }

  if (secret && !signature) {
    const signed = signSchedulerRequest({ secret, body, method, timestamp })
    headers['x-shugyla-scheduler-timestamp'] = signed.timestamp
    headers['x-shugyla-scheduler-signature'] = signed.signature
  } else {
    if (timestamp) headers['x-shugyla-scheduler-timestamp'] = timestamp
    if (signature) headers['x-shugyla-scheduler-signature'] = signature
  }

  const response = await fetch(state.functionUrl, {
    method,
    headers,
    body: method === 'POST' ? body : undefined,
  })

  let json = null
  try {
    json = await response.json()
  } catch {
    json = null
  }

  return { status: response.status, json, text: JSON.stringify(json) }
}

function stageStaticEnvironment() {
  console.log('Stage 1: Static / environment')

  const fnPath = path.join(ROOT, 'supabase/functions/run-time-tracker-notification-scheduler/index.ts')
  const authPath = path.join(ROOT, 'supabase/functions/_shared/schedulerRequestAuth.ts')
  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
  const fnSource = fs.readFileSync(fnPath, 'utf8')
  const authSource = fs.readFileSync(authPath, 'utf8')

  assert('Edge Function exists', fs.existsSync(fnPath))
  assert('HMAC helper exists', fs.existsSync(authPath))
  assert(
    'verify_jwt=false only for scheduler function',
    config.includes('[functions.run-time-tracker-notification-scheduler]') &&
      config.includes('verify_jwt = false') &&
      !config.includes('[functions.dispatch-time-tracker-notifications]\nenabled = true\nverify_jwt = false')
  )
  assert('TIME_TRACKER_SCHEDULER_ENABLED guard exists', fnSource.includes('TIME_TRACKER_SCHEDULER_ENABLED'))
  assert('scheduler disabled response code', fnSource.includes("'scheduler_disabled'"))
  assert('uses verifySchedulerRequest', fnSource.includes('verifySchedulerRequest'))
  assert('uses runTimeTrackerNotificationScheduler', fnSource.includes('runTimeTrackerNotificationScheduler'))
  assert('no rulesOverride in HTTP function', !fnSource.includes('rulesOverride'))
  assert('no select(*)', !fnSource.includes("select('*')"))
  assert('crypto.subtle.verify used', authSource.includes('crypto.subtle.verify'))
  assert('no string === signature compare', !authSource.includes('=== signature') && !authSource.includes("=== 'v1="))
  assert(
    'DB client after HMAC check',
    fnSource.indexOf('serviceClient = createClient') > fnSource.indexOf('verifySchedulerRequest')
  )

  const trackedEdgeEnv = run('git', ['ls-files', EDGE_ENV], { capture: true, allowFailure: true }).stdout.trim()
  assert('scheduler secret file not tracked', !trackedEdgeEnv)

  const secretInGit = run('git', ['grep', '-n', 'TIME_TRACKER_SCHEDULER_SECRET_CURRENT='], { capture: true, allowFailure: true })
  assert('scheduler secret absent from Git tracked files', !secretInGit.stdout.trim())

  const srcServiceRole = run('grep', ['-r', '-l', 'SUPABASE_SERVICE_ROLE', 'src'], { capture: true, allowFailure: true })
  assert('service_role absent in src', !srcServiceRole.stdout.trim())

  const status = getLocalSupabaseStatus()
  state.apiUrl = status.API_URL
  state.anonKey = status.ANON_KEY
  state.functionUrl = `${status.API_URL}/functions/v1/${FUNCTION_NAME}`
  state.container = findDbContainer()

  assert('local API URL only', state.apiUrl.includes('127.0.0.1'))
  assert('no production ref in API URL', !state.apiUrl.includes(PRODUCTION_REF))

  const enabledCount = psqlScalar(
    "SELECT COUNT(*)::text FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%' AND is_enabled = true;"
  )
  assert('seed rules enabled = 0', enabledCount === '0')
  console.log('')
}

async function stageEdgeEnv() {
  console.log('Stage 2: Edge env + restart')

  if (!fs.existsSync(EDGE_ENV)) {
    run('npm', ['run', 'webpush:local:prepare-edge-env'], { capture: false })
  } else {
    const content = fs.readFileSync(EDGE_ENV, 'utf8')
    if (!content.includes('TIME_TRACKER_SCHEDULER_SECRET_CURRENT=')) {
      run('npm', ['run', 'webpush:local:prepare-edge-env'], { capture: false })
    }
  }

  const edgeEnv = fs.readFileSync(EDGE_ENV, 'utf8')
  state.edgeEnvBackup = edgeEnv
  state.vapidFingerprintBefore = vapidFingerprint(edgeEnv)
  const parsed = parseEdgeEnv(edgeEnv)
  state.currentSecret = parsed.TIME_TRACKER_SCHEDULER_SECRET_CURRENT

  assert('scheduler secret configured in edge env', Boolean(state.currentSecret))
  assert('scheduler enabled in edge env', parsed.TIME_TRACKER_SCHEDULER_ENABLED === 'true')
  assert('scheduler test mode in edge env', parsed.TIME_TRACKER_SCHEDULER_TEST_MODE === 'true')
  assert('VAPID public key present', edgeEnv.includes('VAPID_PUBLIC_KEY='))

  restartEdgeRuntime()
  state.countsBefore = captureCounts()
  console.log('')
}

async function stageHttpAuth() {
  console.log('Stage 3: HTTP auth')

  const options = await invoke({ method: 'OPTIONS', secret: null, timestamp: null, signature: null })
  assert('OPTIONS works', options.status === 204)

  const getRes = await invoke({ method: 'GET', secret: null, timestamp: null, signature: null })
  assert('GET → 405', getRes.status === 405 && getRes.json?.code === 'method_not_allowed')

  const noSig = await invoke({ timestamp: null, signature: null, secret: null })
  assert('POST without signature → 401', noSig.status === 401 && noSig.json?.code === 'unauthorized')

  const signed = signSchedulerRequest({ secret: state.currentSecret, body: '{}' })
  const noTs = await invoke({
    body: '{}',
    timestamp: null,
    signature: signed.signature,
    secret: null,
  })
  assert('without timestamp → 401', noTs.status === 401)

  const noSigHeader = await invoke({
    body: '{}',
    timestamp: signed.timestamp,
    signature: null,
    secret: null,
  })
  assert('without signature header → 401', noSigHeader.status === 401)

  const malformedTs = await invoke({
    body: '{}',
    timestamp: 'abc',
    signature: signed.signature,
    secret: null,
  })
  assert('malformed timestamp → 401', malformedTs.status === 401)

  const oldTs = Math.floor(Date.now() / 1000) - 400
  const oldSigned = signSchedulerRequest({ secret: state.currentSecret, body: '{}', timestamp: String(oldTs) })
  const oldRes = await invoke({
    body: '{}',
    timestamp: oldSigned.timestamp,
    signature: oldSigned.signature,
    secret: null,
  })
  assert('timestamp older than 300 seconds → 401', oldRes.status === 401)

  const futureTs = Math.floor(Date.now() / 1000) + 400
  const futureSigned = signSchedulerRequest({ secret: state.currentSecret, body: '{}', timestamp: String(futureTs) })
  const futureRes = await invoke({
    body: '{}',
    timestamp: futureSigned.timestamp,
    signature: futureSigned.signature,
    secret: null,
  })
  assert('timestamp too far in future → 401', futureRes.status === 401)

  const invalidSig = await invoke({
    body: '{}',
    timestamp: signed.timestamp,
    signature: 'v1=' + '0'.repeat(64),
    secret: null,
  })
  assert('invalid signature → 401', invalidSig.status === 401)

  const wrongBody = signSchedulerRequest({ secret: state.currentSecret, body: '{"x":1}' })
  const wrongBodyRes = await invoke({
    body: '{}',
    timestamp: wrongBody.timestamp,
    signature: wrongBody.signature,
    secret: null,
  })
  assert('signature for different body → 401', wrongBodyRes.status === 401)

  const getSigned = signSchedulerRequest({ secret: state.currentSecret, body: '{}', method: 'GET' })
  const wrongMethodRes = await invoke({
    body: '{}',
    timestamp: getSigned.timestamp,
    signature: getSigned.signature,
    secret: null,
  })
  assert('signature for different method → 401', wrongMethodRes.status === 401)

  const okRes = await invoke({ body: '{}' })
  assert('valid current secret → 200', okRes.status === 200 && okRes.json?.ok === true)

  state.previousSecret = generateSchedulerSecret()
  const withPrevious = upsertLine(fs.readFileSync(EDGE_ENV, 'utf8'), 'TIME_TRACKER_SCHEDULER_SECRET_PREVIOUS', state.previousSecret)
  writeEdgeEnv(withPrevious)
  restartEdgeRuntime(true)

  const previousSigned = signSchedulerRequest({ secret: state.previousSecret, body: '{}' })
  const previousRes = await invoke({
    body: '{}',
    timestamp: previousSigned.timestamp,
    signature: previousSigned.signature,
    secret: null,
  })
  assert('valid previous secret → 200', previousRes.status === 200 && previousRes.json?.ok === true)

  restoreEdgeEnv()
  state.edgeEnvBackup = fs.readFileSync(EDGE_ENV, 'utf8')
  restartEdgeRuntime(true)

  const disabledEnv = upsertLine(state.edgeEnvBackup, 'TIME_TRACKER_SCHEDULER_ENABLED', 'false')
  writeEdgeEnv(disabledEnv)
  restartEdgeRuntime(true)

  const disabledRes = await invoke({ body: '{}' })
  assert('disabled flag → 503', disabledRes.status === 503 && disabledRes.json?.code === 'scheduler_disabled')

  restoreEdgeEnv()
  state.edgeEnvBackup = fs.readFileSync(EDGE_ENV, 'utf8')
  restartEdgeRuntime(true)
  console.log('')
}

async function stageValidation() {
  console.log('Stage 4: Request validation')

  const token = state.currentSecret
  const signedBase = () => signSchedulerRequest({ secret: token, body: '{}' })

  const cases = [
    ['body with run_at', '{"run_at":"2026-01-01T00:00:00.000Z"}'],
    ['body with dry_run', '{"dry_run":true}'],
    ['body with rule_codes', '{"rule_codes":[]}'],
    ['body with employee_id', '{"employee_id":1}'],
    ['extra field', '{"extra":true}'],
  ]

  for (const [name, body] of cases) {
    const signed = signSchedulerRequest({ secret: token, body })
    const res = await invoke({
      body,
      timestamp: signed.timestamp,
      signature: signed.signature,
      secret: null,
    })
    assert(`${name} → 422`, res.status === 422 && res.json?.code === 'validation_error')
  }

  const invalidRunAt = signSchedulerRequest({ secret: token, body: '{}' })
  const invalidRunAtRes = await invoke({
    body: '{}',
    timestamp: invalidRunAt.timestamp,
    signature: invalidRunAt.signature,
    secret: null,
    extraHeaders: { 'x-shugyla-scheduler-test-run-at': 'not-a-date' },
  })
  assert('invalid local test runAt → 422', invalidRunAtRes.status === 422)

  const noTestModeEnv = upsertLine(state.edgeEnvBackup, 'TIME_TRACKER_SCHEDULER_TEST_MODE', 'false')
  writeEdgeEnv(noTestModeEnv)
  restartEdgeRuntime(true)

  const noTestModeSigned = signSchedulerRequest({ secret: token, body: '{}' })
  const noTestModeRes = await invoke({
    body: '{}',
    timestamp: noTestModeSigned.timestamp,
    signature: noTestModeSigned.signature,
    secret: null,
    extraHeaders: { 'x-shugyla-scheduler-test-run-at': new Date().toISOString() },
  })
  assert('test runAt without test mode → 422', noTestModeRes.status === 422)

  restoreEdgeEnv()
  state.edgeEnvBackup = fs.readFileSync(EDGE_ENV, 'utf8')
  restartEdgeRuntime(true)

  const fnSource = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/run-time-tracker-notification-scheduler/index.ts'),
    'utf8'
  )
  assert('hosted simulation blocks test header', fnSource.includes('isLocalTestMode') && fnSource.includes(PRODUCTION_REF))
  console.log('')
}

async function stageExecution() {
  console.log('Stage 5: Execution + immutability')

  const before = captureCounts()
  const res = await invoke({ body: '{}' })

  assert('valid signed request calls scheduler', res.status === 200 && res.json?.ok === true)
  assert('returns no_enabled_rules', res.json?.status === 'no_enabled_rules')
  assert('enabledRules=0', res.json?.enabledRules === 0)

  const after = captureCounts()
  assert('notification count unchanged', after.notifications === before.notifications)
  assert('delivery count unchanged', after.deliveries === before.deliveries)
  assert('subscription count unchanged', after.subscriptions === before.subscriptions)
  assert('seed rules unchanged', after.rulesEnabled === 0 && after.rulesEnabled === before.rulesEnabled)
  assert('no push accepted', res.json?.result?.pushAccepted === 0)
  assert('no notifications created', res.json?.result?.createdNotifications === 0)

  const invalidRes = await invoke({
    body: '{}',
    timestamp: String(Math.floor(Date.now() / 1000)),
    signature: 'v1=' + 'f'.repeat(64),
    secret: null,
  })
  const afterInvalid = captureCounts()
  assert('invalid HMAC does not mutate DB', afterInvalid.notifications === before.notifications)
  console.log('')
}

function stageSecurityStatic() {
  console.log('Stage 6: Security response shape')

  const fnSource = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/run-time-tracker-notification-scheduler/index.ts'),
    'utf8'
  )
  const authSource = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/_shared/schedulerRequestAuth.ts'),
    'utf8'
  )
  const invokeScript = fs.readFileSync(
    path.join(ROOT, 'scripts/invoke-local-time-tracker-scheduler.mjs'),
    'utf8'
  )

  assert('auth helper avoids secret logging', !/console\.log\([^)]*secret/i.test(authSource))
  assert('function avoids secret logging', !/console\.log\([^)]*SECRET/i.test(fnSource))
  assert('invoker avoids secret logging', !/console\.log\([^)]*(SECRET_|signature|p256dh|auth_key)/i.test(invokeScript))
  assert('safe response excludes employee_id', !fnSource.includes('employee_id'))
  assert('raw DB errors not returned', fnSource.includes("'internal_error'"))
  console.log('')
}

async function stagePreservation() {
  console.log('Stage 7: Regression / preservation')

  const manualExists = psqlScalar(`SELECT COUNT(*)::text FROM public.academy_users WHERE login = '${MANUAL_LOGIN}';`)
  assert('web-push-manual-staff preserved', manualExists === '1')

  const manualSub = psqlScalar(`
    SELECT COUNT(*)::text FROM public.notification_push_subscriptions s
    INNER JOIN public.academy_users u ON u.id = s.employee_id
    WHERE u.login = '${MANUAL_LOGIN}' AND s.is_active = true AND s.permission_status = 'granted';
  `)
  assert('manual browser subscription preserved', manualSub === '1')

  const edgeEnv = fs.readFileSync(EDGE_ENV, 'utf8')
  assert('VAPID fingerprint unchanged', vapidFingerprint(edgeEnv) === state.vapidFingerprintBefore)

  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
  assert('Cron not configured in repo', !config.includes('pg_cron') && !config.includes('[cron]'))
  assert('production not connected', state.apiUrl.includes('127.0.0.1'))
  console.log('')
}

main()
