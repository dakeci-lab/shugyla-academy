#!/usr/bin/env node
/**
 * Static checks for the umag_sync_runs.entity constraint extension.
 *
 * Usage:
 *   npm run verify:umag-sync-runs-entity
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const MIGRATION = 'supabase/migrations/20260819103000_umag_sync_runs_obligations_entity.sql'
const ORIGINAL = 'supabase/migrations/20260726220000_umag_settlements_sync.sql'
let passed = 0

function ok(name) {
  passed += 1
  console.log(`  ✓ ${name}`)
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function main() {
  console.log('=== UMAG sync runs entity verification ===\n')

  const migration = read(MIGRATION)

  assert.match(migration, /alter table public\.umag_sync_runs\s+drop constraint if exists umag_sync_runs_entity_check/)
  assert.match(migration, /add constraint umag_sync_runs_entity_check/)
  ok('constraint is replaced, not duplicated')

  for (const value of ['suppliers', 'supplies', 'all', 'obligations']) {
    assert.ok(
      new RegExp(`'${value}'`).test(migration),
      `entity value '${value}' must stay allowed`
    )
  }
  ok('all four entity values allowed (no regression for existing runs)')

  assert.match(migration, /select pg_advisory_xact_lock\(202608191030\)/)
  ok('advisory lock guards concurrent apply')

  // Constraint-only migration: no data movement, no permission drift.
  assert.doesNotMatch(migration, /\binsert\s+into\b/i)
  assert.doesNotMatch(migration, /\bupdate\s+public\./i)
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i)
  assert.doesNotMatch(migration, /\bgrant\b/i)
  assert.doesNotMatch(migration, /\brevoke\b/i)
  assert.doesNotMatch(migration, /create policy/i)
  assert.doesNotMatch(migration, /drop table/i)
  ok('no data, grant, or policy changes')

  // The original table definition must remain the narrower list, proving this
  // migration is the only place that widens it.
  const original = read(ORIGINAL)
  assert.match(original, /constraint umag_sync_runs_entity_check check \(\s*entity in \('suppliers', 'supplies', 'all'\)/)
  ok('original migration left untouched')

  const originalStamp = Number(path.basename(ORIGINAL).slice(0, 14))
  const newStamp = Number(path.basename(MIGRATION).slice(0, 14))
  assert.ok(newStamp > originalStamp, 'new migration must sort after the table definition')
  ok('migration ordering is correct')

  console.log(`\n${passed} checks passed`)
}

main()
