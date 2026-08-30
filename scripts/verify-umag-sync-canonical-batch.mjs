#!/usr/bin/env node
/**
 * Verification — reconcileCanonicalSuppliers() N+1 fix in umag-sync.
 *
 * Measured problem (real umag_sync_runs history, not a guess): every
 * entity='all' sync (the ↻ button in «Расчёты») took 124-138s for only
 * ~740 supplies + 23 returns — vs. the unrelated sales_facts sync processing
 * 6000-7000 rows in 30-50s. ~25-30x worse per-record cost. Root cause traced
 * to two sequential-per-row write loops; this PR fixes the larger one:
 * reconcileCanonicalSuppliers() previously did one awaited UPDATE or INSERT
 * per UMAG supplier (hundreds of round trips on every single click, for a
 * catalog that rarely changes) instead of batching.
 *
 * The real algorithm lives in supabase/functions/umag-sync/index.ts, a Deno
 * Edge Function — not importable into this Node harness (no Deno globals
 * here, Deno.serve runs at module scope, and the function isn't exported).
 * Same limitation as scripts/verify-supplier-finance-sync-scope.mjs, which
 * documents the same constraint. Verified here via:
 *   1. Structural checks pinning the exact fix shape in the real source.
 *   2. `deno check` / `deno lint` on the real file, run separately (see
 *      docs/performance/umag-sync-canonical-batch.md) — zero new errors
 *      versus the pre-existing baseline (both commands were also run
 *      against main before this change, for comparison).
 *
 * Usage:
 *   npm run verify:umag-sync-canonical-batch
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const UMAG_SYNC = 'supabase/functions/umag-sync/index.ts'

let checks = 0
function ok(name) {
  checks += 1
  console.log(`  ✓ ${name}`)
}
function read(relPath) {
  const full = path.join(ROOT, relPath)
  if (!fs.existsSync(full)) throw new Error(`file not found: ${relPath}`)
  return fs.readFileSync(full, 'utf8')
}

function fnBody(src, startMarker) {
  const start = src.indexOf(startMarker)
  assert.ok(start > -1, `marker not found: ${startMarker}`)
  const end = src.indexOf('\nasync function ', start + startMarker.length)
  return src.slice(start, end > -1 ? end : undefined)
}

function main() {
  console.log('=== umag-sync reconcileCanonicalSuppliers batch verification ===\n')

  const src = read(UMAG_SYNC)
  const body = fnBody(src, 'async function reconcileCanonicalSuppliers(')

  // --- Case 1: the per-row umagRows loop no longer awaits a DB call --------
  const decisionLoop = body.slice(
    body.indexOf('for (const umag of umagRows || []) {'),
    body.indexOf('\n  // Batched UPDATE')
  )
  assert.doesNotMatch(decisionLoop, /await serviceClient/)
  assert.match(decisionLoop, /updateDecisions\.push/)
  assert.match(decisionLoop, /insertDecisions\.push/)
  ok('Case 1: the per-supplier decision loop is pure (no await serviceClient inside it) — decisions are collected, not written, one row at a time')

  // --- Case 2: updates are one batched upsert-on-id call per chunk ---------
  assert.match(body, /for \(let i = 0; i < updateDecisions\.length; i \+= CANONICAL_CHUNK_SIZE\)/)
  assert.match(body, /\.upsert\(\s*\n\s*chunk\.map\(\(d\) => \(\{ id: d\.platformId, \.\.\.d\.umagOwned \}\)\),\s*\n\s*\{ onConflict: 'id' \}/)
  ok('Case 2: updates batch via upsert(onConflict:"id") per CANONICAL_CHUNK_SIZE chunk instead of one UPDATE per supplier')

  // --- Case 3: inserts are one batched call per chunk, correlated by
  // umag_supplier_id (not insert order) -------------------------------------
  assert.match(body, /for \(let i = 0; i < insertDecisions\.length; i \+= CANONICAL_CHUNK_SIZE\)/)
  assert.match(body, /\.insert\(chunk\.map\(\(d\) => d\.insertRow\)\)/)
  assert.match(body, /\.select\('id, umag_supplier_id'\)/)
  assert.match(body, /createdIdByUmagId\.set\(Number\(row\.umag_supplier_id\), row\.id\)/)
  ok('Case 3: inserts batch per chunk and map results back by umag_supplier_id — correct regardless of row order in the response')

  // --- Case 4: same chunk size already used by this function's existing
  // deactivation batching — consistent, not a second magic number ----------
  assert.match(body, /const CANONICAL_CHUNK_SIZE = 100/)
  assert.match(body, /const chunkSize = 100/) // pre-existing deactivation loop, untouched
  ok('Case 4: new batching reuses the same chunk size (100) as the pre-existing deactivation loop in this function')

  // --- Case 5: mappingErrors accounting still triggers the same overall
  // failure semantics — any failure still aborts the sync (mappingErrors>0),
  // just accounted per-chunk instead of per-row now ---------------------
  assert.match(body, /stats\.mappingErrors \+= chunk\.length/)
  assert.match(src, /if \(stats\.mappingErrors > 0\) \{\s*\n\s*return umagErrorResponse\(\s*\n\s*'CANONICAL_SUPPLIER_RECONCILE_FAILED'/)
  ok('Case 5: a failed chunk still fails the whole reconcile step (mappingErrors>0), same overall contract as the old per-row failure path')

  // --- Case 6: dedup-candidate detection for newly-created suppliers is
  // unchanged in substance, just runs after the batch insert returns -------
  assert.match(body, /match_reason: 'exact_name'/)
  assert.match(body, /nameCountsPlatform\.get\(d\.nameKey\) === 1 &&\s*\n\s*nameCountsUmag\.get\(d\.nameKey\) === 1/)
  ok('Case 6: exact-name duplicate-candidate detection for newly-created suppliers is preserved, evaluated per insert result')

  // --- Case 7: no accidental behavior drift in the matching rules ----------
  // (external-id match, then unique-BIN match — same two link methods, same
  // priority, nothing new invented).
  assert.match(body, /byUmagId\.get\(umagId\)\?\.id \|\| null/)
  assert.match(body, /umagBinCounts\.get\(umagOwned\.bin\) === 1/)
  assert.doesNotMatch(src, /linkMethod === 'create'/) // dead enum member from the old type, not resurrected
  ok('Case 7: external-id-first, then unique-BIN matching rules are unchanged — no new matching heuristic introduced')

  console.log(`\n${checks} checks passed`)
}

main()
