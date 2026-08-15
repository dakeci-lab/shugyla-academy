#!/usr/bin/env node
/**
 * Static verification for platform_suppliers RLS hardening.
 *
 * Confirms:
 *   1. timestamped migration after ABC,
 *   2. legacy open policies dropped, anon/public revoked,
 *   3. authenticated DML + permission RLS, service_role ALL,
 *   4. no USING (true), no anon grants,
 *   5. Edge still reads/writes via service_role,
 *   6. app supplier CRUD uses the session supabase client, not an anonymous workflow.
 *
 * Does not talk to remote Supabase. Does not embed secrets.
 *
 * Usage:
 *   npm run verify:secure-platform-suppliers-rls
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const MIGRATION = 'supabase/migrations/20260815095402_secure_platform_suppliers_rls.sql'
const ABC_MIGRATION = 'supabase/migrations/20260815072607_procurement_abc_analysis.sql'
const DOC = 'docs/procurement/secure-platform-suppliers-rls.md'
const ABC_DOC = 'docs/procurement/abc-analysis.md'
const PACKAGE_JSON = 'package.json'
const ADAPTER = 'src/services/suppliersSupabaseAdapter.js'
const CLIENT = 'src/lib/supabaseClient.js'
const PROCUREMENT_EDGE = 'supabase/functions/umag-procurement/index.ts'
const SYNC_EDGE = 'supabase/functions/umag-sync/index.ts'
const AUTH_SHARED = 'supabase/functions/_shared/employeeAuthorization.ts'
const CORPORATE = 'src/pages/CorporateHome.jsx'
const APPLY = 'src/pages/Apply.jsx'
const APPLY_HUB = 'src/pages/ApplyHub.jsx'
const APP = 'src/App.jsx'
const PROTECTED = 'src/components/ProtectedRoute.jsx'

const LEGACY_POLICY_NAMES = [
  'Allow anon read write platform_suppliers',
  'Allow anon read write suppliers',
  'Allow read suppliers',
  'Allow insert suppliers',
  'Allow update suppliers',
  'Allow delete suppliers',
  'Allow read platform_suppliers',
  'Allow insert platform_suppliers',
  'Allow update platform_suppliers',
  'Allow delete platform_suppliers',
]

const EXPECTED_CHECKS = 48

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

function grantToAnon(sql) {
  const body = stripSqlComments(sql)
  const hits = []
  const re = /\bgrant\b[\s\S]*?;/gi
  let match
  while ((match = re.exec(body))) {
    const stmt = match[0].replace(/\s+/g, ' ')
    if (/\bto\s+anon\b/i.test(stmt)) hits.push(stmt.trim())
  }
  return hits
}

console.log('Stage 1: Migration filename and deploy order')

assert('hardening migration exists', fs.existsSync(path.join(ROOT, MIGRATION)))
assert('ABC migration still exists', fs.existsSync(path.join(ROOT, ABC_MIGRATION)))

const hardeningName = path.basename(MIGRATION)
const abcName = path.basename(ABC_MIGRATION)
assert(
  'hardening filename is timestamped after ABC',
  hardeningName.startsWith('20260815095402') && hardeningName > abcName,
  hardeningName
)
assert(
  'filename is secure_platform_suppliers_rls',
  hardeningName === '20260815095402_secure_platform_suppliers_rls.sql'
)

const sql = read(MIGRATION)
const body = stripSqlComments(sql)

console.log('Stage 2: Drop legacy policies, revoke anon, grants')

for (const name of LEGACY_POLICY_NAMES) {
  assert(
    `drops legacy policy ${name}`,
    sql.includes(`drop policy if exists "${name}" on public.platform_suppliers`)
  )
}

assert(
  'drops leftover policies via pg_policies loop on platform_suppliers only',
  sql.includes('from pg_policies as p') &&
    sql.includes("p.tablename = 'platform_suppliers'") &&
    sql.includes('drop policy if exists %I on public.platform_suppliers')
)
assert(
  'loop does not drop policies on other tables',
  !/drop policy if exists %I on public\.(?!platform_suppliers)/.test(sql)
)
assert('enables RLS', /alter table public\.platform_suppliers enable row level security/.test(sql))
assert(
  'revokes all from public and anon',
  /revoke all on table public\.platform_suppliers from public/.test(sql) &&
    /revoke all on table public\.platform_suppliers from anon/.test(sql)
)
assert(
  'authenticated grant is SELECT/INSERT/UPDATE/DELETE only, not ALL',
  /grant select, insert, update, delete on table public\.platform_suppliers to authenticated/.test(
    sql
  ) && !/grant all on table public\.platform_suppliers to authenticated/.test(sql)
)
assert(
  'service_role keeps ALL',
  /grant all on table public\.platform_suppliers to service_role/.test(sql)
)
assert('never GRANT … TO anon', grantToAnon(sql).length === 0, grantToAnon(sql).join(' | '))
assert('no USING (true)', !/using\s*\(\s*true\s*\)/i.test(body))
assert('no WITH CHECK (true)', !/with check\s*\(\s*true\s*\)/i.test(body))

console.log('Stage 3: Authenticated permission policies')

assert(
  'SELECT policy is TO authenticated',
  /create policy platform_suppliers_select_permission[\s\S]*for select[\s\S]*to authenticated/.test(
    sql
  )
)
assert(
  'SELECT allows view/create/edit/delete',
  sql.includes("auth_private.current_user_has_permission('suppliers.view')") &&
    sql.includes("auth_private.current_user_has_permission('suppliers.create')") &&
    sql.includes("auth_private.current_user_has_permission('suppliers.edit')") &&
    sql.includes("auth_private.current_user_has_permission('suppliers.delete')")
)
assert(
  'INSERT is suppliers.create only',
  /create policy platform_suppliers_insert_create[\s\S]*for insert[\s\S]*to authenticated[\s\S]*with check \(auth_private\.current_user_has_permission\('suppliers\.create'\)\)/.test(
    sql
  )
)
assert(
  'UPDATE is suppliers.edit only',
  /create policy platform_suppliers_update_edit[\s\S]*for update[\s\S]*to authenticated[\s\S]*using \(auth_private\.current_user_has_permission\('suppliers\.edit'\)\)[\s\S]*with check \(auth_private\.current_user_has_permission\('suppliers\.edit'\)\)/.test(
    sql
  )
)
assert(
  'DELETE is suppliers.delete only',
  /create policy platform_suppliers_delete_permission[\s\S]*for delete[\s\S]*to authenticated[\s\S]*using \(auth_private\.current_user_has_permission\('suppliers\.delete'\)\)/.test(
    sql
  )
)
assert(
  'permission helper is fully qualified auth_private.current_user_has_permission',
  (sql.match(/auth_private\.current_user_has_permission\(/g) || []).length >= 7
)
assert(
  'policies are not TO public or TO anon',
  !/create policy[\s\S]{0,200}to public/.test(sql) &&
    !/create policy[\s\S]{0,200}to anon/.test(sql)
)

console.log('Stage 4: Edge service_role unchanged; no anonymous app CRUD')

const procurementEdge = read(PROCUREMENT_EDGE)
const syncEdge = read(SYNC_EDGE)
const authShared = read(AUTH_SHARED)
const adapter = read(ADAPTER)
const client = read(CLIENT)
const corporate = read(CORPORATE)
const applyPage = read(APPLY)
const applyHub = read(APPLY_HUB)
const app = read(APP)
const protectedRoute = read(PROTECTED)

assert(
  'employeeAuthorization builds serviceClient from SERVICE_ROLE_KEY',
  authShared.includes("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')") &&
    authShared.includes('const serviceClient = createClient(supabaseUrl, serviceRoleKey')
)
assert(
  'umag-procurement reads platform_suppliers via serviceClient',
  /authz\.serviceClient\s*\n\s*\.from\('platform_suppliers'\)/.test(procurementEdge) ||
    procurementEdge.includes("authz.serviceClient") &&
      /serviceClient[\s\S]{0,200}\.from\('platform_suppliers'\)/.test(procurementEdge)
)
assert(
  'umag-sync writes platform_suppliers via serviceClient',
  syncEdge.includes('.from(\'platform_suppliers\')') &&
    syncEdge.includes('authz.serviceClient') &&
    !/userClient[\s\S]{0,80}\.from\('platform_suppliers'\)/.test(syncEdge)
)
assert(
  'adapter uses the shared session supabase client',
  adapter.includes("import { supabase } from '../lib/supabaseClient'") &&
    adapter.includes(".from('platform_suppliers')")
)
assert(
  'adapter does not construct its own unauthenticated client',
  !adapter.includes('createClient(')
)
assert(
  'browser client is the standard anon-key session client',
  client.includes('createClient(supabaseUrl, supabaseAnonKey)') &&
    !client.includes('persistSession: false')
)
assert(
  'corporate home does not touch platform_suppliers',
  !corporate.includes('platform_suppliers') && !corporate.includes('suppliersSupabaseAdapter')
)
assert(
  'public apply does not touch platform_suppliers',
  !applyPage.includes('platform_suppliers') && !applyHub.includes('platform_suppliers')
)
assert(
  'platform /platform shell is behind ProtectedRoute',
  /path="\/platform"[\s\S]{0,300}<ProtectedRoute>/.test(app)
)
assert(
  'suppliers routes use PlatformRoute SUPPLIERS',
  /path="suppliers"[\s\S]{0,160}PlatformRoute routeKey=\{ROUTE_KEYS.SUPPLIERS\}/.test(app)
)
assert(
  'ProtectedRoute requires a signed-in platform session',
  protectedRoute.includes('supabaseAuthenticated') &&
    protectedRoute.includes('sessionValid')
)

console.log('Stage 5: Docs and package script')

const doc = read(DOC)
const abcDoc = read(ABC_DOC)
const pkg = read(PACKAGE_JSON)

assert(
  'package.json exposes verify:secure-platform-suppliers-rls',
  pkg.includes('"verify:secure-platform-suppliers-rls"')
)
assert(
  'hardening doc records the migration filename',
  doc.includes('20260815095402_secure_platform_suppliers_rls.sql')
)
assert(
  'hardening doc deploy-order: supplier hardening, ABC if fresh, then Edge',
  /supplier hardening/i.test(doc) &&
    doc.includes('20260815072607_procurement_abc_analysis.sql') &&
    doc.includes('umag-procurement')
)
assert(
  'ABC doc lists supplier hardening after ABC on a fresh environment',
  abcDoc.includes('20260815095402_secure_platform_suppliers_rls.sql') &&
    abcDoc.includes('20260815072607_procurement_abc_analysis.sql')
)
assert(
  'staging fixture documents hardening after ABC',
  read('supabase/tests/fixtures/procurement_abc_staging_bootstrap.sql').includes(
    '20260815095402_secure_platform_suppliers_rls.sql'
  )
)
assert(
  'docs forbid production apply from this PR',
  /не трогаем|do not deploy production|не deploy/i.test(doc) ||
    doc.includes('Прод / remote Supabase не трогаем')
)

assert(
  `check count is ${EXPECTED_CHECKS}`,
  checks + 1 === EXPECTED_CHECKS,
  `got ${checks + 1}`
)

console.log(`\nAll ${EXPECTED_CHECKS} platform_suppliers RLS checks passed.`)
