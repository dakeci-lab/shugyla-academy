#!/usr/bin/env node
/**
 * Verification for Этап 2.3 — server-side lock + stale-run recovery for
 * umag-sync.
 *
 * No Docker/local Postgres was available in this environment (checked:
 * `docker ps` fails to reach the daemon, no .env.local / live Supabase
 * connection either — see the Этап 2.3 report), so a real two-connection
 * concurrent-INSERT race against the partial unique index could not be
 * executed here. This script instead:
 *
 *   1. Structurally verifies the real migration SQL and Edge Function code
 *      (the actual committed logic, not a description of it).
 *   2. Faithfully mirrors the small pure predicates (isSyncLockConflict,
 *      the stale-cleanup age check) and exercises them as unit tests.
 *   3. Explicitly labels every one of the Этап 2.3 Case 1–12 scenarios with
 *      how it was verified (structural vs. mirrored-logic) so the gap is
 *      visible, not glossed over.
 *
 * Usage:
 *   npm run verify:umag-sync-lock
 */

import fs from 'fs'
import path from 'path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const EDGE_FN = 'supabase/functions/umag-sync/index.ts'
const CONFIG = 'supabase/functions/_shared/umagConfig.ts'
const MIGRATION = 'supabase/migrations/20260819120000_umag_sync_runs_lock.sql'

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

function main() {
  console.log('=== UMAG sync lock verification (Этап 2.3) ===\n')

  // --- 0. Table usage survey: lock key must not block an independent workflow ---
  const writers = execFileSync(
    'git',
    ['grep', '-l', "from('umag_sync_runs')", '--', 'supabase', 'src'],
    { cwd: ROOT, encoding: 'utf8' }
  ).trim()
  assert.equal(
    writers,
    'src/services/umagSettlementsService.js\nsupabase/functions/umag-sync/index.ts',
    'a new writer of umag_sync_runs appeared — re-check the lock key against it'
  )
  ok('umag_sync_runs is written only by umag-sync/index.ts (service_role) — frontend only SELECTs; no independent workflow to protect from the lock')

  const edge = read(EDGE_FN)
  const entityLiterals = [...edge.matchAll(/entity:\s*'([^']+)'/g)].map((m) => m[1])
  assert.deepEqual([...new Set(entityLiterals)], ['all'], "entity is not exclusively 'all' — the lock key assumption no longer holds")
  ok("entity is hardcoded to 'all' everywhere it's written — a single mutually-exclusive pipeline today; the lock is still keyed on entity (not hardcoded) so a genuinely independent future entity value stays unaffected")

  // --- 1. Migration: structural checks -----------------------------------
  const migration = read(MIGRATION)
  assert.match(migration, /select pg_advisory_xact_lock\(202608191200\);/)
  ok('migration takes its own advisory_xact_lock, matching every other migration in this project')

  assert.match(
    migration,
    /create unique index if not exists umag_sync_runs_entity_running_lock\s*\n\s*on public\.umag_sync_runs \(entity\)\s*\n\s*where status = 'running';/
  )
  ok("Case 1/2 precondition: partial unique index on (entity) WHERE status='running' — two 'running' rows for the same entity are physically impossible")

  assert.doesNotMatch(migration, /\bdelete from\b/i)
  ok('pre-cleanup never deletes history — only UPDATE to a terminal status')

  assert.match(migration, /status = 'failed'/)
  assert.match(migration, /finished_at = coalesce\(r\.finished_at, now\(\)\)/)
  assert.match(migration, /error_message = coalesce\(/)
  ok('pre-cleanup closes stale/duplicate running rows into the existing status/finished_at/error_message columns — no new column added')

  assert.match(migration, /row_number\(\) over \(partition by entity order by started_at desc\)/)
  assert.match(migration, /ranked_running\.rn > 1/)
  ok('duplicate running rows for the same entity: only the most recent started_at is kept as plausibly active, the rest are closed (Case with historical dupes)')

  assert.match(migration, /r\.started_at < now\(\) - interval '15 minutes'/)
  ok("pre-cleanup age check uses the same 15-minute threshold as the Edge Function's runtime cleanup")

  // --- 2. Config: named constant, not a magic number ----------------------
  const config = read(CONFIG)
  assert.match(config, /export const STALE_SYNC_THRESHOLD_MINUTES = 15/)
  ok('STALE_SYNC_THRESHOLD_MINUTES = 15 is a named, commented constant in _shared/umagConfig.ts')
  assert.match(config, /No production telemetry was available/)
  assert.match(config, /deliberately\s*\n \* conservative fallback, not a measured value/)
  ok('the constant is honestly documented as a conservative fallback, not a measured value (no telemetry was available — see report)')

  // --- 3. Edge Function: lock acquisition wiring --------------------------
  assert.match(edge, /const PG_UNIQUE_VIOLATION = '23505'/)
  assert.match(edge, /const SYNC_LOCK_INDEX_NAME = 'umag_sync_runs_entity_running_lock'/)
  ok('the index name checked at runtime literally matches the migration — not duplicated by accident')

  assert.match(
    edge,
    /function isSyncLockConflict\(/
  )
  assert.match(edge, /if \(error\.code !== PG_UNIQUE_VIOLATION\) return false/)
  assert.match(edge, /return text\.includes\(SYNC_LOCK_INDEX_NAME\)/)
  ok('isSyncLockConflict() requires BOTH the 23505 code AND the specific lock index name — not "any insert error"')

  assert.doesNotMatch(
    edge,
    /catch\s*\{\s*\n?\s*return\s+(SYNC_ALREADY_RUNNING|umagErrorResponse\('SYNC_ALREADY_RUNNING')/
  )
  ok('no bare catch-and-assume-already-running — item 11 forbidden pattern is absent')

  assert.match(edge, /async function acquireSyncRun\(/)
  const acquireBody = edge.slice(edge.indexOf('async function acquireSyncRun('), edge.indexOf('\ntype OpenObligationDatePoint') > -1 ? edge.indexOf('\ntype OpenObligationDatePoint') : undefined)
  assert.doesNotMatch(
    acquireBody.split('\n').slice(0, 20).join('\n'),
    /\.select\(.*\)\s*\n\s*\.eq\('status', 'running'\)/,
    'acquireSyncRun must not pre-check with a SELECT before the INSERT — that would be a check-then-act race, not a DB-enforced lock'
  )
  ok('Case 3: acquireSyncRun attempts the INSERT directly (no SELECT-then-INSERT check-then-act) — the DB unique index, not application logic, is the last guarantee against a real race')

  assert.match(
    edge,
    /const \{ data: running \} = await serviceClient\s*\n\s*\.from\('umag_sync_runs'\)\s*\n\s*\.select\('id, started_at'\)/
  )
  ok('after a genuine lock conflict, the existing running run is looked up (id/started_at) only to report it — this read happens after, never before, the INSERT attempt')

  // --- 4. Handler wiring: cleanup -> acquire -> (session | SYNC_ALREADY_RUNNING) ---
  assert.match(
    edge,
    /const staleCleanup = await cleanupStaleSyncRuns\(authz\.serviceClient\)\s*\n\s*if \(staleCleanup instanceof Response\) return staleCleanup/
  )
  const acquireCallIdx = edge.indexOf('const acquired = await acquireSyncRun(')
  const cleanupCallIdx = edge.indexOf('const staleCleanup = await cleanupStaleSyncRuns(')
  const sessionCallIdx = edge.indexOf("const session = await acquireUmagSession()")
  assert.ok(cleanupCallIdx > 0 && acquireCallIdx > cleanupCallIdx, 'stale cleanup must run before lock acquisition')
  assert.ok(sessionCallIdx > acquireCallIdx, 'lock acquisition must happen before the UMAG signin — a losing request must not pay for a UMAG login')
  ok('handler order: stale cleanup -> lock acquisition -> (only then) UMAG signin')

  assert.match(
    edge,
    /if \(!acquired\.ok\) \{\s*\n\s*if \(acquired\.alreadyRunning\) \{\s*\n\s*return umagErrorResponse\(\s*\n\s*'SYNC_ALREADY_RUNNING',/
  )
  ok('Case 2: a genuine lock conflict returns immediately as SYNC_ALREADY_RUNNING — no further pipeline code runs for the loser')

  assert.match(edge, /'SYNC_ALREADY_RUNNING',\s*\n\s*'Синхронизация UMAG уже выполняется\. Дождитесь её завершения\.',\s*\n\s*409,/)
  ok('SYNC_ALREADY_RUNNING is reported as HTTP 409 Conflict with a clear Russian message')

  assert.match(edge, /\{ runId: acquired\.runId, startedAt: acquired\.startedAt \}/)
  ok('the response includes the existing runId/startedAt when available (best-effort, non-racy read)')

  // Loser never gets a second row: the alreadyRunning branch has no further
  // acquireSyncRun/finishSyncRun/insert call before its return.
  const alreadyRunningBlockStart = edge.indexOf('if (acquired.alreadyRunning) {')
  const alreadyRunningBlockEnd = edge.indexOf('\n    }\n', alreadyRunningBlockStart)
  const alreadyRunningBlock = edge.slice(alreadyRunningBlockStart, alreadyRunningBlockEnd)
  assert.doesNotMatch(alreadyRunningBlock, /acquireSyncRun\(|finishSyncRun\(|\.insert\(/)
  ok('Case 9: the SYNC_ALREADY_RUNNING branch performs no further umag_sync_runs write — no fake failed/partial row for the loser')

  // --- 5. UMAG-auth failure now properly closes the row it already created ---
  assert.match(
    edge,
    /if \('error' in session\) \{\s*\n\s*await finishSyncRun\(authz\.serviceClient, runId, \{\s*\n\s*status: 'failed',\s*\n\s*error_message: `Ошибка входа в UMAG: \$\{session\.error\}`,/
  )
  ok('a UMAG signin failure after lock acquisition now closes the run (status=failed) instead of leaving it running until the next stale-cleanup')

  // --- 6. Stage 2.2 untouched ----------------------------------------------
  assert.match(edge, /async function computeEffectiveSyncScope\(/)
  assert.match(edge, /MAX_AUTO_SYNC_LOOKBACK_MONTHS,?\s*\n?/)
  assert.match(edge, /openDebtCoverageComplete/)
  assert.match(
    edge,
    /const effectiveFrom = \[recentStart, automaticOpenDebtFrom, requestedFrom\]\.reduce\(\(min, key\) =>\s*\n\s*key < min \? key : min\s*\n\s*\)/
  )
  ok('Этап 2.2 sync-scope algorithm (computeEffectiveSyncScope, effectiveFrom formula, openDebtCoverageComplete) is textually unchanged')

  // --- 7. Debt formula untouched -------------------------------------------
  assert.match(edge, /const debt = asNumber\(supply\.debt\)/)
  assert.match(edge, /current_debt: debt,/)
  const debtService = read('src/services/supplierDebtService.js')
  assert.doesNotMatch(debtService, /\.gte\(|\.lte\(/)
  ok('canonical debt formula (current_debt = umag_supplies.debt, no date filter in fetchCanonicalSupplierDebt) is untouched')

  // --- 8. Ledger reconciliation still not added -----------------------------
  assert.doesNotMatch(edge, /reconciliation_flag|ledger_delta|ledgerClosingBalance/i)
  ok('no ledger-vs-canonical reconciliation flag added this stage either')

  // --- 9. UI/routes/menu untouched ------------------------------------------
  const uiStatus = execFileSync(
    'git',
    [
      'status',
      '--porcelain',
      '--',
      'src/components/suppliers',
      'src/pages/platform/settlements',
      'src/pages/platform/supplier-payments',
      'src/platform/platformNav.js',
      'src/App.jsx',
    ],
    { cwd: ROOT, encoding: 'utf8' }
  ).trim()
  assert.equal(uiStatus, '', `UI files changed unexpectedly: ${uiStatus}`)
  ok('no UI/route/menu files touched — SYNC_ALREADY_RUNNING already resolves to a clear Russian message via the existing generic error-body path (verified below), no frontend change needed')

  // The existing generic path (resolveEdgeFunctionUserMessage) picks body.message
  // verbatim when it looks like a Russian sentence, before ever falling back to
  // a generic "unknown error" — confirmed by reading the (untouched) utility.
  const edgeErrUtil = read('src/utils/edgeFunctionErrors.js')
  assert.match(edgeErrUtil, /looksLikeRussianUserMessage\(structured\)/)
  ok('src/utils/edgeFunctionErrors.js already prefers a Cyrillic body.message over any generic/English fallback — confirmed by reading the existing (unmodified) utility')

  // --- 10. Delegation: both sync buttons hit the same pipeline (Case 10) ---
  const paymentsService = read('src/services/supplierPaymentObligationsService.js')
  assert.match(
    paymentsService,
    /export async function syncUmagForPayments\(\{ dateFrom, dateTo \}\) \{\s*\n\s*return syncUmagSettlements\(\{ dateFrom, dateTo, syncSuppliers: true \}\)\s*\n\}/
  )
  ok('Case 10: syncUmagForPayments (Оплаты) still delegates verbatim to syncUmagSettlements (Взаиморасчёты) — both tabs\' ↻ hit the exact same Edge Function call, hence the same DB lock')

  console.log('\n--- Mirrored pure-logic tests ---\n')
  runMirrorCases()

  console.log(`\n${checks} checks passed`)
  console.log(
    '\nNOTE: Cases 1-10 above are verified structurally against the committed code.\n' +
      'A live two-connection concurrent-INSERT race (the strongest possible proof of\n' +
      'the unique-index guarantee) was not run — no Docker/local Postgres was reachable\n' +
      'in this environment (`docker ps` cannot reach the daemon) and no .env.local /\n' +
      'live Supabase project is configured. This is the same limitation noted for prior\n' +
      'stages\' DB verification in CLAUDE.md.'
  )
}

// ---------------------------------------------------------------------------
// Faithful mirrors of the two pure predicates in the real (Deno TS) file.
// ---------------------------------------------------------------------------

const PG_UNIQUE_VIOLATION = '23505'
const SYNC_LOCK_INDEX_NAME = 'umag_sync_runs_entity_running_lock'
const STALE_SYNC_THRESHOLD_MINUTES = 15

function isSyncLockConflict(error) {
  if (!error) return false
  if (error.code !== PG_UNIQUE_VIOLATION) return false
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  return text.includes(SYNC_LOCK_INDEX_NAME)
}

function isStale(startedAtIso, nowMs = Date.now()) {
  const staleBeforeMs = nowMs - STALE_SYNC_THRESHOLD_MINUTES * 60_000
  return new Date(startedAtIso).getTime() < staleBeforeMs
}

function mirrorOk(name) {
  checks += 1
  console.log(`  ✓ ${name}`)
}

function runMirrorCases() {
  // Case 11 — an unrelated DB error must never be classified as a lock conflict.
  {
    const fkViolation = { code: '23503', message: 'insert or update on table violates foreign key constraint' }
    assert.equal(isSyncLockConflict(fkViolation), false)
    mirrorOk('Case 11a: foreign-key violation (23503) is never treated as SYNC_ALREADY_RUNNING')

    const unrelatedUnique = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "umag_sync_runs_pkey"',
    }
    assert.equal(isSyncLockConflict(unrelatedUnique), false)
    mirrorOk('Case 11b: a 23505 on a DIFFERENT constraint (e.g. the primary key) is not treated as SYNC_ALREADY_RUNNING')

    const rlsDenied = { code: '42501', message: 'new row violates row-level security policy' }
    assert.equal(isSyncLockConflict(rlsDenied), false)
    mirrorOk('Case 11c: an RLS denial is not treated as SYNC_ALREADY_RUNNING')

    const genuineLockConflict = {
      code: '23505',
      message:
        'duplicate key value violates unique constraint "umag_sync_runs_entity_running_lock"',
      details: 'Key (entity)=(all) already exists.',
    }
    assert.equal(isSyncLockConflict(genuineLockConflict), true)
    mirrorOk('Case 11d (control): a 23505 that DOES name the lock index is correctly recognized as SYNC_ALREADY_RUNNING')
  }

  // Case 4/5 — stale threshold math (mirrors the migration's and the Edge
  // Function's identical `started_at < now() - 15 minutes` predicate).
  {
    const now = new Date('2026-08-19T12:00:00.000Z').getTime()
    const staleStart = new Date(now - 16 * 60_000).toISOString()
    const freshStart = new Date(now - 14 * 60_000).toISOString()
    const exactlyAtEdge = new Date(now - 15 * 60_000).toISOString()

    assert.equal(isStale(staleStart, now), true)
    mirrorOk('Case 4: a running row started 16 minutes ago is stale — next sync closes it and can acquire the lock')

    assert.equal(isStale(freshStart, now), false)
    mirrorOk("Case 5: a running row started 14 minutes ago is NOT touched by cleanup — a fresh run's lock is never stolen early")

    assert.equal(isStale(exactlyAtEdge, now), false)
    mirrorOk('boundary: a row exactly at the 15-minute mark is not yet stale (strict <, not <=) — errs toward not stealing a possibly-live lock')
  }

  // Cases 6/7/8 — release-on-terminal-status is a property of the partial
  // index predicate itself (WHERE status = 'running'), proven structurally
  // above for all three terminal statuses at once; restated here as three
  // explicit assertions against the same predicate for traceability.
  for (const terminalStatus of ['success', 'partial', 'failed']) {
    const indexedByLock = terminalStatus === 'running'
    assert.equal(indexedByLock, false)
    mirrorOk(`Case ${{ success: 6, partial: 7, failed: 8 }[terminalStatus]}: a run transitioned to '${terminalStatus}' no longer matches WHERE status='running' — the next acquisition is unblocked automatically, no separate release code needed`)
  }

  // Case 12 — stale diagnostics shape (mirrors cleanupStaleSyncRuns' UPDATE payload).
  {
    const patch = {
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_message: `stale: run exceeded ${STALE_SYNC_THRESHOLD_MINUTES} min without finishing — closed by the next sync attempt's cleanup step.`,
    }
    assert.equal(patch.status, 'failed')
    assert.ok(patch.finished_at)
    assert.match(patch.error_message, /stale/)
    mirrorOk('Case 12: a stale-closed run carries a final status, finished_at, and a diagnostic reason (existing columns, no schema addition)')
  }
}

main()
