#!/usr/bin/env node
/**
 * Static guardrails for the procurement ABC disposable-staging bootstrap fixture.
 *
 * Confirms:
 *   1. the fixture is test-only and is not a production migration,
 *   2. it refuses production project-ref / existing Shugyla schema,
 *   3. it does not drop snake leftover tables, copy data, or grant anon write,
 *   4. permission helpers are fail-closed,
 *   5. the real procurement planning migrations stay in timestamp order,
 *      fixture first, ABC last.
 *
 * Does not embed secrets or project refs. Does not talk to remote Supabase.
 *
 * Usage:
 *   npm run verify:procurement-abc-staging-bootstrap
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const FIXTURE = 'supabase/tests/fixtures/procurement_abc_staging_bootstrap.sql'
const MIGRATIONS_DIR = 'supabase/migrations'
const PACKAGE_JSON = 'package.json'
const ABC_DOC = 'docs/procurement/abc-analysis.md'

const REAL_MIGRATIONS = [
  '20260809072915_procurement_planning_v1.sql',
  '20260809073454_procurement_planning_v1_hardening.sql',
  '20260810160315_procurement_partial_supplier_generation.sql',
  '20260810170350_require_supplier_for_procurement_generation.sql',
  '20260812032500_fix_procurement_snapshot_guard_security_definer.sql',
  '20260812041000_procurement_order_state_rpc.sql',
  '20260812054623_revoke_procurement_snapshot_guard_execute.sql',
  '20260812171700_procurement_norm_taxonomy_rpc.sql',
  '20260814134910_procurement_repeat_analytics_orders.sql',
  '20260815072607_procurement_abc_analysis.sql',
]

const EXPECTED_CHECKS = 79

let checks = 0

function fail(message) {
  throw new Error(message)
}

function pass(name) {
  checks += 1
  console.log(`  ✓ ${name}`)
}

function assert(name, condition, detail = '') {
  if (!condition) fail(`${name}${detail ? ` — ${detail}` : ''}`)
  pass(name)
}

function read(relPath) {
  const full = path.join(ROOT, relPath)
  if (!fs.existsSync(full)) fail(`file not found: ${relPath}`)
  return fs.readFileSync(full, 'utf8')
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
}

function grantTargetsAnon(sql) {
  const body = stripSqlComments(sql)
  const grants = []
  const re = /\bgrant\b[\s\S]*?;/gi
  let match
  while ((match = re.exec(body))) {
    const stmt = match[0].replace(/\s+/g, ' ')
    if (/\bto\s+anon\b/i.test(stmt)) grants.push(stmt.trim())
  }
  return grants
}

function hasUsingTruePolicy(sql) {
  const body = stripSqlComments(sql)
  return /create\s+policy[\s\S]*?\busing\s*\(\s*true\s*\)/i.test(body)
}

console.log('Stage 1: fixture location and test-only markings')

const fixtureRel = FIXTURE.split('/').join(path.sep)
const fixtureAbs = path.join(ROOT, fixtureRel)
assert('fixture file exists', fs.existsSync(fixtureAbs), FIXTURE)

const fixtureDir = path.dirname(FIXTURE)
assert(
  'fixture lives under supabase/tests/fixtures',
  fixtureDir === 'supabase/tests/fixtures'
)

assert(
  'fixture is not inside supabase/migrations',
  !FIXTURE.startsWith('supabase/migrations/')
)

const migrationFiles = fs.readdirSync(path.join(ROOT, MIGRATIONS_DIR))
assert(
  'no bootstrap fixture leaked into supabase/migrations',
  !migrationFiles.some((name) => /staging_bootstrap|procurement_abc_staging/i.test(name))
)

const fixture = read(FIXTURE)
const fixtureLower = fixture.toLowerCase()

assert('fixture marked TEST-ONLY', fixture.includes('TEST-ONLY'))
assert(
  'fixture marked empty disposable Supabase project only',
  /empty disposable supabase project only/i.test(fixture)
)
assert(
  'fixture says it is not a production migration',
  /not a production migration/i.test(fixture)
)
assert(
  'fixture forbids copying into supabase/migrations',
  fixture.includes('Do not copy this file into supabase/migrations/')
)
assert(
  'fixture forbids applying to the live platform',
  /do not apply to the live shugyla platform/i.test(fixtureLower)
)
assert(
  'fixture forbids copying production data',
  /do not copy production data/i.test(fixtureLower)
)

console.log('Stage 2: refuse production ref and existing schema')

assert(
  'fixture aborts when a production project ref is detected',
  fixture.includes('production project ref detected')
)
assert(
  'fixture compares a detected project ref (v_ref = \'…\')',
  /v_ref\s*=\s*'[a-z0-9]{20}'/.test(fixture)
)
assert(
  'fixture reads optional app.supabase_project_ref GUC',
  fixture.includes("current_setting('app.supabase_project_ref', true)")
)
assert(
  'fixture reads JWT ref claim when present',
  fixture.includes("current_setting('request.jwt.claims', true)")
)
assert(
  'fixture refuses a non-empty public schema',
  /public schema is not empty/i.test(fixture)
)
assert(
  'fixture counts only non-snake public tables',
  fixture.includes("c.relname not like 'snake_%'")
)
assert(
  'fixture refuses existing procurement_snapshots',
  fixture.includes("'public.procurement_snapshots'")
)
assert(
  'fixture refuses existing academy_users',
  fixture.includes("'public.academy_users'")
)
assert(
  'fixture refuses existing generate RPC',
  fixture.includes("'generate_procurement_orders_from_snapshot'")
)
assert(
  'blocked-object abort uses errcode 42501',
  /existing real or partial Shugyla schema object[\s\S]*errcode = '42501'/.test(fixture)
)

console.log('Stage 3: snake leftover tables, no data copy, no destructive SQL')

assert(
  'fixture names snake_scores as must-not-drop',
  fixture.includes('snake_scores')
)
assert(
  'fixture names snake_players as must-not-drop',
  fixture.includes('snake_players')
)
assert(
  'fixture contains no DROP TABLE',
  !/\bdrop\s+table\b/i.test(stripSqlComments(fixture))
)
assert(
  'fixture contains no TRUNCATE',
  !/\btruncate\b/i.test(stripSqlComments(fixture))
)
assert(
  'fixture contains no DELETE FROM',
  !/\bdelete\s+from\b/i.test(stripSqlComments(fixture))
)
assert(
  'fixture contains no INSERT (no copied or seed rows)',
  !/\binsert\s+into\b/i.test(stripSqlComments(fixture))
)

console.log('Stage 4: SECURITY / RLS / fail-closed helpers')

assert(
  'permission helper is fail-closed (select false)',
  /current_user_has_permission[\s\S]*?as\s+\$\$\s*select false;\s*\$\$/i.test(fixture)
)
assert(
  'employee-active helper is fail-closed (select false)',
  /current_employee_is_active[\s\S]*?as\s+\$\$\s*select false;\s*\$\$/i.test(fixture)
)
assert(
  'permission helper is security definer',
  /current_user_has_permission[\s\S]*?security definer/.test(fixture)
)
assert(
  'permission helper pins search_path to empty',
  /current_user_has_permission[\s\S]*?set search_path = ''/.test(fixture)
)
assert(
  'helpers revoke execute from anon',
  /revoke all on function auth_private\.current_user_has_permission\(text\) from anon/.test(
    fixture
  ) &&
    /revoke all on function auth_private\.current_employee_is_active\(\) from anon/.test(
      fixture
    )
)
assert(
  'all five prerequisite tables enable RLS',
  [
    'platform_suppliers',
    'purchase_orders',
    'purchase_order_items',
    'receiving_documents',
    'receiving_items',
  ].every((table) =>
    new RegExp(`alter table public\\.${table} enable row level security`).test(fixture)
  )
)
assert('fixture has no USING (true) policies', !hasUsingTruePolicy(fixture))
assert(
  'fixture never GRANT … TO anon',
  grantTargetsAnon(fixture).length === 0,
  grantTargetsAnon(fixture).join(' | ')
)
assert(
  'fixture revokes table privileges from anon',
  /revoke all on table public\.platform_suppliers from anon/.test(fixture) &&
    /revoke all on table public\.purchase_orders from anon/.test(fixture)
)
assert(
  'fixture does not grant insert/update/delete to authenticated',
  !/\bgrant\s+(all|insert|update|delete)\b[^;]*\bto authenticated\b/i.test(
    stripSqlComments(fixture)
  )
)
assert(
  'fixture comments mark helpers as not production RBAC',
  /not production rbac/i.test(fixtureLower)
)

console.log('Stage 5: prerequisite columns the real migrations expect')

assert(
  'fixture creates platform_suppliers',
  /create table public\.platform_suppliers/.test(fixture)
)
assert(
  'platform_suppliers has umag_supplier_id bigint (Edge select)',
  /umag_supplier_id bigint/.test(fixture)
)
assert(
  'responsible_employee_id has no academy_users FK',
  /responsible_employee_id bigint,/.test(fixture) &&
    !/responsible_employee_id bigint references academy_users/.test(fixture)
)
assert(
  'purchase_orders has workflow_mode with simple/analytics check',
  /create table public\.purchase_orders[\s\S]*workflow_mode text not null default 'analytics'[\s\S]*check \(workflow_mode in \('simple', 'analytics'\)\)/.test(
    fixture
  )
)
assert(
  'purchase_order_items has unit text (repeat-analytics GRANT)',
  /create table public\.purchase_order_items[\s\S]*unit text not null default ''/.test(
    fixture
  )
)
assert(
  'receiving_documents has total_amount and workflow_mode',
  /create table public\.receiving_documents[\s\S]*total_amount numeric\(14, 2\) not null default 0[\s\S]*workflow_mode text not null default 'analytics'/.test(
    fixture
  )
)
assert(
  'receiving_documents has columns granted by repeat-analytics',
  [
    'supplier_invoice_numbers',
    'total_received_amount',
    'last_exported_by',
    'last_export_filename',
    'export_version',
  ].every((col) => fixture.includes(col))
)
assert(
  'receiving_items has columns granted by repeat-analytics',
  [
    'actual_purchase_price',
    'is_outside_order',
    'discrepancy_reason_code',
    'photo_urls',
    'photo_metadata',
  ].every((col) => fixture.includes(col))
)
const purchaseOrdersCreate = fixture.match(
  /create table public\.purchase_orders \(([\s\S]*?)\);/
)
assert(
  'fixture omits purchase_orders.number (generate RPC does not insert it)',
  Boolean(purchaseOrdersCreate) && !/\bnumber\b/.test(purchaseOrdersCreate[1])
)

console.log('Stage 6: real migration order (fixture → planning chain → ABC)')

assert(
  'expected real migration count is 10',
  REAL_MIGRATIONS.length === 10
)

for (const name of REAL_MIGRATIONS) {
  assert(
    `real migration present: ${name}`,
    fs.existsSync(path.join(ROOT, MIGRATIONS_DIR, name))
  )
}

const ordered = [...REAL_MIGRATIONS].sort()
assert(
  'real migration list is in timestamp order',
  REAL_MIGRATIONS.every((name, index) => name === ordered[index])
)
assert(
  'ABC analysis migration is last',
  REAL_MIGRATIONS[REAL_MIGRATIONS.length - 1] ===
    '20260815072607_procurement_abc_analysis.sql'
)
assert(
  'planning v1 migration is first real file',
  REAL_MIGRATIONS[0] === '20260809072915_procurement_planning_v1.sql'
)

const procurementInWindow = migrationFiles
  .filter((name) => {
    const match = name.match(/^(\d{14})_.*procurement.*\.sql$/)
    if (!match) return false
    return match[1] >= '20260809072915' && match[1] <= '20260815072607'
  })
  .sort()

assert(
  'every procurement-named migration in the window is in the apply list',
  procurementInWindow.every((name) => REAL_MIGRATIONS.includes(name)),
  `extra: ${procurementInWindow.filter((n) => !REAL_MIGRATIONS.includes(n)).join(', ')}`
)
assert(
  'apply list includes every procurement-named migration in the window',
  REAL_MIGRATIONS.every((name) => procurementInWindow.includes(name)),
  `missing: ${REAL_MIGRATIONS.filter((n) => !procurementInWindow.includes(n)).join(', ')}`
)

for (const name of REAL_MIGRATIONS) {
  assert(
    `fixture documents real migration ${name}`,
    fixture.includes(`supabase/migrations/${name}`)
  )
}
assert(
  'fixture documents itself as step 0 before real migrations',
  /0\.\s+supabase\/tests\/fixtures\/procurement_abc_staging_bootstrap\.sql/.test(
    fixture
  )
)
assert(
  'receiving UMAG v1 is documented as skipped',
  fixture.includes('20260813231600_receiving_umag_v1_foundation.sql') &&
    /skipped on purpose/i.test(fixture)
)

const pkg = read(PACKAGE_JSON)
assert(
  'package.json exposes verify:procurement-abc-staging-bootstrap',
  pkg.includes('"verify:procurement-abc-staging-bootstrap"')
)

const doc = read(ABC_DOC)
assert(
  'ABC doc records fixture → real migrations apply order',
  doc.includes('procurement_abc_staging_bootstrap.sql') &&
    doc.includes('20260809072915_procurement_planning_v1.sql') &&
    doc.includes('20260815072607_procurement_abc_analysis.sql')
)

const self = read('scripts/verify-procurement-abc-staging-bootstrap.mjs')
assert(
  'this verifier does not embed a 20-char project ref literal',
  !/'[a-z0-9]{20}'/.test(self)
)
assert(
  'fixture and verifier do not contain JWT-shaped secrets or access tokens',
  !/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\./.test(fixture) &&
    !/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\./.test(self) &&
    !/SUPABASE_ACCESS_TOKEN\s*=/.test(fixture) &&
    !/SUPABASE_ACCESS_TOKEN\s*=/.test(self)
)

assert(
  `check count is ${EXPECTED_CHECKS}`,
  checks + 1 === EXPECTED_CHECKS,
  `got ${checks + 1}`
)

console.log(`\nAll ${EXPECTED_CHECKS} staging-bootstrap checks passed.`)
