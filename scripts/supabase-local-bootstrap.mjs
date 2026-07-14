#!/usr/bin/env node
/**
 * Local-only Supabase bootstrap for Shugyla Academy.
 *
 * Usage:
 *   npm run supabase:local:bootstrap -- --reset
 *
 * Without --reset the script prints help and exits with code 1.
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROJECT_ID = 'shugyla-academy'
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'

const REQUIRED_FILES = [
  'supabase/config.toml',
  'supabase/schema.sql',
  'supabase/migrations/20260712163000_complete_flexible_rbac.sql',
  'supabase/migrations/20260713194500_notification_system_foundation.sql',
  'supabase/migrations/20260714120000_auth_first_login_foundation.sql',
  'supabase/migrations/20260714130000_employee_provisioning_service_grants.sql',
  'supabase/functions/admin-create-employee/index.ts',
  'supabase/functions/admin-list-employees/index.ts',
  'supabase/functions/admin-update-employee/index.ts',
  'supabase/functions/manage-push-subscription/index.ts',
  'supabase/functions/send-test-web-push/index.ts',
]

const TIMESTAMP_MIGRATIONS = [
  '20260712163000_complete_flexible_rbac.sql',
  '20260713194500_notification_system_foundation.sql',
  '20260714120000_auth_first_login_foundation.sql',
  '20260714130000_employee_provisioning_service_grants.sql',
  '20260714140000_web_push_subscription_foundation.sql',
  '20260714150000_web_push_delivery_tracking.sql',
]

const TEMPLATE_CODES = [
  'time_tracker.shift_start_soon',
  'time_tracker.clock_in_missing',
  'time_tracker.shift_end_reached',
  'time_tracker.clock_out_missing',
]

const RULE_CODES = [
  'time_tracker.rule.shift_start_soon',
  'time_tracker.rule.clock_in_missing',
  'time_tracker.rule.shift_end_reached',
  'time_tracker.rule.clock_out_missing',
]

function main() {
  const args = process.argv.slice(2)
  if (!args.includes('--reset')) {
    printHelp()
    process.exit(1)
  }

  if (args.some((arg) => ['--linked', '--db-url', '--project-ref'].includes(arg))) {
    fail('Remote flags are not allowed for local bootstrap.')
  }

  console.log('=== Local Supabase bootstrap (--reset) ===\n')

  stageSafetyChecks()
  stageStopLocal()
  stageStartLocal()
  const dbContainer = findDbContainer()
  stageApplySchema(dbContainer)
  stageMigrationUp()
  stageVerify(dbContainer)
  stageFinalReport()
}

function printHelp() {
  console.error(`Local Supabase bootstrap

This command recreates ONLY the local Docker database for project "${PROJECT_ID}".

Usage:
  npm run supabase:local:bootstrap -- --reset

Requirements:
  - Docker Desktop running
  - supabase/config.toml with [db.migrations] enabled = false
  - No remote Supabase project link

Without --reset nothing is changed.`)
}

function fail(message, code = 1) {
  console.error(`\nERROR: ${message}`)
  process.exit(code)
}

function run(command, args, options = {}) {
  const capture = options.capture ?? false
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    input: options.input,
  })

  if (result.error) {
    fail(`${command} ${args.join(' ')} failed: ${result.error.message}`)
  }

  if (result.status !== 0 && !options.allowFailure) {
    const stderr = result.stderr?.trim()
    const stdout = result.stdout?.trim()
    const details = [stderr, stdout].filter(Boolean).join('\n')
    fail(`${command} ${args.join(' ')} exited with code ${result.status}${details ? `\n${details}` : ''}`)
  }

  return result
}

function runSupabase(args, options = {}) {
  return run('npx', ['supabase', ...args], options)
}

function readFile(relativePath) {
  const fullPath = path.join(ROOT, relativePath)
  if (!fs.existsSync(fullPath)) {
    fail(`Required file missing: ${relativePath}`)
  }
  return fs.readFileSync(fullPath, 'utf8')
}

function stageSafetyChecks() {
  console.log('Stage A: Safety checks')

  for (const relativePath of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(ROOT, relativePath))) {
      fail(`Required file missing: ${relativePath}`)
    }
  }

  const config = readFile('supabase/config.toml')

  if (!config.includes(`project_id = "${PROJECT_ID}"`)) {
    fail(`supabase/config.toml must contain project_id = "${PROJECT_ID}"`)
  }

  if (config.includes(PRODUCTION_REF)) {
    fail('Production project ref found in supabase/config.toml')
  }

  if (/[a-z0-9-]+\.supabase\.co\b/i.test(config)) {
    fail('Remote supabase.co project URL found in supabase/config.toml')
  }

  const migrationsSection = config.match(/\[db\.migrations\][\s\S]*?(?=\n\[|$)/)?.[0] ?? ''
  if (!/enabled\s*=\s*false/.test(migrationsSection)) {
    fail(
      'supabase/config.toml [db.migrations] enabled must be false for local bootstrap.\n' +
        'Automatic migrations on start would run before schema.sql creates academy_users.'
    )
  }

  checkRemoteLinkMetadata(config)

  run('docker', ['info'], { capture: true })
  console.log('  Docker: OK')

  const versionResult = run('npx', ['supabase', '--version'], { capture: true })
  console.log(`  Supabase CLI: ${versionResult.stdout.trim()}`)

  const legacyCount = countLegacyMigrations()
  console.log(`  Legacy migrations (skipped by CLI): ${legacyCount}`)
  console.log('')
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
      if (content.includes(PRODUCTION_REF)) {
        fail(`Remote project link detected in ${relativePath}`)
      }
      if (content !== PROJECT_ID && /^[a-z0-9]{15,}$/i.test(content)) {
        fail(`Remote project ref detected in ${relativePath}`)
      }
    }
  }

  if (configText.includes('db_url') || configText.includes('remote')) {
    // noop: generic words may appear in comments; supabase.co already checked
  }
}

function countLegacyMigrations() {
  const dir = path.join(ROOT, 'supabase/migrations')
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sql'))
  return files.filter((name) => !/^\d{14}_.+\.sql$/.test(name)).length
}

function stageStopLocal() {
  console.log('Stage B: Stop local project and remove local data')

  const result = runSupabase(['stop', '--no-backup', '--project-id', PROJECT_ID], {
    capture: true,
    allowFailure: true,
  })

  if (result.status === 0) {
    console.log('  Local Supabase stopped (local data removed)\n')
  } else {
    console.log('  Local Supabase was not running (continuing)\n')
  }
}

function stageStartLocal() {
  console.log('Stage C: Start local Supabase')

  runSupabase(['start'])

  const statusResult = runSupabase(['status', '-o', 'json'], { capture: true })
  let status
  try {
    status = JSON.parse(statusResult.stdout)
  } catch {
    fail('Could not parse local supabase status JSON')
  }

  const urls = [
    ['API_URL', status.API_URL],
    ['STUDIO_URL', status.STUDIO_URL],
    ['DB_URL', status.DB_URL],
  ]

  for (const [label, value] of urls) {
    if (!value || !isLocalUrl(value)) {
      fail(`${label} is not local: ${value ?? '(missing)'}`)
    }
  }

  console.log('  Local URLs verified\n')
  globalThis.__bootstrapStatus = status
}

function isLocalUrl(value) {
  try {
    const url = new URL(String(value))
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  } catch {
    return /^(127\.0\.0\.1|localhost)(:|\/|$)/.test(String(value))
  }
}

function findDbContainer() {
  console.log('Stage D: Locate local database container')

  const exactName = `supabase_db_${PROJECT_ID}`
  const exactResult = run(
    'docker',
    ['ps', '--filter', `name=^/${exactName}$`, '--format', '{{.Names}}'],
    { capture: true }
  )

  let names = exactResult.stdout.trim().split('\n').filter(Boolean)

  if (names.length === 0) {
    const fuzzyResult = run(
      'docker',
      ['ps', '--filter', `name=supabase_db_${PROJECT_ID}`, '--format', '{{.Names}}'],
      { capture: true }
    )
    names = fuzzyResult.stdout.trim().split('\n').filter(Boolean)
  }

  if (names.length === 0) {
    fail('No local Supabase database container found')
  }

  if (names.length > 1) {
    fail(`Multiple database containers matched: ${names.join(', ')}`)
  }

  console.log(`  Database container: ${names[0]}\n`)
  return names[0]
}

function stageApplySchema(container) {
  console.log('Stage E: Apply supabase/schema.sql')

  const schemaPath = path.join(ROOT, 'supabase/schema.sql')
  const schemaSql = fs.readFileSync(schemaPath)

  const result = run(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { capture: true, input: schemaSql }
  )

  if (result.status !== 0) {
    const err = [result.stderr, result.stdout].filter(Boolean).join('\n')
    fail(`schema.sql failed:\n${err}`)
  }

  const academyUsers = psqlScalar(container, "SELECT to_regclass('public.academy_users')")
  if (academyUsers !== 'academy_users') {
    fail(`Expected public.academy_users after schema.sql, got: ${academyUsers ?? '(null)'}`)
  }

  const shifts = psqlScalar(container, "SELECT to_regclass('public.academy_employee_shifts')")
  if (shifts !== 'academy_employee_shifts') {
    fail(`Expected public.academy_employee_shifts after schema.sql, got: ${shifts ?? '(null)'}`)
  }

  const updatedAtFn = psqlScalar(
    container,
    "SELECT to_regprocedure('public.academy_set_updated_at()')"
  )
  if (!updatedAtFn) {
    fail('Expected function public.academy_set_updated_at() after schema.sql')
  }

  console.log('  schema.sql: OK\n')
}

function stageMigrationUp() {
  console.log('Stage F: Apply timestamp migrations')

  const result = runSupabase(['migration', 'up', '--local'], { capture: true })
  const output = `${result.stdout}\n${result.stderr}`

  for (const migration of TIMESTAMP_MIGRATIONS) {
    if (!output.includes(migration)) {
      fail(`Expected migration output to mention ${migration}`)
    }
  }

  if (/ERROR:/i.test(output)) {
    fail(`Migration failed:\n${output}`)
  }

  console.log('  RBAC migration: OK')
  console.log('  Notification migration: OK')
  console.log('  Auth-first migration: OK')
  console.log('  Provisioning grants migration: OK\n')
}

function psqlQuery(container, sql) {
  const result = run(
    'docker',
    ['exec', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql],
    { capture: true }
  )
  return result.stdout.trim()
}

function psqlScalar(container, sql) {
  const value = psqlQuery(container, sql)
  return value || null
}

function stageVerify(container) {
  console.log('Stage G: Verify objects')

  const checks = [
    ["public.academy_users", "SELECT to_regclass('public.academy_users')", 'academy_users'],
    ["academy_users.auth_user_id", "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='academy_users' AND column_name='auth_user_id'", '1'],
    ['public.roles', "SELECT to_regclass('public.roles')", 'roles'],
    ['public.permissions', "SELECT to_regclass('public.permissions')", 'permissions'],
    ['public.role_permissions', "SELECT to_regclass('public.role_permissions')", 'role_permissions'],
    ['public.notification_templates', "SELECT to_regclass('public.notification_templates')", 'notification_templates'],
    ['public.notification_rules', "SELECT to_regclass('public.notification_rules')", 'notification_rules'],
    ['public.notifications', "SELECT to_regclass('public.notifications')", 'notifications'],
    ['public.notification_push_subscriptions', "SELECT to_regclass('public.notification_push_subscriptions')", 'notification_push_subscriptions'],
    ['public.notification_deliveries', "SELECT to_regclass('public.notification_deliveries')", 'notification_deliveries'],
    ['public.notification_preferences', "SELECT to_regclass('public.notification_preferences')", 'notification_preferences'],
  ]

  for (const [label, sql, expected] of checks) {
    const actual = psqlScalar(container, sql)
    if (actual !== expected) {
      fail(`Verification failed for ${label}: expected ${expected}, got ${actual ?? '(null)'}`)
    }
    console.log(`  ${label}: OK`)
  }

  const templateCount = psqlScalar(
    container,
    "SELECT COUNT(*) FROM public.notification_templates WHERE code LIKE 'time_tracker.%'"
  )
  if (templateCount !== '4') {
    fail(`Expected 4 notification templates, got ${templateCount}`)
  }

  const ruleCount = psqlScalar(
    container,
    "SELECT COUNT(*) FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%'"
  )
  if (ruleCount !== '4') {
    fail(`Expected 4 notification rules, got ${ruleCount}`)
  }

  const enabledRules = psqlScalar(
    container,
    `SELECT COUNT(*) FROM public.notification_rules WHERE code IN (${RULE_CODES.map((c) => `'${c}'`).join(', ')}) AND is_enabled = true`
  )
  if (enabledRules !== '0') {
    fail(`Expected 0 enabled notification rules, got ${enabledRules}`)
  }

  for (const code of TEMPLATE_CODES) {
    const exists = psqlScalar(container, `SELECT COUNT(*) FROM public.notification_templates WHERE code = '${code}'`)
    if (exists !== '1') fail(`Missing template ${code}`)
  }

  for (const code of RULE_CODES) {
    const exists = psqlScalar(container, `SELECT COUNT(*) FROM public.notification_rules WHERE code = '${code}'`)
    if (exists !== '1') fail(`Missing rule ${code}`)
  }

  const versions = psqlQuery(
    container,
    'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version'
  ).split('\n').filter(Boolean)

  for (const version of ['20260712163000', '20260713194500']) {
    if (!versions.includes(version)) {
      fail(`Migration history missing version ${version}`)
    }
  }

  console.log('  Templates: 4')
  console.log('  Rules: 4')
  console.log('  Enabled rules: 0')
  console.log('  Migration history: OK\n')
}

function stageFinalReport() {
  const status = globalThis.__bootstrapStatus ?? {}
  const dbUrl = status.DB_URL ? new URL(status.DB_URL) : null

  console.log('Local Supabase bootstrap completed\n')
  console.log(`- API: ${status.API_URL ?? 'n/a'}`)
  console.log(`- Studio: ${status.STUDIO_URL ?? 'n/a'}`)
  console.log(
    `- DB: ${dbUrl ? `${dbUrl.hostname}:${dbUrl.port || '5432'}` : 'n/a'}`
  )
  console.log('- academy_users: OK')
  console.log('- RBAC migration: OK')
  console.log('- Notification migration: OK')
  console.log('- Notification templates: 4')
  console.log('- Notification rules: 4')
  console.log('- Enabled notification rules: 0')
}

main()
