#!/usr/bin/env node
/**
 * Static checks for lazy UMAG operation product-line details.
 *
 * Usage:
 *   npm run verify:umag-operation-details
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
let passed = 0

function ok(name) {
  passed += 1
  console.log(`  ✓ ${name}`)
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function main() {
  console.log('=== UMAG operation details verification ===\n')

  const migration = read('supabase/migrations/20260728060000_umag_operation_items.sql')
  assert.match(migration, /create table if not exists public\.umag_supply_items/)
  assert.match(migration, /create table if not exists public\.umag_supply_return_items/)
  assert.match(migration, /items_synced_at/)
  assert.match(migration, /items_source_updated_at/)
  assert.match(migration, /external_line_key/)
  assert.match(migration, /revoke all on table public\.umag_supply_items from anon/)
  assert.match(migration, /umag\.settlements\.view/)
  assert.doesNotMatch(migration, /\borganization_id\b\s/)
  ok('migration creates item caches + RLS')

  const edge = read('supabase/functions/umag-operation-details/index.ts')
  assert.match(edge, /supplies\/v2\/\$\{operationId\}\/products/)
  assert.match(edge, /supply-returns\/get\/\$\{operationId\}/)
  assert.match(edge, /umag\.settlements\.view/)
  assert.match(edge, /forceRefresh/)
  assert.match(edge, /cache: 'hit'/)
  assert.match(edge, /umagFetchAuthed/)
  ok('edge function lazy-fetches details with cache')

  const sync = read('supabase/functions/umag-sync/index.ts')
  assert.doesNotMatch(sync, /supply-returns\/get\//)
  assert.doesNotMatch(sync, /supplies\/v2\/.*\/products/)
  ok('bulk umag-sync still avoids N+1 product endpoints')

  const service = read('src/services/umagOperationDetailsService.js')
  assert.match(service, /umag-operation-details/)
  assert.match(service, /readSupplyCache/)
  assert.match(service, /forceRefresh/)
  ok('frontend service prefers local cache before edge')

  const panel = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')
  assert.match(panel, /OperationDetailSheet/)
  assert.match(panel, /setSelectedOperation/)
  assert.match(panel, /umag-settlements__op-badge--button/)
  assert.doesNotMatch(panel, /ReturnDetailModal/)
  ok('settlements history opens shared detail sheet')

  const sheet = read('src/components/suppliers/settlements/OperationDetailSheet.jsx')
  assert.match(sheet, /Обновить детали/)
  assert.match(sheet, /Поиск по товарам или штрихкоду/)
  assert.match(sheet, /Сумма строк отличается/)
  ok('detail sheet has refresh, search, and sum warning')

  console.log(`\n${passed} checks passed`)
}

main()
