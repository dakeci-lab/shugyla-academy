#!/usr/bin/env node
/**
 * Local verification for admin-team-workforce-data Edge Function + frontend integration.
 *
 * Usage:
 *   npm run supabase:local:verify-team-workforce-admin-access
 *
 * Requires local Supabase + Edge Functions served locally.
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
const FIXTURE_TAG = 'team-workforce-verify'
const ADMIN_PASSWORD = 'TeamWorkforceAdmin1!'
const STAFF_PASSWORD = 'TeamWorkforceStaff1!'
const INACTIVE_PASSWORD = 'TeamWorkforceInactive1!'

const FORBIDDEN_RESPONSE_KEYS = [
  'password',
  'auth_user_id',
  'auth_linked',
  '@shugyla.local',
  'access_token',
  'refresh_token',
]

const state = {
  container: null,
  apiUrl: null,
  anonKey: null,
  serviceRoleKey: null,
  workforceUrl: null,
  roleIds: {},
  employeeIds: {},
  authUsers: {},
  tokens: {},
  createdAuthUserIds: [],
  createdEmployeeIds: [],
  createdShiftIds: [],
  testsRun: 0,
  testsPassed: 0,
}

async function main() {
  try {
    console.log('=== Team workforce admin access verification ===\n')
    await stageEnvironment()
    stageServiceRoleNotInSrc()
    stageFunctionConfig()
    stageStaticFrontend()
    await stageSetupFixture()
    await stageAuthorization()
    await stageValidation()
    await stageDtoSecurity()
    await stageWorkforceData()
    console.log(
      `\nTeam workforce verification completed (${state.testsPassed}/${state.testsRun} tests, exit 0)\n`
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

function defaultBody(overrides = {}) {
  return {
    date_from: '2026-07-01',
    date_to: '2026-07-31',
    timezone: 'Asia/Almaty',
    view: 'schedule',
    ...overrides,
  }
}

async function stageEnvironment() {
  console.log('Stage 1: Environment')
  const status = getLocalSupabaseStatus()
  state.apiUrl = status.API_URL
  state.anonKey = status.ANON_KEY
  state.serviceRoleKey = status.SERVICE_ROLE_KEY
  state.workforceUrl = `${state.apiUrl}/functions/v1/admin-team-workforce-data`

  if (!state.apiUrl?.includes('127.0.0.1') && !state.apiUrl?.includes('localhost')) {
    fail('API URL must be local')
  }

  if (fs.existsSync(path.join(ROOT, 'supabase/.temp/project-ref'))) {
    const ref = fs.readFileSync(path.join(ROOT, 'supabase/.temp/project-ref'), 'utf8').trim()
    if (ref.includes(PRODUCTION_REF)) fail('Production link detected')
  }

  state.container = findDbContainer()
  pass('local environment verified')
  console.log('')
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
    'admin-team-workforce-data verify_jwt = true',
    /\[functions\.admin-team-workforce-data\][\s\S]*verify_jwt\s*=\s*true/.test(config)
  )
  console.log('')
}

function stageStaticFrontend() {
  console.log('Stage 4: Frontend static checks')
  const workforce = fs.readFileSync(path.join(ROOT, 'src/services/workforceAdminService.js'), 'utf8')
  const owner = fs.readFileSync(path.join(ROOT, 'src/components/admin/OwnerDashboard.jsx'), 'utf8')
  const schedule = fs.readFileSync(
    path.join(ROOT, 'src/components/admin/sections/WorkScheduleSection.jsx'),
    'utf8'
  )
  const rating = fs.readFileSync(
    path.join(ROOT, 'src/components/admin/sections/EmployeeRatingSection.jsx'),
    'utf8'
  )

  assert('workforce service uses functions.invoke', workforce.includes("supabase.functions.invoke('admin-team-workforce-data'"))
  assert('workforce service has no service_role', !workforce.includes('SERVICE_ROLE'))
  assert(
    'OwnerDashboard uses home workforce summary',
    owner.includes('fetchHomeWorkforceSummary') || owner.includes('fetchTeamWorkforceData')
  )
  assert('WorkScheduleSection uses fetchTeamWorkforceData', schedule.includes('fetchTeamWorkforceData'))
  assert('WorkScheduleSection passes week query to editor', schedule.includes('?week='))
  const editor = fs.readFileSync(
    path.join(ROOT, 'src/components/admin/sections/EmployeeScheduleSection.jsx'),
    'utf8'
  )
  assert('EmployeeScheduleSection uses fetchEmployeeWorkforceBundle', editor.includes('fetchEmployeeWorkforceBundle'))
  assert('EmployeeRatingSection uses fetchTeamWorkforceForMonth', rating.includes('fetchTeamWorkforceForMonth'))
  assert('OwnerDashboard cloud path avoids direct team cache only', owner.includes('isCloudMode()'))
  assert('schedule error does not masquerade as empty list', schedule.includes('!error && employees.length === 0'))
  assert('rating error does not masquerade as empty list', rating.includes('!error && rows.length === 0'))
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
  state.authUsers[spec.key] = { id: data.user.id, email, login: spec.login }
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
  if (!state.roleIds.admin || !state.roleIds.cashier) fail('Missing admin/cashier roles')

  await createCaller({
    key: 'admin',
    login: `${FIXTURE_TAG}-admin`,
    firstName: 'Team',
    lastName: 'Admin',
    role: 'admin',
    roleId: state.roleIds.admin,
    password: ADMIN_PASSWORD,
    status: 'active',
  })

  await createCaller({
    key: 'staff',
    login: `${FIXTURE_TAG}-staff`,
    firstName: 'Team',
    lastName: 'Staff',
    role: 'cashier',
    roleId: state.roleIds.cashier,
    password: STAFF_PASSWORD,
    status: 'active',
  })

  await createCaller({
    key: 'inactive',
    login: `${FIXTURE_TAG}-inactive`,
    firstName: 'Team',
    lastName: 'Inactive',
    role: 'cashier',
    roleId: state.roleIds.cashier,
    password: INACTIVE_PASSWORD,
    status: 'inactive',
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

  const shiftId = crypto.randomUUID()
  state.createdShiftIds.push(shiftId)
  psqlExec(`
    INSERT INTO public.academy_employee_shifts (
      id, employee_id, shift_date, status, planned_start_time, planned_end_time
    ) VALUES (
      '${shiftId}', ${peerId}, '2026-07-08', 'working', '09:00', '18:00'
    );
  `)

  const nightShiftId = crypto.randomUUID()
  state.createdShiftIds.push(nightShiftId)
  psqlExec(`
    INSERT INTO public.academy_employee_shifts (
      id, employee_id, shift_date, status, planned_start_time, planned_end_time
    ) VALUES (
      '${nightShiftId}', ${peerId}, '2026-07-09', 'working', '22:00', '06:00'
    );
  `)

  pass('fixture employees and shifts created')
  console.log('')
}

async function stageAuthorization() {
  console.log('Stage 6: Authorization')

  const noJwt = await invoke(state.workforceUrl, { body: defaultBody() })
  assert('no JWT -> 401', noJwt.status === 401)

  const badJwt = await invoke(state.workforceUrl, {
    token: 'invalid.jwt.token',
    body: defaultBody(),
  })
  assert('invalid JWT -> 401', badJwt.status === 401)

  const inactive = await invoke(state.workforceUrl, {
    token: state.tokens.inactive,
    body: defaultBody(),
  })
  assert('inactive caller -> 403', inactive.status === 403)

  const staffDashboard = await invoke(state.workforceUrl, {
    token: state.tokens.staff,
    body: defaultBody({ view: 'dashboard' }),
  })
  assert('staff without team schedule -> dashboard 403', staffDashboard.status === 403)

  const staffSchedule = await invoke(state.workforceUrl, {
    token: state.tokens.staff,
    body: defaultBody({ view: 'schedule' }),
  })
  assert('staff own schedule -> 200', staffSchedule.status === 200 && staffSchedule.json?.ok === true)
  assert('staff schedule self scope', staffSchedule.json?.team_scope === false)
  assert('staff schedule one employee', staffSchedule.json?.employees?.length === 1)

  const adminRes = await invoke(state.workforceUrl, {
    token: state.tokens.admin,
    body: defaultBody({ view: 'schedule' }),
  })
  assert('admin team schedule -> 200', adminRes.status === 200 && adminRes.json?.ok === true)
  assert('admin team scope', adminRes.json?.team_scope === true)

  console.log('')
}

async function stageValidation() {
  console.log('Stage 7: Validation')

  const reversed = await invoke(state.workforceUrl, {
    token: state.tokens.admin,
    body: defaultBody({ date_from: '2026-07-31', date_to: '2026-07-01' }),
  })
  assert('date_to before date_from -> 422', reversed.status === 422)

  const tooLong = await invoke(state.workforceUrl, {
    token: state.tokens.admin,
    body: defaultBody({ date_from: '2026-01-01', date_to: '2026-04-15' }),
  })
  assert('range > 62 days -> 422', tooLong.status === 422)

  const badView = await invoke(state.workforceUrl, {
    token: state.tokens.admin,
    body: defaultBody({ view: 'unknown' }),
  })
  assert('invalid view -> 422', badView.status === 422)

  console.log('')
}

async function stageDtoSecurity() {
  console.log('Stage 8: DTO security')

  const res = await invoke(state.workforceUrl, {
    token: state.tokens.admin,
    body: defaultBody({ view: 'rating' }),
  })
  assert('rating view -> 200', res.status === 200 && res.json?.ok === true)

  const serialized = JSON.stringify(res.json)
  for (const forbidden of FORBIDDEN_RESPONSE_KEYS) {
    assert(`response excludes ${forbidden}`, !serialized.includes(forbidden))
  }

  const employee = res.json?.employees?.[0]
  assert('employee has id', typeof employee?.id === 'number')
  assert('employee has full_name', typeof employee?.full_name === 'string')
  assert('employee has no login field', !Object.prototype.hasOwnProperty.call(employee ?? {}, 'login'))

  console.log('')
}

async function stageWorkforceData() {
  console.log('Stage 9: Workforce data semantics')

  const schedule = await invoke(state.workforceUrl, {
    token: state.tokens.admin,
    body: defaultBody({ view: 'schedule' }),
  })
  const employees = schedule.json?.employees ?? []
  const shifts = schedule.json?.shifts ?? []
  assert('schedule includes employees', employees.length >= 2)
  assert('schedule includes shifts', shifts.length >= 2)

  const peerIncluded = employees.some((row) => row.full_name?.includes('peer'))
  assert('employee without shift on queried day still listed', peerIncluded)

  const nightShift = shifts.find((row) => row.shift_date === '2026-07-09')
  assert('night shift row preserved', nightShift?.planned_start_time === '22:00:00')

  const dashboard = await invoke(state.workforceUrl, {
    token: state.tokens.admin,
    body: defaultBody({ view: 'dashboard', date_from: '2026-07-08', date_to: '2026-07-08' }),
  })
  assert('dashboard view -> 200', dashboard.status === 200)
  assert('dashboard includes shift on selected day', (dashboard.json?.shifts?.length ?? 0) >= 1)

  const rating = await invoke(state.workforceUrl, {
    token: state.tokens.admin,
    body: defaultBody({ view: 'rating' }),
  })
  assert('rating view -> 200', rating.status === 200)
  assert('rating includes employees', (rating.json?.employees?.length ?? 0) >= 2)

  console.log('')
}

async function stageCleanup() {
  console.log('Cleanup: removing team-workforce fixture data')
  if (!state.container) return

  if (state.createdShiftIds.length) {
    psqlExec(
      `DELETE FROM public.academy_employee_shifts WHERE id IN (${state.createdShiftIds.map((id) => `'${id}'`).join(',')});`
    )
  }

  psqlExec(`DELETE FROM public.academy_users WHERE full_name LIKE '%[${FIXTURE_TAG}]%';`)
  psqlExec(`DELETE FROM public.academy_users WHERE login LIKE '${FIXTURE_TAG}-%';`)

  if (state.apiUrl && state.serviceRoleKey) {
    const admin = adminClient()
    for (const id of state.createdAuthUserIds) {
      await admin.auth.admin.deleteUser(id).catch(() => {})
    }
  }

  console.log('  Cleanup: passed\n')
}

main()
