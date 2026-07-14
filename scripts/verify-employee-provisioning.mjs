#!/usr/bin/env node
/**
 * Local verification for admin-create-employee Edge Function.
 *
 * Usage:
 *   npm run supabase:local:verify-employee-provisioning
 */

import { spawnSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getLocalSupabaseStatus } from './lib/localSupabaseCli.mjs'
import { createClient } from '@supabase/supabase-js'
import { loginToTechnicalEmail } from '../src/utils/phoneUtils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROJECT_ID = 'shugyla-academy'
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'
const FIXTURE_TAG = 'emp-prov-verify'
const ADMIN_PASSWORD = 'ProvAdminLocal123!'
const STAFF_PASSWORD = 'ProvStaffLocal123!'
const TEMP_PASSWORD = 'TempEmployee1234!'

const LOGIN_MAPPING_CASES = [
  { login: 'provision-test-a', label: 'text login' },
  { login: 'PROVISION-TEST-A', label: 'uppercase login' },
  { login: 'admin@shugyla.local', label: 'email login' },
  { login: '+77001234567', label: 'phone with plus' },
  { login: '7 700 123 45 67', label: 'phone with spaces' },
]

const state = {
  runId: `prov-${Date.now()}`,
  container: null,
  apiUrl: null,
  anonKey: null,
  serviceRoleKey: null,
  functionUrl: null,
  roleIds: {},
  authUsers: {},
  employeeIds: {},
  tokens: {},
  createdEmployeeLogins: [],
  createdAuthUserIds: [],
}

async function main() {
  try {
    console.log('=== Employee provisioning verification ===\n')
    stageEnvironment()
    stageServiceRoleNotInSrc()
    await stageSetupCallers()
    await stageLoginMapping()
    await stageAuthorizationTests()
    await stageValidationTests()
    await stageSuccessfulProvisioning()
    await stageDuplicateTests()
    await stageSecurityChecks()
    await stageRegression()
    console.log('\nEmployee provisioning verification completed (exit 0)\n')
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
  console.log(`  ✓ ${name}`)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    input: options.input,
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

function stageEnvironment() {
  console.log('Stage 1: Environment')
  run('docker', ['info'], { capture: true })

  const status = getLocalSupabaseStatus()

  state.apiUrl = status.API_URL
  state.anonKey = status.ANON_KEY
  state.serviceRoleKey = status.SERVICE_ROLE_KEY
  state.functionUrl = `${state.apiUrl}/functions/v1/admin-create-employee`

  if (!state.apiUrl?.includes('127.0.0.1') && !state.apiUrl?.includes('localhost')) {
    fail('API URL must be local')
  }

  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
  if (config.includes(PRODUCTION_REF)) fail('Production ref in config.toml')
  if (!/verify_jwt\s*=\s*true/.test(config)) fail('admin-create-employee must have verify_jwt = true')

  state.container = findDbContainer()
  pass('local API and function endpoint')
  pass('no production ref')
  console.log('')
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

function adminClient() {
  return createClient(state.apiUrl, state.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function stageSetupCallers() {
  console.log('Stage 3: Setup callers')
  const admin = adminClient()

  state.roleIds.admin = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'admin' LIMIT 1;`)
  state.roleIds.cashier = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'cashier' LIMIT 1;`)
  if (!state.roleIds.admin || !state.roleIds.cashier) fail('Missing admin/cashier roles')

  const callers = [
    { key: 'admin', login: `${FIXTURE_TAG}-admin`, role: 'admin', roleId: state.roleIds.admin, password: ADMIN_PASSWORD, status: 'active' },
    { key: 'staff', login: `${FIXTURE_TAG}-staff`, role: 'cashier', roleId: state.roleIds.cashier, password: STAFF_PASSWORD, status: 'active' },
    { key: 'deactivated', login: `${FIXTURE_TAG}-inactive-admin`, role: 'admin', roleId: state.roleIds.admin, password: ADMIN_PASSWORD, status: 'inactive' },
  ]

  for (const spec of callers) {
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
    state.employeeIds[spec.key] = employeeId
    psqlExec(`
      INSERT INTO public.academy_users (
        id, first_name, last_name, full_name, login, password, role, role_id, status, auth_user_id
      ) VALUES (
        ${employeeId}, 'Prov', '${spec.key}', '[${FIXTURE_TAG}] ${spec.key}', '${spec.login}',
        '', '${spec.role}', '${spec.roleId}', '${spec.status}', '${data.user.id}'
      );
    `)

    const anon = createClient(state.apiUrl, state.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const signIn = await anon.auth.signInWithPassword({ email, password: spec.password })
    if (signIn.error) fail(`Sign in ${spec.key}: ${signIn.error.message}`)
    state.tokens[spec.key] = signIn.data.session.access_token
  }

  pass('admin, staff, deactivated callers ready')
  console.log('')
}

async function invokeFunction({ token, body, method = 'POST' }) {
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
  return { status: response.status, json, headers: response.headers }
}

async function stageLoginMapping() {
  console.log('Stage 4: Technical email mapping')
  for (const testCase of LOGIN_MAPPING_CASES) {
    const frontend = loginToTechnicalEmail(testCase.login)
    const escaped = testCase.login.replace(/'/g, "''")
    const sql = psqlScalar(`SELECT notification_login_to_technical_email('${escaped}');`)
    if (frontend !== sql) {
      fail(`Mapping mismatch (${testCase.label}): frontend=${frontend}, sql=${sql}`)
    }
  }
  pass(`${LOGIN_MAPPING_CASES.length} login mapping cases`)
  console.log('')
}

async function stageAuthorizationTests() {
  console.log('Stage 5: Authorization')

  const anonRes = await invokeFunction({
    token: state.anonKey,
    body: validCreateBody(`${FIXTURE_TAG}-anon-target`),
  })
  if (anonRes.status !== 401) fail(`Anon expected 401, got ${anonRes.status}`)

  const noAuth = await invokeFunction({ token: null, body: validCreateBody(`${FIXTURE_TAG}-noauth`) })
  if (noAuth.status !== 401) fail(`Missing auth expected 401, got ${noAuth.status}`)

  const invalid = await invokeFunction({
    token: 'invalid.jwt.token',
    body: validCreateBody(`${FIXTURE_TAG}-invalid`),
  })
  if (invalid.status !== 401) fail(`Invalid JWT expected 401, got ${invalid.status}`)

  const staffRes = await invokeFunction({
    token: state.tokens.staff,
    body: validCreateBody(`${FIXTURE_TAG}-staff-blocked`),
  })
  if (staffRes.status !== 403) fail(`Staff expected 403, got ${staffRes.status}`)

  const deactivatedRes = await invokeFunction({
    token: state.tokens.deactivated,
    body: validCreateBody(`${FIXTURE_TAG}-inactive-blocked`),
  })
  if (deactivatedRes.status !== 403) fail(`Deactivated admin expected 403, got ${deactivatedRes.status}`)

  pass('anon, missing auth, invalid JWT, staff, deactivated admin')
  console.log('')
}

function validCreateBody(login) {
  return {
    login,
    temporary_password: TEMP_PASSWORD,
    first_name: 'New',
    last_name: 'Employee',
    full_name: 'New Employee',
    role_id: state.roleIds.cashier,
    position: 'Cashier',
  }
}

async function stageValidationTests() {
  console.log('Stage 6: Validation')

  const missingLogin = await invokeFunction({
    token: state.tokens.admin,
    body: { ...validCreateBody(''), login: '' },
  })
  if (missingLogin.status !== 422) fail(`Missing login expected 422, got ${missingLogin.status}`)

  const shortPwd = await invokeFunction({
    token: state.tokens.admin,
    body: { ...validCreateBody(`${FIXTURE_TAG}-short-pwd`), temporary_password: 'short' },
  })
  if (shortPwd.status !== 422) fail(`Short password expected 422, got ${shortPwd.status}`)

  const badRole = await invokeFunction({
    token: state.tokens.admin,
    body: { ...validCreateBody(`${FIXTURE_TAG}-bad-role`), role_id: crypto.randomUUID() },
  })
  if (badRole.status !== 422) fail(`Unknown role expected 422, got ${badRole.status}`)

  const forbiddenRole = await invokeFunction({
    token: state.tokens.admin,
    body: { ...validCreateBody(`${FIXTURE_TAG}-forbidden-role`), role: 'admin' },
  })
  if (forbiddenRole.status !== 422) fail(`Forbidden role field expected 422, got ${forbiddenRole.status}`)

  const forbiddenStatus = await invokeFunction({
    token: state.tokens.admin,
    body: { ...validCreateBody(`${FIXTURE_TAG}-forbidden-status`), status: 'inactive' },
  })
  if (forbiddenStatus.status !== 422) fail(`Forbidden status expected 422, got ${forbiddenStatus.status}`)

  const forbiddenAuthId = await invokeFunction({
    token: state.tokens.admin,
    body: { ...validCreateBody(`${FIXTURE_TAG}-forbidden-auth`), auth_user_id: crypto.randomUUID() },
  })
  if (forbiddenAuthId.status !== 422) fail(`Forbidden auth_user_id expected 422, got ${forbiddenAuthId.status}`)

  const wrongPasswordField = await invokeFunction({
    token: state.tokens.admin,
    body: { ...validCreateBody(`${FIXTURE_TAG}-wrong-pwd-field`), password: TEMP_PASSWORD, temporary_password: undefined },
  })
  if (wrongPasswordField.status !== 422) fail(`password field expected 422, got ${wrongPasswordField.status}`)

  const optionsRes = await fetch(state.functionUrl, {
    method: 'OPTIONS',
    headers: { apikey: state.anonKey },
  })
  if (optionsRes.status !== 204) fail(`OPTIONS expected 204, got ${optionsRes.status}`)

  const getRes = await invokeFunction({ token: state.tokens.admin, body: {}, method: 'GET' })
  if (getRes.status !== 405) fail(`GET expected 405, got ${getRes.status}`)

  pass('validation, forbidden fields, OPTIONS, GET')
  console.log('')
}

async function stageSuccessfulProvisioning() {
  console.log('Stage 7: Successful provisioning')

  const login = `${FIXTURE_TAG}-new-employee`
  state.createdEmployeeLogins.push(login)

  const createRes = await invokeFunction({
    token: state.tokens.admin,
    body: validCreateBody(login),
  })

  if (createRes.status !== 201 || !createRes.json?.ok || !createRes.json?.employee) {
    fail(`Create expected 201, got ${createRes.status}`)
  }

  const employee = createRes.json.employee
  if (employee.login !== login.toLowerCase()) fail('Canonical login mismatch')
  if (employee.role_id !== state.roleIds.cashier) fail('role_id must come from server')
  if (employee.status !== 'active') fail('status must be active')
  if (!employee.auth_user_id) fail('auth_user_id missing in response')

  state.createdAuthUserIds.push(employee.auth_user_id)

  const pwdInDb = psqlScalar(`SELECT password FROM public.academy_users WHERE id = ${employee.id};`)
  if (pwdInDb && pwdInDb !== '' && pwdInDb !== "''") {
    if (pwdInDb === TEMP_PASSWORD) fail('Plaintext password stored in academy_users')
  }

  const responseText = JSON.stringify(createRes.json)
  if (responseText.includes(TEMP_PASSWORD)) fail('Response contains temporary password')
  if (responseText.includes('service_role')) fail('Response contains service_role')

  const technicalEmail = loginToTechnicalEmail(login)
  const anon = createClient(state.apiUrl, state.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = await anon.auth.signInWithPassword({ email: technicalEmail, password: TEMP_PASSWORD })
  if (signIn.error) fail(`New employee Auth login failed: ${signIn.error.message}`)

  const profile = await anon
    .from('academy_users')
    .select('id, auth_user_id')
    .eq('auth_user_id', signIn.data.user.id)
    .maybeSingle()
  if (profile.error || !profile.data) fail('Auth-first profile lookup failed after provisioning')
  if (profile.data.id !== employee.id) fail('Profile id mismatch after Auth-first login')

  await anon.auth.signOut()
  pass('create, password isolation, Auth-first login')
  console.log('')
}

async function stageDuplicateTests() {
  console.log('Stage 8: Duplicate login')

  const login = state.createdEmployeeLogins[0]
  const dup = await invokeFunction({
    token: state.tokens.admin,
    body: validCreateBody(login),
  })
  if (dup.status !== 409) fail(`Duplicate login expected 409, got ${dup.status}`)
  pass('duplicate login rejected')
  console.log('')
}

async function stageSecurityChecks() {
  console.log('Stage 7b: Security static checks')
  const indexSource = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/admin-create-employee/index.ts'),
    'utf8'
  )
  if (!indexSource.includes('employees.create')) fail('employees.create permission check missing')
  pass('permission checked in Edge Function')
  if (!indexSource.includes('deleteUser')) fail('rollback branch missing')
  pass('rollback branch present')

  const withoutForbiddenKeys = indexSource.replace(/const FORBIDDEN_BODY_KEYS[\s\S]*?\]\)/m, '')
  if (/\buser_metadata\b/.test(withoutForbiddenKeys)) {
    fail('user_metadata used for authorization in Edge Function')
  }
  pass('user_metadata not used for authorization')
  console.log('')
}

async function stageRegression() {
  console.log('Stage 9: Regression')
  const enabled = psqlScalar('SELECT COUNT(*) FROM public.notification_rules WHERE is_enabled = true;')
  if (enabled !== '0') fail(`Expected 0 enabled rules, got ${enabled}`)
  pass('notification rules disabled')
  console.log('')
}

async function stageCleanup() {
  console.log('Cleanup: removing provisioning test data')

  if (!state.container) {
    try {
      state.container = findDbContainer()
    } catch {
      return
    }
  }

  for (const login of state.createdEmployeeLogins) {
    psqlExec(`DELETE FROM public.academy_users WHERE login = '${login.toLowerCase()}';`)
  }

  psqlExec(`DELETE FROM public.academy_users WHERE full_name LIKE '%[${FIXTURE_TAG}]%';`)

  if (state.apiUrl && state.serviceRoleKey) {
    const admin = adminClient()
    for (const id of [...new Set(state.createdAuthUserIds)]) {
      if (id) await admin.auth.admin.deleteUser(id).catch(() => {})
    }
    for (const spec of Object.values(state.authUsers)) {
      if (spec?.id) await admin.auth.admin.deleteUser(spec.id).catch(() => {})
    }
  }

  pass('cleanup complete')
  console.log('')
}

main()
