#!/usr/bin/env node
/**
 * Verification — umag-sync speed (2026-10-22 baseline: ~50 s per sync, ~93 sequential REST round
 * trips of ~0.5–0.8 s each against ~15 ms of real query time):
 *  - chunked reads/writes run in parallel (mapConcurrent), results/errors unchanged
 *  - supplies are written only when new / soft-deleted / changed (counters still describe the snapshot)
 *
 * The Edge Function is Deno/TypeScript; the pieces under test are extracted from the real source
 * and executed here (types stripped with node:module.stripTypeScriptTypes).
 *
 * Usage:
 *   npm run verify:umag-sync-speed
 */

import fs from 'fs'
import path from 'path'
import assert from 'node:assert/strict'
import { stripTypeScriptTypes } from 'node:module'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

let checks = 0
const ok = (name) => {
  checks += 1
  console.log(`  ✓ ${name}`)
}

function loadTs(source, exportsList) {
  const js = stripTypeScriptTypes(source).replace(/^export\s+/gm, '')
  return new Function(`${js}\nreturn { ${exportsList.join(', ')} }`)()
}

// --- mapConcurrent ------------------------------------------------------------------------
const { mapConcurrent } = loadTs(read('supabase/functions/_shared/concurrency.ts'), ['mapConcurrent'])

let inFlight = 0
let maxInFlight = 0
const out = await mapConcurrent([5, 1, 4, 2, 3, 6, 7, 8], 3, async (n) => {
  inFlight += 1
  maxInFlight = Math.max(maxInFlight, inFlight)
  await new Promise((r) => setTimeout(r, n * 3))
  inFlight -= 1
  return n * 10
})
assert.deepEqual(out, [50, 10, 40, 20, 30, 60, 70, 80])
ok('mapConcurrent returns results in input order')
assert.equal(maxInFlight, 3)
ok('mapConcurrent never exceeds the concurrency limit (and does use it)')
assert.deepEqual(await mapConcurrent([], 5, async () => 1), [])
ok('mapConcurrent handles an empty list')
await assert.rejects(mapConcurrent([1, 2], 2, async (n) => { if (n === 2) throw new Error('boom'); return n }), /boom/)
ok('mapConcurrent propagates a failing call')

// --- supplyRowChanged ---------------------------------------------------------------------
const edge = read('supabase/functions/umag-sync/index.ts')
const fnSrc = edge.slice(edge.indexOf('function supplyRowChanged('), edge.indexOf('async function upsertSupplies('))
const { supplyRowChanged } = loadTs(fnSrc, ['supplyRowChanged'])

const stored = {
  is_source_deleted: false,
  umag_edit_time: '2026-10-20T10:00:00+00:00',
  amount: '1000.0000',
  payment_amount: 1000,
  payment_refund_amount: 0,
  debt: '0',
  umag_supplier_id: 77,
  platform_supplier_id: 'p1',
  supplier_id: 's1',
  comment: null,
  account: 'Каспи',
}
const same = {
  umag_edit_time: '2026-10-20T15:00:00+05:00',
  amount: 1000,
  payment_amount: 1000,
  payment_refund_amount: 0,
  debt: 0,
  umag_supplier_id: 77,
  platform_supplier_id: 'p1',
  supplier_id: 's1',
  comment: null,
  account: 'Каспи',
}
assert.equal(supplyRowChanged(same, stored), false)
ok('identical document (numeric strings, +05:00 vs UTC time) is NOT rewritten')
assert.equal(supplyRowChanged(same, undefined), true)
ok('new document is written')
assert.equal(supplyRowChanged(same, { ...stored, is_source_deleted: true }), true)
ok('soft-deleted document is rewritten (reactivation)')
for (const [field, value] of [
  ['umag_edit_time', '2026-10-21T15:00:00+05:00'],
  ['amount', 1000.5],
  ['payment_amount', 900],
  ['debt', 100],
  ['platform_supplier_id', 'p2'],
  ['comment', 'новый'],
  ['account', 'Наличные'],
]) {
  assert.equal(supplyRowChanged({ ...same, [field]: value }, stored), true, field)
}
ok('a change in editTime / amounts / debt / supplier link / comment / account triggers a write')

// --- wiring -------------------------------------------------------------------------------
assert.match(edge, /import \{ mapConcurrent \} from '\.\.\/_shared\/concurrency\.ts'/)
assert.match(edge, /await mapConcurrent<[\s\S]{0,200}>\(chunks, DB_CONCURRENCY,/)
ok('fetchRowsByIdsInChunks reads chunks in parallel')
assert.match(edge, /const rowsToWrite = rows\.filter\(\(row\) => supplyRowChanged\(/)
assert.match(edge, /for \(const row of rows\) \{\s*\n\s*const umagId = Number\(row\.umag_supply_id\)\s*\n\s*if \(existing\.has\(umagId\)\)/)
ok('only changed supplies are written, counters still computed over the whole snapshot')
assert.match(edge, /await mapConcurrent\(chunks, DB_CONCURRENCY, async \(chunk, chunkIndex\) =>/)
assert.match(edge, /await mapConcurrent\(obligationChunks, DB_CONCURRENCY,/)
ok('supply and obligation chunk upserts run in parallel with the same per-row failure isolation')
const shared = read('supabase/functions/_shared/umagDocumentPayments.ts')
assert.match(shared, /mapConcurrent\(eventChunks, 5,/)
ok('ledger event upserts run in parallel')
assert.match(edge, /umag_supplies_upsert_failed/)
assert.match(edge, /spo_upsert_row_failed/)
ok('failure logging and row-by-row isolation preserved')

console.log(`\nverify:umag-sync-speed — ${checks} checks passed`)
