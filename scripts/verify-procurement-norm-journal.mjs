#!/usr/bin/env node
/**
 * Verification: stock-norm changes are journaled by a trigger on procurement_norm_rules.
 * Spec: docs/procurement/norm-change-journal.md
 *
 * Usage:
 *   npm run verify:procurement-norm-journal
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
let checks = 0
function assert(name, condition) {
  if (!condition) throw new Error(name)
  checks += 1
  console.log(`  ✓ ${name}`)
}

const sql = fs
  .readFileSync(path.join(ROOT, 'supabase/migrations/20261017190000_procurement_norm_change_journal.sql'), 'utf8')
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')

assert('journal table is created', /create table public\.procurement_norm_changes/.test(sql))
assert('journal stores old and new norm, author and time',
  ['old_norm_days', 'new_norm_days', 'changed_by_name', 'changed_at'].every((c) => sql.includes(c)))
assert('RLS is enabled', /alter table public\.procurement_norm_changes enable row level security/.test(sql))
assert('client roles have no access', /revoke all on public\.procurement_norm_changes from anon, authenticated/.test(sql))
assert('trigger fires on insert, update and delete',
  /after insert or update or delete on public\.procurement_norm_rules/.test(sql))
assert('trigger function is security definer with empty search_path',
  /security definer\s+set search_path = ''/.test(sql))
assert('trigger function is not callable by clients',
  /revoke all on function public\.procurement_norm_rules_journal\(\) from public, anon, authenticated/.test(sql))
assert('unchanged norm_days is not journaled', /new\.norm_days is distinct from old\.norm_days/.test(sql))

console.log(`\nOK — ${checks} checks`)
