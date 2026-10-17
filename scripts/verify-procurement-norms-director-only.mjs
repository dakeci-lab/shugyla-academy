#!/usr/bin/env node
/**
 * Verification: stock norms can be changed only with `procurement.norms.manage`, which only the director holds.
 * Spec: docs/procurement/norms-director-only.md
 *
 * Usage:
 *   npm run verify:procurement-norms-director-only
 */

import fs from 'fs'
import path from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

let checks = 0
function assert(name, condition) {
  if (!condition) throw new Error(name)
  checks += 1
  console.log(`  ✓ ${name}`)
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const code = 'procurement.norms.manage'

const catalog = await import(pathToFileURL(path.join(ROOT, 'src/config/permissionCatalog.js')).href)

console.log('catalog and default grants')
assert('permission code is defined', catalog.PERMISSION_CODES.PROCUREMENT_NORMS_MANAGE === code)
assert('permission is listed in the catalog (roles UI)', catalog.PERMISSION_CATALOG.some((p) => p.code === code))
assert('director (admin) gets it by default', catalog.RBAC_DEFAULT_ROLE_PERMISSIONS.admin.includes(code))
for (const role of ['buyer', 'receiver']) {
  assert(`${role} does not get it`, !catalog.RBAC_DEFAULT_ROLE_PERMISSIONS[role].includes(code))
}

console.log('\nmigration (prod grant)')
const migration = read('supabase/migrations/20261017180000_procurement_norms_manage_permission.sql')
const sql = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
assert('creates the permission', sql.includes("'procurement.norms.manage'") && /insert into public\.permissions/.test(sql))
assert("grants it only to role code 'admin'", /where r\.code = 'admin'/.test(sql) && !/'buyer'|'receiver'/.test(sql))

console.log('\nserver: set_norm requires the permission')
const edge = read('supabase/functions/umag-procurement/index.ts')
assert('constant is defined', /const PERMISSION_NORMS_MANAGE = 'procurement\.norms\.manage'/.test(edge))
const setNorm = edge.slice(edge.indexOf('async function handleSetNorm('), edge.indexOf('Deno.serve('))
assert('handleSetNorm checks the norms permission', setNorm.includes('authz.permissions[PERMISSION_NORMS_MANAGE] !== true'))
assert('handleSetNorm no longer accepts plain procurement.edit', !setNorm.includes('PERMISSION_EDIT'))
assert('authorization asks for the norms permission for set_norm',
  /action === 'set_norm'\s*\?\s*\[PERMISSION_NORMS_MANAGE\]/.test(edge))
const syncHandler = edge.slice(edge.indexOf('async function handleSync('), edge.indexOf('async function handleGenerate('))
assert('sync still needs procurement.edit (unchanged)', syncHandler.includes('PERMISSION_EDIT'))

console.log('\nclient: the norms screen is read-only without the permission')
const view = read('src/components/procurement/ProcurementNormsView.jsx')
assert('editing is gated by the norms permission', /canEditNorms = can\(user, PERMISSION_CODES\.PROCUREMENT_NORMS_MANAGE\)/.test(view))
assert('procurement.edit does not unlock editing', !/canEditNorms = can\(user, PERMISSION_CODES\.PROCUREMENT_EDIT\)/.test(view))
assert('lock message says only the director', view.includes('Нормы может менять только директор'))

console.log('\nno other path writes norms')
const grepWriters = ['src', 'supabase/functions'].flatMap((dir) => {
  const out = []
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`
      if (e.isDirectory()) walk(p)
      else if (/\.(jsx?|tsx?)$/.test(e.name) && /set_procurement_norm_rule_for_snapshot|from\('procurement_norm_rules'\)\s*\n?\s*\.(insert|update|upsert|delete)/.test(read(p))) out.push(p)
    }
  }
  walk(dir)
  return out
})
assert('only umag-procurement calls the norm-writing RPC / table', grepWriters.length === 1 && grepWriters[0] === 'supabase/functions/umag-procurement/index.ts')

console.log(`\nOK — ${checks} checks`)
