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
