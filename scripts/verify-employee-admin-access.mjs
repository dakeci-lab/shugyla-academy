#!/usr/bin/env node
/**
 * Local verification for admin-list-employees and admin-update-employee Edge Functions.
 *
 * Usage:
 *   npm run supabase:local:verify-employee-admin-access
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
const FIXTURE_TAG = 'emp-admin-verify'
const ADMIN1_PASSWORD = 'AdminAccessLocal1!'
const ADMIN2_PASSWORD = 'AdminAccessLocal2!'
const STAFF_PASSWORD = 'StaffAccessLocal1!'

const SAFE_EMPLOYEE_KEYS = new Set([
  'id',
  'first_name',
  'last_name',
  'full_name',
  'login',
  'role',
  'role_id',
  'status',
  'position',
  'avatar_url',
  'created_at',
  'updated_at',
  'auth_linked',
])

const FORBIDDEN_RESPONSE_KEYS = [
  'password',
  'auth_user_id',
  'access_token',
  'refresh_token',
  'service_role',
  'SUPABASE_SERVICE_ROLE_KEY',
]

const state = {
  container: null,
  apiUrl: null,
  anonKey: null,
  serviceRoleKey: null,
  listUrl: null,
  updateUrl: null,
  roleIds: {},
  targets: {},
  authUsers: {},
  tokens: {},
  createdAuthUserIds: [],
  createdEmployeeIds: [],
  testsRun: 0,
  testsPassed: 0,
}

async function main() {
  try {
    console.log('=== Employee admin access verification ===\n')
    await stageEnvironment()
    stageServiceRoleNotInSrc()
    stageFunctionConfig()
    stageStaticFrontend()
    await stageSetupFixture()
    await stageListAuthorization()
    await stageUpdateAuthorization()
    await stageListSecurity()
    await stageListValidation()
    await stageListFunctional()
    await stageUpdateValidation()
    await stageUpdateFunctional()
    await stageProtection()
    stageSharedHelperStatic()
    await stageRegression()
    console.log(`\nEmployee admin access verification completed (${state.testsPassed}/${state.testsRun} tests, exit 0)\n`)
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
  if (!condition) {
    fail(`${name}${detail ? `: ${detail}` : ''}`)
  }
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

function nextEmployeeId() {
  return Number(psqlScalar('SELECT COALESCE(MAX(id), 0) + 1 FROM public.academy_users;'))
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
  return { status: response.status, json, headers: response.headers }
}

async function stageEnvironment() {
  console.log('Stage 1: Environment')
  run('docker', ['info'], { capture: true })

  const status = getLocalSupabaseStatus()

  state.apiUrl = status.API_URL
  state.anonKey = status.ANON_KEY
  state.serviceRoleKey = status.SERVICE_ROLE_KEY
  state.listUrl = `${state.apiUrl}/functions/v1/admin-list-employees`
  state.updateUrl = `${state.apiUrl}/functions/v1/admin-update-employee`

  if (!state.apiUrl?.includes('127.0.0.1') && !state.apiUrl?.includes('localhost')) {
    fail('API URL must be local')
  }

  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
  if (config.includes(PRODUCTION_REF)) fail('Production ref in config.toml')

  state.container = findDbContainer()

  const anonSelect = psqlScalar(`
    SELECT COUNT(*) FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_name = 'academy_users' AND privilege_type = 'SELECT';
  `)
  assert('anon SELECT academy_users absent', anonSelect === '0')

  const broadPolicy = psqlScalar(`
    SELECT COUNT(*) FROM pg_policies
    WHERE tablename = 'academy_users'
      AND roles @> ARRAY['authenticated']::name[]
      AND qual = 'true';
  `)
  assert('authenticated broad SELECT absent', broadPolicy === '0')

  const enabledRules = psqlScalar('SELECT COUNT(*) FROM public.notification_rules WHERE is_enabled = true;')
  assert('notification rules disabled', enabledRules === '0')

  pass('local environment verified')
  console.log('')
}

function stageServiceRoleNotInSrc() {
  console.log('Stage 2: service_role not in src')
  const result = run(
    'grep',
    ['-r', '-l', '-E', 'service_role|SUPABASE_SERVICE_ROLE', 'src'],
    { capture: true, allowFailure: true }
  )
  if (result.stdout.trim()) fail('service_role found in src')
  pass('service_role absent in src')
  console.log('')
}

function stageFunctionConfig() {
  console.log('Stage 3: Function config')
  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
  assert('admin-list-employees verify_jwt = true', /\[functions\.admin-list-employees\][\s\S]*verify_jwt\s*=\s*true/.test(config))
  assert('admin-update-employee verify_jwt = true', /\[functions\.admin-update-employee\][\s\S]*verify_jwt\s*=\s*true/.test(config))
  console.log('')
}

function stageStaticFrontend() {
  console.log('Stage 4: Frontend static checks')
  const section = fs.readFileSync(path.join(ROOT, 'src/components/admin/sections/EmployeesSection.jsx'), 'utf8')
  const adminService = fs.readFileSync(path.join(ROOT, 'src/services/employeeAdminService.js'), 'utf8')
  const academy = fs.readFileSync(path.join(ROOT, 'src/services/academyDataService.js'), 'utf8')

  assert('EmployeesSection uses listEmployeesForAdmin', section.includes('listEmployeesForAdmin'))
  assert('EmployeesSection cloud edit uses updateEmployee', section.includes('updateEmployee(editId'))
  assert('double submit blocked', section.includes('if (submitting) return'))
  assert('cloud login disabled on edit', section.includes('disabled={Boolean(editId && cloudMode)}'))
  assert('employeeAdminService uses functions.invoke', adminService.includes("supabase.functions.invoke('admin-list-employees'"))
  assert('cloud update uses admin function', adminService.includes("supabase.functions.invoke('admin-update-employee'"))
  assert('academyDataService cloud update uses updateEmployeeAsAdmin', academy.includes('updateEmployeeAsAdmin'))
  assert('no service key in employeeAdminService', !adminService.includes('SERVICE_ROLE'))
  console.log('')
}

async function createCaller(spec) {
  const admin = adminClient()
  const email = loginToTechnicalEmail(spec.login)
  let authUserId = null
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: spec.password,
    email_confirm: true,
  })
  if (error) {
    if (!/already been registered/i.test(error.message)) {
      fail(`Create auth ${spec.key}: ${error.message}`)
    }
    const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = listed.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
    if (!existing?.id) fail(`Create auth ${spec.key}: ${error.message}`)
    authUserId = existing.id
    await admin.auth.admin.updateUserById(authUserId, { password: spec.password, email_confirm: true })
  } else {
    authUserId = data.user.id
  }

  state.authUsers[spec.key] = { id: authUserId, email, login: spec.login }
  if (!state.createdAuthUserIds.includes(authUserId)) {
    state.createdAuthUserIds.push(authUserId)
  }

  const employeeId = nextEmployeeId()
  state.createdEmployeeIds.push(employeeId)
  psqlExec(`DELETE FROM public.academy_users WHERE login = '${spec.login}';`)
  psqlExec(`
    INSERT INTO public.academy_users (
      id, first_name, last_name, full_name, login, password, role, role_id, status, auth_user_id
    ) VALUES (
      ${employeeId}, '${spec.firstName}', '${spec.lastName}', '[${FIXTURE_TAG}] ${spec.key}', '${spec.login}',
      '', '${spec.role}', '${spec.roleId}', '${spec.status}', '${authUserId}'
    );
  `)

  const anon = createClient(state.apiUrl, state.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = await anon.auth.signInWithPassword({ email, password: spec.password })
  if (signIn.error) fail(`Sign in ${spec.key}: ${signIn.error.message}`)
  state.tokens[spec.key] = signIn.data.session.access_token
  return employeeId
}

async function createTargetEmployee(spec) {
  const employeeId = nextEmployeeId()
  state.createdEmployeeIds.push(employeeId)
  const authClause = spec.authUserId ? `'${spec.authUserId}'` : 'NULL'
  psqlExec(`
    INSERT INTO public.academy_users (
      id, first_name, last_name, full_name, login, password, role, role_id, status, auth_user_id
    ) VALUES (
      ${employeeId}, '${spec.firstName}', '${spec.lastName}', '${spec.fullName}', '${spec.login}',
      'legacy-stored', '${spec.role}', '${spec.roleId}', '${spec.status}', ${authClause}
    );
  `)
  state.targets[spec.key] = { id: employeeId, login: spec.login, ...spec }
  return employeeId
}

async function stageSetupFixture() {
  console.log('Stage 5: Setup fixture')

  state.roleIds.admin = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'admin' LIMIT 1;`)
  state.roleIds.cashier = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'cashier' LIMIT 1;`)
  state.roleIds.seller = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'seller' LIMIT 1;`)
  if (!state.roleIds.admin || !state.roleIds.cashier || !state.roleIds.seller) {
    fail('Missing admin/cashier/seller roles')
  }

  state.employeeIds = {}
  state.employeeIds.admin1 = await createCaller({
    key: 'admin1',
    login: `${FIXTURE_TAG}-admin1`,
    firstName: 'Admin',
    lastName: 'One',
    role: 'admin',
    roleId: state.roleIds.admin,
    password: ADMIN1_PASSWORD,
    status: 'active',
  })
  state.employeeIds.admin2 = await createCaller({
    key: 'admin2',
    login: `${FIXTURE_TAG}-admin2`,
    firstName: 'Admin',
    lastName: 'Two',
    role: 'admin',
    roleId: state.roleIds.admin,
    password: ADMIN2_PASSWORD,
    status: 'active',
  })
  state.employeeIds.staff = await createCaller({
    key: 'staff',
    login: `${FIXTURE_TAG}-staff`,
    firstName: 'Staff',
    lastName: 'User',
    role: 'cashier',
    roleId: state.roleIds.cashier,
    password: STAFF_PASSWORD,
    status: 'active',
  })
  state.employeeIds.deactivated = await createCaller({
    key: 'deactivated',
    login: `${FIXTURE_TAG}-inactive-admin`,
    firstName: 'Inactive',
    lastName: 'Admin',
    role: 'admin',
    roleId: state.roleIds.admin,
    password: ADMIN1_PASSWORD,
    status: 'inactive',
  })

  await createTargetEmployee({
    key: 'cashier',
    login: `${FIXTURE_TAG}-cashier-target`,
    firstName: 'Alpha',
    lastName: 'Cashier',
    fullName: 'Alpha Cashier',
    role: 'cashier',
    roleId: state.roleIds.cashier,
    status: 'active',
  })
  await createTargetEmployee({
    key: 'seller',
    login: `${FIXTURE_TAG}-seller-target`,
    firstName: 'Beta',
    lastName: 'Seller',
    fullName: 'Beta Seller',
    role: 'seller',
    roleId: state.roleIds.seller,
    status: 'active',
  })
  await createTargetEmployee({
    key: 'inactive',
    login: `${FIXTURE_TAG}-inactive-target`,
    firstName: 'Gamma',
    lastName: 'Inactive',
    fullName: 'Gamma Inactive',
    role: 'cashier',
    roleId: state.roleIds.cashier,
    status: 'inactive',
  })

  const admin = adminClient()
  const linkedEmail = loginToTechnicalEmail(`${FIXTURE_TAG}-linked-target`)
  const { data: linkedAuth, error: linkedAuthError } = await admin.auth.admin.createUser({
    email: linkedEmail,
    password: 'LinkedTarget1234!',
    email_confirm: true,
  })
  if (linkedAuthError) fail(`Create linked auth: ${linkedAuthError.message}`)
  state.createdAuthUserIds.push(linkedAuth.user.id)

  await createTargetEmployee({
    key: 'linked',
    login: `${FIXTURE_TAG}-linked-target`,
    firstName: 'Linked',
    lastName: 'Employee',
    fullName: 'Linked Employee',
    role: 'cashier',
    roleId: state.roleIds.cashier,
    status: 'active',
    authUserId: linkedAuth.user.id,
  })

  await createTargetEmployee({
    key: 'legacy',
    login: `${FIXTURE_TAG}-legacy-target`,
    firstName: 'Legacy',
    lastName: 'Employee',
    fullName: 'Legacy Employee',
    role: 'cashier',
    roleId: state.roleIds.cashier,
    status: 'active',
  })

  pass('fixture callers and targets ready')
  console.log('')
}

function assertSafeEmployee(row) {
  for (const key of Object.keys(row)) {
    if (!SAFE_EMPLOYEE_KEYS.has(key)) {
      fail(`Unexpected response field: ${key}`)
    }
  }
  for (const forbidden of FORBIDDEN_RESPONSE_KEYS) {
    if (JSON.stringify(row).includes(forbidden)) {
      fail(`Forbidden value in employee response: ${forbidden}`)
    }
  }
  if (typeof row.auth_linked !== 'boolean') {
    fail('auth_linked must be boolean')
  }
}

async function stageListAuthorization() {
  console.log('Stage 6: List authorization')

  const noJwt = await invoke(state.listUrl, { body: {} })
  assert('list without JWT → 401', noJwt.status === 401, `got ${noJwt.status}`)

  const badJwt = await invoke(state.listUrl, { token: 'invalid.jwt.token', body: {} })
  assert('list invalid JWT → 401', badJwt.status === 401, `got ${badJwt.status}`)

  const staffRes = await invoke(state.listUrl, { token: state.tokens.staff, body: {} })
  assert('staff without view → 403', staffRes.status === 403, `got ${staffRes.status}`)

  const inactiveRes = await invoke(state.listUrl, { token: state.tokens.deactivated, body: {} })
  assert('deactivated admin → 403', inactiveRes.status === 403, `got ${inactiveRes.status}`)

  const adminRes = await invoke(state.listUrl, { token: state.tokens.admin1, body: {} })
  assert('permitted admin → 200', adminRes.status === 200 && adminRes.json?.ok === true, `got ${adminRes.status}`)

  const optionsRes = await invoke(state.listUrl, { method: 'OPTIONS' })
  assert('list OPTIONS → 204', optionsRes.status === 204, `got ${optionsRes.status}`)

  const getRes = await invoke(state.listUrl, { token: state.tokens.admin1, method: 'GET' })
  assert('list GET → 405', getRes.status === 405, `got ${getRes.status}`)

  console.log('')
}

async function stageUpdateAuthorization() {
  console.log('Stage 7: Update authorization')

  const noJwt = await invoke(state.updateUrl, {
    body: { employee_id: state.targets.cashier.id, changes: { first_name: 'X' } },
  })
  assert('update without JWT → 401', noJwt.status === 401)

  const badJwt = await invoke(state.updateUrl, {
    token: 'invalid.jwt.token',
    body: { employee_id: state.targets.cashier.id, changes: { first_name: 'X' } },
  })
  assert('update invalid JWT → 401', badJwt.status === 401)

  const staffRes = await invoke(state.updateUrl, {
    token: state.tokens.staff,
    body: { employee_id: state.targets.cashier.id, changes: { first_name: 'X' } },
  })
  assert('staff without edit → 403', staffRes.status === 403)

  const inactiveRes = await invoke(state.updateUrl, {
    token: state.tokens.deactivated,
    body: { employee_id: state.targets.cashier.id, changes: { first_name: 'X' } },
  })
  assert('deactivated admin update → 403', inactiveRes.status === 403)

  console.log('')
}

async function stageListSecurity() {
  console.log('Stage 8: List security')

  const res = await invoke(state.listUrl, { token: state.tokens.admin1, body: { page_size: 50 } })
  assert('list ok', res.status === 200 && res.json?.ok)
  for (const row of res.json.employees) {
    assertSafeEmployee(row)
  }
  assert('pagination present', res.json.pagination?.total != null)
  assert('no password in list JSON', !JSON.stringify(res.json).includes('"password"'))
  assert('no auth_user_id in list JSON', !JSON.stringify(res.json).includes('auth_user_id'))

  const oversize = await invoke(state.listUrl, {
    token: state.tokens.admin1,
    body: { page_size: 101 },
  })
  assert('page_size > 100 → 422', oversize.status === 422)

  console.log('')
}

async function stageListValidation() {
  console.log('Stage 9: List validation')

  const invalidPage = await invoke(state.listUrl, { token: state.tokens.admin1, body: { page: 0 } })
  assert('invalid page → 422', invalidPage.status === 422)

  const invalidSort = await invoke(state.listUrl, {
    token: state.tokens.admin1,
    body: { sort_by: 'password' },
  })
  assert('invalid sort_by → 422', invalidSort.status === 422)

  const invalidDirection = await invoke(state.listUrl, {
    token: state.tokens.admin1,
    body: { sort_direction: 'sideways' },
  })
  assert('invalid sort_direction → 422', invalidDirection.status === 422)

  const extraField = await invoke(state.listUrl, {
    token: state.tokens.admin1,
    body: { employee_id: 1 },
  })
  assert('extra list field → 422', extraField.status === 422)

  console.log('')
}

async function stageListFunctional() {
  console.log('Stage 10: List functional')

  const searchName = await invoke(state.listUrl, {
    token: state.tokens.admin1,
    body: { search: 'Alpha', status: 'active' },
  })
  assert('search by name', searchName.json?.employees?.some((e) => e.login === state.targets.cashier.login))

  const searchLogin = await invoke(state.listUrl, {
    token: state.tokens.admin1,
    body: { search: 'seller-target', status: 'all' },
  })
  assert('search by login', searchLogin.json?.employees?.some((e) => e.login === state.targets.seller.login))

  const statusFilter = await invoke(state.listUrl, {
    token: state.tokens.admin1,
    body: { status: 'deactivated' },
  })
  assert(
    'filter deactivated status',
    statusFilter.json?.employees?.some((e) => e.login === state.targets.inactive.login)
  )

  const roleFilter = await invoke(state.listUrl, {
    token: state.tokens.admin1,
    body: { role_id: state.roleIds.seller, status: 'all' },
  })
  assert('filter role_id', roleFilter.json?.employees?.every((e) => e.role_id === state.roleIds.seller))

  const sortAsc = await invoke(state.listUrl, {
    token: state.tokens.admin1,
    body: { sort_by: 'full_name', sort_direction: 'asc', status: 'all', page_size: 100 },
  })
  const ascNames = sortAsc.json?.employees?.map((e) => e.full_name) ?? []
  const ascSorted = [...ascNames].sort((a, b) => a.localeCompare(b))
  assert('sort asc', JSON.stringify(ascNames) === JSON.stringify(ascSorted))

  const sortDesc = await invoke(state.listUrl, {
    token: state.tokens.admin1,
    body: { sort_by: 'full_name', sort_direction: 'desc', status: 'all', page_size: 100 },
  })
  const descNames = sortDesc.json?.employees?.map((e) => e.full_name) ?? []
  const descSorted = [...descNames].sort((a, b) => b.localeCompare(a))
  assert('sort desc', JSON.stringify(descNames) === JSON.stringify(descSorted))

  const page1 = await invoke(state.listUrl, {
    token: state.tokens.admin1,
    body: { page: 1, page_size: 2, status: 'all', sort_by: 'id', sort_direction: 'asc' },
  })
  const page2 = await invoke(state.listUrl, {
    token: state.tokens.admin1,
    body: { page: 2, page_size: 2, status: 'all', sort_by: 'id', sort_direction: 'asc' },
  })
  const page1Ids = new Set(page1.json?.employees?.map((e) => e.id) ?? [])
  const overlap = (page2.json?.employees ?? []).some((e) => page1Ids.has(e.id))
  assert('pagination page 2 has no overlap', !overlap)

  console.log('')
}

async function stageUpdateValidation() {
  console.log('Stage 11: Update validation')

  const missingId = await invoke(state.updateUrl, {
    token: state.tokens.admin1,
    body: { changes: { first_name: 'X' } },
  })
  assert('missing employee_id → 422', missingId.status === 422)

  const unknown = await invoke(state.updateUrl, {
    token: state.tokens.admin1,
    body: { employee_id: 999999999, changes: { first_name: 'X' } },
  })
  assert('unknown employee → 404', unknown.status === 404)

  const emptyChanges = await invoke(state.updateUrl, {
    token: state.tokens.admin1,
    body: { employee_id: state.targets.cashier.id, changes: {} },
  })
  assert('empty changes → 422', emptyChanges.status === 422)

  const forbiddenFields = [
    ['login', { login: 'hack' }],
    ['phone', { phone: '+7700' }],
    ['email', { email: 'a@b.c' }],
    ['password', { password: 'secret123456' }],
    ['auth_user_id', { auth_user_id: crypto.randomUUID() }],
    ['role', { role: 'admin' }],
  ]

  for (const [label, change] of forbiddenFields) {
    const res = await invoke(state.updateUrl, {
      token: state.tokens.admin1,
      body: { employee_id: state.targets.cashier.id, changes: change },
    })
    assert(`forbidden ${label} → 422`, res.status === 422, `got ${res.status}`)
  }

  const badRole = await invoke(state.updateUrl, {
    token: state.tokens.admin1,
    body: {
      employee_id: state.targets.cashier.id,
      changes: { role_id: crypto.randomUUID() },
    },
  })
  assert('unknown role_id → 422', badRole.status === 422)

  const badStatus = await invoke(state.updateUrl, {
    token: state.tokens.admin1,
    body: {
      employee_id: state.targets.cashier.id,
      changes: { status: 'not-a-status' },
    },
  })
  assert('invalid status → 422', badStatus.status === 422)

  console.log('')
}

async function stageUpdateFunctional() {
  console.log('Stage 12: Update functional')
  const targetId = state.targets.cashier.id
  const beforeLogin = psqlScalar(`SELECT login FROM public.academy_users WHERE id = ${targetId};`)
  const beforeAuthId = psqlScalar(`SELECT auth_user_id::text FROM public.academy_users WHERE id = ${targetId};`)
  const beforePassword = psqlScalar(`SELECT password FROM public.academy_users WHERE id = ${targetId};`)
  const beforeAuthEmail = beforeAuthId
    ? psqlScalar(`SELECT email FROM auth.users WHERE id = '${beforeAuthId}';`)
    : ''

  const res = await invoke(state.updateUrl, {
    token: state.tokens.admin1,
    body: {
      employee_id: targetId,
      changes: {
        first_name: 'Updated',
        last_name: 'Person',
        position: 'Senior Cashier',
        role_id: state.roleIds.seller,
        status: 'active',
      },
    },
  })
  assert('update success → 200', res.status === 200 && res.json?.ok)
  assertSafeEmployee(res.json.employee)
  assert('response full_name recalculated', res.json.employee.full_name === 'Updated Person')
  assert('legacy role updated', res.json.employee.role === 'seller')

  const afterLogin = psqlScalar(`SELECT login FROM public.academy_users WHERE id = ${targetId};`)
  const afterAuthId = psqlScalar(`SELECT auth_user_id::text FROM public.academy_users WHERE id = ${targetId};`)
  const afterPassword = psqlScalar(`SELECT password FROM public.academy_users WHERE id = ${targetId};`)
  assert('login unchanged in DB', afterLogin === beforeLogin)
  assert('auth_user_id unchanged in DB', afterAuthId === beforeAuthId)
  assert('password unchanged in DB', afterPassword === beforePassword)

  if (beforeAuthEmail) {
    const afterAuthEmail = psqlScalar(`SELECT email FROM auth.users WHERE id = '${beforeAuthId}';`)
    assert('Auth email unchanged', afterAuthEmail === beforeAuthEmail)
  }

  console.log('')
}

async function stageProtection() {
  console.log('Stage 13: Protection')

  const selfRole = await invoke(state.updateUrl, {
    token: state.tokens.admin1,
    body: {
      employee_id: state.employeeIds.admin1,
      changes: { role_id: state.roleIds.cashier },
    },
  })
  assert('self role change → 409', selfRole.status === 409 && selfRole.json?.code === 'self_role_change_forbidden')

  const selfStatus = await invoke(state.updateUrl, {
    token: state.tokens.admin1,
    body: {
      employee_id: state.employeeIds.admin1,
      changes: { status: 'inactive' },
    },
  })
  assert('self status change → 409', selfStatus.status === 409 && selfStatus.json?.code === 'self_status_change_forbidden')

  const deactivateSecond = await invoke(state.updateUrl, {
    token: state.tokens.admin1,
    body: {
      employee_id: state.employeeIds.admin2,
      changes: { status: 'inactive' },
    },
  })
  assert('deactivate second admin allowed', deactivateSecond.status === 200)

  const lastAdmin = await invoke(state.updateUrl, {
    token: state.tokens.admin1,
    body: {
      employee_id: state.employeeIds.admin1,
      changes: { status: 'inactive' },
    },
  })
  assert('last admin deactivate blocked', lastAdmin.status === 409 && lastAdmin.json?.code === 'self_status_change_forbidden')

  psqlExec(`UPDATE public.academy_users SET status = 'active' WHERE id = ${state.employeeIds.admin2};`)

  const demoteWithBackup = await invoke(state.updateUrl, {
    token: state.tokens.admin1,
    body: {
      employee_id: state.employeeIds.admin2,
      changes: { role_id: state.roleIds.cashier },
    },
  })
  assert('role demote allowed while another admin remains', demoteWithBackup.status === 200)

  psqlExec(`UPDATE public.academy_users SET status = 'active', role_id = '${state.roleIds.admin}', role = 'admin' WHERE id = ${state.employeeIds.admin2};`)

  const prepDeactivate = await invoke(state.updateUrl, {
    token: state.tokens.admin1,
    body: {
      employee_id: state.employeeIds.admin2,
      changes: { status: 'inactive' },
    },
  })
  assert('prep sole editor state', prepDeactivate.status === 200)

  const soleEditorRoleChange = await invoke(state.updateUrl, {
    token: state.tokens.admin1,
    body: {
      employee_id: state.employeeIds.admin1,
      changes: { role_id: state.roleIds.cashier },
    },
  })
  assert(
    'sole editor self role change blocked before last-admin',
    soleEditorRoleChange.status === 409 && soleEditorRoleChange.json?.code === 'self_role_change_forbidden'
  )

  console.log('')
}

function stageSharedHelperStatic() {
  console.log('Stage 14: Shared helper static')
  const helper = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/_shared/employeeAuthorization.ts'),
    'utf8'
  )
  const listFn = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/admin-list-employees/index.ts'),
    'utf8'
  )
  const updateFn = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/admin-update-employee/index.ts'),
    'utf8'
  )

  assert('helper uses auth.getUser', helper.includes('auth.getUser'))
  assert('helper checks permissions table', helper.includes("from('permissions')"))
  assert('no user_metadata in helper', !/\buser_metadata\b/.test(helper))
  assert('list no select(*)', !listFn.includes("select('*')"))
  assert('update no select(*)', !updateFn.includes("select('*')"))
  assert('list selects safe fields', listFn.includes('SAFE_EMPLOYEE_SELECT'))
  assert('password not in list select', !listFn.includes('password'))
  assert('update function has last_admin_protected', updateFn.includes('last_admin_protected'))

  console.log('')
}

async function stageRegression() {
  console.log('Stage 15: Regression')
  const scripts = [
    'supabase:local:verify-employee-provisioning',
    'supabase:local:verify-auth-first',
    'supabase:local:verify-notifications',
  ]

  for (const script of scripts) {
    const result = run('npm', ['run', script], { capture: true })
    assert(`${script} exit 0`, result.status === 0, result.stderr?.slice(0, 200))
  }

  const buildResult = run('npm', ['run', 'build'], { capture: true })
  assert('npm run build exit 0', buildResult.status === 0, buildResult.stderr?.slice(0, 200))

  const enabled = psqlScalar('SELECT COUNT(*) FROM public.notification_rules WHERE is_enabled = true;')
  assert('notification rules still disabled', enabled === '0')

  console.log('')
}

async function stageCleanup() {
  console.log('Cleanup: removing admin access fixture data')

  if (!state.container) {
    try {
      state.container = findDbContainer()
    } catch {
      return
    }
  }

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
