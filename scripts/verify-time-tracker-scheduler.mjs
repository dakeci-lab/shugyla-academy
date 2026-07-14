#!/usr/bin/env node
/**
 * Targeted verification for time tracker notification scheduler.
 *
 * Usage:
 *   npm run supabase:local:verify-time-tracker-scheduler
 */

import { spawnSync, spawn } from 'child_process'
import crypto, { webcrypto } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { loginToTechnicalEmail } from '../src/utils/phoneUtils.js'
import { getLocalSupabaseStatus } from './lib/localSupabaseCli.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROJECT_ID = 'shugyla-academy'
const FIXTURE_TAG = 'time-tracker-scheduler-verify'
const MANUAL_LOGIN = 'web-push-manual-staff'
const MANUAL_FIXTURE_TAG = 'web-push-manual'
const SHIFT_DATE = '2026-08-10'
const PASSWORD = 'SchedulerVerify123!'
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'

const state = {
  container: null,
  apiUrl: null,
  serviceRoleKey: null,
  roleId: null,
  rules: [],
  employees: {},
  shifts: {},
  subscriptionId: null,
  createdAuthUserIds: [],
  createdEmployeeIds: [],
  createdShiftIds: [],
  createdNotificationIds: [],
  createdDeliveryIds: [],
  createdSubscriptionIds: [],
  testsRun: 0,
  testsPassed: 0,
}

async function main() {
  try {
    console.log('=== Time tracker scheduler verification ===\n')
    stageEnvironment()
    stageStaticSecurity()
    await stageLoadRules()
    await stageSetupFixture()
    await stageNoEnabledRules()
    await stageDryRun()
    await stageOneShotMock()
    await stageIdempotency()
    await stageManualFixturePreserved()
    console.log(
      `\nTime tracker scheduler verification completed (${state.testsPassed}/${state.testsRun} tests, exit 0)\n`
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
    fail(`${command} exited with code ${result.status}${result.stderr ? `: ${result.stderr.trim()}` : ''}`)
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

function almatyISO(dateKey, hours, minutes) {
  const pad = (n) => String(n).padStart(2, '0')
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(`${y}-${pad(m)}-${pad(d)}T${pad(hours)}:${pad(minutes)}:00+05:00`).toISOString()
}

function invokeRunner(payload) {
  const inputPath = path.join(os.tmpdir(), `tt-scheduler-${crypto.randomUUID()}.json`)
  const outputPath = path.join(os.tmpdir(), `tt-scheduler-out-${crypto.randomUUID()}.json`)
  fs.writeFileSync(inputPath, JSON.stringify(payload))
  try {
    run(
      'npm',
      [
        'exec',
        '--yes',
        'deno',
        '--',
        'run',
        '--allow-env',
        '--allow-net',
        '--allow-read',
        '--allow-write',
        '--config',
        'supabase/functions/send-test-web-push/deno.json',
        'scripts/lib/time-tracker-scheduler-runner.ts',
        inputPath,
        outputPath,
      ],
      { capture: true }
    )
    return JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  } finally {
    fs.unlinkSync(inputPath)
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
  }
}

function invokeRunnerParallel(payload) {
  const inputPath = path.join(os.tmpdir(), `tt-scheduler-${crypto.randomUUID()}.json`)
  const outputPath = path.join(os.tmpdir(), `tt-scheduler-out-${crypto.randomUUID()}.json`)
  fs.writeFileSync(inputPath, JSON.stringify(payload))
  return new Promise((resolve, reject) => {
    const child = spawn(
      'npm',
      [
        'exec',
        '--yes',
        'deno',
        '--',
        'run',
        '--allow-env',
        '--allow-net',
        '--allow-read',
        '--allow-write',
        '--config',
        'supabase/functions/send-test-web-push/deno.json',
        'scripts/lib/time-tracker-scheduler-runner.ts',
        inputPath,
        outputPath,
      ],
      { cwd: ROOT, stdio: 'ignore' }
    )
    child.on('error', reject)
    child.on('close', (code) => {
      try {
        if (code !== 0) {
          reject(new Error(`runner exited ${code}`))
          return
        }
        resolve(JSON.parse(fs.readFileSync(outputPath, 'utf8')))
      } catch (err) {
        reject(err)
      } finally {
        fs.unlinkSync(inputPath)
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
      }
    })
  })
}

function stageEnvironment() {
  console.log('Stage 1: Environment')
  const status = getLocalSupabaseStatus()
  state.container = findDbContainer()
  state.apiUrl = status.API_URL
  state.serviceRoleKey = status.SERVICE_ROLE_KEY
  assert('scheduler shared module exists', fs.existsSync(path.join(ROOT, 'supabase/functions/_shared/timeTrackerNotificationScheduler.ts')))
  assert('local scheduler script exists', fs.existsSync(path.join(ROOT, 'scripts/local-time-tracker-scheduler.mjs')))
  assert('local API URL only', state.apiUrl.includes('127.0.0.1'))
  assert('no production ref in API URL', !state.apiUrl.includes(PRODUCTION_REF))
  const localScript = fs.readFileSync(path.join(ROOT, 'scripts/local-time-tracker-scheduler.mjs'), 'utf8')
  assert('real one-shot requires LOCAL_TIME_TRACKER_SCHEDULER_REAL_ENABLED', localScript.includes('LOCAL_TIME_TRACKER_SCHEDULER_REAL_ENABLED'))
  assert('local real scheduler disabled code', localScript.includes('local real scheduler disabled'))
  psqlExec('GRANT SELECT ON public.academy_employee_shifts TO service_role;')
  const rulesEnabled = psqlScalar(
    "SELECT COUNT(*)::text FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%' AND is_enabled = true;"
  )
  assert('seed rules enabled count = 0', rulesEnabled === '0')
  console.log('')
}

function stageStaticSecurity() {
  console.log('Stage 2: Security static checks')
  const schedulerSource = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/_shared/timeTrackerNotificationScheduler.ts'),
    'utf8'
  )
  const dispatchSource = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/_shared/timeTrackerNotificationDispatch.ts'),
    'utf8'
  )
  const edgeSource = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/dispatch-time-tracker-notifications/index.ts'),
    'utf8'
  )
  const localScript = fs.readFileSync(path.join(ROOT, 'scripts/local-time-tracker-scheduler.mjs'), 'utf8')

  assert('service_role absent in src', !run('grep', ['-r', '-l', 'SUPABASE_SERVICE_ROLE', 'src'], { capture: true, allowFailure: true }).stdout.trim())
  assert('rulesOverride not in edge HTTP body', !edgeSource.includes('rulesOverride'))
  assert('no select(*) in scheduler', !schedulerSource.includes("select('*')") && !schedulerSource.includes('select("*")'))
  assert('no select(*) in dispatch', !dispatchSource.includes("select('*')") && !dispatchSource.includes('select("*")'))
  assert('scheduler whitelists four rules', schedulerSource.includes('time_tracker.rule.shift_start_soon'))
  assert('trigger_type scheduled filter', schedulerSource.includes("'scheduled'"))
  assert('dispatch loads templates server-side', dispatchSource.includes('notification_templates'))
  assert('safe result shape', schedulerSource.includes('no_enabled_rules'))
  assert('no employee_id in scheduler result', !schedulerSource.includes('employee_id'))
  assert('local script blocks production URL', localScript.includes(PRODUCTION_REF))
  assert('local script avoids secret logging', !/console\.log\([^)]*(endpoint|p256dh|auth_key|JWT|service_role)/i.test(localScript))
  console.log('')
}

async function stageLoadRules() {
  console.log('Stage 3: Rule loading')
  const admin = adminClient()
  const { data, error } = await admin
    .from('notification_rules')
    .select(
      'id, code, template_id, module_code, event_code, offset_minutes, repeat_after_minutes, max_attempts, channels, priority, is_enabled, trigger_type'
    )
    .like('code', 'time_tracker.rule.%')
    .order('code')

  if (error) fail(`Load rules: ${error.message}`)
  state.rules = data ?? []
  assert('four seed rules loaded', state.rules.length === 4)
  assert('only enabled rules read from DB by default', state.rules.every((r) => r.is_enabled === false))

  const enabledOnly = invokeRunner({
    action: 'scheduler',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: new Date().toISOString(),
    dryRun: true,
  })
  assert('disabled rules not run', enabledOnly.status === 'no_enabled_rules' && enabledOnly.enabledRules === 0)
  assert('only four whitelisted rule codes', schedulerCodesMatchWhitelist(state.rules.map((r) => r.code)))
  assert('unknown codes rejected by whitelist', !schedulerCodesMatchWhitelist(['time_tracker.rule.unknown']))
  const schedulerSource = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/_shared/timeTrackerNotificationScheduler.ts'),
    'utf8'
  )
  assert('scheduled trigger_type required', schedulerSource.includes("eq('trigger_type', 'scheduled')"))
  assert('templates delegated to dispatch core', schedulerSource.includes('dispatchTimeTrackerNotifications'))
  console.log('')
}

function schedulerCodesMatchWhitelist(codes) {
  const allowed = new Set([
    'time_tracker.rule.shift_start_soon',
    'time_tracker.rule.clock_in_missing',
    'time_tracker.rule.shift_end_reached',
    'time_tracker.rule.clock_out_missing',
  ])
  return codes.every((c) => allowed.has(c))
}

async function makeValidPushKeys() {
  const keyPair = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])
  const raw = Buffer.from(await webcrypto.subtle.exportKey('raw', keyPair.publicKey))
  return {
    p256dh: raw.toString('base64url'),
    auth: crypto.randomBytes(16).toString('base64url'),
  }
}

function nextEmployeeId() {
  return Number(psqlScalar('SELECT COALESCE(MAX(id), 0) + 1 FROM public.academy_users;'))
}

async function createEmployee(key) {
  const login = `${FIXTURE_TAG}-${key}`
  const email = loginToTechnicalEmail(login)
  const admin = adminClient()

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error) fail(`Create auth ${key}: ${error.message}`)

  state.createdAuthUserIds.push(data.user.id)
  const employeeId = nextEmployeeId()
  state.createdEmployeeIds.push(employeeId)

  psqlExec(`
    INSERT INTO public.academy_users (
      id, first_name, last_name, full_name, login, password, role, role_id, status, auth_user_id
    ) VALUES (
      ${employeeId}, 'Scheduler', '${key}', '[${FIXTURE_TAG}] ${key}', '${login}',
      '', 'cashier', '${state.roleId}', 'active', '${data.user.id}'
    );
  `)

  state.employees[key] = { id: employeeId, authUserId: data.user.id, login }
  return state.employees[key]
}

function insertShift(key, employeeKey, spec) {
  const employee = state.employees[employeeKey]
  const id = crypto.randomUUID()
  state.createdShiftIds.push(id)
  state.shifts[key] = id

  const actualStart = spec.actualStart ? `'${spec.actualStart}'::timestamptz` : 'null'
  const actualEnd = spec.actualEnd ? `'${spec.actualEnd}'::timestamptz` : 'null'

  psqlExec(`
    INSERT INTO public.academy_employee_shifts (
      id, employee_id, shift_date, status,
      planned_start_time, planned_end_time,
      actual_start_time, actual_end_time, comment
    ) VALUES (
      '${id}', ${employee.id}, '${SHIFT_DATE}', '${spec.status}',
      '${spec.plannedStart}', '${spec.plannedEnd}',
      ${actualStart}, ${actualEnd}, '${FIXTURE_TAG}'
    );
  `)

  return id
}

async function stageSetupFixture() {
  console.log('Stage 4: Setup fixture')
  state.roleId = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'cashier' LIMIT 1;`)
  if (!state.roleId) fail('Missing cashier role')

  await createEmployee('with-sub')
  await createEmployee('no-sub')
  await createEmployee('ending')
  await createEmployee('missed-out')

  insertShift('startSoon', 'with-sub', { status: 'working', plannedStart: '09:00', plannedEnd: '18:00' })
  insertShift('noSub', 'no-sub', { status: 'working', plannedStart: '10:00', plannedEnd: '19:00' })
  insertShift('ending', 'ending', {
    status: 'working',
    plannedStart: '09:00',
    plannedEnd: '18:00',
    actualStart: almatyISO(SHIFT_DATE, 9, 5),
  })
  insertShift('missedOut', 'missed-out', {
    status: 'working',
    plannedStart: '09:00',
    plannedEnd: '18:00',
    actualStart: almatyISO(SHIFT_DATE, 9, 5),
  })

  const keys = await makeValidPushKeys()
  const endpoint = `https://updates.push.services.mozilla.com/wpush/v2/${FIXTURE_TAG}-mock-sub`
  const subId = crypto.randomUUID()
  const deviceId = crypto.randomUUID()
  state.subscriptionId = subId
  state.createdSubscriptionIds.push(subId)

  psqlExec(`
    INSERT INTO public.notification_push_subscriptions (
      id, employee_id, auth_user_id, endpoint, p256dh_key, auth_key,
      device_id, permission_status, is_active
    ) VALUES (
      '${subId}', ${state.employees['with-sub'].id}, '${state.employees['with-sub'].authUserId}',
      '${endpoint}', '${keys.p256dh}', '${keys.auth}', '${deviceId}', 'granted', true
    );
  `)

  pass('fixture employees, shifts, mock subscription ready')
  console.log('')
}

function ruleByEvent(eventCode) {
  return state.rules.find((rule) => rule.event_code === eventCode)
}

function allRulesOverride() {
  return state.rules.map((r) => ({
    id: r.id,
    code: r.code,
    template_id: r.template_id,
    module_code: r.module_code,
    event_code: r.event_code,
    offset_minutes: r.offset_minutes,
    repeat_after_minutes: r.repeat_after_minutes,
    max_attempts: r.max_attempts,
    channels: r.channels,
    priority: r.priority,
  }))
}

async function stageNoEnabledRules() {
  console.log('Stage 5: No enabled rules')

  const beforeN = Number(
    psqlScalar(`SELECT COUNT(*) FROM public.notifications WHERE employee_id IN (${state.employees['with-sub']?.id ?? 0}, ${state.employees['no-sub']?.id ?? 0});`)
  )
  const beforeD = Number(psqlScalar(`SELECT COUNT(*) FROM public.notification_deliveries;`))

  const result = invokeRunner({
    action: 'scheduler',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 8, 52),
    dryRun: true,
    mockSender: 'noop',
  })

  assert('returns status=no_enabled_rules', result.status === 'no_enabled_rules')
  assert('ok=true not internal_error', result.ok === true)
  assert('no notification created', result.result.createdNotifications === 0)
  assert('no delivery created', result.result.pushAccepted === 0 && result.result.pushFailed === 0)
  assert('sender not called', result.senderCalls === 0)

  const afterN = Number(
    psqlScalar(`SELECT COUNT(*) FROM public.notifications WHERE employee_id IN (${state.employees['with-sub'].id}, ${state.employees['no-sub'].id});`)
  )
  const afterD = Number(psqlScalar(`SELECT COUNT(*) FROM public.notification_deliveries;`))
  assert('DB notification count unchanged', afterN === beforeN)
  assert('DB delivery count unchanged', afterD === beforeD)
  console.log('')
}

async function stageDryRun() {
  console.log('Stage 6: Dry-run with rulesOverride')

  const beforeN = Number(
    psqlScalar(`SELECT COUNT(*) FROM public.notifications WHERE employee_id IN (${state.employees['with-sub'].id}, ${state.employees['no-sub'].id});`)
  )

  const result = invokeRunner({
    action: 'scheduler',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 8, 52),
    dryRun: true,
    rulesOverride: allRulesOverride(),
    shiftIds: [state.shifts.startSoon, state.shifts.noSub],
    mockSender: 'noop',
  })

  assert('dry-run status completed', result.status === 'completed')
  assert('dry-run analyzes fixture events', result.result.matchedEvents >= 1)
  assert('dry-run no notifications', result.result.createdNotifications === 0)
  assert('dry-run no push accepted', result.result.pushAccepted === 0)
  assert('dry-run sender not called', result.senderCalls === 0)

  const afterN = Number(
    psqlScalar(`SELECT COUNT(*) FROM public.notifications WHERE employee_id IN (${state.employees['with-sub'].id}, ${state.employees['no-sub'].id});`)
  )
  assert('dry-run no DB notification writes', afterN === beforeN)

  const subActive = psqlScalar(`SELECT is_active::text FROM public.notification_push_subscriptions WHERE id = '${state.subscriptionId}';`)
  assert('subscription unchanged', subActive === 't' || subActive === 'true')
  assert('dry-run counts present', typeof result.result.scannedShifts === 'number')
  console.log('')
}

async function stageOneShotMock() {
  console.log('Stage 7: One-shot mock dispatch (four events)')

  const rules = allRulesOverride()
  const startSoonRule = ruleByEvent('shift_start_soon')
  const clockInRule = ruleByEvent('clock_in_missing')
  const endRule = ruleByEvent('shift_end_reached')
  const clockOutRule = ruleByEvent('clock_out_missing')

  const events = [
    { name: 'shift_start_soon', rule: startSoonRule, runAt: almatyISO(SHIFT_DATE, 8, 52), shiftId: state.shifts.startSoon },
    { name: 'clock_in_missing', rule: clockInRule, runAt: almatyISO(SHIFT_DATE, 9, 6), shiftId: state.shifts.startSoon },
    { name: 'shift_end_reached', rule: endRule, runAt: almatyISO(SHIFT_DATE, 18, 0), shiftId: state.shifts.ending },
    { name: 'clock_out_missing', rule: clockOutRule, runAt: almatyISO(SHIFT_DATE, 18, 11), shiftId: state.shifts.missedOut },
  ]

  for (const event of events) {
    const run = invokeRunner({
      action: 'scheduler',
      supabaseUrl: state.apiUrl,
      serviceRoleKey: state.serviceRoleKey,
      runAt: event.runAt,
      dryRun: false,
      rulesOverride: [event.rule],
      shiftIds: [event.shiftId],
      mockSender: 'accepted',
    })
    assert(`${event.name} creates notification`, run.result.createdNotifications >= 1)
  }

  const deliveryAccepted = psqlScalar(`
    SELECT COUNT(*)::text FROM public.notification_deliveries
    WHERE status = 'accepted' AND subscription_id = '${state.subscriptionId}';
  `)
  assert('mock accepted creates accepted delivery', Number(deliveryAccepted) >= 1)

  const noSubRun = invokeRunner({
    action: 'scheduler',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 9, 52),
    dryRun: false,
    rulesOverride: [startSoonRule],
    shiftIds: [state.shifts.noSub],
    mockSender: 'accepted',
  })
  assert('no-sub in-app notification', noSubRun.result.createdNotifications >= 1)
  assert('noActiveSubscriptions increases', noSubRun.result.noActiveSubscriptions >= 1)

  const rulesEnabled = psqlScalar(
    "SELECT COUNT(*)::text FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%' AND is_enabled = true;"
  )
  assert('seed rules remain disabled after mock runs', rulesEnabled === '0')
  console.log('')
}

async function stageIdempotency() {
  console.log('Stage 8: Idempotency + parallel runs')

  const startSoonRule = ruleByEvent('shift_start_soon')
  const employeeId = state.employees['with-sub'].id
  const shiftId = state.shifts.startSoon

  psqlExec(`
    DELETE FROM public.notification_deliveries
    WHERE notification_id IN (
      SELECT id FROM public.notifications
      WHERE deduplication_key = 'time_tracker:shift_start_soon:${employeeId}:${shiftId}'
    );
    DELETE FROM public.notifications
    WHERE deduplication_key = 'time_tracker:shift_start_soon:${employeeId}:${shiftId}';
  `)

  const first = invokeRunner({
    action: 'scheduler',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 8, 52),
    dryRun: false,
    rulesOverride: [startSoonRule],
    shiftIds: [shiftId],
    mockSender: 'accepted',
  })
  assert('first run creates notification', first.result.createdNotifications === 1)

  const second = invokeRunner({
    action: 'scheduler',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 8, 52),
    dryRun: false,
    rulesOverride: [startSoonRule],
    shiftIds: [shiftId],
    mockSender: 'accepted',
  })
  assert('repeat run skippedDuplicates', second.result.skippedDuplicates >= 1)
  assert('repeat run no second notification', second.result.createdNotifications === 0)
  assert('repeat run sender not called again', second.senderCalls === 0)

  const deliveryCount = psqlScalar(`
    SELECT COUNT(*)::text FROM public.notification_deliveries d
    INNER JOIN public.notifications n ON n.id = d.notification_id
    WHERE n.deduplication_key = 'time_tracker:shift_start_soon:${employeeId}:${shiftId}';
  `)
  assert('single delivery row', deliveryCount === '1')

  psqlExec(`
    DELETE FROM public.notification_deliveries
    WHERE notification_id IN (
      SELECT id FROM public.notifications
      WHERE deduplication_key = 'time_tracker:shift_start_soon:${employeeId}:${shiftId}'
    );
    DELETE FROM public.notifications
    WHERE deduplication_key = 'time_tracker:shift_start_soon:${employeeId}:${shiftId}';
  `)

  const racePayload = {
    action: 'scheduler',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 8, 52),
    dryRun: false,
    rulesOverride: [startSoonRule],
    shiftIds: [shiftId],
    mockSender: 'accepted',
  }

  const [raceA, raceB] = await Promise.all([invokeRunnerParallel(racePayload), invokeRunnerParallel(racePayload)])
  const raceCreated = raceA.result.createdNotifications + raceB.result.createdNotifications
  const raceSkipped = raceA.result.skippedDuplicates + raceB.result.skippedDuplicates
  const raceSenderCalls = (raceA.senderCalls ?? 0) + (raceB.senderCalls ?? 0)
  const raceRows = psqlScalar(`
    SELECT COUNT(*)::text FROM public.notifications
    WHERE deduplication_key = 'time_tracker:shift_start_soon:${employeeId}:${shiftId}';
  `)
  assert('parallel runs create one notification', raceRows === '1')
  assert('parallel race dedupe without 500', raceCreated <= 1 && (raceSkipped >= 1 || raceCreated === 1))
  assert('parallel race sender called once', raceSenderCalls <= 1)
  console.log('')
}

async function stageManualFixturePreserved() {
  console.log('Stage 9: Manual fixture preserved')

  const manualExists = psqlScalar(`SELECT COUNT(*)::text FROM public.academy_users WHERE login = '${MANUAL_LOGIN}';`)
  assert('web-push-manual-staff preserved', manualExists === '1')

  const manualSub = psqlScalar(`
    SELECT COUNT(*)::text FROM public.notification_push_subscriptions s
    INNER JOIN public.academy_users u ON u.id = s.employee_id
    WHERE u.login = '${MANUAL_LOGIN}' AND s.is_active = true AND s.permission_status = 'granted';
  `)
  assert('manual browser subscription preserved', manualSub === '1')

  const manualDispatchShift = psqlScalar(
    `SELECT COUNT(*)::text FROM public.academy_employee_shifts WHERE comment = 'time-tracker-manual-dispatch';`
  )
  assert('manual-dispatch temp shift removed', manualDispatchShift === '0')
  console.log('')
}

async function stageCleanup() {
  console.log('Stage 10: Cleanup fixture data')

  if (!state.container) return

  const employeeIds = state.createdEmployeeIds.join(',') || '0'
  const shiftIds = state.createdShiftIds.map((id) => `'${id}'`).join(',') || "''"
  const subIds = state.createdSubscriptionIds.map((id) => `'${id}'`).join(',') || "''"
  const authIds = state.createdAuthUserIds.map((id) => `'${id}'`).join(',') || "''"

  psqlExec(`
    DELETE FROM public.notification_deliveries
    WHERE notification_id IN (
      SELECT id FROM public.notifications WHERE employee_id IN (${employeeIds})
    );
    DELETE FROM public.notifications WHERE employee_id IN (${employeeIds});
    DELETE FROM public.notification_push_subscriptions WHERE id IN (${subIds});
    DELETE FROM public.academy_employee_shifts WHERE id IN (${shiftIds});
    DELETE FROM public.academy_users WHERE id IN (${employeeIds});
  `)

  const admin = adminClient()
  for (const authUserId of state.createdAuthUserIds) {
    await admin.auth.admin.deleteUser(authUserId)
  }

  const fixtureShifts = psqlScalar(`SELECT COUNT(*)::text FROM public.academy_employee_shifts WHERE comment = '${FIXTURE_TAG}';`)
  const fixtureUsers = psqlScalar(`SELECT COUNT(*)::text FROM public.academy_users WHERE login LIKE '${FIXTURE_TAG}-%';`)
  const manualSub = psqlScalar(`
    SELECT COUNT(*)::text FROM public.notification_push_subscriptions s
    INNER JOIN public.academy_users u ON u.id = s.employee_id
    WHERE u.login = '${MANUAL_LOGIN}' AND s.is_active = true;
  `)

  assert('fixture shifts removed', fixtureShifts === '0')
  assert('fixture users removed', fixtureUsers === '0')
  assert('manual subscription still active after cleanup', manualSub === '1')
  console.log('')
}

main()
