#!/usr/bin/env node
/**
 * Targeted verification for time tracker notification dispatch core.
 *
 * Usage:
 *   npm run supabase:local:verify-time-tracker-dispatch-core
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
const FIXTURE_TAG = 'time-tracker-dispatch-core-verify'
const MANUAL_FIXTURE_TAG = 'web-push-manual'
const SHIFT_DATE = '2026-07-08'
const PASSWORD = 'TimeTrackerDispatch123!'

const state = {
  container: null,
  apiUrl: null,
  anonKey: null,
  serviceRoleKey: null,
  roleId: null,
  employees: {},
  shifts: {},
  rules: [],
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
    console.log('=== Time tracker dispatch core verification ===\n')
    stageEnvironment()
    await stageLoadRules()
    await stageSetupFixture()
    await stageTimezoneWindow()
    await stageRuleMatching()
    await stageRepeatsAndDedupe()
    await stageDryRun()
    await stageNormalDispatch()
    await stageDeliveryAndMetadata()
    await stageSeedAndManualFixture()
    console.log(
      `\nTime tracker dispatch core verification completed (${state.testsPassed}/${state.testsRun} tests, exit 0)\n`
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

function stageEnvironment() {
  console.log('Stage 1: Environment')
  const status = getLocalSupabaseStatus()
  state.container = findDbContainer()
  state.apiUrl = status.API_URL
  state.anonKey = status.ANON_KEY
  state.serviceRoleKey = status.SERVICE_ROLE_KEY
  assert('local Supabase API URL', state.apiUrl.includes('127.0.0.1'))
  pass('DB container found')
  psqlExec('GRANT SELECT ON public.academy_employee_shifts TO service_role;')
  pass('service_role can read employee shifts')
  console.log('')
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
  const inputPath = path.join(os.tmpdir(), `tt-dispatch-${crypto.randomUUID()}.json`)
  const outputPath = path.join(os.tmpdir(), `tt-dispatch-out-${crypto.randomUUID()}.json`)
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

function invokeRunnerParallel(payload) {
  const inputPath = path.join(os.tmpdir(), `tt-dispatch-${crypto.randomUUID()}.json`)
  const outputPath = path.join(os.tmpdir(), `tt-dispatch-out-${crypto.randomUUID()}.json`)
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
        'scripts/lib/time-tracker-dispatch-runner.ts',
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

async function stageLoadRules() {
  console.log('Stage 2: Load rules/templates from DB')
  const admin = adminClient()
  const { data, error } = await admin
    .from('notification_rules')
    .select(
      'id, code, template_id, module_code, event_code, offset_minutes, repeat_after_minutes, max_attempts, channels, priority, is_enabled'
    )
    .like('code', 'time_tracker.rule.%')
    .order('code')

  if (error) fail(`Load rules: ${error.message}`)
  if (!data?.length) fail('No time_tracker rules found')
  state.rules = data
  assert('four seed rules loaded', data.length === 4)
  assert('seed rules remain disabled', data.every((rule) => rule.is_enabled === false))
  console.log('')
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

async function createEmployee(key, status = 'active') {
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
      ${employeeId}, 'Dispatch', '${key}', '[${FIXTURE_TAG}] ${key}', '${login}',
      '', 'cashier', '${state.roleId}', '${status}', '${data.user.id}'
    );
  `)

  state.employees[key] = { id: employeeId, authUserId: data.user.id, login, status }
  return state.employees[key]
}

function insertShift(key, spec) {
  const employee = state.employees[spec.employeeKey]
  const id = crypto.randomUUID()
  state.createdShiftIds.push(id)
  state.shifts[key] = id

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

  return id
}

async function stageSetupFixture() {
  console.log('Stage 3: Setup fixture employees, shifts, subscription')

  state.roleId = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'cashier' LIMIT 1;`)
  if (!state.roleId) fail('Missing cashier role')

  await createEmployee('with-sub')
  await createEmployee('no-sub')
  await createEmployee('inactive', 'inactive')
  await createEmployee('ending')
  await createEmployee('missed-out')
  await createEmployee('checked-in')
  await createEmployee('completed')
  await createEmployee('day-off')
  await createEmployee('vacation')
  await createEmployee('overnight')
  await createEmployee('repeat')
  await createEmployee('inactive-shift', 'inactive')

  insertShift('startSoon', {
    employeeKey: 'with-sub',
    status: 'working',
    plannedStart: '09:00',
    plannedEnd: '18:00',
  })
  insertShift('noSub', {
    employeeKey: 'no-sub',
    status: 'working',
    plannedStart: '10:00',
    plannedEnd: '19:00',
  })
  insertShift('inactiveShift', {
    employeeKey: 'inactive-shift',
    status: 'working',
    plannedStart: '09:00',
    plannedEnd: '18:00',
  })
  insertShift('ending', {
    employeeKey: 'ending',
    status: 'working',
    plannedStart: '09:00',
    plannedEnd: '18:00',
    actualStart: almatyISO(SHIFT_DATE, 9, 5),
  })
  insertShift('missedOut', {
    employeeKey: 'missed-out',
    status: 'working',
    plannedStart: '09:00',
    plannedEnd: '18:00',
    actualStart: almatyISO(SHIFT_DATE, 9, 5),
  })
  insertShift('checkedIn', {
    employeeKey: 'checked-in',
    status: 'working',
    plannedStart: '11:00',
    plannedEnd: '20:00',
    actualStart: almatyISO(SHIFT_DATE, 11, 5),
  })
  insertShift('completed', {
    employeeKey: 'completed',
    status: 'working',
    plannedStart: '09:00',
    plannedEnd: '17:00',
    actualStart: almatyISO(SHIFT_DATE, 9, 0),
    actualEnd: almatyISO(SHIFT_DATE, 17, 0),
  })
  insertShift('dayOff', {
    employeeKey: 'day-off',
    status: 'day_off',
    plannedStart: '09:00',
    plannedEnd: '18:00',
  })
  insertShift('vacation', {
    employeeKey: 'vacation',
    status: 'vacation',
    plannedStart: '09:00',
    plannedEnd: '18:00',
  })
  insertShift('overnight', {
    employeeKey: 'overnight',
    status: 'working',
    plannedStart: '22:00',
    plannedEnd: '00:00',
  })
  insertShift('repeat', {
    employeeKey: 'repeat',
    status: 'working',
    plannedStart: '14:00',
    plannedEnd: '22:00',
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

function shiftRow(key, employeeKey, spec) {
  return {
    id: state.shifts[key],
    employee_id: state.employees[employeeKey].id,
    shift_date: SHIFT_DATE,
    status: spec.status,
    planned_start_time: spec.plannedStart,
    planned_end_time: spec.plannedEnd,
    actual_start_time: spec.actualStart ?? null,
    actual_end_time: spec.actualEnd ?? null,
  }
}

function shiftWithEmployee(key, employeeKey, spec) {
  const employee = state.employees[employeeKey]
  return {
    ...shiftRow(key, employeeKey, spec),
    employee_status: employee.status ?? 'active',
    auth_user_id: employee.authUserId,
  }
}

async function stageTimezoneWindow() {
  console.log('Stage 4: Asia/Almaty window + midnight end')

  const normal = invokeRunner({
    action: 'buildWindow',
    shift: shiftRow('startSoon', 'with-sub', {
      status: 'working',
      plannedStart: '09:00:00',
      plannedEnd: '18:00:00',
    }),
  })
  assert('Asia/Almaty start datetime', normal.plannedStartAt === almatyISO(SHIFT_DATE, 9, 0))
  assert('normal end datetime', normal.plannedEndAt === almatyISO(SHIFT_DATE, 18, 0))

  const overnight = invokeRunner({
    action: 'buildWindow',
    shift: shiftRow('overnight', 'overnight', {
      status: 'working',
      plannedStart: '22:00:00',
      plannedEnd: '00:00:00',
    }),
  })
  assert('midnight end = next day', overnight.plannedEndAt === almatyISO('2026-07-09', 0, 0))

  console.log('')
}

async function stageRuleMatching() {
  console.log('Stage 5: Rule matching')

  const startSoonRule = ruleByEvent('shift_start_soon')
  const startSoonMatch = invokeRunner({
    action: 'evaluate',
    shiftWithEmployee: shiftWithEmployee('startSoon', 'with-sub', {
      status: 'working',
      plannedStart: '09:00:00',
      plannedEnd: '18:00:00',
    }),
    rule: startSoonRule,
    runAt: almatyISO(SHIFT_DATE, 8, 52),
    existingAttempts: [],
  })
  assert('start soon matched', startSoonMatch?.eventCode === 'shift_start_soon')

  const startSoonBlocked = invokeRunner({
    action: 'evaluate',
    shiftWithEmployee: shiftWithEmployee('checkedIn', 'checked-in', {
      status: 'working',
      plannedStart: '11:00:00',
      plannedEnd: '20:00:00',
      actualStart: almatyISO(SHIFT_DATE, 11, 5),
    }),
    rule: startSoonRule,
    runAt: almatyISO(SHIFT_DATE, 10, 52),
    existingAttempts: [],
  })
  assert('start soon not matched after actual_start', startSoonBlocked === null)

  const clockInRule = ruleByEvent('clock_in_missing')
  const clockInMatch = invokeRunner({
    action: 'evaluate',
    shiftWithEmployee: shiftWithEmployee('startSoon', 'with-sub', {
      status: 'working',
      plannedStart: '09:00:00',
      plannedEnd: '18:00:00',
    }),
    rule: clockInRule,
    runAt: almatyISO(SHIFT_DATE, 9, 6),
    existingAttempts: [],
  })
  assert('clock-in missing matched', clockInMatch?.attempt === 1)

  const dayOffMatch = invokeRunner({
    action: 'evaluate',
    shiftWithEmployee: shiftWithEmployee('dayOff', 'day-off', {
      status: 'day_off',
      plannedStart: '09:00:00',
      plannedEnd: '18:00:00',
    }),
    rule: clockInRule,
    runAt: almatyISO(SHIFT_DATE, 9, 30),
    existingAttempts: [],
  })
  assert('day off skipped', dayOffMatch === null)

  const vacationMatch = invokeRunner({
    action: 'evaluate',
    shiftWithEmployee: shiftWithEmployee('vacation', 'vacation', {
      status: 'vacation',
      plannedStart: '09:00:00',
      plannedEnd: '18:00:00',
    }),
    rule: clockInRule,
    runAt: almatyISO(SHIFT_DATE, 9, 30),
    existingAttempts: [],
  })
  assert('vacation skipped', vacationMatch === null)

  const inactiveMatch = invokeRunner({
    action: 'evaluate',
    shiftWithEmployee: {
      ...shiftRow('inactiveShift', 'inactive-shift', {
        status: 'working',
        plannedStart: '09:00:00',
        plannedEnd: '18:00:00',
      }),
      employee_status: 'inactive',
      auth_user_id: state.employees['inactive-shift'].authUserId,
    },
    rule: clockInRule,
    runAt: almatyISO(SHIFT_DATE, 9, 30),
    existingAttempts: [],
  })
  assert('inactive employee skipped', inactiveMatch === null)

  const endRule = ruleByEvent('shift_end_reached')
  const endWithoutStart = invokeRunner({
    action: 'evaluate',
    shiftWithEmployee: shiftWithEmployee('startSoon', 'with-sub', {
      status: 'working',
      plannedStart: '09:00:00',
      plannedEnd: '18:00:00',
    }),
    rule: endRule,
    runAt: almatyISO(SHIFT_DATE, 18, 0),
    existingAttempts: [],
  })
  assert('end reached requires actual_start', endWithoutStart === null)

  const endMatch = invokeRunner({
    action: 'evaluate',
    shiftWithEmployee: shiftWithEmployee('ending', 'ending', {
      status: 'working',
      plannedStart: '09:00:00',
      plannedEnd: '18:00:00',
      actualStart: almatyISO(SHIFT_DATE, 9, 5),
    }),
    rule: endRule,
    runAt: almatyISO(SHIFT_DATE, 18, 0),
    existingAttempts: [],
  })
  assert('end reached matched', endMatch?.eventCode === 'shift_end_reached')

  const clockOutRule = ruleByEvent('clock_out_missing')
  const clockOutMatch = invokeRunner({
    action: 'evaluate',
    shiftWithEmployee: shiftWithEmployee('missedOut', 'missed-out', {
      status: 'working',
      plannedStart: '09:00:00',
      plannedEnd: '18:00:00',
      actualStart: almatyISO(SHIFT_DATE, 9, 5),
    }),
    rule: clockOutRule,
    runAt: almatyISO(SHIFT_DATE, 18, 11),
    existingAttempts: [],
  })
  assert('clock-out missing matched', clockOutMatch?.attempt === 1)

  const completedMatch = invokeRunner({
    action: 'evaluate',
    shiftWithEmployee: shiftWithEmployee('completed', 'completed', {
      status: 'working',
      plannedStart: '09:00:00',
      plannedEnd: '17:00:00',
      actualStart: almatyISO(SHIFT_DATE, 9, 0),
      actualEnd: almatyISO(SHIFT_DATE, 17, 0),
    }),
    rule: clockOutRule,
    runAt: almatyISO(SHIFT_DATE, 17, 30),
    existingAttempts: [],
  })
  assert('completed shift skipped', completedMatch === null)

  console.log('')
}

async function stageRepeatsAndDedupe() {
  console.log('Stage 6: Repeats, dedupe, race')

  const clockInRule = ruleByEvent('clock_in_missing')
  const repeatShiftId = state.shifts.repeat
  const employeeId = state.employees.repeat.id

  const attempt1 = invokeRunner({
    action: 'dispatch',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 14, 6),
    rules: [clockInRule],
    shiftIds: [repeatShiftId],
    mockSender: 'noop',
  })
  assert('attempt 1 created', attempt1.createdNotifications === 1)

  const expectedKey = `time_tracker:clock_in_missing:${employeeId}:${repeatShiftId}:a1`
  const keyInDb = psqlScalar(
    `SELECT deduplication_key FROM public.notifications WHERE deduplication_key = '${expectedKey}';`
  )
  assert('deduplication_key correct', keyInDb === expectedKey)

  psqlExec(`
    UPDATE public.notifications
    SET created_at = '${almatyISO(SHIFT_DATE, 14, 6)}'
    WHERE deduplication_key = '${expectedKey}';
  `)

  const attempt2Early = invokeRunner({
    action: 'dispatch',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 14, 12),
    rules: [clockInRule],
    shiftIds: [repeatShiftId],
    mockSender: 'noop',
  })
  assert('attempt 2 only after repeat interval', attempt2Early.createdNotifications === 0)

  const attempt2 = invokeRunner({
    action: 'dispatch',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 14, 20),
    rules: [clockInRule],
    shiftIds: [repeatShiftId],
    mockSender: 'noop',
  })
  assert('attempt 2 created', attempt2.createdNotifications === 1)

  psqlExec(`
    UPDATE public.notifications
    SET created_at = '${almatyISO(SHIFT_DATE, 14, 20)}'
    WHERE deduplication_key = 'time_tracker:clock_in_missing:${employeeId}:${repeatShiftId}:a2';
  `)

  const attempt3 = invokeRunner({
    action: 'dispatch',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 14, 40),
    rules: [clockInRule],
    shiftIds: [repeatShiftId],
    mockSender: 'noop',
  })
  assert('attempt 3 not created', attempt3.createdNotifications === 0)

  psqlExec(`
    DELETE FROM public.notification_deliveries
    WHERE notification_id IN (
      SELECT id FROM public.notifications WHERE deduplication_key LIKE 'time_tracker:shift_start_soon:${state.employees['with-sub'].id}:${state.shifts.startSoon}%'
        OR deduplication_key = 'time_tracker:shift_start_soon:${state.employees['with-sub'].id}:${state.shifts.startSoon}'
    );
    DELETE FROM public.notifications
    WHERE deduplication_key = 'time_tracker:shift_start_soon:${state.employees['with-sub'].id}:${state.shifts.startSoon}';
  `)

  const startSoonRule = ruleByEvent('shift_start_soon')
  invokeRunner({
    action: 'dispatch',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 8, 52),
    rules: [startSoonRule],
    shiftIds: [state.shifts.startSoon],
    mockSender: 'accepted',
  })

  const duplicateRun = invokeRunner({
    action: 'dispatch',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 8, 52),
    rules: [startSoonRule],
    shiftIds: [state.shifts.startSoon],
    mockSender: 'accepted',
  })
  assert('repeat run skips duplicate', duplicateRun.skippedDuplicates >= 1)

  psqlExec(`
    DELETE FROM public.notification_deliveries
    WHERE notification_id IN (
      SELECT id FROM public.notifications WHERE deduplication_key LIKE 'time_tracker:clock_in_missing:${employeeId}:${repeatShiftId}%'
    );
    DELETE FROM public.notifications
    WHERE deduplication_key LIKE 'time_tracker:clock_in_missing:${employeeId}:${repeatShiftId}%';
  `)

  const racePayload = {
    action: 'dispatch',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 14, 6),
    rules: [clockInRule],
    shiftIds: [repeatShiftId],
    mockSender: 'noop',
  }

  const [raceA, raceB] = await Promise.all([
    invokeRunnerParallel(racePayload),
    invokeRunnerParallel(racePayload),
  ])
  const raceCreated = raceA.createdNotifications + raceB.createdNotifications
  const raceSkipped = raceA.skippedDuplicates + raceB.skippedDuplicates
  const raceRows = psqlScalar(`
    SELECT COUNT(*)::text FROM public.notifications
    WHERE deduplication_key = 'time_tracker:clock_in_missing:${employeeId}:${repeatShiftId}:a1';
  `)
  assert('UNIQUE race creates single notification row', raceRows === '1')
  assert(
    'UNIQUE race treated as duplicate',
    raceCreated <= 1 && (raceSkipped >= 1 || raceCreated === 1)
  )

  console.log('')
}

async function stageDryRun() {
  console.log('Stage 7: dryRun')

  const beforeNotifications = Number(
    psqlScalar(`SELECT COUNT(*) FROM public.notifications WHERE metadata->>'source' = 'time_tracker_dispatcher';`)
  )
  const beforeDeliveries = Number(
    psqlScalar(`SELECT COUNT(*) FROM public.notification_deliveries WHERE request_id IS NOT NULL;`)
  )

  const dryRun = invokeRunner({
    action: 'dispatch',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 8, 52),
    rules: state.rules,
    dryRun: true,
    mockSender: 'noop',
  })

  assert('dryRun returns counts', typeof dryRun.scannedShifts === 'number' && dryRun.matchedEvents >= 1)
  assert('dryRun sender not called', dryRun.senderCalls === 0)

  const afterNotifications = Number(
    psqlScalar(`SELECT COUNT(*) FROM public.notifications WHERE metadata->>'source' = 'time_tracker_dispatcher';`)
  )
  const afterDeliveries = Number(
    psqlScalar(`SELECT COUNT(*) FROM public.notification_deliveries WHERE request_id IS NOT NULL;`)
  )
  assert('dryRun no notification writes', afterNotifications === beforeNotifications)
  assert('dryRun no delivery writes', afterDeliveries === beforeDeliveries)

  console.log('')
}

async function stageNormalDispatch() {
  console.log('Stage 8: Normal dispatch + in-app without subscription')

  psqlExec(`
    DELETE FROM public.notification_deliveries
    WHERE notification_id IN (
      SELECT id FROM public.notifications
      WHERE employee_id IN (${state.employees['with-sub'].id}, ${state.employees['no-sub'].id})
        AND module_code = 'time_tracker'
    );
    DELETE FROM public.notifications
    WHERE employee_id IN (${state.employees['with-sub'].id}, ${state.employees['no-sub'].id})
      AND module_code = 'time_tracker';
  `)

  const withSub = invokeRunner({
    action: 'dispatch',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 8, 52),
    rules: [ruleByEvent('shift_start_soon')],
    shiftIds: [state.shifts.startSoon],
    mockSender: 'accepted',
  })
  assert('mock accepted dispatch', withSub.pushAccepted >= 1)

  const noSub = invokeRunner({
    action: 'dispatch',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 10, 6),
    rules: [ruleByEvent('clock_in_missing')],
    shiftIds: [state.shifts.noSub],
    mockSender: 'accepted',
  })
  assert('in-app notification without subscription', noSub.createdNotifications === 1)
  assert('noActiveSubscriptions incremented', noSub.noActiveSubscriptions === 1)
  assert('no push without subscription', noSub.pushAccepted === 0)

  const noSubStatus = psqlScalar(`
    SELECT status FROM public.notifications
    WHERE employee_id = ${state.employees['no-sub'].id}
      AND module_code = 'time_tracker'
    ORDER BY created_at DESC LIMIT 1;
  `)
  assert('in-app notification dispatched status', noSubStatus === 'dispatched')

  console.log('')
}

async function stageDeliveryAndMetadata() {
  console.log('Stage 9: Delivery outcomes + metadata safety')

  psqlExec(`
    DELETE FROM public.notification_deliveries
    WHERE subscription_id = '${state.subscriptionId}';
    DELETE FROM public.notifications
    WHERE employee_id = ${state.employees['with-sub'].id} AND module_code = 'time_tracker';
    UPDATE public.notification_push_subscriptions
    SET is_active = true, permission_status = 'granted', revoked_at = null
    WHERE id = '${state.subscriptionId}';
  `)

  const retryable = invokeRunner({
    action: 'dispatch',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 8, 52),
    rules: [ruleByEvent('shift_start_soon')],
    shiftIds: [state.shifts.startSoon],
    mockSender: 'retryable',
  })
  assert('mock retryable failed delivery', retryable.pushFailed >= 1)

  const retryableStatus = psqlScalar(`
    SELECT status FROM public.notification_deliveries
    WHERE subscription_id = '${state.subscriptionId}'
    ORDER BY created_at DESC LIMIT 1;
  `)
  assert('retryable delivery status', retryableStatus === 'retryable')

  const subStillActive = psqlScalar(`
    SELECT is_active::text FROM public.notification_push_subscriptions WHERE id = '${state.subscriptionId}';
  `)
  assert('retryable does not disable subscription', subStillActive === 'true')

  psqlExec(`
    DELETE FROM public.notification_deliveries WHERE subscription_id = '${state.subscriptionId}';
    DELETE FROM public.notifications WHERE employee_id = ${state.employees['with-sub'].id} AND module_code = 'time_tracker';
    UPDATE public.notification_push_subscriptions
    SET is_active = true, permission_status = 'granted', revoked_at = null
    WHERE id = '${state.subscriptionId}';
  `)

  const expired = invokeRunner({
    action: 'dispatch',
    supabaseUrl: state.apiUrl,
    serviceRoleKey: state.serviceRoleKey,
    runAt: almatyISO(SHIFT_DATE, 8, 52),
    rules: [ruleByEvent('shift_start_soon')],
    shiftIds: [state.shifts.startSoon],
    mockSender: 'subscription_expired',
  })
  assert('mock 410 disables subscription', expired.pushFailed >= 1)

  const subDisabled = psqlScalar(`
    SELECT is_active::text FROM public.notification_push_subscriptions WHERE id = '${state.subscriptionId}';
  `)
  assert('subscription disabled after 410', subDisabled === 'false')

  const deliveryColumns = psqlScalar(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notification_deliveries'
      AND column_name IN ('endpoint', 'p256dh_key', 'auth_key');
  `)
  assert('delivery table has no endpoint/keys columns', deliveryColumns === '')

  const metadata = psqlScalar(`
    SELECT metadata::text FROM public.notifications
    WHERE employee_id = ${state.employees['with-sub'].id}
      AND module_code = 'time_tracker'
    ORDER BY created_at DESC LIMIT 1;
  `)
  const forbidden = ['login', 'email', 'phone', 'endpoint', 'p256dh', 'auth', 'jwt', 'vapid']
  assert(
    'metadata has no personal/secret fields',
    forbidden.every((token) => !metadata.toLowerCase().includes(token))
  )

  console.log('')
}

async function stageSeedAndManualFixture() {
  console.log('Stage 10: Seed rules + manual fixture preserved')

  const enabledCount = psqlScalar(
    "SELECT COUNT(*) FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%' AND is_enabled = true;"
  )
  assert('seed rules enabled count remains 0', enabledCount === '0')

  const manualLogin = `${MANUAL_FIXTURE_TAG}-staff`
  const manualExists = psqlScalar(
    `SELECT COUNT(*)::text FROM public.academy_users WHERE login = '${manualLogin}';`
  )
  const manualSub = psqlScalar(`
    SELECT COUNT(*)::text FROM public.notification_push_subscriptions s
    INNER JOIN public.academy_users u ON u.id = s.employee_id
    WHERE u.login = '${manualLogin}' AND s.is_active = true;
  `)
  assert('manual web-push fixture preserved', manualExists === '1')
  assert('manual browser subscription preserved', manualSub === '1')

  console.log('')
}

async function stageCleanup() {
  console.log('Cleanup fixture data')

  const employeeIds = state.createdEmployeeIds.join(',') || '0'
  const shiftIds = state.createdShiftIds.map((id) => `'${id}'`).join(',') || "'00000000-0000-0000-0000-000000000000'"
  const subIds = state.createdSubscriptionIds.map((id) => `'${id}'`).join(',') || "'00000000-0000-0000-0000-000000000000'"

  if (state.createdEmployeeIds.length) {
    psqlExec(`
      DELETE FROM public.notification_deliveries
      WHERE notification_id IN (
        SELECT id FROM public.notifications WHERE employee_id IN (${employeeIds})
      );
      DELETE FROM public.notifications WHERE employee_id IN (${employeeIds});
      DELETE FROM public.notification_push_subscriptions WHERE employee_id IN (${employeeIds});
      DELETE FROM public.academy_employee_shifts WHERE id IN (${shiftIds});
      DELETE FROM public.academy_users WHERE id IN (${employeeIds});
    `)
  }

  if (state.createdSubscriptionIds.length) {
    psqlExec(`DELETE FROM public.notification_push_subscriptions WHERE id IN (${subIds});`)
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
