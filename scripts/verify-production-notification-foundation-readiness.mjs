#!/usr/bin/env node
/**
 * Production notification foundation readiness verification.
 * Read-only checks — no mutations, no secret values printed.
 *
 * Usage:
 *   npm run verify:production-notification-foundation-readiness
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'

const REQUIRED_TABLES = [
  'notification_templates',
  'notification_rules',
  'notifications',
  'notification_push_subscriptions',
  'notification_deliveries',
  'notification_preferences',
]

const REQUIRED_RULES = [
  'time_tracker.rule.shift_start_soon',
  'time_tracker.rule.clock_in_missing',
  'time_tracker.rule.shift_end_reached',
  'time_tracker.rule.clock_out_missing',
]

const NOTIFICATION_FUNCTIONS = [
  { name: 'manage-push-subscription', verify_jwt: true },
  { name: 'send-test-web-push', verify_jwt: true },
  { name: 'dispatch-time-tracker-notifications', verify_jwt: true },
  { name: 'run-time-tracker-notification-scheduler', verify_jwt: false },
]

const EMPLOYEE_FUNCTIONS = [
  'admin-create-employee',
  'admin-list-employees',
  'admin-update-employee',
]

const RECONCILIATION_MIGRATIONS = [
  '20260714230000_production_notification_foundation_reconciliation.sql',
  '20260714231000_production_web_push_foundation_reconciliation.sql',
  '20260714232000_production_notification_grants_reconciliation.sql',
]

const CANONICAL_DELIVERY = 'supabase/migrations/20260714150000_web_push_delivery_tracking.sql'
const EMPTY_STUB = 'supabase/migrations/20260714062253_web_push_delivery_tracking.sql'
const PHASE3 = 'supabase/migrations/20260714220000_production_legacy_password_cleanup_phase3.sql'

const VAPID_SECRET_NAMES = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']

const EXPECTED_BASELINE = {
  academyUsers: 18,
  authUsers: 18,
  linked: 18,
  unlinked: 0,
  activeUsers: 10,
  activeLinked: 10,
  inactiveUsers: 8,
  roles: 9,
  rolePermissions: 137,
  legacyPasswordsNonempty: 18,
  duplicateLinks: 0,
  orphanLinks: 0,
}

const EXPECTED_FINGERPRINTS = {
  academy_users: '2db1f3bd96bab76e2dae079250882714',
  academy_employee_shifts: '7294e354656ea92fa315693e0e24cf9d',
  roles: 'f443f5326ab4ddc4b807de653958ce5d',
  permissions: 'dd3ed66c9c004ffeab5cdb2ce4bea9d8',
  role_permissions: '0658d2ae42184583e2bb7c83c115594a',
}
const EXPECTED_SHIFTS_ROW_COUNT = 190
const FINGERPRINT_SQL = 'scripts/lib/production-business-fingerprints.sql'

function fail(message) {
  throw new Error(message)
}

function pass(name) {
  console.log(`  ✓ ${name}`)
}

function assert(name, condition, detail = '') {
  if (!condition) fail(`${name}${detail ? `: ${detail}` : ''}`)
  pass(name)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: { ...process.env, ...options.env },
  })
  if (!options.allowFailure && result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    fail(`${command} ${args.join(' ')} exited ${result.status}${detail ? `: ${detail.slice(0, 500)}` : ''}`)
  }
  return result
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function linkedRef() {
  const refPath = path.join(ROOT, 'supabase/.temp/project-ref')
  if (!fs.existsSync(refPath)) return null
  return fs.readFileSync(refPath, 'utf8').trim()
}

function dbQueryJson(sql) {
  const result = run(
    'npm',
    ['exec', '--yes', 'supabase@2.109.1', '--', 'db', 'query', '--linked', sql, '-o', 'json'],
    { capture: true }
  )
  const jsonStart = result.stdout.indexOf('{')
  if (jsonStart < 0) fail('db query did not return JSON')
  const payload = JSON.parse(result.stdout.slice(jsonStart))
  if (!payload.rows?.[0]) fail('db query returned no rows')
  return payload.rows[0]
}

function parseFunctionsList(stdout) {
  const jsonStart = stdout.indexOf('[')
  if (jsonStart < 0) fail('functions list output missing JSON array')
  return JSON.parse(stdout.slice(jsonStart))
}

function parseSecretNames(stdout) {
  const jsonStart = stdout.indexOf('[')
  if (jsonStart < 0) fail('secrets list output missing JSON array')
  const rows = JSON.parse(stdout.slice(jsonStart))
  return rows.map((row) => row.name).filter(Boolean)
}

function stageRepoStatic() {
  console.log('Stage 1: Repository static checks')

  assert('empty stub absent', !fs.existsSync(path.join(ROOT, EMPTY_STUB)))
  assert('canonical delivery migration present', fs.existsSync(path.join(ROOT, CANONICAL_DELIVERY)))

  for (const file of RECONCILIATION_MIGRATIONS) {
    const rel = `supabase/migrations/${file}`
    assert(`reconciliation migration ${file} present`, fs.existsSync(path.join(ROOT, rel)))
    const sql = read(rel).toLowerCase()
    assert(`${file} has no auth_user_id column add`, !sql.includes('add column auth_user_id'))
    assert(`${file} has no phase3 password cleanup`, !sql.includes("set password = ''"))
    assert(`${file} has no cron schedule`, !sql.includes('cron.schedule'))
  }

  const phase3 = read(PHASE3)
  assert('Phase 3 file marked high risk', phase3.includes('DO NOT RUN YET') || phase3.includes('phase3 precondition'))

  const gitPrivate = run('git', ['grep', '-n', 'VAPID_PRIVATE_KEY', '--', 'src', 'dist', 'public'], {
    capture: true,
    allowFailure: true,
  })
  assert('VAPID_PRIVATE_KEY absent from tracked src/dist/public', !gitPrivate.stdout.trim())

  for (const rel of ['src', 'public']) {
    const abs = path.join(ROOT, rel)
    if (!fs.existsSync(abs)) continue
    const grep = run('grep', ['-r', '-l', 'VAPID_PRIVATE_KEY', rel], { capture: true, allowFailure: true })
    assert(`VAPID_PRIVATE_KEY absent from ${rel}`, !grep.stdout.trim())
  }

  console.log('')
}

function stageProductionLink() {
  console.log('Stage 2: Production link guard')
  const ref = linkedRef()
  assert('Supabase project linked', ref === PRODUCTION_REF, `expected ${PRODUCTION_REF}, got ${ref ?? 'none'}`)
  console.log('')
}

function parseMigrationList(stdout) {
  const jsonStart = stdout.indexOf('{')
  if (jsonStart < 0) fail('migration list output missing JSON object')
  const payload = JSON.parse(stdout.slice(jsonStart))
  return payload.migrations ?? []
}

function stageMigrationHistory() {
  console.log('Stage 3: Migration history')

  const result = run(
    'npm',
    ['exec', '--yes', 'supabase@2.109.1', '--', 'migration', 'list', '--linked'],
    { capture: true }
  )
  const migrations = parseMigrationList(result.stdout)
  const remoteVersions = new Set(migrations.map((row) => row.remote).filter(Boolean))
  const localOnly = new Set(
    migrations.filter((row) => row.local && !row.remote).map((row) => row.local)
  )

  for (const version of [
    '20260714230000',
    '20260714231000',
    '20260714232000',
    '20260714172032',
    '20260714210000',
  ]) {
    assert(`migration ${version} applied on remote`, remoteVersions.has(version))
  }

  assert('empty stub version absent from remote history', !remoteVersions.has('20260714062253'))
  assert('Phase 3 not applied on remote', !remoteVersions.has('20260714220000'))
  assert('Phase 3 remains local-only pending', localOnly.has('20260714220000'))

  for (const version of [
    '20260713194500',
    '20260714120000',
    '20260714130000',
    '20260714140000',
    '20260714150000',
    '20260714160000',
  ]) {
    assert(`legacy migration ${version} repaired on remote`, remoteVersions.has(version))
  }

  console.log('')
}

function stageNotificationObjects() {
  console.log('Stage 4: Notification database objects')

  const tables = dbQueryJson(`
    select coalesce(json_agg(t.table_name order by t.table_name), '[]'::json) as tables
    from (
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name like 'notification_%'
    ) t;
  `)

  for (const table of REQUIRED_TABLES) {
    assert(`table ${table} exists`, tables.tables.includes(table))
  }

  const counts = dbQueryJson(`
    select
      (select count(*)::int from public.notification_templates) as templates,
      (select count(*)::int from public.notification_rules) as rules,
      (select count(*)::int from public.notification_rules where is_enabled = true) as rules_enabled,
      (select count(*)::int from public.notifications) as notifications,
      (select count(*)::int from public.notification_push_subscriptions) as subscriptions,
      (select count(*)::int from public.notification_deliveries) as deliveries;
  `)

  assert('templates count = 4', counts.templates === 4)
  assert('rules count = 4', counts.rules === 4)
  assert('enabled rules = 0', counts.rules_enabled === 0)
  assert('notifications count = 0', counts.notifications === 0)
  assert('subscriptions count = 0', counts.subscriptions === 0)
  assert('deliveries count = 0', counts.deliveries === 0)

  const ruleCodes = dbQueryJson(`
    select coalesce(json_agg(code order by code), '[]'::json) as codes
    from public.notification_rules;
  `)
  for (const code of REQUIRED_RULES) {
    assert(`rule ${code} exists`, ruleCodes.codes.includes(code))
  }

  const rls = dbQueryJson(`
    select
      bool_and(c.relrowsecurity) as rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'notification_templates','notification_rules','notifications',
        'notification_push_subscriptions','notification_deliveries','notification_preferences'
      );
  `)
  assert('RLS enabled on notification tables', rls.rls_enabled === true)

  const anon = dbQueryJson(`
    select
      has_table_privilege('anon', 'public.notifications', 'SELECT') as anon_notif_select,
      has_table_privilege('anon', 'public.notification_push_subscriptions', 'SELECT') as anon_sub_select;
  `)
  assert('anon cannot SELECT notifications', anon.anon_notif_select === false)
  assert('anon cannot SELECT push subscriptions', anon.anon_sub_select === false)

  const service = dbQueryJson(`
    select
      has_table_privilege('service_role', 'public.notifications', 'SELECT') as sr_notif_select,
      has_table_privilege('service_role', 'public.notification_deliveries', 'INSERT') as sr_delivery_insert;
  `)
  assert('service_role can SELECT notifications', service.sr_notif_select === true)
  assert('service_role can INSERT deliveries', service.sr_delivery_insert === true)

  const cronExt = dbQueryJson(`select count(*)::int as has_cron from pg_extension where extname = 'pg_cron';`)
  const cronJobs =
    cronExt.has_cron === 0
      ? 0
      : dbQueryJson(`
          select count(*)::int as cron_jobs
          from cron.job
          where jobname ilike '%notification%' or command ilike '%notification%';
        `).cron_jobs
  assert('notification cron jobs = 0', cronJobs === 0)

  console.log('')
}

function stageBusinessBaseline() {
  console.log('Stage 5: Business baseline unchanged')

  const baseline = dbQueryJson(`
    with au as (
      select
        count(*)::int as academy_users,
        count(*) filter (where auth_user_id is not null)::int as linked,
        count(*) filter (where auth_user_id is null)::int as unlinked,
        count(*) filter (where status = 'active')::int as active_users,
        count(*) filter (where status = 'active' and auth_user_id is not null)::int as active_linked,
        count(*) filter (where status <> 'active')::int as inactive_users,
        count(*) filter (where password <> '')::int as legacy_passwords_nonempty
      from public.academy_users
    ),
    dup as (
      select count(*)::int as duplicate_links
      from (
        select auth_user_id
        from public.academy_users
        where auth_user_id is not null
        group by auth_user_id
        having count(*) > 1
      ) d
    ),
    orphan as (
      select count(*)::int as orphan_links
      from public.academy_users au
      left join auth.users u on u.id = au.auth_user_id
      where au.auth_user_id is not null and u.id is null
    ),
    auth_total as (
      select count(*)::int as auth_users from auth.users
    ),
    rbac as (
      select
        (select count(*)::int from public.roles) as roles,
        (select count(*)::int from public.role_permissions) as role_permissions
    )
    select
      au.academy_users,
      auth_total.auth_users,
      au.linked,
      au.unlinked,
      au.active_users,
      au.active_linked,
      au.inactive_users,
      rbac.roles,
      rbac.role_permissions,
      au.legacy_passwords_nonempty,
      dup.duplicate_links,
      orphan.orphan_links
    from au, dup, orphan, auth_total, rbac;
  `)

  for (const [key, expected] of Object.entries(EXPECTED_BASELINE)) {
    const snake = key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`)
    assert(`baseline ${key} = ${expected}`, baseline[snake] === expected)
  }

  const fingerprintResult = run(
    'npm',
    ['exec', '--yes', 'supabase@2.109.1', '--', 'db', 'query', '--linked', '-f', FINGERPRINT_SQL, '-o', 'json'],
    { capture: true }
  )
  const fpPayload = JSON.parse(fingerprintResult.stdout.slice(fingerprintResult.stdout.indexOf('{')))
  const fp = fpPayload.rows[0].fp

  for (const [table, expected] of Object.entries(EXPECTED_FINGERPRINTS)) {
    assert(`fingerprint ${table} unchanged`, fp[table] === expected)
  }
  assert('shifts row count unchanged', fp.shifts_row_count === EXPECTED_SHIFTS_ROW_COUNT)

  console.log('')
}

function stageEdgeFunctions() {
  console.log('Stage 6: Edge Functions inventory')

  const result = run(
    'npm',
    ['exec', '--yes', 'supabase@2.109.1', '--', 'functions', 'list', '--project-ref', PRODUCTION_REF, '-o', 'json'],
    { capture: true }
  )
  const functions = parseFunctionsList(result.stdout)
  const byName = Object.fromEntries(functions.map((fn) => [fn.name, fn]))

  for (const name of EMPLOYEE_FUNCTIONS) {
    assert(`employee function ${name} ACTIVE`, byName[name]?.status === 'ACTIVE')
    assert(`employee function ${name} verify_jwt=true`, byName[name]?.verify_jwt === true)
  }

  for (const spec of NOTIFICATION_FUNCTIONS) {
    assert(`notification function ${spec.name} ACTIVE`, byName[spec.name]?.status === 'ACTIVE')
    assert(
      `notification function ${spec.name} verify_jwt=${spec.verify_jwt}`,
      byName[spec.name]?.verify_jwt === spec.verify_jwt
    )
  }

  assert('total Edge Functions = 7', functions.length === 7)

  console.log('')
}

function stageVapidSecrets() {
  console.log('Stage 7: VAPID secrets (names only)')

  const result = run(
    'npm',
    ['exec', '--yes', 'supabase@2.109.1', '--', 'secrets', 'list', '--project-ref', PRODUCTION_REF, '-o', 'json'],
    { capture: true }
  )
  const names = parseSecretNames(result.stdout)

  for (const secretName of VAPID_SECRET_NAMES) {
    assert(`secret ${secretName} present`, names.includes(secretName))
  }

  assert('VAPID secret names only reported', true)
  console.log(`  secret names: ${VAPID_SECRET_NAMES.join(', ')}`)
  console.log('')
}

function stageDryRunPush() {
  console.log('Stage 8: db push dry-run')

  const result = run('npm', ['exec', '--yes', 'supabase@2.109.1', '--', 'db', 'push', '--linked', '--dry-run'], {
    capture: true,
    allowFailure: true,
  })
  const output = `${result.stdout}\n${result.stderr}`.toLowerCase()

  assert('db push dry-run exit 0', result.status === 0)
  assert('dry-run shows no pending migrations', output.includes('no schema changes') || output.includes('up to date'))

  console.log('')
}

async function mainAsync() {
  console.log('=== Production notification foundation readiness ===\n')
  stageRepoStatic()
  stageProductionLink()
  stageMigrationHistory()
  stageNotificationObjects()
  stageBusinessBaseline()
  stageEdgeFunctions()
  stageVapidSecrets()
  stageDryRunPush()
  console.log('Production notification foundation readiness completed (exit 0)\n')
}

mainAsync().catch((err) => {
  console.error(`\nFAILED: ${err.message}\n`)
  process.exit(1)
})
