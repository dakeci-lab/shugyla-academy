#!/usr/bin/env node
/**
 * Local verification for dispatch-time-tracker-notifications Edge Function.
 *
 * Usage:
 *   npm run supabase:local:verify-time-tracker-dispatch-edge
 */

import { spawnSync, spawn } from 'child_process'
import crypto from 'crypto'
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
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'
const FIXTURE_TAG = 'time-tracker-dispatch-edge-verify'
const MANUAL_FIXTURE_TAG = 'web-push-manual'
const SHIFT_DATE = '2026-07-08'
const PASSWORD = 'TimeTrackerDispatchEdge123!'
const PERMISSION_CODE = 'schedule.edit'

const ALL_RULE_CODES = [
  'time_tracker.rule.shift_start_soon',
  'time_tracker.rule.clock_in_missing',
  'time_tracker.rule.shift_end_reached',
  'time_tracker.rule.clock_out_missing',
]

const state = {
  container: null,
  apiUrl: null,
  anonKey: null,
  serviceRoleKey: null,
  functionUrl: null,
  roleIds: {},
  employees: {},
  tokens: {},
  createdAuthUserIds: [],
  createdEmployeeIds: [],
  createdShiftIds: [],
  shifts: {},
  rulesByEvent: {},
  testsRun: 0,
  testsPassed: 0,
}

async function main() {
  try {
    console.log('=== Time tracker dispatch Edge verification ===\n')
    stageEnvironment()
    stageFunctionFiles()
    stageEdgeEnv()
    await stageSetupFixture()
    await stageHttpAuth()
    await stageValidation()
    await stageDryRun()
    stageSecurity()
    await stageManualFixture()
    console.log(
      `\nTime tracker dispatch Edge verification completed (${state.testsPassed}/${state.testsRun} tests, exit 0)\n`
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

function almatyISO(dateKey, hours, minutes) {
  const pad = (n) => String(n).padStart(2, '0')
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(`${y}-${pad(m)}-${pad(d)}T${pad(hours)}:${pad(minutes)}:00+05:00`).toISOString()
}

function invokeRunner(payload) {
  const inputPath = path.join(os.tmpdir(), `tt-edge-${crypto.randomUUID()}.json`)
  const outputPath = path.join(os.tmpdir(), `tt-edge-out-${crypto.randomUUID()}.json`)
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
        'scripts/lib/time-tracker-dispatch-runner.ts',
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

function stageEnvironment() {
  console.log('Stage 1: Environment')
  const status = getLocalSupabaseStatus()
  state.container = findDbContainer()
  state.apiUrl = status.API_URL
  state.anonKey = status.ANON_KEY
  state.serviceRoleKey = status.SERVICE_ROLE_KEY
  state.functionUrl = `${state.apiUrl}/functions/v1/dispatch-time-tracker-notifications`

  assert('local Supabase API URL', state.apiUrl.includes('127.0.0.1'))
  psqlExec('GRANT SELECT ON public.academy_employee_shifts TO service_role;')

  const enabledCount = psqlScalar(
    "SELECT COUNT(*) FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%' AND is_enabled = true;"
  )
  assert('seed rules enabled = 0', enabledCount === '0')
  console.log('')
}

function stageFunctionFiles() {
  console.log('Stage 2: Function files + config')

  const fnPath = path.join(ROOT, 'supabase/functions/dispatch-time-tracker-notifications/index.ts')
  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
  const fnSource = fs.readFileSync(fnPath, 'utf8')

  assert('function exists', fs.existsSync(fnPath))
  assert('verify_jwt = true', config.includes('[functions.dispatch-time-tracker-notifications]') && config.includes('verify_jwt = true'))
  assert('production guard exists', fnSource.includes('supabase.co') && fnSource.includes(PRODUCTION_REF))
  assert('TIME_TRACKER_DISPATCH_TEST_ENABLED guard', fnSource.includes('TIME_TRACKER_DISPATCH_TEST_ENABLED'))
  assert('uses schedule.edit permission', fnSource.includes("'schedule.edit'"))
  assert('uses authorizeEmployeeAdmin', fnSource.includes('authorizeEmployeeAdmin'))
  assert('uses dispatchTimeTrackerNotifications', fnSource.includes('dispatchTimeTrackerNotifications'))
  assert('dry_run required check', fnSource.includes('real_dispatch_disabled'))
  assert('real dispatch local flag', fnSource.includes('TIME_TRACKER_DISPATCH_REAL_TEST_ENABLED'))
  assert('no select(*)', !fnSource.includes("select('*')"))
  console.log('')
}

function stageEdgeEnv() {
  console.log('Stage 3: Edge env')
  const edgeEnvPath = path.join(ROOT, 'supabase/functions/.env')
  if (!fs.existsSync(edgeEnvPath)) {
    run('npm', ['run', 'webpush:local:prepare-edge-env'], { capture: false })
  } else {
    const content = fs.readFileSync(edgeEnvPath, 'utf8')
    if (!content.includes('TIME_TRACKER_DISPATCH_TEST_ENABLED=true')) {
      run('npm', ['run', 'webpush:local:prepare-edge-env'], { capture: false })
    }
  }

  const edgeEnv = fs.readFileSync(edgeEnvPath, 'utf8')
  assert('TIME_TRACKER_DISPATCH_TEST_ENABLED in edge env', edgeEnv.includes('TIME_TRACKER_DISPATCH_TEST_ENABLED=true'))
  assert('VAPID keys preserved in edge env', edgeEnv.includes('VAPID_PUBLIC_KEY=') && edgeEnv.includes('VAPID_PRIVATE_KEY='))
  assert('WEB_PUSH_TEST_ENABLED preserved', edgeEnv.includes('WEB_PUSH_TEST_ENABLED=true'))

  if (process.env.SKIP_SUPABASE_RESTART !== '1') {
    console.log('Restarting Edge runtime to load env (DB preserved)...')
    run('npm', ['run', 'webpush:local:restart-supabase'], { capture: false })
  } else {
    pass('supabase restart skipped (SKIP_SUPABASE_RESTART=1)')
  }

  const status = getLocalSupabaseStatus()
  state.apiUrl = status.API_URL
  state.anonKey = status.ANON_KEY
  state.serviceRoleKey = status.SERVICE_ROLE_KEY
  state.functionUrl = `${state.apiUrl}/functions/v1/dispatch-time-tracker-notifications`
  console.log('')
}

function adminClient() {
  return createClient(state.apiUrl, state.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function nextEmployeeId() {
  return Number(psqlScalar('SELECT COALESCE(MAX(id), 0) + 1 FROM public.academy_users;'))
}

async function createEmployee(key, roleCode, roleId, status = 'active') {
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
      ${employeeId}, 'DispatchEdge', '${key}', '[${FIXTURE_TAG}] ${key}', '${login}',
      '', '${roleCode}', '${roleId}', '${status}', '${data.user.id}'
    );
  `)

  const anon = createClient(state.apiUrl, state.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = await anon.auth.signInWithPassword({ email, password: PASSWORD })
  if (signIn.error) fail(`Sign in ${key}: ${signIn.error.message}`)

  state.employees[key] = { id: employeeId, authUserId: data.user.id, login }
  state.tokens[key] = signIn.data.session.access_token
}

function insertShift(key, employeeKey, spec) {
  const employee = state.employees[employeeKey]
  const id = crypto.randomUUID()
  state.createdShiftIds.push(id)

  const actualStart = spec.actualStart ? `'${spec.actualStart}'::timestamptz` : 'null'
  const actualEnd = spec.actualEnd ? `'${spec.actualEnd}'::timestamptz` : 'null'

  psqlExec(`
    INSERT INTO public.academy_employee_shifts (
      id, employee_id, shift_date, status,
      planned_start_time, planned_end_time,
      actual_start_time, actual_end_time
    ) VALUES (
      '${id}', ${employee.id}, '${SHIFT_DATE}', '${spec.status}',
      '${spec.plannedStart}', '${spec.plannedEnd}',
      ${actualStart}, ${actualEnd}
    );
  `)

  state.shifts[key] = id
  return id
}

async function stageSetupFixture() {
  console.log('Stage 4: Setup fixture')

  psqlExec(`
    DELETE FROM public.academy_employee_shifts
    WHERE employee_id IN (
      SELECT id FROM public.academy_users WHERE login LIKE '${FIXTURE_TAG}-%'
    );
    DELETE FROM public.academy_users WHERE login LIKE '${FIXTURE_TAG}-%';
  `)

  state.roleIds.admin = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'admin' LIMIT 1;`)
  state.roleIds.cashier = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'cashier' LIMIT 1;`)
  if (!state.roleIds.admin || !state.roleIds.cashier) fail('Missing admin/cashier roles')

  const permExists = psqlScalar(`SELECT COUNT(*)::text FROM public.permissions WHERE code = '${PERMISSION_CODE}';`)
  assert('schedule.edit permission exists', permExists === '1')

  await createEmployee('admin', 'admin', state.roleIds.admin)
  await createEmployee('staff', 'cashier', state.roleIds.cashier)
  await createEmployee('inactive-admin', 'admin', state.roleIds.admin, 'inactive')
  await createEmployee('events', 'cashier', state.roleIds.cashier)
  await createEmployee('missed-in', 'cashier', state.roleIds.cashier)
  await createEmployee('ending', 'cashier', state.roleIds.cashier)
  await createEmployee('missed-out', 'cashier', state.roleIds.cashier)
  await createEmployee('day-off', 'cashier', state.roleIds.cashier)
  await createEmployee('completed', 'cashier', state.roleIds.cashier)
  await createEmployee('overnight', 'cashier', state.roleIds.cashier)

  insertShift('startSoon', 'events', { status: 'working', plannedStart: '09:00', plannedEnd: '18:00' })
  insertShift('missedIn', 'missed-in', {
    status: 'working',
    plannedStart: '10:00',
    plannedEnd: '19:00',
  })
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
  insertShift('dayOff', 'day-off', { status: 'day_off', plannedStart: '09:00', plannedEnd: '18:00' })
  insertShift('completed', 'completed', {
    status: 'working',
    plannedStart: '09:00',
    plannedEnd: '17:00',
    actualStart: almatyISO(SHIFT_DATE, 9, 0),
    actualEnd: almatyISO(SHIFT_DATE, 17, 0),
  })
  insertShift('overnight', 'overnight', {
    status: 'working',
    plannedStart: '22:00',
    plannedEnd: '00:00',
    actualStart: almatyISO(SHIFT_DATE, 22, 5),
  })

  const admin = adminClient()
  const { data: rules, error } = await admin
    .from('notification_rules')
    .select('id, code, template_id, module_code, event_code, offset_minutes, repeat_after_minutes, max_attempts, channels, priority')
    .like('code', 'time_tracker.rule.%')
  if (error) fail(`Load rules: ${error.message}`)
  state.rulesByEvent = {
    shift_start_soon: rules.find((r) => r.event_code === 'shift_start_soon'),
    clock_in_missing: rules.find((r) => r.event_code === 'clock_in_missing'),
    shift_end_reached: rules.find((r) => r.event_code === 'shift_end_reached'),
    clock_out_missing: rules.find((r) => r.event_code === 'clock_out_missing'),
  }

  pass('fixture employees and shifts ready')
  console.log('')
}

async function invoke({ token, body, method = 'POST' }) {
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
  return { status: response.status, json, text: JSON.stringify(json) }
}

function dryRunBody(runAt, ruleCodes = ALL_RULE_CODES) {
  return { run_at: runAt, dry_run: true, rule_codes: ruleCodes }
}

async function stageHttpAuth() {
  console.log('Stage 5: HTTP auth')

  const options = await invoke({ token: state.anonKey, method: 'OPTIONS' })
  assert('OPTIONS works', options.status === 204)

  const getRes = await invoke({ token: state.tokens.admin, method: 'GET' })
  assert('GET → 405', getRes.status === 405)

  const noJwt = await invoke({ token: null, body: dryRunBody(almatyISO(SHIFT_DATE, 8, 52)) })
  assert('POST without JWT → 401', noJwt.status === 401 && noJwt.json?.code === 'unauthorized')

  const invalidJwt = await invoke({ token: 'invalid.jwt.token', body: dryRunBody(almatyISO(SHIFT_DATE, 8, 52)) })
  assert('invalid JWT → 401', invalidJwt.status === 401)

  const staffRes = await invoke({ token: state.tokens.staff, body: dryRunBody(almatyISO(SHIFT_DATE, 8, 52)) })
  assert('staff without permission → 403', staffRes.status === 403 && staffRes.json?.code === 'forbidden')

  const inactiveRes = await invoke({
    token: state.tokens['inactive-admin'],
    body: dryRunBody(almatyISO(SHIFT_DATE, 8, 52)),
  })
  assert('inactive caller → 403', inactiveRes.status === 403 && inactiveRes.json?.code === 'inactive_caller')

  const okRes = await invoke({ token: state.tokens.admin, body: dryRunBody(almatyISO(SHIFT_DATE, 8, 52)) })
  assert('permitted active caller → 200', okRes.status === 200 && okRes.json?.ok === true)

  console.log('')
}

async function stageValidation() {
  console.log('Stage 6: Request validation')

  const token = state.tokens.admin
  const cases = [
    ['missing run_at', { dry_run: true, rule_codes: ALL_RULE_CODES }, 422],
    ['invalid run_at', { run_at: 'not-a-date', dry_run: true, rule_codes: ALL_RULE_CODES }, 422],
    ['missing dry_run', { run_at: almatyISO(SHIFT_DATE, 8, 52), rule_codes: ALL_RULE_CODES }, 422],
    ['missing rule_codes', { run_at: almatyISO(SHIFT_DATE, 8, 52), dry_run: true }, 422],
    ['empty rule_codes', { run_at: almatyISO(SHIFT_DATE, 8, 52), dry_run: true, rule_codes: [] }, 422],
    ['unknown rule code', { run_at: almatyISO(SHIFT_DATE, 8, 52), dry_run: true, rule_codes: ['time_tracker.rule.unknown'] }, 422],
    ['duplicate rule code', { run_at: almatyISO(SHIFT_DATE, 8, 52), dry_run: true, rule_codes: [ALL_RULE_CODES[0], ALL_RULE_CODES[0]] }, 422],
    ['forbidden employee_id', { run_at: almatyISO(SHIFT_DATE, 8, 52), dry_run: true, rule_codes: ALL_RULE_CODES, employee_id: 1 }, 422],
    ['forbidden title', { run_at: almatyISO(SHIFT_DATE, 8, 52), dry_run: true, rule_codes: ALL_RULE_CODES, title: 'x' }, 422],
    ['extra field', { run_at: almatyISO(SHIFT_DATE, 8, 52), dry_run: true, rule_codes: ALL_RULE_CODES, extra: true }, 422],
  ]

  for (const [name, body, status, code] of cases) {
    const res = await invoke({ token, body })
    if (res.status !== status) fail(`${name}: expected ${status}, got ${res.status}`)
    if (code && res.json?.code !== code) fail(`${name}: expected code ${code}, got ${res.json?.code}`)
    pass(name)
  }

  console.log('')
}

function countRows(table, where = '') {
  return Number(psqlScalar(`SELECT COUNT(*) FROM public.${table}${where ? ` WHERE ${where}` : ''};`))
}

async function stageDryRun() {
  console.log('Stage 7: Dry-run behavior')

  const beforeNotifications = countRows('notifications')
  const beforeDeliveries = countRows('notification_deliveries')
  const beforeSubscriptions = countRows('notification_push_subscriptions')

  const token = state.tokens.admin

  const startSoonRes = await invoke({
    token,
    body: dryRunBody(almatyISO(SHIFT_DATE, 8, 52), ['time_tracker.rule.shift_start_soon']),
  })
  assert('start soon found', startSoonRes.json?.result?.matchedEvents >= 1)

  const clockInRes = await invoke({
    token,
    body: dryRunBody(almatyISO(SHIFT_DATE, 10, 6), ['time_tracker.rule.clock_in_missing']),
  })
  assert('clock-in missing found', clockInRes.json?.result?.matchedEvents >= 1)

  const endRes = await invoke({
    token,
    body: dryRunBody(almatyISO(SHIFT_DATE, 18, 0), ['time_tracker.rule.shift_end_reached']),
  })
  assert('end reached found', endRes.json?.result?.matchedEvents >= 1)

  const clockOutRes = await invoke({
    token,
    body: dryRunBody(almatyISO(SHIFT_DATE, 18, 11), ['time_tracker.rule.clock_out_missing']),
  })
  assert('clock-out missing found', clockOutRes.json?.result?.matchedEvents >= 1)

  const dayOffEval = invokeRunner({
    action: 'evaluate',
    shiftWithEmployee: {
      id: state.shifts.dayOff,
      employee_id: state.employees['day-off'].id,
      shift_date: SHIFT_DATE,
      status: 'day_off',
      planned_start_time: '09:00:00',
      planned_end_time: '18:00:00',
      actual_start_time: null,
      actual_end_time: null,
      employee_status: 'active',
      auth_user_id: state.employees['day-off'].authUserId,
    },
    rule: state.rulesByEvent.clock_in_missing,
    runAt: almatyISO(SHIFT_DATE, 9, 30),
    existingAttempts: [],
  })
  assert('day off skipped', dayOffEval === null)

  const completedEval = invokeRunner({
    action: 'evaluate',
    shiftWithEmployee: {
      id: state.shifts.completed,
      employee_id: state.employees.completed.id,
      shift_date: SHIFT_DATE,
      status: 'working',
      planned_start_time: '09:00:00',
      planned_end_time: '17:00:00',
      actual_start_time: almatyISO(SHIFT_DATE, 9, 0),
      actual_end_time: almatyISO(SHIFT_DATE, 17, 0),
      employee_status: 'active',
      auth_user_id: state.employees.completed.authUserId,
    },
    rule: state.rulesByEvent.clock_out_missing,
    runAt: almatyISO(SHIFT_DATE, 17, 30),
    existingAttempts: [],
  })
  assert('completed shift skipped', completedEval === null)

  const midnightWindow = invokeRunner({
    action: 'buildWindow',
    shift: {
      id: state.shifts.overnight,
      employee_id: state.employees.overnight.id,
      shift_date: SHIFT_DATE,
      status: 'working',
      planned_start_time: '22:00:00',
      planned_end_time: '00:00:00',
      actual_start_time: null,
      actual_end_time: null,
    },
  })
  assert('midnight shift window correct', midnightWindow.plannedEndAt === almatyISO('2026-07-09', 0, 0))

  const midnightRes = await invoke({
    token,
    body: dryRunBody(almatyISO('2026-07-09', 0, 0), ['time_tracker.rule.shift_end_reached']),
  })
  assert('midnight shift end reached', midnightRes.json?.result?.matchedEvents >= 1)

  const allRes = await invoke({ token, body: dryRunBody(almatyISO(SHIFT_DATE, 18, 11), ALL_RULE_CODES) })
  assert('response dry_run=true', allRes.json?.dry_run === true)
  assert('counts present', typeof allRes.json?.result?.scannedShifts === 'number')
  assert('dry-run createdNotifications=0', allRes.json?.result?.createdNotifications === 0)
  assert('dry-run pushAccepted=0', allRes.json?.result?.pushAccepted === 0)
  assert('dry-run pushFailed=0', allRes.json?.result?.pushFailed === 0)
  assert('sender not called', allRes.json?.result?.pushAccepted === 0 && allRes.json?.result?.createdNotifications === 0)

  const afterNotifications = countRows('notifications')
  const afterDeliveries = countRows('notification_deliveries')
  const afterSubscriptions = countRows('notification_push_subscriptions')

  assert('notification rows unchanged', afterNotifications === beforeNotifications)
  assert('delivery rows unchanged', afterDeliveries === beforeDeliveries)
  assert('subscription rows unchanged', afterSubscriptions === beforeSubscriptions)

  const rulesEnabled = psqlScalar(
    "SELECT COUNT(*) FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%' AND is_enabled = true;"
  )
  assert('seed rules unchanged', rulesEnabled === '0')

  const forbidden = ['employee_id', 'shift_id', 'login', 'email', 'endpoint', 'p256dh', 'auth', 'uuid', 'vapid', 'jwt']
  assert(
    'response has no personal/secret fields',
    forbidden.every((tokenName) => !allRes.text.toLowerCase().includes(tokenName))
  )

  console.log('')
}

function stageSecurity() {
  console.log('Stage 8: Security static checks')

  const fnSource = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/dispatch-time-tracker-notifications/index.ts'),
    'utf8'
  )
  const srcGrep = run('grep', ['-r', '-l', '-E', 'service_role|SUPABASE_SERVICE_ROLE', 'src'], {
    capture: true,
    allowFailure: true,
  })

  assert('user_metadata not used', !fnSource.includes('user_metadata'))
  assert('select(*) absent', !fnSource.includes("select('*')"))
  assert('service_role absent in src', !srcGrep.stdout.trim())
  assert('raw DB errors not returned', fnSource.includes("adminErrorResponse('internal_error', 500)"))
  assert('forbidden employee_id in body', fnSource.includes("'employee_id'"))

  console.log('')
}

async function stageManualFixture() {
  console.log('Stage 9: Manual fixture preserved')

  const manualLogin = `${MANUAL_FIXTURE_TAG}-staff`
  const manualExists = psqlScalar(`SELECT COUNT(*)::text FROM public.academy_users WHERE login = '${manualLogin}';`)
  const manualSub = psqlScalar(`
    SELECT COUNT(*)::text FROM public.notification_push_subscriptions s
    INNER JOIN public.academy_users u ON u.id = s.employee_id
    WHERE u.login = '${manualLogin}' AND s.is_active = true;
  `)
  assert('manual web-push-manual-staff preserved', manualExists === '1')
  assert('manual browser subscription preserved', manualSub === '1')

  const fixtureNotifications = countRows(
    'notifications',
    `employee_id IN (${state.createdEmployeeIds.join(',') || '0'})`
  )
  assert('fixture notifications absent', fixtureNotifications === 0)

  console.log('')
}

async function stageCleanup() {
  console.log('Cleanup fixture data')

  const employeeIds = state.createdEmployeeIds.join(',') || '0'
  const shiftIds = state.createdShiftIds.map((id) => `'${id}'`).join(',') || "'00000000-0000-0000-0000-000000000000'"

  if (state.createdEmployeeIds.length) {
    psqlExec(`
      DELETE FROM public.notification_deliveries
      WHERE notification_id IN (SELECT id FROM public.notifications WHERE employee_id IN (${employeeIds}));
      DELETE FROM public.notifications WHERE employee_id IN (${employeeIds});
      DELETE FROM public.academy_employee_shifts WHERE id IN (${shiftIds});
      DELETE FROM public.academy_users WHERE id IN (${employeeIds});
    `)
  }

  const admin = state.apiUrl ? adminClient() : null
  if (admin) {
    for (const authUserId of state.createdAuthUserIds) {
      await admin.auth.admin.deleteUser(authUserId)
    }
  }

  console.log('Cleanup done\n')
}

main()
