#!/usr/bin/env node
/**
 * Verification — stage 24 package: norms and ABC removed from the Edge functions and the migration shape.
 *
 * Usage:
 *   npm run verify:procurement-remove-norms-abc
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let checks = 0
const ok = (name) => {
  checks += 1
  console.log(`  ✓ ${name}`)
}

const edge = read('supabase/functions/umag-procurement/index.ts')
assert.doesNotMatch(edge, /procurement_norm_rules|norm_days|abc_|set_norm|resolveNormDays|assignSnapshotAbcClasses/)
assert.match(edge, /from '\.\/salesAggregation\.js'/)
assert.ok(!fs.existsSync(path.join(ROOT, 'supabase/functions/umag-procurement/abcClassification.js')))
const sales = read('supabase/functions/umag-procurement/salesAggregation.js')
assert.doesNotMatch(sales, /classifyAbcAxis|assignSnapshotAbcClasses|ABC_SHARE/)
assert.match(sales, /export function shouldIncludeSnapshotBarcode/)
ok('umag-procurement: no norm rules, no ABC, no set_norm; sales helpers kept in salesAggregation.js')

const archive = read('supabase/functions/procurement-archive/index.ts')
assert.doesNotMatch(archive, /'norm_days'|'reserve_status'/)
assert.match(archive, /'target_days'/)
assert.match(archive, /'plan_status'/)
ok('procurement-archive exports target_days / plan_status instead of the dropped columns')

const sql = read('supabase/migrations/20261026100000_remove_norms_and_abc.sql')
assert.match(sql, /^begin;/m)
assert.match(sql, /^commit;/m)
const code = sql.replace(/^--.*$/gm, '')
assert.doesNotMatch(code, /\bcascade\b/i)
assert.doesNotMatch(code, /if exists/i)
for (const col of ['reserve_status', 'norm_days', 'abc_qty', 'abc_revenue', 'abc_profit']) {
  assert.match(sql, new RegExp(`drop column ${col};`))
}
assert.match(sql, /drop table public\.procurement_norm_changes;\ndrop table public\.procurement_norm_rules;/)
assert.match(sql, /count\(\*\) filter \(where i\.plan_status = 'under_norm'\)/)
const guard = sql.slice(sql.indexOf('procurement_snapshot_items_guard_update'), sql.indexOf('compute_procurement_snapshot_rollup'))
assert.doesNotMatch(guard, /norm_days|abc_/)
assert.match(sql, /app\.items_guard_skip/)
assert.match(sql, /drop trigger trg_procurement_snapshot_ready_plan/)
ok('migration: one transaction, no CASCADE / IF EXISTS, the guard and the rollup no longer mention the dropped columns')

const readme = read('docs/db/stage-24-remove-norms-and-abc/README.md')
assert.match(readme, /Задеплоить функции/)
ok('the package documents the order: deploy the functions first, then the migration')

console.log(`\nverify:procurement-remove-norms-abc — ${checks} checks passed`)
