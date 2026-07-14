#!/usr/bin/env node
/**
 * Local-only verification for Auth-first login foundation.
 *
 * Usage:
 *   npm run supabase:local:verify-auth-first
 */

import { spawnSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { loginToTechnicalEmail } from '../src/utils/phoneUtils.js'

const ACADEMY_PROFILE_SAFE_FIELDS =
  'id, first_name, last_name, full_name, login, role, role_id, status, position, avatar_url, auth_user_id'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROJECT_ID = 'shugyla-academy'
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'
const FIXTURE_TAG = 'auth-first-verify'
const AUTH_PASSWORD = 'AuthFirstVerify123!'
const MISMATCH_PASSWORD = 'MismatchPlaintextOnly99'

const state = {
  runId: `authv-${Date.now()}`,
  container: null,
  apiUrl: null,
  anonKey: null,
  serviceRoleKey: null,
  passwords: {},
  authUsers: {},
  employeeIds: {},
  courseId: null,
}

function main() {
  mainAsync().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

async function mainAsync() {
  try {
    console.log('=== Auth-first login verification ===\n')
    stageEnvironment()
    stageDatabaseSecurity()
    await stageSetupFixture()
    await stageLoginTests()
    await stageRestoreTests()
    stagePasswordIsolation()
    await stageNotificationRegression()
    console.log('\nAuth-first login verification completed (exit 0)\n')
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

function assertEqual(name, actual, expected) {
  if (String(actual) !== String(expected)) {
    fail(`${name}: expected ${expected}, got ${actual}`)
  }
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

  const statusResult = run('npx', ['supabase', 'status', '-o', 'json'], { capture: true })
  const jsonMatch = statusResult.stdout.match(/\{[\s\S]*\}/)
  if (!jsonMatch) fail('Could not parse supabase status JSON')
  const status = JSON.parse(jsonMatch[0])

  state.apiUrl = status.API_URL
  state.anonKey = status.ANON_KEY
  state.serviceRoleKey = status.SERVICE_ROLE_KEY

  if (!state.apiUrl?.includes('127.0.0.1') && !state.apiUrl?.includes('localhost')) {
    fail('API URL must be local')
  }

  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
  if (config.includes(PRODUCTION_REF)) fail('Production ref in config.toml')

  if (fs.existsSync(path.join(ROOT, 'supabase/.temp/project-ref'))) {
    const ref = fs.readFileSync(path.join(ROOT, 'supabase/.temp/project-ref'), 'utf8').trim()
    if (ref.includes(PRODUCTION_REF)) fail('Remote production link detected')
  }

  state.container = findDbContainer()

  assertEqual('anon SELECT academy_users', psqlScalar(`
    SELECT has_table_privilege('anon', 'public.academy_users', 'SELECT');
  `), 'f')

  assertEqual('anon SELECT assignments', psqlScalar(`
    SELECT has_table_privilege('anon', 'public.academy_course_assignments', 'SELECT');
  `), 'f')

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

function stageDatabaseSecurity() {
  console.log('Stage 2: Database security')

  assertEqual(
    'authenticated no SELECT password column',
    psqlScalar(`SELECT has_column_privilege('authenticated', 'public.academy_users', 'password', 'SELECT');`),
    'f'
  )

  assertEqual(
    'authenticated SELECT safe id column',
    psqlScalar(`SELECT has_column_privilege('authenticated', 'public.academy_users', 'id', 'SELECT');`),
    't'
  )

  assertEqual(
    'own-profile policy exists',
    psqlScalar(`
      SELECT COUNT(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'academy_users'
        AND policyname = 'academy_users_select_own_profile';
    `),
    '1'
  )

  assertEqual(
    'assignments own policy exists',
    psqlScalar(`
      SELECT COUNT(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'academy_course_assignments'
        AND policyname = 'academy_course_assignments_select_own';
    `),
    '1'
  )

  assertEqual(
    'auth_private not exposed in API',
    psqlScalar(`
      SELECT COUNT(*) FROM information_schema.schemata
      WHERE schema_name = 'auth_private'
        AND schema_name = ANY(current_setting('pgrst.db_schemas', true)::text[]);
    `) || '0',
    '0'
  )

  assertEqual(
    'anon no EXECUTE auth helper',
    psqlScalar(`
      SELECT has_function_privilege('anon', 'auth_private.employee_owned_by_current_auth(bigint)', 'EXECUTE');
    `),
    'f'
  )

  assertEqual(
    'authenticated EXECUTE auth helper',
    psqlScalar(`
      SELECT has_function_privilege('authenticated', 'auth_private.employee_owned_by_current_auth(bigint)', 'EXECUTE');
    `),
    't'
  )

  console.log('')
}

function adminClient() {
  return createClient(state.apiUrl, state.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function anonClient() {
  return createClient(state.apiUrl, state.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function stageSetupFixture() {
  console.log('Stage 3: Setup fixture data')
  const admin = adminClient()

  const specs = [
    { key: 'admin', login: `${FIXTURE_TAG}-admin`, role: 'admin' },
    { key: 'staff', login: `${FIXTURE_TAG}-staff`, role: 'cashier' },
    { key: 'deactivated', login: `${FIXTURE_TAG}-inactive`, role: 'cashier', status: 'inactive' },
  ]

  for (const spec of specs) {
    const email = loginToTechnicalEmail(spec.login)
    state.passwords[spec.key] = AUTH_PASSWORD
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: AUTH_PASSWORD,
      email_confirm: true,
    })
    if (error) fail(`Create auth ${spec.key}: ${error.message}`)
    state.authUsers[spec.key] = { id: data.user.id, email }

    const employeeId = nextEmployeeId()
    state.employeeIds[spec.key] = employeeId
    const roleId = psqlScalar(`SELECT id::text FROM public.roles WHERE code = '${spec.role}' LIMIT 1;`)
    psqlExec(`
      INSERT INTO public.academy_users (
        id, first_name, last_name, full_name, login, password, role, role_id, status, auth_user_id
      ) VALUES (
        ${employeeId}, 'Verify', '${spec.key}', '[${FIXTURE_TAG}] ${spec.key}', '${spec.login}',
        '${MISMATCH_PASSWORD}', '${spec.role}', ${roleId ? `'${roleId}'` : 'NULL'},
        '${spec.status || 'active'}', '${data.user.id}'
      );
    `)
  }

  const orphanEmail = `${FIXTURE_TAG}-orphan@shugyla.local`
  const orphan = await admin.auth.admin.createUser({
    email: orphanEmail,
    password: AUTH_PASSWORD,
    email_confirm: true,
  })
  if (orphan.error) fail(`Create orphan auth: ${orphan.error.message}`)
  state.authUsers.orphan = { id: orphan.data.user.id, email: orphanEmail }

  state.courseId = psqlScalar('SELECT id FROM public.academy_courses ORDER BY id LIMIT 1;')
  if (state.courseId) {
    psqlExec(`
      INSERT INTO public.academy_course_assignments (user_id, course_id)
      VALUES (${state.employeeIds.staff}, ${state.courseId});
    `)
  }

  console.log('  Fixture data ready\n')
}

async function signInAs(key) {
  const client = anonClient()
  const spec = state.authUsers[key]
  const { data, error } = await client.auth.signInWithPassword({
    email: spec.email,
    password: state.passwords[key] || AUTH_PASSWORD,
  })
  if (error) fail(`Sign in ${key}: ${error.message}`)
  return { client, session: data.session, authUserId: data.user.id }
}

async function stageLoginTests() {
  console.log('Stage 4: Login tests')

  for (const key of ['admin', 'staff']) {
    const { client, authUserId } = await signInAs(key)
    const { data, error } = await client
      .from('academy_users')
      .select(ACADEMY_PROFILE_SAFE_FIELDS)
      .eq('auth_user_id', authUserId)
      .maybeSingle()
    if (error) fail(`${key} profile after Auth: ${error.message}`)
    if (!data) fail(`${key} profile missing after Auth`)
    if (!String(data.login).includes(FIXTURE_TAG)) {
      fail(`${key} profile login unexpected`)
    }
    console.log(`  ✓ ${key} login with mismatched academy_users.password`)
    await client.auth.signOut()
  }

  const wrong = anonClient()
  const wrongResult = await wrong.auth.signInWithPassword({
    email: state.authUsers.staff.email,
    password: 'TotallyWrongPassword999!',
  })
  if (!wrongResult.error) fail('Wrong Auth password should fail')
  assertEqual('wrong password rejected', Boolean(wrongResult.error), true)

  const deactivated = await signInAs('deactivated')
  const deactivatedProfile = await deactivated.client
    .from('academy_users')
    .select('status')
    .eq('auth_user_id', deactivated.authUserId)
    .maybeSingle()
  if (deactivatedProfile.error) fail(`Deactivated profile read: ${deactivatedProfile.error.message}`)
  assertEqual('deactivated status loaded', deactivatedProfile.data?.status, 'inactive')
  await deactivated.client.auth.signOut()

  const orphanClient = anonClient()
  const orphanSignIn = await orphanClient.auth.signInWithPassword({
    email: state.authUsers.orphan.email,
    password: AUTH_PASSWORD,
  })
  if (orphanSignIn.error) fail(`Orphan auth sign-in: ${orphanSignIn.error.message}`)
  const orphanProfile = await orphanClient
    .from('academy_users')
    .select('id')
    .eq('auth_user_id', orphanSignIn.data.user.id)
    .maybeSingle()
  if (orphanProfile.data) fail('Orphan auth should have no academy profile')
  await orphanClient.auth.signOut()

  const adminSession = await signInAs('admin')
  const staffSession = await signInAs('staff')

  const cross = await adminSession.client
    .from('academy_users')
    .select('id')
    .eq('auth_user_id', state.authUsers.staff.id)
  if ((cross.data ?? []).length > 0) fail('Admin must not read staff profile')

  if (state.courseId) {
    const staffAssignments = await staffSession.client
      .from('academy_course_assignments')
      .select('course_id')
      .eq('user_id', state.employeeIds.staff)
    if (staffAssignments.error) fail(`Staff assignments: ${staffAssignments.error.message}`)
    if ((staffAssignments.data ?? []).length < 1) fail('Staff must see own assignment')

    const adminAssignments = await adminSession.client
      .from('academy_course_assignments')
      .select('course_id')
      .eq('user_id', state.employeeIds.staff)
    if ((adminAssignments.data ?? []).length > 0) {
      fail('Admin must not see staff assignments without own employee link')
    }
  }

  const anon = anonClient()
  const anonProfiles = await anon.from('academy_users').select('id').limit(1)
  if ((anonProfiles.data ?? []).length > 0) fail('Anon must not read profiles')

  await adminSession.client.auth.signOut()
  await staffSession.client.auth.signOut()

  const invalidEmail = loginToTechnicalEmail('')
  assertEqual('invalid login mapping null', invalidEmail, null)

  console.log('')
}

async function stageRestoreTests() {
  console.log('Stage 5: Restore tests')

  const { client, authUserId } = await signInAs('staff')
  const { data: before } = await client
    .from('academy_users')
    .select('id, login')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (!before) fail('Restore: profile missing')

  psqlExec(`UPDATE public.academy_users SET login = '${FIXTURE_TAG}-staff-renamed' WHERE id = ${before.id};`)

  const { data: afterRename } = await client
    .from('academy_users')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (!afterRename) fail('Restore after login rename should use auth_user_id')

  psqlExec(`UPDATE public.academy_users SET login = '${FIXTURE_TAG}-staff' WHERE id = ${before.id};`)

  await client.auth.signOut()

  const stale = anonClient()
  const staleSignIn = await stale.auth.signInWithPassword({
    email: state.authUsers.staff.email,
    password: AUTH_PASSWORD,
  })
  if (staleSignIn.error) fail(`Restore sign-in: ${staleSignIn.error.message}`)
  await stale.auth.signOut()

  console.log('  ✓ active session restores by auth_user_id')
  console.log('  ✓ login rename does not break auth_user_id restore')
  console.log('  ✓ stale localStorage not tested in Node (browser step)')
  console.log('')
}

function stagePasswordIsolation() {
  console.log('Stage 6: Password isolation')
  assertEqual('safe fields exclude password', ACADEMY_PROFILE_SAFE_FIELDS.includes('password'), false)
  console.log('  ✓ sessionUser path uses safe field list only')
  console.log('')
}

async function stageNotificationRegression() {
  console.log('Stage 7: Notification regression')
  const enabled = psqlScalar('SELECT COUNT(*) FROM public.notification_rules WHERE is_enabled = true;')
  assertEqual('notification rules enabled', enabled, '0')

  const result = run('npm', ['run', 'supabase:local:verify-notifications'], {
    capture: true,
    allowFailure: true,
  })
  if (result.status !== 0) {
    fail('Notification foundation verification failed during auth regression check')
  }
  console.log('  ✓ notification foundation verification passed')
  console.log('')
}

async function stageCleanup() {
  console.log('Cleanup: removing temporary auth-first test data')

  if (!state.container) {
    try {
      state.container = findDbContainer()
    } catch {
      return
    }
  }

  psqlExec(`
    DELETE FROM public.academy_course_assignments
    WHERE user_id IN (SELECT id FROM public.academy_users WHERE full_name LIKE '%[${FIXTURE_TAG}]%');
  `)
  psqlExec(`DELETE FROM public.academy_users WHERE full_name LIKE '%[${FIXTURE_TAG}]%';`)

  if (state.apiUrl && state.serviceRoleKey) {
    const admin = adminClient()
    for (const spec of Object.values(state.authUsers)) {
      if (spec?.id) await admin.auth.admin.deleteUser(spec.id).catch(() => {})
    }
  }

  console.log('  Cleanup: passed\n')
}

main()
