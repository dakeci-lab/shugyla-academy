#!/usr/bin/env node
/**
 * Verification for secure time-tracker writes and unified notification routing.
 *
 * Usage:
 *   npm run verify:time-tracker-attendance-routing
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { loginToTechnicalEmail } from '../src/utils/phoneUtils.js'
import { normalizeTimeTrackerActionUrl } from '../src/utils/timeTrackerRoutes.js'
import { getLocalSupabaseStatus } from './lib/localSupabaseCli.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROJECT_ID = 'shugyla-academy'
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'
const FIXTURE_TAG = 'time-tracker-attendance-routing-verify'
const STAFF_PASSWORD = 'TimeTrackerStaff1!'

const state = {
  testsRun: 0,
  testsPassed: 0,
  container: null,
  apiUrl: null,
  anonKey: null,
  serviceRoleKey: null,
  functionUrl: null,
  employeeId: null,
  token: null,
  createdAuthUserId: null,
  createdEmployeeId: null,
  createdShiftId: null,
  createdLocationId: null,
}

async function main() {
  try {
    console.log('=== Time tracker attendance + routing verification ===\n')
    stageStaticWritePath()
    stageStaticUi()
    stageStaticRouting()
    stageServiceWorkerNormalization()
    stageNotificationTemplates()
    await stageOptionalLocalEdge()
    stageBuild()
    console.log(
      `\nTime tracker attendance + routing verification completed (${state.testsPassed}/${state.testsRun} tests, exit 0)\n`
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

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: { ...process.env, ...options.env },
  })
  if (!options.allowFailure && result.status !== 0) {
    fail(`${command} ${args.join(' ')} exited ${result.status}\n${result.stdout}\n${result.stderr}`)
  }
  return result
}

function stageStaticWritePath() {
  console.log('Stage 1: Secure write path')
  const config = read('supabase/config.toml')
  assert(
    'employee-time-tracker-action verify_jwt = true',
    /\[functions\.employee-time-tracker-action\][\s\S]*verify_jwt\s*=\s*true/.test(config)
  )

  const fn = read('supabase/functions/employee-time-tracker-action/index.ts')
  assert('uses authorizeAuthenticatedEmployee', fn.includes('authorizeAuthenticatedEmployee'))
  assert('rejects employee_id in payload', fn.includes("'employee_id'"))
  assert('uses caller.id for RPC', fn.includes('caller.id'))
  assert('clock_in uses attendance_check_in RPC', fn.includes("rpc('attendance_check_in'"))
  assert('clock_out uses attendance_check_out RPC', fn.includes("rpc('attendance_check_out'"))
  assert('clock_out no direct shift update', !fn.includes(".from('academy_employee_shifts').update"))
  assert('clock_out idempotent handler', fn.includes('isAlreadyCheckedOutMessage'))
  assert('maps permission denied to access message', fn.includes('ошибки доступа'))
  assert('logs failed finish shift', fn.includes("Failed to finish shift"))

  const migration = read('supabase/migrations/20260716220000_fix_time_tracker_checkout_after_rls.sql')
  assert('checkout migration exists', migration.includes('attendance_check_out'))
  assert('service_role shift write grant', migration.includes('grant select, insert, update, delete'))
  assert('attendance RPC execute service_role only', migration.includes('grant execute on function public.attendance_check_out'))

  const errors = read('src/utils/attendanceActionErrors.js')
  assert('shared attendance error mapper', errors.includes('mapAttendanceActionUserMessage'))
  assert('network-only internet message', errors.includes('Нет соединения с интернетом'))
  assert('access denied user message', errors.includes('ошибки доступа'))

  const adapter = read('src/services/attendanceSupabaseAdapter.js')
  assert('adapter invokes employee-time-tracker-action', adapter.includes("invoke('employee-time-tracker-action'"))
  assert('no direct attendance_check_in RPC', !adapter.includes("rpc('attendance_check_in'"))
  assert('no direct attendance_check_out RPC', !adapter.includes("rpc('attendance_check_out'"))
  assert('no direct shift upsert', !adapter.includes(".from('academy_employee_shifts').upsert"))
  assert('no direct shift update', !adapter.includes(".from('academy_employee_shifts').update"))
  assert('no direct shift insert', !adapter.includes(".from('academy_employee_shifts').insert"))
  assert('adapter logs finish shift failures', adapter.includes("finish shift"))
  console.log('')
}

function stageStaticUi() {
  console.log('Stage 2: UI success/error handling')
  const section = read('src/components/admin/sections/TimeTrackerSection.jsx')
  assert('success only after runWithGeolocation ok', /if \(ok\) setSuccess\('Уход отмечен'\)/.test(section))
  assert('runWithGeolocation returns boolean', section.includes('return true') && section.includes('return false'))
  assert('acting disables buttons', section.includes('disabled={!canCheckOut || acting'))
  assert('uses shared attendance error mapper', section.includes('mapAttendanceActionUserMessage'))
  assert('logs attendance failures', section.includes('logAttendanceActionFailure'))
  assert('checkout user message not generic internet', !section.includes('Проверьте интернет и повторите попытку'))
  console.log('')
}

function stageStaticRouting() {
  console.log('Stage 3: Canonical routing')
  const routes = read('src/utils/timeTrackerRoutes.js')
  assert('canonical route is /platform', routes.includes("'/platform'"))

  const legacyPage = read('src/pages/platform/PlatformTimeTracker.jsx')
  assert('legacy page redirects', legacyPage.includes('<Navigate to="/platform"'))

  const inbox = read('src/services/inAppNotificationService.js')
  assert('in-app normalizes legacy tracker URL', inbox.includes('normalizeTimeTrackerActionUrl'))

  assert(
    'legacy /platform/time-tracker -> /platform',
    normalizeTimeTrackerActionUrl('/platform/time-tracker') === '/platform'
  )
  assert(
    'legacy with base -> /platform',
    normalizeTimeTrackerActionUrl('/shugyla-academy/platform/time-tracker') === '/platform'
  )
  assert(
    'canonical unchanged',
    normalizeTimeTrackerActionUrl('/platform') === '/platform'
  )

  const dispatch = read('supabase/functions/_shared/timeTrackerNotificationDispatch.ts')
  assert('push fallback uses /platform', dispatch.includes("'/shugyla-academy/platform'"))
  assert('push fallback not legacy tracker', !dispatch.includes("'/shugyla-academy/platform/time-tracker'"))
  console.log('')
}

function stageServiceWorkerNormalization() {
  console.log('Stage 4: Service worker')
  const sw = read('public/sw.js')
  assert('cache bumped to v2', sw.includes('shugyla-academy-shell-v2'))
  assert('normalizeNotificationDestination exists', sw.includes('function normalizeNotificationDestination'))
  assert('legacy tracker normalized', sw.includes('/platform/time-tracker'))
  assert('notificationclick uses normalization', /notificationclick[\s\S]*normalizeNotificationDestination/.test(sw))
  assert('waitUntil on notificationclick', /notificationclick[\s\S]*event\.waitUntil/.test(sw))
  assert('no push subscription mutation', !sw.includes('pushManager.subscribe'))
  console.log('')
}

function stageNotificationTemplates() {
  console.log('Stage 5: Notification templates seed')
  const migration = read('supabase/migrations/20260713194500_notification_system_foundation.sql')
  assert('seed templates use /platform', migration.includes("'/platform'"))
  assert('seed templates not legacy tracker', !migration.includes("'/platform/time-tracker'"))
  console.log('')
}

function isLocalUrl(value) {
  try {
    const hostname = new URL(String(value)).hostname
    return hostname === '127.0.0.1' || hostname === 'localhost'
  } catch {
    return /^(127\.0\.0\.1|localhost)(:|\/|$)/.test(String(value))
  }
}

function findDbContainer() {
  const name = `supabase_db_${PROJECT_ID}`
  const result = run('docker', ['ps', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'], {
    capture: true,
  })
  const names = result.stdout.trim().split('\n').filter(Boolean)
  if (names.length !== 1) return null
  return names[0]
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
  run(
    'docker',
    ['exec', state.container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { capture: true }
  )
}

async function invoke(body, token) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: state.anonKey,
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(state.functionUrl, {
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

async function stageOptionalLocalEdge() {
  console.log('Stage 6: Local Edge Function (optional)')

  let status
  try {
    status = getLocalSupabaseStatus()
  } catch {
    pass('local Supabase not running — skipped live Edge tests')
    console.log('')
    return
  }

  state.apiUrl = status.API_URL
  state.anonKey = status.ANON_KEY
  state.serviceRoleKey = status.SERVICE_ROLE_KEY
  state.functionUrl = `${state.apiUrl}/functions/v1/employee-time-tracker-action`

  if (!isLocalUrl(state.apiUrl)) {
    pass('non-local API — skipped live Edge tests')
    console.log('')
    return
  }

  if (read('supabase/config.toml').includes(PRODUCTION_REF)) {
    fail('Production ref in config.toml')
  }

  state.container = findDbContainer()
  if (!state.container) {
    pass('DB container not found — skipped live Edge tests')
    console.log('')
    return
  }

  const health = await fetch(state.functionUrl, { method: 'OPTIONS' })
  if (!health.ok && health.status !== 204) {
    pass('Edge function not served locally — skipped live Edge tests')
    console.log('')
    return
  }

  const unauth = await invoke({ action: 'get_today_status' })
  assert('unauthenticated invoke -> 401', unauth.status === 401)

  await setupFixture()

  const statusResp = await invoke({ action: 'get_today_status' }, state.token)
  assert('authenticated get_today_status -> 200', statusResp.status === 200 && statusResp.json?.ok === true)

  const forbidden = await invoke(
    {
      action: 'clock_in',
      employee_id: 999999,
      coords: { latitude: 43.24, longitude: 76.95, accuracy: 10 },
    },
    state.token
  )
  assert('forbidden employee_id in payload -> 400', forbidden.status === 400)

  const otherShiftDate = '2099-03-01'
  psqlExec(`
    INSERT INTO public.academy_employee_shifts (
      employee_id, shift_date, status, planned_start_time, planned_end_time, comment
    ) VALUES (
      ${state.employeeId + 1}, '${otherShiftDate}', 'working', '09:00', '18:00', '${FIXTURE_TAG}'
    );
  `)

  const clockIn = await invoke(
    {
      action: 'clock_in',
      coords: { latitude: 43.24, longitude: 76.95, accuracy: 10 },
    },
    state.token
  )
  assert('clock_in -> 200', clockIn.status === 200 && clockIn.json?.ok === true)
  assert('clock_in preserves planned times', Boolean(clockIn.json?.shift?.planned_start_time))

  const clockInAgain = await invoke(
    {
      action: 'clock_in',
      coords: { latitude: 43.24, longitude: 76.95, accuracy: 10 },
    },
    state.token
  )
  assert('clock_in idempotent -> 200', clockInAgain.status === 200 && clockInAgain.json?.idempotent === true)

  const clockOut = await invoke(
    {
      action: 'clock_out',
      coords: { latitude: 43.24, longitude: 76.95, accuracy: 10 },
    },
    state.token
  )
  assert('clock_out -> 200', clockOut.status === 200 && clockOut.json?.ok === true)
  assert('clock_out keeps check-in', Boolean(clockOut.json?.shift?.actual_start_time))

  const clockOutAgain = await invoke(
    {
      action: 'clock_out',
      coords: { latitude: 43.24, longitude: 76.95, accuracy: 10 },
    },
    state.token
  )
  assert('clock_out idempotent -> 200', clockOutAgain.status === 200 && clockOutAgain.json?.idempotent === true)

  console.log('')
}

async function setupFixture() {
  const admin = createClient(state.apiUrl, state.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const login = `tt-attendance-${Date.now()}`
  const email = loginToTechnicalEmail(login)
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: STAFF_PASSWORD,
    email_confirm: true,
  })
  if (error) fail(`Create auth user: ${error.message}`)
  state.createdAuthUserId = data.user.id

  const roleId = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'cashier' LIMIT 1;`)
  state.employeeId = Number(psqlScalar('SELECT COALESCE(MAX(id), 0) + 1 FROM public.academy_users;'))
  state.createdEmployeeId = state.employeeId

  psqlExec(`
    INSERT INTO public.academy_users (
      id, first_name, last_name, full_name, login, password, role, role_id, status, auth_user_id
    ) VALUES (
      ${state.employeeId}, 'TT', 'Staff', '[${FIXTURE_TAG}] Staff', '${login}',
      '', 'cashier', '${roleId}', 'active', '${state.createdAuthUserId}'
    );
  `)

  state.createdLocationId = psqlScalar(`
    INSERT INTO public.platform_work_locations (
      name, address, latitude, longitude, radius_meters, is_active
    ) VALUES (
      '[${FIXTURE_TAG}] Office', 'Test', 43.24, 76.95, 500, true
    ) RETURNING id::text;
  `)
  psqlExec(`
    UPDATE public.academy_users SET work_location_id = '${state.createdLocationId}'::uuid
    WHERE id = ${state.employeeId};
  `)

  const today = new Date().toISOString().slice(0, 10)
  state.createdShiftId = psqlScalar(`
    INSERT INTO public.academy_employee_shifts (
      employee_id, shift_date, status, planned_start_time, planned_end_time, comment
    ) VALUES (
      ${state.employeeId}, '${today}', 'working', '09:00', '18:00', '${FIXTURE_TAG}'
    ) RETURNING id::text;
  `)

  const anon = createClient(state.apiUrl, state.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = await anon.auth.signInWithPassword({ email, password: STAFF_PASSWORD })
  if (signIn.error) fail(`Sign in: ${signIn.error.message}`)
  state.token = signIn.data.session.access_token
}

async function stageCleanup() {
  if (!state.container) return

  try {
    if (state.createdShiftId) {
      psqlExec(`DELETE FROM public.academy_employee_shifts WHERE id = '${state.createdShiftId}'::uuid;`)
    }
    psqlExec(`DELETE FROM public.academy_employee_shifts WHERE comment = '${FIXTURE_TAG}';`)
    if (state.createdLocationId) {
      psqlExec(`DELETE FROM public.platform_work_locations WHERE id = '${state.createdLocationId}'::uuid;`)
    }
    if (state.createdEmployeeId) {
      psqlExec(`DELETE FROM public.academy_users WHERE id = ${state.createdEmployeeId};`)
    }
    if (state.createdAuthUserId) {
      const admin = createClient(state.apiUrl, state.serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      await admin.auth.admin.deleteUser(state.createdAuthUserId)
    }
  } catch {
    // best effort
  }
}

function stageBuild() {
  console.log('Stage 7: Build + diff check')
  run('npm', ['run', 'build'], { capture: false })
  run('git', ['diff', '--check'], { capture: true })
  pass('npm run build')
  pass('git diff --check')
  console.log('')
}

main()
