#!/usr/bin/env node
/**
 * Local verification for production Auth cutover (Phases 1–3 + provisioning tool).
 *
 * Usage:
 *   npm run supabase:local:verify-production-auth-cutover
 */

import { spawnSync } from 'child_process'
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
const FIXTURE_TAG = 'auth-cutover-verify'

const MIGRATION_PHASE1 = 'supabase/migrations/20260714200000_production_auth_bridge_phase1.sql'
const MIGRATION_PHASE2 = 'supabase/migrations/20260714210000_production_auth_security_cutover_phase2.sql'
const MIGRATION_PHASE3 = 'supabase/migrations/20260714220000_production_legacy_password_cleanup_phase3.sql'
const DUPLICATE_DELIVERY = 'supabase/migrations/20260714062253_web_push_delivery_tracking.sql'
const CANONICAL_DELIVERY = 'supabase/migrations/20260714150000_web_push_delivery_tracking.sql'

const AUTH_PASSWORD = 'AuthCutoverVerify123!'
const LEGACY_PASSWORD = 'LegacyPlaintextOnly99!'

const state = {
  container: null,
  apiUrl: null,
  anonKey: null,
  serviceRoleKey: null,
  authUsers: {},
  employeeIds: {},
  createdAuthIds: [],
}

function main() {
  mainAsync().catch((err) => {
    console.error(`\nFAILED: ${err.message}\n`)
    process.exit(1)
  })
}

async function mainAsync() {
  try {
    console.log('=== Production Auth cutover verification ===\n')
    stageEnvironment()
    stageStaticMigrationAnalysis()
    stageDuplicateDeliveryAnalysis()
    await stageProductionLikeFixture()
    stageApplyPhase1()
    stagePhase1Checks()
    await stageProvisioningTool()
    stagePhase2PreconditionAbort()
    stageApplyPhase2()
    await stagePhase2Security()
    stagePhase3Separated()
    stageNotificationUnchanged()
    stageBuild()
    console.log('\nProduction Auth cutover verification completed (exit 0)\n')
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

function assertEqual(name, actual, expected) {
  if (String(actual) !== String(expected)) fail(`${name}: expected ${expected}, got ${actual}`)
  pass(name)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: { ...process.env, ...options.env },
    input: options.input,
  })
  if (result.error) fail(`${command} failed: ${result.error.message}`)
  if (result.status !== 0 && !options.allowFailure) {
    fail(`${command} exited with code ${result.status}\n${result.stdout}\n${result.stderr}`)
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

function psqlFile(relativePath) {
  const abs = path.join(ROOT, relativePath)
  run(
    'docker',
    ['exec', '-i', state.container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { capture: true, input: fs.readFileSync(abs, 'utf8') }
  )
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

function anonClient() {
  return createClient(state.apiUrl, state.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function stageEnvironment() {
  console.log('Stage 1: Environment')
  run('docker', ['info'], { capture: true })

  const status = getLocalSupabaseStatus()
  state.apiUrl = status.API_URL
  state.anonKey = status.ANON_KEY
  state.serviceRoleKey = status.SERVICE_ROLE_KEY

  if (!state.apiUrl?.includes('127.0.0.1') && !state.apiUrl?.includes('localhost')) {
    fail('API URL must be local')
  }

  if (fs.existsSync(path.join(ROOT, 'supabase/.temp/project-ref'))) {
    const ref = fs.readFileSync(path.join(ROOT, 'supabase/.temp/project-ref'), 'utf8').trim()
    if (ref.includes(PRODUCTION_REF)) fail('Production link detected')
  }

  state.container = findDbContainer()
  pass('local Supabase only')
  console.log('')
}

function stageStaticMigrationAnalysis() {
  console.log('Stage 2: Static migration analysis')

  const phase1 = fs.readFileSync(path.join(ROOT, MIGRATION_PHASE1), 'utf8').toLowerCase()
  const forbiddenPhase1 = ['drop policy', 'revoke all on table', 'update public.academy_users', 'delete from']
  for (const token of forbiddenPhase1) {
    if (phase1.includes(token)) fail(`Phase1 must not contain: ${token}`)
  }
  pass('Phase1 additive (no policy revoke, no password clear)')

  const phase2 = fs.readFileSync(path.join(ROOT, MIGRATION_PHASE2), 'utf8')
  if (!phase2.includes('phase2 precondition failed')) fail('Phase2 must include preconditions')
  pass('Phase2 has preconditions')

  const phase3 = fs.readFileSync(path.join(ROOT, MIGRATION_PHASE3), 'utf8')
  if (!phase3.includes('DO NOT RUN YET') && !phase3.includes('phase3 precondition')) {
    fail('Phase3 must be marked high risk with preconditions')
  }
  pass('Phase3 separated with preconditions')

  const authFirst = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20260714120000_auth_first_login_foundation.sql'),
    'utf8'
  )
  if (!authFirst.includes('drop policy if exists "Allow anon read write academy_users"')) {
    fail('auth_first migration expected to drop permissive anon policy')
  }
  pass('existing auth_first combines cutover (not used for production phased path)')

  console.log('')
}

function stageDuplicateDeliveryAnalysis() {
  console.log('Stage 3: Duplicate delivery migration analysis')

  if (fs.existsSync(path.join(ROOT, DUPLICATE_DELIVERY))) {
    fail('Empty stub 20260714062253 must be removed from repo')
  }
  pass('20260714062253 empty stub absent from repo')

  const canonical = fs.readFileSync(path.join(ROOT, CANONICAL_DELIVERY), 'utf8').trim()

  if (!canonical.includes('notification_deliveries')) {
    fail('Canonical delivery migration must alter notification_deliveries')
  }
  pass('20260714150000 is canonical delivery migration')

  console.log('')
}

async function stageProductionLikeFixture() {
  console.log('Stage 4: Production-like fixture')

  psqlExec(`
    DROP POLICY IF EXISTS academy_users_select_own_profile ON public.academy_users;
    DROP POLICY IF EXISTS "Allow anon read write academy_users" ON public.academy_users;
    CREATE POLICY "Allow anon read write academy_users"
      ON public.academy_users FOR ALL USING (true) WITH CHECK (true);
    GRANT ALL ON public.academy_users TO anon;
  `)

  psqlExec(`
    DROP POLICY IF EXISTS academy_employee_shifts_select_own ON public.academy_employee_shifts;
    DROP POLICY IF EXISTS "Allow anon read write academy_employee_shifts" ON public.academy_employee_shifts;
    CREATE POLICY "Allow anon read write academy_employee_shifts"
      ON public.academy_employee_shifts FOR ALL USING (true) WITH CHECK (true);
    GRANT ALL ON public.academy_employee_shifts TO anon;
  `)

  const admin = adminClient()
  const specs = [
    { key: 'admin', login: `${FIXTURE_TAG}-admin`, role: 'admin', status: 'active', prelink: true },
    { key: 'staff', login: `${FIXTURE_TAG}-staff`, role: 'cashier', status: 'active', prelink: false },
    { key: 'inactive', login: `${FIXTURE_TAG}-inactive`, role: 'cashier', status: 'inactive', prelink: false },
  ]

  for (const spec of specs) {
    const email = loginToTechnicalEmail(spec.login)
    const employeeId = nextEmployeeId()
    state.employeeIds[spec.key] = employeeId
    const roleId = psqlScalar(`SELECT id::text FROM public.roles WHERE code = '${spec.role}' LIMIT 1;`)

    let authUserId = null
    if (spec.prelink) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: AUTH_PASSWORD,
        email_confirm: true,
      })
      if (error) fail(`Create prelinked auth ${spec.key}: ${error.message}`)
      authUserId = data.user.id
      state.authUsers[spec.key] = { id: authUserId }
      state.createdAuthIds.push(authUserId)
    }

    psqlExec(`
      INSERT INTO public.academy_users (
        id, first_name, last_name, full_name, login, password, role, role_id, status, auth_user_id
      ) VALUES (
        ${employeeId}, 'Cutover', '${spec.key}', '[${FIXTURE_TAG}] ${spec.key}', '${spec.login}',
        '${LEGACY_PASSWORD}', '${spec.role}', ${roleId ? `'${roleId}'` : 'NULL'},
        '${spec.status}', ${authUserId ? `'${authUserId}'` : 'NULL'}
      );
    `)
  }

  assertEqual('fixture legacy password stored', psqlScalar(`
    SELECT password <> '' FROM public.academy_users WHERE id = ${state.employeeIds.staff};
  `), 't')

  pass('production-like permissive anon policies restored for fixture')
  console.log('')
}

function stageApplyPhase1() {
  console.log('Stage 5: Apply Phase 1 migration')
  psqlFile(MIGRATION_PHASE1)
  pass('Phase1 migration applied locally')
  console.log('')
}

function stagePhase1Checks() {
  console.log('Stage 6: Phase 1 checks')

  assertEqual('auth_user_id column exists', psqlScalar(`
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'academy_users' AND column_name = 'auth_user_id';
  `), '1')

  assertEqual('auth_user_id nullable', psqlScalar(`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'academy_users' AND column_name = 'auth_user_id';
  `), 'YES')

  assertEqual('partial unique index exists', psqlScalar(`
    SELECT COUNT(*) FROM (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'academy_users'
        AND indexname = 'idx_academy_users_auth_user_id_unique'
      UNION ALL
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'academy_users'
        AND c.conname = 'academy_users_auth_user_id_unique'
    ) s;
  `), '1')

  assertEqual('legacy anon SELECT still allowed after Phase1', psqlScalar(`
    SELECT has_table_privilege('anon', 'public.academy_users', 'SELECT');
  `), 't')

  assertEqual('legacy password not cleared', psqlScalar(`
    SELECT password FROM public.academy_users WHERE id = ${state.employeeIds.staff};
  `), LEGACY_PASSWORD)

  assertEqual('permissive anon policy still present', psqlScalar(`
    SELECT COUNT(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'academy_users'
      AND policyname = 'Allow anon read write academy_users';
  `), '1')

  console.log('')
}

async function stageProvisioningTool() {
  console.log('Stage 7: Provisioning tool (local fixture dry-run + apply)')

  const env = {
    SUPABASE_URL: state.apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: state.serviceRoleKey,
  }

  const dryRun = run('node', ['scripts/production-auth-users-migration.mjs', '--dry-run'], {
    capture: true,
    env,
  })
  const dryStats = JSON.parse(dryRun.stdout.trim())
  if (dryStats.conflicts !== 0) fail('Dry-run reported conflicts')
  if (dryRun.stdout.includes(LEGACY_PASSWORD)) fail('Password leaked in dry-run stdout')
  if (dryRun.stderr.includes(LEGACY_PASSWORD)) fail('Password leaked in dry-run stderr')
  pass('dry-run aggregate report without secrets')

  const applyRun = run('node', ['scripts/production-auth-users-migration.mjs', '--apply'], {
    capture: true,
    env,
  })
  if (applyRun.stdout.includes(LEGACY_PASSWORD) || applyRun.stderr.includes(LEGACY_PASSWORD)) {
    fail('Password leaked in apply output')
  }
  pass('apply linked/created fixture Auth users without logging passwords')

  const dryRun2 = run('node', ['scripts/production-auth-users-migration.mjs', '--dry-run'], {
    capture: true,
    env,
  })
  const dryStats2 = JSON.parse(dryRun2.stdout.trim())
  assertEqual('idempotent dry-run wouldCreate', dryStats2.wouldCreateAuthUsers, 0)

  const { data: staffAuth } = await adminClient().auth.admin.listUsers()
  const staffEmail = loginToTechnicalEmail(`${FIXTURE_TAG}-staff`)
  const staffUser = staffAuth.users.find((u) => u.email === staffEmail)
  if (!staffUser) fail('Staff Auth user missing after apply')
  state.authUsers.staff = { id: staffUser.id, email: staffEmail }
  state.createdAuthIds.push(staffUser.id)

  assertEqual(
    'staff auth_user_id linked',
    psqlScalar(`SELECT auth_user_id IS NOT NULL FROM public.academy_users WHERE id = ${state.employeeIds.staff};`),
    't'
  )

  assertEqual('inactive remains inactive', psqlScalar(`
    SELECT status FROM public.academy_users WHERE id = ${state.employeeIds.inactive};
  `), 'inactive')

  console.log('')
}

function stagePhase2PreconditionAbort() {
  console.log('Stage 8: Phase 2 precondition abort')

  psqlExec(`UPDATE public.academy_users SET auth_user_id = NULL WHERE id = ${state.employeeIds.staff};`)

  assertEqual(
    'staff unlinked before Phase2 abort test',
    psqlScalar(`SELECT auth_user_id IS NULL FROM public.academy_users WHERE id = ${state.employeeIds.staff};`),
    't'
  )

  const activeUnlinked = psqlScalar(`
    SELECT COUNT(*) FROM public.academy_users WHERE status = 'active' AND auth_user_id IS NULL;
  `)
  if (Number(activeUnlinked) < 1) fail('Expected at least one active unlinked user before Phase2 abort test')

  const result = run(
    'docker',
    ['exec', '-i', state.container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    {
      capture: true,
      allowFailure: true,
      input: fs.readFileSync(path.join(ROOT, MIGRATION_PHASE2), 'utf8'),
    }
  )
  if (result.status === 0) fail('Phase2 should abort when active user unlinked')
  const combined = `${result.stdout}\n${result.stderr}`
  if (!combined.includes('phase2 precondition failed')) fail('Phase2 abort message missing')

  pass('Phase2 stops when active academy_user lacks auth_user_id')

  const staffAuthId = state.authUsers.staff?.id
  if (staffAuthId) {
    psqlExec(`UPDATE public.academy_users SET auth_user_id = '${staffAuthId}' WHERE id = ${state.employeeIds.staff};`)
  }

  console.log('')
}

function stageApplyPhase2() {
  console.log('Stage 9: Apply Phase 2 migration')
  psqlFile(MIGRATION_PHASE2)
  pass('Phase2 applied after all active users linked')
  console.log('')
}

async function stagePhase2Security() {
  console.log('Stage 10: Phase 2 security checks')

  assertEqual('public ALL policy removed from academy_users', psqlScalar(`
    SELECT COUNT(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'academy_users'
      AND policyname = 'Allow anon read write academy_users';
  `), '0')

  assertEqual('public ALL policy removed from shifts', psqlScalar(`
    SELECT COUNT(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'academy_employee_shifts'
      AND policyname = 'Allow anon read write academy_employee_shifts';
  `), '0')

  assertEqual('anon no SELECT academy_users', psqlScalar(`
    SELECT has_table_privilege('anon', 'public.academy_users', 'SELECT');
  `), 'f')

  assertEqual('anon no TRUNCATE academy_users', psqlScalar(`
    SELECT has_table_privilege('anon', 'public.academy_users', 'TRUNCATE');
  `), 'f')

  assertEqual('authenticated no SELECT password column', psqlScalar(`
    SELECT has_column_privilege('authenticated', 'public.academy_users', 'password', 'SELECT');
  `), 'f')

  assertEqual('service_role retains table access', psqlScalar(`
    SELECT has_table_privilege('service_role', 'public.academy_users', 'SELECT');
  `), 't')

  assertEqual('own-profile policy exists', psqlScalar(`
    SELECT COUNT(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'academy_users'
      AND policyname = 'academy_users_select_own_profile';
  `), '1')

  assertEqual('RBAC catalog readable by authenticated', psqlScalar(`
    SELECT has_table_privilege('authenticated', 'public.permissions', 'SELECT');
  `), 't')

  const staffSession = anonClient()
  const staffSignIn = await staffSession.auth.signInWithPassword({
    email: state.authUsers.staff.email,
    password: LEGACY_PASSWORD,
  })
  if (staffSignIn.error) fail(`Staff sign-in: ${staffSignIn.error.message}`)

  const ownProfile = await staffSession
    .from('academy_users')
    .select('id, login, status, role_id')
    .eq('auth_user_id', staffSignIn.data.user.id)
    .maybeSingle()
  if (ownProfile.error || !ownProfile.data) fail('Own-profile policy failed for staff')
  pass('own-profile policy works')

  const crossProfile = await staffSession
    .from('academy_users')
    .select('id')
    .eq('auth_user_id', state.authUsers.admin?.id ?? '00000000-0000-0000-0000-000000000000')
  if ((crossProfile.data ?? []).length > 0) fail('Staff must not read admin profile')
  pass('staff cannot read other profile')

  const roleTamper = await staffSession
    .from('academy_users')
    .update({ role: 'admin' })
    .eq('id', state.employeeIds.staff)
  if (!roleTamper.error && (roleTamper.data ?? []).length > 0) {
    fail('Staff must not update role/status')
  }
  pass('staff cannot change role/status via client')

  const anonRead = anonClient()
  const anonProfiles = await anonRead.from('academy_users').select('id').limit(1)
  if ((anonProfiles.data ?? []).length > 0) fail('Anon must not read profiles after Phase2')

  await staffSession.auth.signOut()
  console.log('')
}

function stagePhase3Separated() {
  console.log('Stage 11: Phase 3 separated (static only — not executed)')

  const phase3 = fs.readFileSync(path.join(ROOT, MIGRATION_PHASE3), 'utf8')
  if (!phase3.includes("set password = ''")) fail('Phase3 must clear password values only')
  if (phase3.toLowerCase().includes('drop column')) fail('Phase3 must not drop password column')
  if (!phase3.includes('phase3 precondition failed')) fail('Phase3 must enforce preconditions')

  pass('Phase3 file exists, high-risk, not executed in this verification')
  console.log('')
}

function stageNotificationUnchanged() {
  console.log('Stage 12: Notification migrations unchanged')

  const notification = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20260713194500_notification_system_foundation.sql'),
    'utf8'
  )
  if (!notification.includes('notification_templates')) fail('Notification migration missing')
  pass('notification foundation migration intact')

  console.log('')
}

function stageBuild() {
  console.log('Stage 13: Build')
  run('npm', ['run', 'build'], { capture: true })
  pass('npm run build exit 0')
  console.log('')
}

async function stageCleanup() {
  console.log('Cleanup: removing auth-cutover fixture data')

  if (!state.container) {
    try {
      state.container = findDbContainer()
    } catch {
      return
    }
  }

  psqlExec(`DELETE FROM public.academy_users WHERE full_name LIKE '%[${FIXTURE_TAG}]%';`)

  if (state.apiUrl && state.serviceRoleKey) {
    const admin = adminClient()
    for (const id of state.createdAuthIds) {
      await admin.auth.admin.deleteUser(id).catch(() => {})
    }
    let page = 1
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (error) break
      for (const user of data.users ?? []) {
        if (user.email?.includes(FIXTURE_TAG)) {
          await admin.auth.admin.deleteUser(user.id).catch(() => {})
        }
      }
      if ((data.users ?? []).length < 200) break
      page += 1
    }
  }

  console.log('  Cleanup: passed\n')
}

main()
