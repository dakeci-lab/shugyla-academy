#!/usr/bin/env node
/**
 * Local verification for admin-manage-employee-schedule Edge Function.
 *
 * Usage:
 *   npm run supabase:local:verify-employee-schedule-write
 *
 * Requires local Supabase + Edge Functions.
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
const FIXTURE_TAG = 'schedule-write-verify'
const ADMIN_PASSWORD = 'TeamWorkforceAdmin1!'
const STAFF_PASSWORD = 'TeamWorkforceStaff1!'
const FLOOR_PASSWORD = 'TeamWorkforceFloor1!'

const TEST_DATE = '2099-02-10'
const TEST_DATE_BULK_A = '2099-02-11'
const TEST_DATE_BULK_B = '2099-02-12'
const TEST_DATE_ACTUAL = '2099-02-13'

const state = {
  container: null,
  apiUrl: null,
  anonKey: null,
  serviceRoleKey: null,
  scheduleUrl: null,
  roleIds: {},
  employeeIds: {},
  tokens: {},
  createdAuthUserIds: [],
  createdEmployeeIds: [],
  createdShiftIds: [],
  testsRun: 0,
  testsPassed: 0,
}

async function main() {
  try {
    console.log('=== Employee schedule write verification ===\n')
    await stageEnvironment()
    stageServiceRoleNotInSrc()
    stageFunctionConfig()
    stageStaticFrontend()
    await stageSetupFixture()
    await stageAuthorization()
    await stageSingleUpsert()
    await stageActualPreservation()
    await stageBulkUpsert()
    await stageValidation()
    console.log(
      `\nEmployee schedule write verification completed (${state.testsPassed}/${state.testsRun} tests, exit 0)\n`
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
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: { ...process.env, ...options.env },
  })
  if (!options.allowFailure && result.status !== 0) {
    fail(`${command} ${args.join(' ')} exited ${result.status}\n${result.stdout}\n${result.stderr}`)
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
  run(
    'docker',
    ['exec', state.container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { capture: true }
  )
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

function nextEmployeeId() {
  return Number(psqlScalar('SELECT COALESCE(MAX(id), 0) + 1 FROM public.academy_users;'))
}

async function invoke(url, { token, body, method = 'POST' } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: state.anonKey,
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(url, {
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

function workingShift(date) {
  return {
    shift_date: date,
    status: 'working',
    planned_start_time: '09:00',
    planned_end_time: '18:00',
    comment: 'verify',
  }
}

function isLocalUrl(value) {
  try {
    const hostname = new URL(String(value)).hostname
    return hostname === '127.0.0.1' || hostname === 'localhost'
  } catch {
    return /^(127\.0\.0\.1|localhost)(:|\/|$)/.test(String(value))
  }
}

async function stageEnvironment() {
  console.log('Stage 1: Environment')
  const status = getLocalSupabaseStatus()
  state.apiUrl = status.API_URL
  state.anonKey = status.ANON_KEY
  state.serviceRoleKey = status.SERVICE_ROLE_KEY
  state.scheduleUrl = `${state.apiUrl}/functions/v1/admin-manage-employee-schedule`

  if (!isLocalUrl(state.apiUrl)) {
    fail(`API URL must be local, got ${state.apiUrl}`)
  }

  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
  if (config.includes(PRODUCTION_REF)) fail('Production ref in config.toml')

  state.container = findDbContainer()
  pass('local environment verified')
  console.log('')
}

function pass(name) {
  state.testsRun += 1
  state.testsPassed += 1
  console.log(`  ✓ ${name}`)
}

function stageServiceRoleNotInSrc() {
  console.log('Stage 2: service_role not in frontend src')
  const result = run(
    'grep',
    ['-r', '-l', '-E', 'service_role|SUPABASE_SERVICE_ROLE', 'src'],
    { capture: true, allowFailure: true }
  )
  assert('service_role absent in src', !result.stdout.trim())
  console.log('')
}

function stageFunctionConfig() {
  console.log('Stage 3: Function config')
  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
  assert(
    'admin-manage-employee-schedule verify_jwt = true',
    /\[functions\.admin-manage-employee-schedule\][\s\S]*verify_jwt\s*=\s*true/.test(config)
  )
  const fnSource = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/admin-manage-employee-schedule/index.ts'),
    'utf8'
  )
  assert('checks schedule.edit', fnSource.includes("'schedule.edit'"))
  assert('checks schedule.bulk_edit', fnSource.includes("'schedule.bulk_edit'"))
  assert('uses service role inside function', fnSource.includes('serviceClient'))
  assert('preserves actual timestamps helper', fs
    .readFileSync(path.join(ROOT, 'supabase/functions/_shared/employeeScheduleWrite.ts'), 'utf8')
    .includes('pickPreservedActual'))
  console.log('')
}

function stageStaticFrontend() {
  console.log('Stage 4: Frontend static checks')
  const adapter = fs.readFileSync(path.join(ROOT, 'src/services/shiftSupabaseAdapter.js'), 'utf8')
  assert('adapter invokes admin-manage-employee-schedule', adapter.includes("invoke('admin-manage-employee-schedule'"))
  assert('adapter no direct upsert to shifts table', !adapter.includes(".from('academy_employee_shifts').upsert"))
  assert('upsert_shift action wired', adapter.includes("'upsert_shift'"))
  assert('bulk_upsert_shifts action wired', adapter.includes("'bulk_upsert_shifts'"))
  console.log('')
}

async function createCaller(spec) {
  const admin = adminClient()
  const email = loginToTechnicalEmail(spec.login)
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: spec.password,
    email_confirm: true,
  })
  if (error) fail(`Create auth ${spec.key}: ${error.message}`)
  state.createdAuthUserIds.push(data.user.id)

  const employeeId = nextEmployeeId()
  state.createdEmployeeIds.push(employeeId)
  psqlExec(`
    INSERT INTO public.academy_users (
      id, first_name, last_name, full_name, login, password, role, role_id, status, auth_user_id
    ) VALUES (
      ${employeeId}, '${spec.firstName}', '${spec.lastName}', '[${FIXTURE_TAG}] ${spec.key}', '${spec.login}',
      '', '${spec.role}', '${spec.roleId}', '${spec.status}', '${data.user.id}'
    );
  `)

  const anon = createClient(state.apiUrl, state.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = await anon.auth.signInWithPassword({ email, password: spec.password })
  if (signIn.error) fail(`Sign in ${spec.key}: ${signIn.error.message}`)
  state.tokens[spec.key] = signIn.data.session.access_token
  state.employeeIds[spec.key] = employeeId
  return employeeId
}

async function stageSetupFixture() {
  console.log('Stage 5: Setup fixture')

  state.roleIds.admin = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'admin' LIMIT 1;`)
  state.roleIds.cashier = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'cashier' LIMIT 1;`)
  state.roleIds.floor_admin = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'floor_admin' LIMIT 1;`)
  if (!state.roleIds.admin || !state.roleIds.cashier || !state.roleIds.floor_admin) {
    fail('Missing admin/cashier/floor_admin roles')
  }

  await createCaller({
    key: 'admin',
    login: `${FIXTURE_TAG}-admin`,
    firstName: 'Schedule',
    lastName: 'Admin',
    role: 'admin',
    roleId: state.roleIds.admin,
    password: ADMIN_PASSWORD,
    status: 'active',
  })

  await createCaller({
    key: 'floorAdmin',
    login: `${FIXTURE_TAG}-floor`,
    firstName: 'Schedule',
    lastName: 'Floor',
    role: 'floor_admin',
    roleId: state.roleIds.floor_admin,
    password: FLOOR_PASSWORD,
    status: 'active',
  })

  await createCaller({
    key: 'staff',
    login: `${FIXTURE_TAG}-staff`,
    firstName: 'Schedule',
    lastName: 'Staff',
    role: 'cashier',
    roleId: state.roleIds.cashier,
    password: STAFF_PASSWORD,
    status: 'active',
  })

  const peerId = nextEmployeeId()
  state.createdEmployeeIds.push(peerId)
  psqlExec(`
    INSERT INTO public.academy_users (
      id, first_name, last_name, full_name, login, password, role, role_id, status
    ) VALUES (
      ${peerId}, 'Peer', 'Worker', '[${FIXTURE_TAG}] peer', '${FIXTURE_TAG}-peer',
      '', 'cashier', '${state.roleIds.cashier}', 'active'
    );
  `)
  state.employeeIds.peer = peerId

  pass('fixture employees created')
  console.log('')
}

async function stageAuthorization() {
  console.log('Stage 6: Authorization')

  const noJwt = await invoke(state.scheduleUrl, {
    body: {
      action: 'upsert_shift',
      employee_id: state.employeeIds.peer,
      shift: workingShift(TEST_DATE),
    },
  })
  assert('no JWT -> 401', noJwt.status === 401)

  const staffWrite = await invoke(state.scheduleUrl, {
    token: state.tokens.staff,
    body: {
      action: 'upsert_shift',
      employee_id: state.employeeIds.peer,
      shift: workingShift(TEST_DATE),
    },
  })
  assert('staff upsert other employee -> 403', staffWrite.status === 403)

  console.log('')
}

async function stageSingleUpsert() {
  console.log('Stage 7: Single upsert CRUD')

  const createRes = await invoke(state.scheduleUrl, {
    token: state.tokens.admin,
    body: {
      action: 'upsert_shift',
      employee_id: state.employeeIds.peer,
      shift: workingShift(TEST_DATE),
    },
  })
  assert('admin create shift -> 200', createRes.status === 200 && createRes.json?.ok === true)
  assert('response includes shift id', Boolean(createRes.json?.shift?.id))

  const updateRes = await invoke(state.scheduleUrl, {
    token: state.tokens.admin,
    body: {
      action: 'upsert_shift',
      employee_id: state.employeeIds.peer,
      shift: {
        ...workingShift(TEST_DATE),
        planned_start_time: '10:00',
        comment: 'updated',
      },
    },
  })
  assert('admin update shift -> 200', updateRes.status === 200 && updateRes.json?.ok === true)
  assert('updated planned start', updateRes.json?.shift?.planned_start_time?.startsWith('10:00'))

  const deleteRes = await invoke(state.scheduleUrl, {
    token: state.tokens.admin,
    body: {
      action: 'upsert_shift',
      employee_id: state.employeeIds.peer,
      shift: {
        shift_date: TEST_DATE,
        status: 'day_off',
        planned_start_time: null,
        planned_end_time: null,
        comment: 'day off',
      },
    },
  })
  assert('admin mark day off -> 200', deleteRes.status === 200)
  assert('status day_off', deleteRes.json?.shift?.status === 'day_off')

  const floorRes = await invoke(state.scheduleUrl, {
    token: state.tokens.floorAdmin,
    body: {
      action: 'upsert_shift',
      employee_id: state.employeeIds.peer,
      shift: workingShift(TEST_DATE),
    },
  })
  assert('floor admin single upsert -> 200', floorRes.status === 200)

  console.log('')
}

async function stageActualPreservation() {
  console.log('Stage 8: Actual timestamp preservation')

  const shiftId = crypto.randomUUID()
  state.createdShiftIds.push(shiftId)
  psqlExec(`
    INSERT INTO public.academy_employee_shifts (
      id, employee_id, shift_date, status, planned_start_time, planned_end_time,
      actual_start_time, comment
    ) VALUES (
      '${shiftId}', ${state.employeeIds.peer}, '${TEST_DATE_ACTUAL}', 'working', '09:00', '18:00',
      '2026-07-15T04:00:00+00:00', 'seed-actual'
    );
  `)

  const planOnly = await invoke(state.scheduleUrl, {
    token: state.tokens.admin,
    body: {
      action: 'upsert_shift',
      employee_id: state.employeeIds.peer,
      shift: {
        shift_date: TEST_DATE_ACTUAL,
        status: 'working',
        planned_start_time: '08:30',
        planned_end_time: '17:30',
        actual_start_time: null,
        actual_end_time: null,
        comment: 'plan-only',
      },
    },
  })
  assert('plan-only upsert -> 200', planOnly.status === 200)
  assert('actual start preserved', Boolean(planOnly.json?.shift?.actual_start_time))
  assert('planned start updated', planOnly.json?.shift?.planned_start_time?.startsWith('08:30'))

  console.log('')
}

async function stageBulkUpsert() {
  console.log('Stage 9: Bulk upsert permissions and behavior')

  const floorBulk = await invoke(state.scheduleUrl, {
    token: state.tokens.floorAdmin,
    body: {
      action: 'bulk_upsert_shifts',
      employee_id: state.employeeIds.peer,
      overwrite: false,
      shifts: [workingShift(TEST_DATE_BULK_A), workingShift(TEST_DATE_BULK_B)],
    },
  })
  assert('floor admin bulk without bulk_edit -> 403', floorBulk.status === 403)

  const adminBulk = await invoke(state.scheduleUrl, {
    token: state.tokens.admin,
    body: {
      action: 'bulk_upsert_shifts',
      employee_id: state.employeeIds.peer,
      overwrite: false,
      shifts: [workingShift(TEST_DATE_BULK_A), workingShift(TEST_DATE_BULK_B)],
    },
  })
  assert('admin bulk create -> 200', adminBulk.status === 200 && adminBulk.json?.applied === 2)

  const skipExisting = await invoke(state.scheduleUrl, {
    token: state.tokens.admin,
    body: {
      action: 'bulk_upsert_shifts',
      employee_id: state.employeeIds.peer,
      overwrite: false,
      shifts: [workingShift(TEST_DATE_BULK_A)],
    },
  })
  assert('bulk without overwrite skips existing', skipExisting.json?.applied === 0)

  const overwriteBulk = await invoke(state.scheduleUrl, {
    token: state.tokens.admin,
    body: {
      action: 'bulk_upsert_shifts',
      employee_id: state.employeeIds.peer,
      overwrite: true,
      shifts: [
        {
          ...workingShift(TEST_DATE_BULK_A),
          planned_start_time: '11:00',
          comment: 'bulk-overwrite',
        },
      ],
    },
  })
  assert('bulk overwrite -> 200', overwriteBulk.status === 200 && overwriteBulk.json?.applied === 1)

  console.log('')
}

async function stageValidation() {
  console.log('Stage 10: Validation guards')

  const forbiddenField = await invoke(state.scheduleUrl, {
    token: state.tokens.admin,
    body: {
      action: 'upsert_shift',
      employee_id: state.employeeIds.peer,
      auth_user_id: '00000000-0000-0000-0000-000000000001',
      shift: workingShift(TEST_DATE),
    },
  })
  assert('forbidden top-level field -> 422', forbiddenField.status === 422)

  const badEmployee = await invoke(state.scheduleUrl, {
    token: state.tokens.admin,
    body: {
      action: 'upsert_shift',
      employee_id: 'not-a-number',
      shift: workingShift(TEST_DATE),
    },
  })
  assert('invalid employee_id -> 422', badEmployee.status === 422)

  console.log('')
}

async function stageCleanup() {
  console.log('Cleanup')
  if (!state.container) return

  const dates = [TEST_DATE, TEST_DATE_BULK_A, TEST_DATE_BULK_B, TEST_DATE_ACTUAL]
    .map((d) => `'${d}'`)
    .join(', ')

  if (state.employeeIds.peer) {
    psqlExec(`
      DELETE FROM public.academy_employee_shifts
      WHERE employee_id = ${state.employeeIds.peer}
        AND shift_date IN (${dates});
    `)
  }

  for (const shiftId of state.createdShiftIds) {
    psqlExec(`DELETE FROM public.academy_employee_shifts WHERE id = '${shiftId}';`)
  }

  for (const employeeId of state.createdEmployeeIds) {
    psqlExec(`DELETE FROM public.academy_users WHERE id = ${employeeId};`)
  }

  const admin = adminClient()
  for (const authUserId of state.createdAuthUserIds) {
    await admin.auth.admin.deleteUser(authUserId)
  }

  pass('fixture cleaned up')
  console.log('')
}

main()
