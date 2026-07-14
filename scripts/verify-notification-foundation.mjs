#!/usr/bin/env node
/**
 * Local-only verification for notification_system_foundation migration.
 *
 * Usage:
 *   npm run supabase:local:verify-notifications
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

const BACKFILL_SQL = `
with candidates as (
  select
    au.id as employee_id,
    notification_login_to_technical_email(au.login) as technical_email
  from public.academy_users au
  where au.auth_user_id is null
    and au.login is not null
    and trim(au.login) <> ''
),
email_matches as (
  select
    c.employee_id,
    u.id as auth_user_id,
    count(*) over (partition by c.employee_id) as matches_for_employee,
    count(*) over (partition by u.id) as matches_for_auth_user
  from candidates c
  inner join auth.users u on lower(u.email) = c.technical_email
  where c.technical_email is not null
),
unambiguous as (
  select employee_id, auth_user_id
  from email_matches
  where matches_for_employee = 1
    and matches_for_auth_user = 1
)
update public.academy_users au
set auth_user_id = u.auth_user_id
from unambiguous u
where au.id = u.employee_id
  and au.auth_user_id is null;
`

const LOGIN_MAPPING_CASES = [
  { login: 'notification-test-a', label: 'text login' },
  { login: 'NOTIFICATION-TEST-A', label: 'uppercase login' },
  { login: 'admin@shugyla.local', label: 'email login' },
  { login: '+77001234567', label: 'phone with plus' },
  { login: '7 700 123 45 67', label: 'phone with spaces' },
  { login: '+7 (700) 123-45-67', label: 'phone with parens' },
  { login: '8-700-123-45-67', label: 'phone with dashes' },
]

const CHECK_TESTS = [
  {
    name: 'notification_templates.default_priority invalid',
    sql: `INSERT INTO public.notification_templates (code, module_code, event_code, title_template, body_template, default_priority)
          VALUES ('test.invalid.priority', 'test', 'x', 't', 'b', 'invalid');`,
  },
  {
    name: 'notification_rules.trigger_type invalid',
    sql: `INSERT INTO public.notification_rules (code, template_id, module_code, event_code, trigger_type, channels)
          SELECT 'test.invalid.trigger', id, 'test', 'x', 'invalid', ARRAY['in_app']::text[]
          FROM public.notification_templates LIMIT 1;`,
  },
  {
    name: 'notification_rules.recipient_type invalid',
    sql: `INSERT INTO public.notification_rules (code, template_id, module_code, event_code, trigger_type, recipient_type, channels)
          SELECT 'test.invalid.recipient', id, 'test', 'x', 'scheduled', 'invalid', ARRAY['in_app']::text[]
          FROM public.notification_templates LIMIT 1;`,
  },
  {
    name: 'notification_rules.max_attempts = 0',
    sql: `INSERT INTO public.notification_rules (code, template_id, module_code, event_code, trigger_type, max_attempts, channels)
          SELECT 'test.invalid.max_attempts', id, 'test', 'x', 'scheduled', 0, ARRAY['in_app']::text[]
          FROM public.notification_templates LIMIT 1;`,
  },
  {
    name: 'notification_rules.repeat_after_minutes = 0',
    sql: `INSERT INTO public.notification_rules (code, template_id, module_code, event_code, trigger_type, repeat_after_minutes, channels)
          SELECT 'test.invalid.repeat', id, 'test', 'x', 'scheduled', 0, ARRAY['in_app']::text[]
          FROM public.notification_templates LIMIT 1;`,
  },
  {
    name: 'notification_rules.channels empty',
    sql: `INSERT INTO public.notification_rules (code, template_id, module_code, event_code, trigger_type, channels)
          SELECT 'test.invalid.channels_empty', id, 'test', 'x', 'scheduled', '{}'::text[]
          FROM public.notification_templates LIMIT 1;`,
  },
  {
    name: 'notification_rules.channels email',
    sql: `INSERT INTO public.notification_rules (code, template_id, module_code, event_code, trigger_type, channels)
          SELECT 'test.invalid.channels_email', id, 'test', 'x', 'scheduled', ARRAY['email']::text[]
          FROM public.notification_templates LIMIT 1;`,
  },
  {
    name: 'notifications.action_url absolute https',
    sql: `INSERT INTO public.notifications (employee_id, auth_user_id, module_code, event_code, title, body, action_url, deduplication_key)
          SELECT __EMPLOYEE_A__, NULL, 'test', 'x', 't', 'b', 'https://example.com', 'test:check:https';`,
  },
  {
    name: 'notifications.action_url protocol-relative',
    sql: `INSERT INTO public.notifications (employee_id, auth_user_id, module_code, event_code, title, body, action_url, deduplication_key)
          SELECT __EMPLOYEE_A__, NULL, 'test', 'x', 't', 'b', '//example.com', 'test:check:proto';`,
  },
  {
    name: 'notifications.priority invalid',
    sql: `INSERT INTO public.notifications (employee_id, auth_user_id, module_code, event_code, title, body, priority, deduplication_key)
          SELECT __EMPLOYEE_A__, NULL, 'test', 'x', 't', 'b', 'invalid', 'test:check:priority';`,
  },
  {
    name: 'notifications.status invalid',
    sql: `INSERT INTO public.notifications (employee_id, auth_user_id, module_code, event_code, title, body, status, deduplication_key)
          SELECT __EMPLOYEE_A__, NULL, 'test', 'x', 't', 'b', 'invalid', 'test:check:status';`,
  },
  {
    name: 'notifications.expires_at before created_at',
    sql: `INSERT INTO public.notifications (employee_id, auth_user_id, module_code, event_code, title, body, expires_at, created_at, deduplication_key)
          SELECT __EMPLOYEE_A__, NULL, 'test', 'x', 't', 'b', now() - interval '1 hour', now(), 'test:check:expires';`,
  },
  {
    name: 'notifications.read_at before created_at',
    sql: `INSERT INTO public.notifications (employee_id, auth_user_id, module_code, event_code, title, body, read_at, created_at, deduplication_key)
          SELECT __EMPLOYEE_A__, NULL, 'test', 'x', 't', 'b', now() - interval '1 hour', now(), 'test:check:read_at';`,
  },
  {
    name: 'notifications.deduplication_key duplicate',
    sql: `INSERT INTO public.notifications (employee_id, auth_user_id, module_code, event_code, title, body, deduplication_key)
          SELECT __EMPLOYEE_A__, NULL, 'test', 'x', 't', 'b', 'test:check:duplicate';`,
    runTwice: true,
  },
  {
    name: 'notification_push_subscriptions.failure_count negative',
    sql: `INSERT INTO public.notification_push_subscriptions (employee_id, auth_user_id, endpoint, p256dh_key, auth_key, device_id, failure_count)
          SELECT __EMPLOYEE_A__, gen_random_uuid(), 'https://local.test/push/check/neg', 'k', 'k', gen_random_uuid(), -1;`,
  },
  {
    name: 'notification_push_subscriptions.endpoint empty',
    sql: `INSERT INTO public.notification_push_subscriptions (employee_id, auth_user_id, endpoint, p256dh_key, auth_key, device_id)
          SELECT __EMPLOYEE_A__, gen_random_uuid(), '   ', 'k', 'k', gen_random_uuid();`,
  },
  {
    name: 'notification_push_subscriptions.p256dh_key empty',
    sql: `INSERT INTO public.notification_push_subscriptions (employee_id, auth_user_id, endpoint, p256dh_key, auth_key, device_id)
          SELECT __EMPLOYEE_A__, gen_random_uuid(), 'https://local.test/push/check/p256', '   ', 'k', gen_random_uuid();`,
  },
  {
    name: 'notification_push_subscriptions.auth_key empty',
    sql: `INSERT INTO public.notification_push_subscriptions (employee_id, auth_user_id, endpoint, p256dh_key, auth_key, device_id)
          SELECT __EMPLOYEE_A__, gen_random_uuid(), 'https://local.test/push/check/auth', 'k', '   ', gen_random_uuid();`,
  },
  {
    name: 'notification_push_subscriptions.permission_status invalid',
    sql: `INSERT INTO public.notification_push_subscriptions (employee_id, auth_user_id, endpoint, p256dh_key, auth_key, device_id, permission_status)
          SELECT __EMPLOYEE_A__, gen_random_uuid(), 'https://local.test/push/check/perm', 'k', 'k', gen_random_uuid(), 'invalid';`,
  },
  {
    name: 'notification_deliveries.push without subscription',
    sql: `INSERT INTO public.notification_deliveries (notification_id, channel)
          SELECT id, 'push' FROM public.notifications LIMIT 1;`,
  },
  {
    name: 'notification_deliveries.attempt_number zero',
    sql: `INSERT INTO public.notification_deliveries (notification_id, channel, attempt_number)
          SELECT id, 'in_app', 0 FROM public.notifications LIMIT 1;`,
  },
  {
    name: 'notification_deliveries.status invalid',
    sql: `INSERT INTO public.notification_deliveries (notification_id, channel, status)
          SELECT id, 'in_app', 'invalid' FROM public.notifications LIMIT 1;`,
  },
  {
    name: 'notification_deliveries.failed without failed_at',
    sql: `INSERT INTO public.notification_deliveries (notification_id, channel, status, failed_at)
          SELECT id, 'in_app', 'failed', NULL FROM public.notifications LIMIT 1;`,
  },
  {
    name: 'notification_preferences.quiet_hours incomplete',
    sql: `INSERT INTO public.notification_preferences (employee_id, auth_user_id, module_code, quiet_hours_enabled)
          SELECT id, auth_user_id, 'test-module', true FROM public.academy_users WHERE auth_user_id IS NOT NULL LIMIT 1;`,
  },
  {
    name: 'notification_preferences duplicate employee module',
    sql: `INSERT INTO public.notification_preferences (employee_id, auth_user_id, module_code)
          SELECT employee_id, auth_user_id, module_code FROM public.notification_preferences LIMIT 1;`,
  },
]

const UPDATED_AT_TABLES = [
  'notification_templates',
  'notification_rules',
  'notifications',
  'notification_push_subscriptions',
  'notification_preferences',
]

const state = {
  runId: `verify-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
  container: null,
  status: null,
  anonKey: null,
  serviceRoleKey: null,
  apiUrl: null,
  authUsers: [],
  employeeIds: {},
  notificationIds: {},
  subscriptionIds: {},
  preferenceIds: {},
  deliveryIds: {},
  passwords: {},
  markReadIds: {},
  markReadSnapshots: {},
  idempotencyTimes: {},
  checkPassed: 0,
  updatedAtPassed: 0,
  failures: [],
}

async function main() {
  console.log('=== Notification foundation verification (local only) ===\n')

  try {
    await stageSafety()
    await stageHelperSecurity()
    await stageMarkReadFunctionSecurity()
    await stageCreateAuthUsers()
    await stageCreateEmployees()
    await stageBackfillTests()
    await stageLoginMappingTests()
    await stagePrepareRlsData()
    await stageRlsTests()
    await stageMarkReadRpcTests()
    await stageCheckConstraints()
    await stageUpdatedAtTests()
    await stageOnDeleteTests()
    await stageSeedIntegrity()
    printSuccess()
  } catch (error) {
    state.failures.push(error.message)
    console.error(`\nVERIFICATION FAILED: ${error.message}`)
    process.exitCode = 1
  } finally {
    await cleanup()
    if (process.exitCode !== 0) {
      process.exit(process.exitCode)
    }
  }
}

function fail(message) {
  throw new Error(message)
}

function run(command, args, options = {}) {
  const capture = options.capture ?? false
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    input: options.input,
  })
  if (result.error) fail(`${command} failed: ${result.error.message}`)
  if (result.status !== 0 && !options.allowFailure) {
    const details = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
    fail(`${command} ${args.join(' ')} failed${details ? `: ${details}` : ''}`)
  }
  return result
}

function psql(sql, options = {}) {
  const wrapped = options.noTx
    ? sql
    : `BEGIN;\n${sql}\nROLLBACK;`
  return run(
    'docker',
    ['exec', '-i', state.container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A'],
    { capture: true, input: wrapped, allowFailure: options.allowFailure }
  )
}

function psqlScalar(sql, options = {}) {
  const result = psql(sql, { noTx: true, ...options })
  return result.stdout.trim()
}

function psqlMutate(sql) {
  const result = run(
    'docker',
    ['exec', '-i', state.container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-q'],
    { capture: true, input: sql, allowFailure: true }
  )
  if (result.status !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
    fail(`SQL mutation failed${details ? `: ${details}` : ''}`)
  }
  return parsePsqlMutationOutput(result.stdout)
}

function parsePsqlMutationOutput(stdout) {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^INSERT\s+\d+/i.test(line))
  if (!lines.length) fail('SQL mutation returned no output')
  return lines[0]
}

function psqlExec(sql) {
  return run(
    'docker',
    ['exec', '-i', state.container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { capture: true, input: sql, allowFailure: true }
  )
}

function expectSqlFailure(name, sql) {
  const result = psqlExec(`BEGIN;\n${sql}\nROLLBACK;`)
  if (result.status === 0) fail(`${name}: expected constraint violation`)
}

function nextEmployeeId() {
  return Number(psqlScalar('SELECT COALESCE(MAX(id), 0) + 1 FROM public.academy_users;'))
}

async function stageSafety() {
  console.log('Stage 1: Environment safety')

  run('docker', ['info'], { capture: true })

  state.status = getLocalSupabaseStatus()

  state.apiUrl = state.status.API_URL
  state.anonKey = state.status.ANON_KEY
  state.serviceRoleKey = state.status.SERVICE_ROLE_KEY

  for (const [label, value] of [
    ['API_URL', state.apiUrl],
    ['DB_URL', state.status.DB_URL],
    ['STUDIO_URL', state.status.STUDIO_URL],
  ]) {
    if (!value || !isLocalUrl(value)) fail(`${label} is not local: ${value ?? '(missing)'}`)
  }

  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
  if (!config.includes(`project_id = "${PROJECT_ID}"`)) fail('Unexpected project_id in config.toml')
  if (config.includes(PRODUCTION_REF)) fail('Production ref found in config.toml')
  if (/[a-z0-9-]+\.supabase\.co\b/i.test(config)) fail('Remote supabase.co URL in config.toml')
  checkRemoteLinkMetadata(config)

  for (const value of [state.apiUrl, state.status.DB_URL, JSON.stringify(state.status)]) {
    if (String(value).includes(PRODUCTION_REF) || /[a-z0-9-]+\.supabase\.co\b/i.test(String(value))) {
      fail('Production or remote Supabase URL detected in status output')
    }
  }

  state.container = findDbContainer()
  const migrationApplied = psqlScalar(
    "SELECT COUNT(*) FROM supabase_migrations.schema_migrations WHERE version = '20260713194500';"
  )
  if (migrationApplied !== '1') fail('Notification migration not applied locally')

  const enabledRules = psqlScalar(
    "SELECT COUNT(*) FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%' AND is_enabled = true;"
  )
  if (enabledRules !== '0') fail('Seed notification rules must remain disabled')

  console.log('  Environment: local OK\n')
}

async function stageHelperSecurity() {
  console.log('Stage 1b: Private helper schema/function security')

  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
  if (/schemas\s*=\s*\[[^\]]*notification_private/i.test(config)) {
    fail('notification_private must not be in API exposed schemas')
  }

  const schemaExists = psqlScalar(
    "SELECT COUNT(*) FROM pg_namespace WHERE nspname = 'notification_private';"
  )
  if (schemaExists !== '1') fail('Schema notification_private missing')

  const fnRow = psqlScalar(`
    SELECT
      n.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' || '|' ||
      r.rolname || '|' ||
      p.prosecdef::text || '|' ||
      p.provolatile::text || '|' ||
      pg_catalog.format_type(p.prorettype, NULL) || '|' ||
      COALESCE(array_to_string(p.proconfig, ','), '')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles r ON r.oid = p.proowner
    WHERE n.nspname = 'notification_private'
      AND p.proname = 'employee_owned_by_current_auth';
  `)
  if (!fnRow) fail('Function notification_private.employee_owned_by_current_auth missing')

  const [signature, owner, prosecdef, provolatile, returnType, proconfig] = fnRow.split('|')
  if (!signature.startsWith('notification_private.employee_owned_by_current_auth(')) {
    fail(`Unexpected function signature: ${signature}`)
  }
  if (!signature.includes('bigint')) fail(`Function must accept bigint: ${signature}`)
  if (owner === 'anon' || owner === 'authenticated') {
    fail(`Function owner must not be ${owner}`)
  }
  if (prosecdef !== 't' && prosecdef !== 'true') fail('Function must be SECURITY DEFINER')
  if (provolatile !== 's') fail('Function must be STABLE')
  if (returnType !== 'boolean') fail(`Function must return boolean, got ${returnType}`)
  if (!proconfig.includes('search_path=')) fail('Function must set search_path')

  const publicFnCount = psqlScalar(`
    SELECT COUNT(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'employee_owned_by_current_auth';
  `)
  if (publicFnCount !== '0') fail('Helper function must not exist in public schema')

  const publicExecute = psqlScalar(`
    SELECT has_function_privilege('public', 'notification_private.employee_owned_by_current_auth(bigint)', 'EXECUTE');
  `)
  if (publicExecute === 't') fail('PUBLIC must not have EXECUTE on helper function')

  const anonExecute = psqlScalar(`
    SELECT has_function_privilege('anon', 'notification_private.employee_owned_by_current_auth(bigint)', 'EXECUTE');
  `)
  if (anonExecute === 't') fail('anon must not have EXECUTE on helper function')

  const authExecute = psqlScalar(`
    SELECT has_function_privilege('authenticated', 'notification_private.employee_owned_by_current_auth(bigint)', 'EXECUTE');
  `)
  if (authExecute !== 't') fail('authenticated must have EXECUTE on helper function')

  const serviceExecute = psqlScalar(`
    SELECT has_function_privilege('service_role', 'notification_private.employee_owned_by_current_auth(bigint)', 'EXECUTE');
  `)
  if (serviceExecute !== 't') fail('service_role must have EXECUTE on helper function')

  const authSchemaUsage = psqlScalar(`
    SELECT has_schema_privilege('authenticated', 'notification_private', 'USAGE');
  `)
  if (authSchemaUsage !== 't') fail('authenticated must have USAGE on notification_private schema')

  const authSchemaCreate = psqlScalar(`
    SELECT has_schema_privilege('authenticated', 'notification_private', 'CREATE');
  `)
  if (authSchemaCreate === 't') fail('authenticated must not have CREATE on notification_private schema')

  const anonSchemaUsage = psqlScalar(`
    SELECT has_schema_privilege('anon', 'notification_private', 'USAGE');
  `)
  if (anonSchemaUsage === 't') fail('anon must not have USAGE on notification_private schema')

  const authPasswordSelect = psqlScalar(`
    SELECT has_column_privilege('authenticated', 'public.academy_users', 'password', 'SELECT');
  `)
  if (authPasswordSelect === 't') {
    fail('authenticated must not have SELECT on academy_users.password')
  }

  const authOwnProfilePolicy = psqlScalar(`
    SELECT COUNT(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'academy_users'
      AND policyname = 'academy_users_select_own_profile';
  `)
  if (authOwnProfilePolicy !== '1') {
    fail('Expected academy_users_select_own_profile policy for Auth-first login')
  }

  console.log('  Helper security: passed\n')
}

function verifyFunctionCatalog({
  schema,
  name,
  typeFragment,
  expectSecdef,
  expectVolatile,
  returnType = 'boolean',
  signature,
}) {
  const fnRow = psqlScalar(`
    SELECT
      n.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' || '|' ||
      r.rolname || '|' ||
      p.prosecdef::text || '|' ||
      p.provolatile::text || '|' ||
      pg_catalog.format_type(p.prorettype, NULL) || '|' ||
      COALESCE(array_to_string(p.proconfig, ','), '')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles r ON r.oid = p.proowner
    WHERE n.nspname = '${schema}'
      AND p.proname = '${name}';
  `)
  if (!fnRow) fail(`Function ${schema}.${name} missing`)

  const [sig, owner, prosecdef, provolatile, ret, proconfig] = fnRow.split('|')
  if (signature && sig !== signature && !sig.startsWith(`${schema}.${name}(`)) {
    fail(`Unexpected signature for ${schema}.${name}: ${sig}`)
  }
  if (typeFragment && !sig.includes(typeFragment)) {
    fail(`${schema}.${name} must accept ${typeFragment}: ${sig}`)
  }
  if (owner === 'anon' || owner === 'authenticated' || owner === 'service_role') {
    fail(`${schema}.${name} owner must not be ${owner}`)
  }
  const secdefOk = expectSecdef ? prosecdef === 't' || prosecdef === 'true' : prosecdef === 'f' || prosecdef === 'false'
  if (!secdefOk) {
    fail(`${schema}.${name} SECURITY DEFINER expected ${expectSecdef}, got ${prosecdef}`)
  }
  if (provolatile !== expectVolatile) {
    fail(`${schema}.${name} volatility expected ${expectVolatile}, got ${provolatile}`)
  }
  if (ret !== returnType) fail(`${schema}.${name} must return ${returnType}, got ${ret}`)
  if (!proconfig.includes('search_path=')) fail(`${schema}.${name} must set search_path`)

  return sig
}

function verifyFunctionExecute(functionSignature, { publicOk, anonOk, authOk, serviceOk }) {
  const publicExec = psqlScalar(
    `SELECT has_function_privilege('public', '${functionSignature}', 'EXECUTE');`
  )
  if ((publicExec === 't') !== publicOk) {
    fail(`PUBLIC EXECUTE on ${functionSignature}: expected ${publicOk}, got ${publicExec}`)
  }
  const anonExec = psqlScalar(
    `SELECT has_function_privilege('anon', '${functionSignature}', 'EXECUTE');`
  )
  if ((anonExec === 't') !== anonOk) {
    fail(`anon EXECUTE on ${functionSignature}: expected ${anonOk}, got ${anonExec}`)
  }
  const authExec = psqlScalar(
    `SELECT has_function_privilege('authenticated', '${functionSignature}', 'EXECUTE');`
  )
  if ((authExec === 't') !== authOk) {
    fail(`authenticated EXECUTE on ${functionSignature}: expected ${authOk}, got ${authExec}`)
  }
  const serviceExec = psqlScalar(
    `SELECT has_function_privilege('service_role', '${functionSignature}', 'EXECUTE');`
  )
  if ((serviceExec === 't') !== serviceOk) {
    fail(`service_role EXECUTE on ${functionSignature}: expected ${serviceOk}, got ${serviceExec}`)
  }
}

async function stageMarkReadFunctionSecurity() {
  console.log('Stage 1c: mark_notification_read function security')

  verifyFunctionCatalog({
    schema: 'notification_private',
    name: 'mark_notification_read_internal',
    typeFragment: 'uuid',
    expectSecdef: true,
    expectVolatile: 'v',
  })
  verifyFunctionExecute('notification_private.mark_notification_read_internal(uuid)', {
    publicOk: false,
    anonOk: false,
    authOk: true,
    serviceOk: true,
  })

  verifyFunctionCatalog({
    schema: 'public',
    name: 'mark_notification_read',
    typeFragment: 'uuid',
    expectSecdef: false,
    expectVolatile: 'v',
  })
  verifyFunctionExecute('public.mark_notification_read(uuid)', {
    publicOk: false,
    anonOk: false,
    authOk: true,
    serviceOk: true,
  })

  const internalInPublicCount = psqlScalar(`
    SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mark_notification_read_internal';
  `)
  if (internalInPublicCount !== '0') fail('mark_notification_read_internal must not exist in public')

  const wrapperInPrivate = psqlScalar(`
    SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'notification_private' AND p.proname = 'mark_notification_read';
  `)
  if (wrapperInPrivate !== '0') fail('mark_notification_read must not exist in notification_private')

  const overloadCount = psqlScalar(`
    SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mark_notification_read';
  `)
  if (overloadCount !== '1') fail(`Expected exactly one public.mark_notification_read overload, got ${overloadCount}`)

  const authUpdate = psqlScalar(
    `SELECT has_table_privilege('authenticated', 'public.notifications', 'UPDATE');`
  )
  if (authUpdate === 't') fail('authenticated must not have UPDATE on notifications')

  const authUpdateReadAt = psqlScalar(`
    SELECT has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE');
  `)
  if (authUpdateReadAt === 't') fail('authenticated must not have UPDATE on notifications.read_at')

  console.log('  Mark-read function security: passed\n')
}

function notificationSnapshot(id) {
  return {
    title: psqlScalar(`SELECT title FROM public.notifications WHERE id = '${id}';`),
    body: psqlScalar(`SELECT body FROM public.notifications WHERE id = '${id}';`),
    status: psqlScalar(`SELECT status FROM public.notifications WHERE id = '${id}';`),
    priority: psqlScalar(`SELECT priority FROM public.notifications WHERE id = '${id}';`),
    readAt: psqlScalar(`SELECT COALESCE(read_at::text, '') FROM public.notifications WHERE id = '${id}';`) || null,
    updatedAt: psqlScalar(`SELECT updated_at::text FROM public.notifications WHERE id = '${id}';`),
    employeeId: psqlScalar(`SELECT employee_id::text FROM public.notifications WHERE id = '${id}';`),
    authUserId: psqlScalar(`SELECT COALESCE(auth_user_id::text, '') FROM public.notifications WHERE id = '${id}';`),
    deduplicationKey: psqlScalar(`SELECT deduplication_key FROM public.notifications WHERE id = '${id}';`),
    metadata: psqlScalar(`SELECT COALESCE(metadata::text, '{}') FROM public.notifications WHERE id = '${id}';`),
  }
}

async function stageMarkReadRpcTests() {
  console.log('Stage 7b: mark_notification_read RPC runtime tests')

  const authA = getAuthUser('a').id
  const authB = getAuthUser('b').id
  const meta = `{"run_id":"${state.runId}"}`

  state.markReadIds.aUnread = psqlMutate(`
    INSERT INTO public.notifications (
      employee_id, auth_user_id, module_code, event_code, title, body, deduplication_key, metadata
    ) VALUES (
      ${state.employeeIds.a}, '${authA}', 'test', 'mark_read', 'A unread', 'body', '${state.runId}:mark-read:a:unread',
      '${meta}'::jsonb
    ) RETURNING id::text;
  `)
  state.markReadIds.bUnread = psqlMutate(`
    INSERT INTO public.notifications (
      employee_id, auth_user_id, module_code, event_code, title, body, deduplication_key, metadata
    ) VALUES (
      ${state.employeeIds.b}, '${authB}', 'test', 'mark_read', 'B unread', 'body', '${state.runId}:mark-read:b:unread',
      '${meta}'::jsonb
    ) RETURNING id::text;
  `)
  state.markReadIds.aAlready = psqlMutate(`
    INSERT INTO public.notifications (
      employee_id, auth_user_id, module_code, event_code, title, body, deduplication_key, metadata,
      created_at, read_at
    ) VALUES (
      ${state.employeeIds.a}, '${authA}', 'test', 'mark_read', 'A already', 'body', '${state.runId}:mark-read:a:already',
      '${meta}'::jsonb, now() - interval '2 hours', now() - interval '1 hour'
    ) RETURNING id::text;
  `)

  state.markReadSnapshots.beforeA = notificationSnapshot(state.markReadIds.aUnread)
  state.markReadSnapshots.beforeB = notificationSnapshot(state.markReadIds.bUnread)
  state.markReadSnapshots.beforeAlready = notificationSnapshot(state.markReadIds.aAlready)

  const clientA = await signInClient('a')
  const clientB = await signInClient('b')
  const anon = anonClient()

  const { data: firstMark, error: firstErr } = await clientA.rpc('mark_notification_read', {
    p_notification_id: state.markReadIds.aUnread,
  })
  if (firstErr) fail(`A mark own unread: ${firstErr.message}`)
  if (firstMark !== true) fail(`A mark own unread: expected true, got ${firstMark}`)

  const afterFirst = notificationSnapshot(state.markReadIds.aUnread)
  if (!afterFirst.readAt) fail('A unread notification read_at should be set after RPC')
  if (notificationSnapshot(state.markReadIds.bUnread).readAt) {
    fail('B unread read_at must remain NULL after A marks own notification')
  }

  state.idempotencyTimes.readAtFirst = afterFirst.readAt
  state.idempotencyTimes.updatedAtFirst = afterFirst.updatedAt

  await sleep(50)

  const { data: secondMark, error: secondErr } = await clientA.rpc('mark_notification_read', {
    p_notification_id: state.markReadIds.aUnread,
  })
  if (secondErr) fail(`A repeat mark: ${secondErr.message}`)
  if (secondMark !== true) fail(`A repeat mark: expected true, got ${secondMark}`)

  const afterSecond = notificationSnapshot(state.markReadIds.aUnread)
  if (afterSecond.readAt !== state.idempotencyTimes.readAtFirst) {
    fail('Idempotency: read_at changed on repeat RPC')
  }
  if (afterSecond.updatedAt !== state.idempotencyTimes.updatedAtFirst) {
    fail('Idempotency: updated_at changed on repeat RPC')
  }

  const alreadyReadAtBefore = state.markReadSnapshots.beforeAlready.readAt
  const { data: alreadyMark, error: alreadyErr } = await clientA.rpc('mark_notification_read', {
    p_notification_id: state.markReadIds.aAlready,
  })
  if (alreadyErr) fail(`A mark already-read: ${alreadyErr.message}`)
  if (alreadyMark !== true) fail(`A mark already-read: expected true, got ${alreadyMark}`)
  const afterAlready = notificationSnapshot(state.markReadIds.aAlready)
  if (afterAlready.readAt !== alreadyReadAtBefore) {
    fail('Already-read notification read_at must not change')
  }

  const { data: crossMark, error: crossErr } = await clientA.rpc('mark_notification_read', {
    p_notification_id: state.markReadIds.bUnread,
  })
  if (crossErr) fail(`A mark B notification: ${crossErr.message}`)
  if (crossMark !== false) fail(`A mark B notification: expected false, got ${crossMark}`)
  if (notificationSnapshot(state.markReadIds.bUnread).readAt) {
    fail('B notification must stay unread when A calls RPC')
  }

  const randomUuid = '00000000-0000-4000-8000-000000000001'
  const { data: randomMark } = await clientA.rpc('mark_notification_read', {
    p_notification_id: randomUuid,
  })
  if (randomMark !== false) fail(`A random UUID: expected false, got ${randomMark}`)

  const { data: nullMark } = await clientA.rpc('mark_notification_read', {
    p_notification_id: null,
  })
  if (nullMark !== false) fail(`A NULL UUID: expected false, got ${nullMark}`)

  const { error: anonRpcErr } = await anon.rpc('mark_notification_read', {
    p_notification_id: state.markReadIds.bUnread,
  })
  if (!anonRpcErr) fail('Anon RPC mark_notification_read must be denied')

  const { error: privateRpcErr } = await clientA.rpc('mark_notification_read_internal', {
    p_notification_id: state.markReadIds.bUnread,
  })
  if (!privateRpcErr) fail('Private internal RPC must not be exposed via Data API')

  const { data: bMark, error: bMarkErr } = await clientB.rpc('mark_notification_read', {
    p_notification_id: state.markReadIds.bUnread,
  })
  if (bMarkErr) fail(`B mark own unread: ${bMarkErr.message}`)
  if (bMark !== true) fail(`B mark own unread: expected true, got ${bMark}`)

  const { data: bCrossMark } = await clientB.rpc('mark_notification_read', {
    p_notification_id: state.markReadIds.aUnread,
  })
  if (bCrossMark !== false) fail(`B mark A notification: expected false, got ${bCrossMark}`)

  await expectDenied('A direct UPDATE read_at', () =>
    clientA
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', state.markReadIds.aUnread)
      .select('id')
  )
  await expectDenied('A direct UPDATE title', () =>
    clientA.from('notifications').update({ title: 'hack' }).eq('id', state.markReadIds.aUnread).select('id')
  )
  await expectDenied('A direct UPDATE status', () =>
    clientA.from('notifications').update({ status: 'failed' }).eq('id', state.markReadIds.aUnread).select('id')
  )
  await expectDenied('A direct UPDATE auth_user_id', () =>
    clientA
      .from('notifications')
      .update({ auth_user_id: authB })
      .eq('id', state.markReadIds.aUnread)
      .select('id')
  )
  await expectDenied('A direct UPDATE employee_id', () =>
    clientA
      .from('notifications')
      .update({ employee_id: state.employeeIds.b })
      .eq('id', state.markReadIds.aUnread)
      .select('id')
  )

  const afterSideEffects = notificationSnapshot(state.markReadIds.aUnread)
  if (afterSideEffects.title !== state.markReadSnapshots.beforeA.title) fail('RPC changed title')
  if (afterSideEffects.body !== state.markReadSnapshots.beforeA.body) fail('RPC changed body')
  if (afterSideEffects.status !== state.markReadSnapshots.beforeA.status) fail('RPC changed status')
  if (afterSideEffects.priority !== state.markReadSnapshots.beforeA.priority) fail('RPC changed priority')
  if (afterSideEffects.deduplicationKey !== state.markReadSnapshots.beforeA.deduplicationKey) {
    fail('RPC changed deduplication_key')
  }
  if (afterSideEffects.employeeId !== state.markReadSnapshots.beforeA.employeeId) fail('RPC changed employee_id')
  if (afterSideEffects.authUserId !== state.markReadSnapshots.beforeA.authUserId) fail('RPC changed auth_user_id')

  const deliveryCount = psqlScalar(`
    SELECT COUNT(*) FROM public.notification_deliveries
    WHERE notification_id IN ('${state.markReadIds.aUnread}', '${state.markReadIds.bUnread}', '${state.markReadIds.aAlready}');
  `)
  if (deliveryCount !== '0') fail('RPC must not create notification_deliveries')

  console.log('  Mark-read RPC: passed\n')
}

function isLocalUrl(value) {
  try {
    const hostname = new URL(String(value)).hostname
    return hostname === '127.0.0.1' || hostname === 'localhost'
  } catch {
    return /^(127\.0\.0\.1|localhost)(:|\/|$)/.test(String(value))
  }
}

function checkRemoteLinkMetadata(configText) {
  const linkCandidates = [
    'supabase/.temp/project-ref',
    'supabase/.branches/_current_branch',
  ]

  for (const relativePath of linkCandidates) {
    const fullPath = path.join(ROOT, relativePath)
    if (!fs.existsSync(fullPath)) continue

    const content = fs.readFileSync(fullPath, 'utf8').trim()
    if (!content) continue

    if (relativePath.endsWith('project-ref')) {
      if (content.includes(PRODUCTION_REF)) fail(`Remote project link detected in ${relativePath}`)
      if (content !== PROJECT_ID && /^[a-z0-9]{15,}$/i.test(content)) {
        fail(`Remote project ref detected in ${relativePath}`)
      }
    }
  }

  if (configText.includes(PRODUCTION_REF)) fail('Production ref found in config.toml')
}

function findDbContainer() {
  const exactName = `supabase_db_${PROJECT_ID}`
  const result = run(
    'docker',
    ['ps', '--filter', `name=^/${exactName}$`, '--format', '{{.Names}}'],
    { capture: true }
  )
  const names = result.stdout.trim().split('\n').filter(Boolean)
  if (names.length !== 1) fail(`Expected exactly one DB container, found ${names.length}`)
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

async function signInClient(key) {
  const spec = getAuthUser(key)
  const client = anonClient()
  const { data, error } = await client.auth.signInWithPassword({
    email: spec.email,
    password: state.passwords[key],
  })
  if (error) fail(`Sign in ${key}: ${error.message}`)
  return client
}

async function stageCreateAuthUsers() {
  console.log('Stage 2: Create temporary auth users')
  const admin = adminClient()

  const specs = [
    { key: 'a', email: 'notification-test-a@shugyla.local' },
    { key: 'b', email: 'notification-test-b@shugyla.local' },
    { key: 'ambiguous', email: 'notification-test-ambiguous@shugyla.local' },
  ]

  for (const spec of specs) {
    const password = crypto.randomBytes(24).toString('base64url')
    state.passwords[spec.key] = password
    const { data, error } = await admin.auth.admin.createUser({
      email: spec.email,
      password,
      email_confirm: true,
    })
    if (error) fail(`Create auth user ${spec.email}: ${error.message}`)
    state.authUsers.push({ key: spec.key, id: data.user.id, email: spec.email })
  }

  console.log(`  Created ${state.authUsers.length} auth users\n`)
}

async function stageCreateEmployees() {
  console.log('Stage 3: Create temporary academy_users')

  const marker = `[${state.runId}]`
  const rows = [
    { key: 'a', login: 'notification-test-a' },
    { key: 'b', login: 'notification-test-b' },
    { key: 'noMatch', login: 'notification-test-no-auth' },
    { key: 'amb1', login: 'notification-test-ambiguous' },
    { key: 'amb2', login: 'NOTIFICATION-TEST-AMBIGUOUS' },
  ]

  for (const row of rows) {
    const id = nextEmployeeId()
    state.employeeIds[row.key] = id
    psqlExec(`
      INSERT INTO public.academy_users (id, first_name, last_name, full_name, login, password, role, status)
      VALUES (${id}, 'Verify', '${row.key}', '${marker} ${row.key}', '${row.login}', '', 'cashier', 'active');
    `)
  }

  console.log(`  Created ${rows.length} academy_users\n`)
}

async function stageBackfillTests() {
  console.log('Stage 4: Backfill verification')

  psqlExec(BACKFILL_SQL)

  const authA = getAuthUser('a').id
  const authB = getAuthUser('b').id

  assertEqual(
    'Backfill A linked',
    psqlScalar(`SELECT auth_user_id::text FROM public.academy_users WHERE id = ${state.employeeIds.a};`),
    authA
  )
  assertEqual(
    'Backfill B linked',
    psqlScalar(`SELECT auth_user_id::text FROM public.academy_users WHERE id = ${state.employeeIds.b};`),
    authB
  )
  assertEqual(
    'Backfill no-match remains NULL',
    psqlScalar(`SELECT auth_user_id IS NULL FROM public.academy_users WHERE id = ${state.employeeIds.noMatch};`),
    't'
  )
  assertEqual(
    'Backfill ambiguous 1 remains NULL',
    psqlScalar(`SELECT auth_user_id IS NULL FROM public.academy_users WHERE id = ${state.employeeIds.amb1};`),
    't'
  )
  assertEqual(
    'Backfill ambiguous 2 remains NULL',
    psqlScalar(`SELECT auth_user_id IS NULL FROM public.academy_users WHERE id = ${state.employeeIds.amb2};`),
    't'
  )

  const duplicateAuth = psqlScalar(`
    SELECT COUNT(*) FROM (
      SELECT auth_user_id FROM public.academy_users
      WHERE auth_user_id IS NOT NULL
      GROUP BY auth_user_id HAVING COUNT(*) > 1
    ) d;
  `)
  assertEqual('No duplicate auth_user_id assignments', duplicateAuth, '0')

  const linkedBefore = psqlScalar(`SELECT auth_user_id::text FROM public.academy_users WHERE id = ${state.employeeIds.a};`)
  psqlExec(BACKFILL_SQL)
  const linkedAfter = psqlScalar(`SELECT auth_user_id::text FROM public.academy_users WHERE id = ${state.employeeIds.a};`)
  assertEqual('Backfill does not overwrite existing auth_user_id', linkedAfter, linkedBefore)

  console.log('  Backfill: passed\n')
}

async function stageLoginMappingTests() {
  console.log('Stage 5: Frontend/SQL login mapping')

  for (const testCase of LOGIN_MAPPING_CASES) {
    const js = loginToTechnicalEmail(testCase.login)
    const escaped = testCase.login.replace(/'/g, "''")
    const sql = psqlScalar(
      `SELECT notification_login_to_technical_email('${escaped}');`
    )
    if (js !== sql) {
      fail(
        `Login mapping mismatch (${testCase.label}): input=${testCase.login}, frontend=${js}, sql=${sql}`
      )
    }
  }

  console.log(`  Login mapping: ${LOGIN_MAPPING_CASES.length} cases passed\n`)
}

async function stagePrepareRlsData() {
  console.log('Stage 6: Prepare RLS test data')

  const authA = getAuthUser('a').id
  const authB = getAuthUser('b').id
  const dedupeA = `${state.runId}:rls:a`
  const dedupeB = `${state.runId}:rls:b`

  const notifA = psqlMutate(`
    INSERT INTO public.notifications (
      employee_id, auth_user_id, module_code, event_code, title, body, action_url, deduplication_key, metadata
    ) VALUES (
      ${state.employeeIds.a}, '${authA}', 'test', 'rls_test', 'A title', 'A body', '/platform/time-tracker', '${dedupeA}',
      '{"run_id":"${state.runId}"}'::jsonb
    ) RETURNING id::text;
  `)
  const notifB = psqlMutate(`
    INSERT INTO public.notifications (
      employee_id, auth_user_id, module_code, event_code, title, body, action_url, deduplication_key, metadata
    ) VALUES (
      ${state.employeeIds.b}, '${authB}', 'test', 'rls_test', 'B title', 'B body', '/platform/time-tracker', '${dedupeB}',
      '{"run_id":"${state.runId}"}'::jsonb
    ) RETURNING id::text;
  `)

  state.notificationIds.a = notifA
  state.notificationIds.b = notifB

  console.log('  RLS seed notifications created\n')
}

async function signIn(key) {
  return signInClient(key)
}

function pushSubscriptionRow(overrides = {}) {
  return {
    device_id: crypto.randomUUID(),
    p256dh_key: 'test-p256dh-key',
    auth_key: 'test-auth-key',
    ...overrides,
  }
}

async function stageRlsTests() {
  console.log('Stage 7: RLS runtime tests')

  const clientA = await signInClient('a')
  const clientB = await signInClient('b')
  const anon = anonClient()

  const { data: notifsA, error: notifsAErr } = await clientA
    .from('notifications')
    .select('id, employee_id')
    .eq('module_code', 'test')
  if (notifsAErr) fail(`A SELECT notifications: ${notifsAErr.message}`)
  if (notifsA.length !== 1 || notifsA[0].id !== state.notificationIds.a) {
    fail(
      `A should see only own notification: count=${notifsA.length}, ` +
        `ids=${notifsA.map((row) => row.id).join(',') || '(none)'}, expected=${state.notificationIds.a}`
    )
  }
  if (notifsA.some((row) => row.id === state.notificationIds.b)) fail('A must not see B notification')

  const { data: notifsB } = await clientB.from('notifications').select('id').eq('module_code', 'test')
  if (notifsB.length !== 1 || notifsB[0].id !== state.notificationIds.b) fail('B should see only own notification')

  await expectDenied('A INSERT notification', () =>
    clientA.from('notifications').insert({
      employee_id: state.employeeIds.a,
      auth_user_id: getAuthUser('a').id,
      module_code: 'test',
      event_code: 'rls_insert',
      title: 'x',
      body: 'x',
      deduplication_key: `${state.runId}:insert:a`,
    })
  )

  await expectDenied('A UPDATE notification title', () =>
    clientA.from('notifications').update({ title: 'hack' }).eq('id', state.notificationIds.a).select('id')
  )
  await expectDenied('A UPDATE notification status', () =>
    clientA.from('notifications').update({ status: 'failed' }).eq('id', state.notificationIds.a).select('id')
  )
  await expectDenied('A UPDATE notification read_at', () =>
    clientA.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', state.notificationIds.a).select('id')
  )
  await expectDenied('A DELETE notification', () =>
    clientA.from('notifications').delete().eq('id', state.notificationIds.a).select('id')
  )

  const endpointA = `https://local.test/push/${state.runId}/a`
  const { data: subA, error: subAErr } = await clientA
    .from('notification_push_subscriptions')
    .insert({
      employee_id: state.employeeIds.a,
      auth_user_id: getAuthUser('a').id,
      endpoint: endpointA,
      ...pushSubscriptionRow(),
    })
    .select('id')
    .single()
  if (subAErr) fail(`A insert own subscription: ${subAErr.message}`)
  state.subscriptionIds.a = subA.id

  await expectDenied('A insert subscription for B employee_id', () =>
    clientA.from('notification_push_subscriptions').insert({
      employee_id: state.employeeIds.b,
      auth_user_id: getAuthUser('a').id,
      endpoint: `https://local.test/push/${state.runId}/a-b-employee`,
      ...pushSubscriptionRow({ p256dh_key: 'k', auth_key: 'k' }),
    })
  )

  const endpointBForA = `https://local.test/push/${state.runId}/a-as-b-auth`
  await expectDenied('A insert subscription with B auth_user_id', () =>
    clientA.from('notification_push_subscriptions').insert({
      employee_id: state.employeeIds.a,
      auth_user_id: getAuthUser('b').id,
      endpoint: endpointBForA,
      ...pushSubscriptionRow({ p256dh_key: 'k', auth_key: 'k' }),
    })
  )

  await expectDenied('A update own subscription employee_id to B', () =>
    clientA
      .from('notification_push_subscriptions')
      .update({ employee_id: state.employeeIds.b })
      .eq('id', state.subscriptionIds.a)
      .select('id')
  )

  await expectDenied('A update own subscription auth_user_id to B', () =>
    clientA
      .from('notification_push_subscriptions')
      .update({ auth_user_id: getAuthUser('b').id })
      .eq('id', state.subscriptionIds.a)
      .select('id')
  )

  const endpointB = `https://local.test/push/${state.runId}/b`
  const { data: subB } = await clientB
    .from('notification_push_subscriptions')
    .insert({
      employee_id: state.employeeIds.b,
      auth_user_id: getAuthUser('b').id,
      endpoint: endpointB,
      ...pushSubscriptionRow(),
    })
    .select('id')
    .single()
  state.subscriptionIds.b = subB.id

  const { data: subsA } = await clientA.from('notification_push_subscriptions').select('id')
  if (subsA.length !== 1 || subsA[0].id !== state.subscriptionIds.a) fail('A sees only own subscriptions')

  await expectDenied('A update B subscription', () =>
    clientA.from('notification_push_subscriptions').update({ device_name: 'hack' }).eq('id', state.subscriptionIds.b).select('id')
  )
  await expectDenied('A delete B subscription', () =>
    clientA.from('notification_push_subscriptions').delete().eq('id', state.subscriptionIds.b).select('id')
  )

  const { error: updateOwnSubErr } = await clientA
    .from('notification_push_subscriptions')
    .update({ device_name: `device-a-${state.runId}` })
    .eq('id', state.subscriptionIds.a)
  if (updateOwnSubErr) fail(`A update own subscription: ${updateOwnSubErr.message}`)

  const { data: prefA, error: prefAErr } = await clientA
    .from('notification_preferences')
    .insert({
      employee_id: state.employeeIds.a,
      auth_user_id: getAuthUser('a').id,
      module_code: `test-${state.runId}`,
    })
    .select('id')
    .single()
  if (prefAErr) fail(`A insert preferences: ${prefAErr.message}`)
  state.preferenceIds.a = prefA.id

  await expectDenied('A insert preferences for B', () =>
    clientA.from('notification_preferences').insert({
      employee_id: state.employeeIds.b,
      auth_user_id: getAuthUser('a').id,
      module_code: `test-b-${state.runId}`,
    })
  )

  await expectDenied('A insert preferences with B auth_user_id', () =>
    clientA.from('notification_preferences').insert({
      employee_id: state.employeeIds.a,
      auth_user_id: getAuthUser('b').id,
      module_code: `test-a-as-b-auth-${state.runId}`,
    })
  )

  const { data: prefB, error: prefBErr } = await clientB
    .from('notification_preferences')
    .insert({
      employee_id: state.employeeIds.b,
      auth_user_id: getAuthUser('b').id,
      module_code: `test-b-${state.runId}`,
    })
    .select('id')
    .single()
  if (prefBErr) fail(`B insert preferences: ${prefBErr.message}`)
  state.preferenceIds.b = prefB.id

  const { data: prefsBVisibleToA } = await clientA
    .from('notification_preferences')
    .select('id')
    .eq('id', state.preferenceIds.b)
  if ((prefsBVisibleToA ?? []).length > 0) fail('A must not read B preferences')

  await expectDenied('A update B preferences', () =>
    clientA.from('notification_preferences').update({ timezone: 'UTC' }).eq('id', state.preferenceIds.b).select('id')
  )

  await expectDenied('A update own preferences employee_id to B', () =>
    clientA
      .from('notification_preferences')
      .update({ employee_id: state.employeeIds.b })
      .eq('id', state.preferenceIds.a)
      .select('id')
  )

  await expectDenied('A update own preferences auth_user_id to B', () =>
    clientA
      .from('notification_preferences')
      .update({ auth_user_id: getAuthUser('b').id })
      .eq('id', state.preferenceIds.a)
      .select('id')
  )

  const { error: updateOwnPrefErr } = await clientA
    .from('notification_preferences')
    .update({ timezone: 'Asia/Almaty' })
    .eq('id', state.preferenceIds.a)
  if (updateOwnPrefErr) fail(`A update own preferences: ${updateOwnPrefErr.message}`)

  const { data: academyRows, error: academyErr } = await clientA
    .from('academy_users')
    .select('id, full_name, login, role, status, auth_user_id')
    .eq('auth_user_id', getAuthUser('a').id)
  if (academyErr) fail(`A read own academy_users: ${academyErr.message}`)
  if ((academyRows ?? []).length !== 1 || academyRows[0].id !== state.employeeIds.a) {
    fail('authenticated must read only own academy_users profile')
  }

  const { data: academyOther, error: academyOtherErr } = await clientA
    .from('academy_users')
    .select('id')
    .eq('auth_user_id', getAuthUser('b').id)
  if (academyOtherErr && !/permission|policy|42501/i.test(academyOtherErr.message)) {
    fail(`Unexpected error reading other profile: ${academyOtherErr.message}`)
  }
  if ((academyOther ?? []).length > 0) {
    fail('authenticated must not read other academy_users profiles')
  }

  await expectEmptySelect('A read templates', () => clientA.from('notification_templates').select('id').limit(1))
  await expectEmptySelect('A read rules', () => clientA.from('notification_rules').select('id').limit(1))
  await expectEmptySelect('A read deliveries', () => clientA.from('notification_deliveries').select('id').limit(1))

  const { data: anonNotifs, error: anonNotifsErr } = await anon.from('notifications').select('id').limit(1)
  if (anonNotifsErr) {
    // RLS deny may surface as empty or error — both acceptable if no data returned
  }
  if ((anonNotifs ?? []).length > 0) fail('Anon must not read notifications')

  const { data: notifsBCheck } = await clientB.from('notifications').select('id').eq('module_code', 'test')
  if (notifsBCheck.some((row) => row.id === state.notificationIds.a)) fail('B must not see A notification')

  const { data: subsB } = await clientB.from('notification_push_subscriptions').select('id')
  if (subsB.length !== 1 || subsB[0].id !== state.subscriptionIds.b) fail('B sees only own subscriptions')

  await expectDenied('B update A subscription', () =>
    clientB.from('notification_push_subscriptions').update({ device_name: 'hack' }).eq('id', state.subscriptionIds.a).select('id')
  )
  await expectDenied('B delete A subscription', () =>
    clientB.from('notification_push_subscriptions').delete().eq('id', state.subscriptionIds.a).select('id')
  )
  await expectDenied('B insert subscription for A employee_id', () =>
    clientB.from('notification_push_subscriptions').insert({
      employee_id: state.employeeIds.a,
      auth_user_id: getAuthUser('b').id,
      endpoint: `https://local.test/push/${state.runId}/b-as-a`,
      ...pushSubscriptionRow({ p256dh_key: 'k', auth_key: 'k' }),
    })
  )
  await expectDenied('B update A preferences', () =>
    clientB.from('notification_preferences').update({ timezone: 'UTC' }).eq('id', state.preferenceIds.a).select('id')
  )

  await expectDenied('B update own subscription employee_id to A', () =>
    clientB
      .from('notification_push_subscriptions')
      .update({ employee_id: state.employeeIds.a })
      .eq('id', state.subscriptionIds.b)
      .select('id')
  )

  await expectDenied('B update own preferences auth_user_id to A', () =>
    clientB
      .from('notification_preferences')
      .update({ auth_user_id: getAuthUser('a').id })
      .eq('id', state.preferenceIds.b)
      .select('id')
  )

  for (const table of [
    'notification_push_subscriptions',
    'notification_preferences',
    'notification_templates',
    'notification_rules',
    'notification_deliveries',
  ]) {
    const { data } = await anon.from(table).select('id').limit(1)
    if ((data ?? []).length > 0) fail(`Anon must not read ${table}`)
  }

  await expectDenied('Anon insert notification', () =>
    anon.from('notifications').insert({
      employee_id: state.employeeIds.a,
      auth_user_id: getAuthUser('a').id,
      module_code: 'test',
      event_code: 'anon',
      title: 'x',
      body: 'x',
      deduplication_key: `${state.runId}:anon`,
    })
  )

  await expectDenied('Anon insert push subscription', () =>
    anon.from('notification_push_subscriptions').insert({
      employee_id: state.employeeIds.a,
      auth_user_id: getAuthUser('a').id,
      endpoint: `https://local.test/push/${state.runId}/anon`,
      ...pushSubscriptionRow({ p256dh_key: 'k', auth_key: 'k' }),
    })
  )

  await expectDenied('Anon insert preferences', () =>
    anon.from('notification_preferences').insert({
      employee_id: state.employeeIds.a,
      auth_user_id: getAuthUser('a').id,
      module_code: `anon-${state.runId}`,
    })
  )

  const service = adminClient()
  const { data: templates, error: templatesErr } = await service.from('notification_templates').select('id').limit(1)
  if (templatesErr) fail(`Service-side read templates: ${templatesErr.message}`)
  if (!templates?.length) fail('Service-side must read templates')

  const { data: rules, error: rulesErr } = await service.from('notification_rules').select('id').limit(1)
  if (rulesErr) fail(`Service-side read rules: ${rulesErr.message}`)
  if (!rules?.length) fail('Service-side must read rules')

  const dedupeService = `${state.runId}:service`
  const { error: createNotifErr } = await service.from('notifications').insert({
    employee_id: state.employeeIds.a,
    auth_user_id: getAuthUser('a').id,
    module_code: 'test',
    event_code: 'service_side',
    title: 'service',
    body: 'service',
    deduplication_key: dedupeService,
    metadata: { run_id: state.runId },
  })
  if (createNotifErr) fail(`Service-side create notification: ${createNotifErr.message}`)

  const serviceNotifId = psqlScalar(
    `SELECT id::text FROM public.notifications WHERE deduplication_key = '${dedupeService}';`
  )
  const { error: deliveryErr } = await service.from('notification_deliveries').insert({
    notification_id: serviceNotifId,
    channel: 'in_app',
    status: 'queued',
  })
  if (deliveryErr) fail(`Service-side create delivery: ${deliveryErr.message}`)

  console.log('  RLS: passed\n')
}

async function expectDenied(label, operation) {
  const { data, error } = await operation()
  if (error) return
  if (Array.isArray(data) && data.length > 0) {
    fail(`${label}: expected denial, but operation affected ${data.length} row(s)`)
  }
  if (data && !Array.isArray(data) && typeof data === 'object' && Object.keys(data).length > 0) {
    fail(`${label}: expected denial, but operation returned data`)
  }
}

async function expectEmptySelect(label, operation) {
  const { data, error } = await operation()
  if (error) {
    if (/permission denied/i.test(error.message)) return
    fail(`${label}: ${error.message}`)
  }
  if ((data ?? []).length > 0) fail(`${label}: expected no rows`)
}

async function stageCheckConstraints() {
  console.log('Stage 8: CHECK constraints')

  for (const test of CHECK_TESTS) {
    const sql = test.sql.replaceAll('__EMPLOYEE_A__', String(state.employeeIds.a))
    if (test.runTwice) {
      const first = psqlExec(sql)
      if (first.status !== 0) fail(`${test.name}: first insert should succeed for duplicate test`)
      expectSqlFailure(test.name, sql)
      psqlExec(`DELETE FROM public.notifications WHERE deduplication_key = 'test:check:duplicate';`)
    } else {
      expectSqlFailure(test.name, sql)
    }
    state.checkPassed += 1
  }

  console.log(`  CHECK constraints: ${state.checkPassed} passed\n`)
}

async function stageUpdatedAtTests() {
  console.log('Stage 9: updated_at triggers')

  for (const table of UPDATED_AT_TABLES) {
    const triggerName = `${table}_updated_at`
    const triggerExists = psqlScalar(`
      SELECT COUNT(*) FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = '${table}'
        AND t.tgname = '${triggerName}' AND NOT t.tgisinternal;
    `)
    if (triggerExists !== '1') fail(`Missing trigger ${triggerName} on ${table}`)

    const row = await insertUpdatedAtProbe(table)
    await sleep(50)
    psqlExec(`UPDATE public.${table} SET ${row.updateColumn} = ${row.updateValue} WHERE id = '${row.id}';`)
    const times = psqlScalar(`
      SELECT CASE WHEN updated_at > '${row.updatedAt}' THEN 'ok' ELSE 'bad' END
      FROM public.${table} WHERE id = '${row.id}';
    `)
    if (times !== 'ok') fail(`updated_at did not change on ${table}`)
    psqlExec(`DELETE FROM public.${table} WHERE id = '${row.id}';`)
    state.updatedAtPassed += 1
  }

  console.log(`  updated_at triggers: ${state.updatedAtPassed} passed\n`)
}

async function insertUpdatedAtProbe(table) {
  switch (table) {
    case 'notification_templates':
      return insertProbe(`
        INSERT INTO public.notification_templates (code, module_code, event_code, title_template, body_template)
        VALUES ('test.updated_at.${state.runId}', 'test', 'x', 't', 'b')
        RETURNING id::text, updated_at::text;
      `, 'title_template', `'updated-${state.runId}'`)
    case 'notification_rules':
      return insertProbe(`
        INSERT INTO public.notification_rules (code, template_id, module_code, event_code, trigger_type, channels)
        SELECT 'test.updated_at.${state.runId}', id, 'test', 'x', 'manual', ARRAY['in_app']::text[]
        FROM public.notification_templates LIMIT 1
        RETURNING id::text, updated_at::text;
      `, 'priority', `'high'`)
    case 'notifications':
      return insertProbe(`
        INSERT INTO public.notifications (employee_id, auth_user_id, module_code, event_code, title, body, deduplication_key)
        VALUES (${state.employeeIds.a}, '${getAuthUser('a').id}', 'test', 'updated_at', 't', 'b', 'test:updated_at:${state.runId}')
        RETURNING id::text, updated_at::text;
      `, 'title', `'updated-${state.runId}'`)
    case 'notification_push_subscriptions':
      return insertProbe(`
        INSERT INTO public.notification_push_subscriptions (employee_id, auth_user_id, endpoint, p256dh_key, auth_key, device_id)
        VALUES (${state.employeeIds.a}, '${getAuthUser('a').id}', 'https://local.test/push/${state.runId}/updated-at', 'k', 'k', gen_random_uuid())
        RETURNING id::text, updated_at::text;
      `, 'device_name', `'device-${state.runId}'`)
    case 'notification_preferences':
      return insertProbe(`
        INSERT INTO public.notification_preferences (employee_id, auth_user_id, module_code)
        VALUES (${state.employeeIds.a}, '${getAuthUser('a').id}', 'updated-at-${state.runId}')
        RETURNING id::text, updated_at::text;
      `, 'timezone', `'Asia/Almaty'`)
    default:
      fail(`Unknown updated_at table ${table}`)
  }
}

function insertProbe(sql, updateColumn, updateValue) {
  const out = psqlMutate(sql)
  const [id, updatedAt] = out.split('|')
  return { id, updatedAt, updateColumn, updateValue }
}

async function stageOnDeleteTests() {
  console.log('Stage 10: ON DELETE behavior')

  const authC = await createTemporaryAuthUserC()
  const employeeC = nextEmployeeId()
  psqlExec(`
    INSERT INTO public.academy_users (id, first_name, last_name, full_name, login, password, role, status, auth_user_id)
    VALUES (${employeeC}, 'Verify', 'c', '[${state.runId}] c', 'notification-test-c-${state.runId}', '', 'cashier', 'active', '${authC.id}');
  `)

  const notifId = psqlMutate(`
    INSERT INTO public.notifications (employee_id, auth_user_id, module_code, event_code, title, body, deduplication_key)
    VALUES (${employeeC}, '${authC.id}', 'test', 'on_delete', 't', 'b', '${state.runId}:ondelete:notif')
    RETURNING id::text;
  `)
  const deliveryId = psqlMutate(`
    INSERT INTO public.notification_deliveries (notification_id, channel, status)
    VALUES ('${notifId}', 'in_app', 'queued')
    RETURNING id::text;
  `)

  psqlExec(`DELETE FROM public.notifications WHERE id = '${notifId}';`)
  assertEqual(
    'DELETE notification cascades deliveries',
    psqlScalar(`SELECT COUNT(*) FROM public.notification_deliveries WHERE id = '${deliveryId}';`),
    '0'
  )

  const notifId2 = psqlMutate(`
    INSERT INTO public.notifications (employee_id, auth_user_id, module_code, event_code, title, body, deduplication_key)
    VALUES (${employeeC}, '${authC.id}', 'test', 'on_delete', 't', 'b', '${state.runId}:ondelete:notif2')
    RETURNING id::text;
  `)
  const subId = psqlMutate(`
    INSERT INTO public.notification_push_subscriptions (employee_id, auth_user_id, endpoint, p256dh_key, auth_key, device_id)
    VALUES (${employeeC}, '${authC.id}', 'https://local.test/push/${state.runId}/ondelete', 'k', 'k', gen_random_uuid())
    RETURNING id::text;
  `)
  const deliveryId2 = psqlMutate(`
    INSERT INTO public.notification_deliveries (notification_id, subscription_id, channel, status)
    VALUES ('${notifId2}', '${subId}', 'push', 'queued')
    RETURNING id::text;
  `)

  const subDeleteStatus = psqlExec(`DELETE FROM public.notification_push_subscriptions WHERE id = '${subId}';`)
  if (subDeleteStatus.status !== 0) fail('DELETE subscription should succeed')
  assertEqual(
    'DELETE subscription keeps delivery row',
    psqlScalar(`SELECT COUNT(*) FROM public.notification_deliveries WHERE id = '${deliveryId2}';`),
    '1'
  )
  assertEqual(
    'DELETE subscription sets subscription_id NULL',
    psqlScalar(`SELECT subscription_id IS NULL FROM public.notification_deliveries WHERE id = '${deliveryId2}';`),
    't'
  )

  psqlExec(`
    INSERT INTO public.notification_preferences (employee_id, auth_user_id, module_code)
    VALUES (${employeeC}, '${authC.id}', 'ondelete-${state.runId}');
  `)
  psqlExec(`DELETE FROM public.academy_users WHERE id = ${employeeC};`)
  assertEqual(
    'DELETE employee cascades notifications',
    psqlScalar(`SELECT COUNT(*) FROM public.notifications WHERE deduplication_key LIKE '${state.runId}:ondelete:%';`),
    '0'
  )
  assertEqual(
    'DELETE employee cascades preferences',
    psqlScalar(`SELECT COUNT(*) FROM public.notification_preferences WHERE module_code = 'ondelete-${state.runId}';`),
    '0'
  )

  const employeeD = nextEmployeeId()
  psqlExec(`
    INSERT INTO public.academy_users (id, first_name, last_name, full_name, login, password, role, status, auth_user_id)
    VALUES (${employeeD}, 'Verify', 'd', '[${state.runId}] d', 'notification-test-d-${state.runId}', '', 'cashier', 'active', '${authC.id}');
  `)
  psqlExec(`
    INSERT INTO public.notifications (employee_id, auth_user_id, module_code, event_code, title, body, deduplication_key)
    VALUES (${employeeD}, '${authC.id}', 'test', 'on_delete', 't', 'b', '${state.runId}:ondelete:auth-user');
  `)
  psqlExec(`
    INSERT INTO public.notification_preferences (employee_id, auth_user_id, module_code)
    VALUES (${employeeD}, '${authC.id}', 'auth-delete-${state.runId}');
  `)
  psqlExec(`
    INSERT INTO public.notification_push_subscriptions (employee_id, auth_user_id, endpoint, p256dh_key, auth_key, device_id)
    VALUES (${employeeD}, '${authC.id}', 'https://local.test/push/${state.runId}/auth-delete', 'k', 'k', gen_random_uuid());
  `)

  const admin = adminClient()
  const { error: deleteAuthErr } = await admin.auth.admin.deleteUser(authC.id)
  if (deleteAuthErr) fail(`Delete auth user C: ${deleteAuthErr.message}`)

  assertEqual(
    'DELETE auth user nullifies academy_users.auth_user_id',
    psqlScalar(`SELECT auth_user_id IS NULL FROM public.academy_users WHERE id = ${employeeD};`),
    't'
  )
  assertEqual(
    'DELETE auth user nullifies notifications.auth_user_id',
    psqlScalar(
      `SELECT auth_user_id IS NULL FROM public.notifications WHERE deduplication_key = '${state.runId}:ondelete:auth-user';`
    ),
    't'
  )
  assertEqual(
    'DELETE auth user nullifies preferences.auth_user_id',
    psqlScalar(
      `SELECT auth_user_id IS NULL FROM public.notification_preferences WHERE module_code = 'auth-delete-${state.runId}';`
    ),
    't'
  )
  assertEqual(
    'DELETE auth user cascades push subscriptions',
    psqlScalar(
      `SELECT COUNT(*) FROM public.notification_push_subscriptions WHERE endpoint = 'https://local.test/push/${state.runId}/auth-delete';`
    ),
    '0'
  )

  psqlExec(`DELETE FROM public.academy_users WHERE id = ${employeeD};`)

  console.log('  ON DELETE: passed\n')
}

async function createTemporaryAuthUserC() {
  const password = crypto.randomBytes(24).toString('base64url')
  const email = `notification-test-c-${state.runId}@shugyla.local`
  const admin = adminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) fail(`Create auth user C: ${error.message}`)
  state.authUsers.push({ key: 'c', id: data.user.id, email })
  state.passwords.c = password
  return { id: data.user.id, email }
}

async function stageSeedIntegrity() {
  assertEqual(
    'Seed templates count',
    psqlScalar("SELECT COUNT(*) FROM public.notification_templates WHERE code LIKE 'time_tracker.%';"),
    '4'
  )
  assertEqual(
    'Seed rules count',
    psqlScalar("SELECT COUNT(*) FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%';"),
    '4'
  )
  assertEqual(
    'Enabled seed rules',
    psqlScalar("SELECT COUNT(*) FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%' AND is_enabled = true;"),
    '0'
  )
}

function getAuthUser(key) {
  const user = state.authUsers.find((item) => item.key === key)
  if (!user) fail(`Missing auth user ${key}`)
  return user
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) fail(`${label}: expected ${expected}, got ${actual}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function cleanup() {
  console.log('Cleanup: removing temporary local test data')

  if (!state.container) {
    console.log('  Cleanup skipped: no DB container\n')
    return
  }

  const marker = state.runId
  psqlExec(`
    DELETE FROM public.notification_deliveries
    WHERE notification_id IN (
      SELECT id FROM public.notifications
      WHERE metadata->>'run_id' = '${marker}' OR deduplication_key LIKE '${marker}:%'
    );
    DELETE FROM public.notifications
    WHERE metadata->>'run_id' = '${marker}' OR deduplication_key LIKE '${marker}:%' OR deduplication_key LIKE 'test:%';
    DELETE FROM public.notification_push_subscriptions
    WHERE endpoint LIKE 'https://local.test/push/${marker}%' OR endpoint LIKE 'https://local.test/push/${marker}/%';
    DELETE FROM public.notification_preferences
    WHERE module_code LIKE '%${marker}%' OR module_code LIKE 'test-${marker}%' OR module_code LIKE 'ondelete-${marker}%' OR module_code LIKE 'auth-delete-${marker}%' OR module_code LIKE 'updated-at-${marker}%';
    DELETE FROM public.notification_templates WHERE code LIKE 'test.%${marker}%';
    DELETE FROM public.notification_rules WHERE code LIKE 'test.%${marker}%';
    DELETE FROM public.academy_users WHERE full_name LIKE '%[${marker}]%' OR login LIKE '%${marker}%';
  `)

  const admin = state.apiUrl && state.serviceRoleKey ? adminClient() : null
  if (admin) {
    for (const user of state.authUsers) {
      try {
        await admin.auth.admin.deleteUser(user.id)
      } catch {
        // best effort
      }
    }
  }

  const remainingEmployees = psqlScalar(
    `SELECT COUNT(*) FROM public.academy_users WHERE full_name LIKE '%[${marker}]%';`
  )
  const remainingNotifs = psqlScalar(
    `SELECT COUNT(*) FROM public.notifications WHERE metadata->>'run_id' = '${marker}';`
  )
  const remainingAuth = psqlScalar(`
    SELECT COUNT(*) FROM auth.users
    WHERE email LIKE 'notification-test-%${marker}@shugyla.local'
       OR email IN ('notification-test-a@shugyla.local','notification-test-b@shugyla.local','notification-test-ambiguous@shugyla.local');
  `)

  if (remainingEmployees !== '0' || remainingNotifs !== '0') {
    fail(
      `Cleanup incomplete: employees=${remainingEmployees}, notifications=${remainingNotifs}, authUsers=${remainingAuth}`
    )
  }

  const enabledRules = psqlScalar(
    "SELECT COUNT(*) FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%' AND is_enabled = true;"
  )
  if (enabledRules !== '0') fail('Cleanup left enabled seed rules')

  console.log('  Cleanup: passed\n')
}

function printSuccess() {
  console.log('Notification foundation verification completed\n')
  console.log('- Environment: local')
  console.log('- Helper schema/function security: passed')
  console.log('- Mark-read RPC security: passed')
  console.log('- Backfill tests: passed')
  console.log('- Frontend/SQL login mapping: passed')
  console.log('- RLS tests: passed')
  console.log('- Mark-read RPC tests: passed')
  console.log('- Anon access tests: passed')
  console.log(`- CHECK constraints: ${state.checkPassed} passed`)
  console.log(`- updated_at triggers: ${state.updatedAtPassed} passed`)
  console.log('- ON DELETE tests: passed')
  console.log('- Cleanup: passed')
  console.log('- Enabled notification rules: 0')
}

main()
