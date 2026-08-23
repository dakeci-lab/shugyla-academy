#!/usr/bin/env node
/**
 * Verification for get_procurement_snapshot_stock_health — the planner's
 * 80/10/10 stock-health widget aggregate.
 *
 * Ties into buyer KPI/bonus (owner's words), so it must be a single,
 * server-computed source of truth: no client-side scan, no caching that
 * could go stale between UMAG syncs (norm edits propagate onto
 * procurement_snapshot_items.norm_days immediately via
 * set_procurement_norm_rule_for_snapshot — a cached percentage would drift).
 *
 * This script proves:
 *   1. the function is a plain SELECT-based aggregate, not security definer
 *      (authenticated already holds SELECT on procurement_snapshot_items —
 *      no new privilege surface is needed or introduced),
 *   2. bucket boundaries match src/utils/procurementPlanningMath.js's
 *      calcReserveDays/compareReserveDaysToNorm exactly: round(stock/avg_daily)
 *      vs norm_days, with avg_daily <= 0 excluded as "no demand",
 *   3. counts on a fixture snapshot with known per-item values match hand-
 *      computed expectations for all four buckets, including a rounding
 *      edge case.
 *
 * Usage:
 *   npm run verify:procurement-snapshot-stock-health-static
 *   npm run supabase:local:verify-procurement-snapshot-stock-health
 */

import { spawnSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROJECT_ID = 'shugyla-academy'
const MIGRATION = 'supabase/migrations/20260824100000_procurement_snapshot_stock_health_tolerance.sql'
const FN_NAME = 'get_procurement_snapshot_stock_health'
const STATIC_ONLY = process.argv.includes('--static-only')

const state = {
  container: null,
  runId: crypto.randomUUID().slice(0, 8),
  authUserId: crypto.randomUUID(),
  employeeId: null,
  snapshotId: null,
  itemIds: [],
  cleanupNeeded: false,
}

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

// ---------------------------------------------------------------------------
// psql plumbing (same pattern as verify-procurement-snapshot-guard.mjs)
// ---------------------------------------------------------------------------

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  })
}

function psql(sql, { expectFailure = false, label = '' } = {}) {
  const result = run('docker', [
    'exec',
    state.container,
    'psql',
    '-U',
    'postgres',
    '-t',
    '-A',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ])

  const ok = result.status === 0
  if (expectFailure && ok) {
    fail(`${label || 'statement'} was expected to fail but succeeded`)
  }
  if (!expectFailure && !ok) {
    fail(`${label || 'statement'} failed: ${(result.stderr || '').trim()}`)
  }

  return {
    ok,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  }
}

function scalar(sql) {
  return psql(sql).stdout
}

/** Runs sql as role `authenticated` with the fixture employee's JWT claims. */
function asBuyer(sql, options = {}) {
  const claims = JSON.stringify({ sub: state.authUserId, role: 'authenticated' })
  const wrapped = [
    'begin',
    'set local role authenticated',
    `set local request.jwt.claims = '${claims}'`,
    sql,
    'commit',
  ].join('; ')
  return psql(wrapped, options)
}

// ---------------------------------------------------------------------------
// Stage 1 — static: the migration says what it must, and nothing more
// ---------------------------------------------------------------------------

function stageStatic() {
  console.log('Stage 1: Migration content')

  const sql = read(MIGRATION)
  const sqlNoComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')

  assert(
    'migration creates the function with the right signature',
    sql.includes(`create or replace function public.${FN_NAME}(p_snapshot_id uuid)`)
  )
  assert(
    'not security definer — no new privilege surface',
    !/security definer/i.test(sqlNoComments)
  )
  assert('search_path stays pinned to empty', /set search_path = ''/.test(sql))
  assert('language sql, stable (read-only, plannable)', /language sql\s*\n\s*stable/.test(sql))
  assert(
    'grants EXECUTE to authenticated',
    /grant execute on function public\.get_procurement_snapshot_stock_health\(uuid\) to authenticated/i.test(
      sql
    )
  )

  // Bucket boundaries must match calcReserveDays/compareReserveDaysToNorm exactly.
  const mathSrc = read('src/utils/procurementPlanningMath.js')
  assert(
    'reserve formula matches calcReserveDays (round(stock/avg_daily))',
    /round\(i\.calculation_stock \/ i\.avg_daily\)/.test(sql) &&
      mathSrc.includes('Math.round(stock / avg)')
  )
  assert('no-demand bucket excludes avg_daily <= 0', /where i\.avg_daily <= 0/.test(sql))
  assert(
    '±20% tolerance band matches STOCK_HEALTH_NORM_TOLERANCE, not exact equality',
    /< i\.norm_days \* 0\.8/.test(sql) &&
      />= i\.norm_days \* 0\.8/.test(sql) &&
      /<= i\.norm_days \* 1\.2/.test(sql) &&
      /> i\.norm_days \* 1\.2/.test(sql) &&
      mathSrc.includes('STOCK_HEALTH_NORM_TOLERANCE = 0.2')
  )

  // Read-only guarantee: this is an aggregate, not a place to smuggle writes.
  const body = sql.slice(sql.indexOf('as $$'), sql.lastIndexOf('$$;'))
  const lowered = body.toLowerCase()
  assert('function body has no INSERT', !/\binsert\s+into\b/.test(lowered))
  assert('function body has no UPDATE', !/\bupdate\s+public\./.test(lowered))
  assert('function body has no DELETE', !/\bdelete\s+from\b/.test(lowered))
  assert('function body reads only procurement_snapshot_items', lowered.includes('from public.procurement_snapshot_items'))

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 2 — environment
// ---------------------------------------------------------------------------

function stageEnvironment() {
  console.log('Stage 2: Local Supabase')

  const docker = run('docker', ['info'])
  if (docker.status !== 0) {
    fail('docker is not available — start Docker and `npm run supabase:local:bootstrap` first')
  }

  const name = `supabase_db_${PROJECT_ID}`
  const ps = run('docker', ['ps', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'])
  const found = (ps.stdout || '').trim().split('\n').filter(Boolean)
  if (found.length !== 1) {
    fail(`local database container ${name} is not running — run npm run supabase:local:bootstrap`)
  }
  state.container = found[0]
  pass(`database container ${state.container}`)

  const db = scalar('select current_database();')
  assert('connected to the local postgres database', db === 'postgres', db)

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 3 — the function is a plain aggregate, correctly granted
// ---------------------------------------------------------------------------

function stageIntrospection() {
  console.log('Stage 3: Function and grants')

  const row = scalar(`
    select p.prosecdef::text
           || '|' || coalesce(array_to_string(p.proconfig, ','), '')
           || '|' || p.provolatile
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '${FN_NAME}';
  `)
  if (!row) fail(`function public.${FN_NAME} not found — is the migration applied?`)
  const [secdef, config, volatility] = row.split('|')

  assert('function is NOT security definer', secdef === 'false', `prosecdef=${secdef}`)
  assert('function pins search_path', config.includes('search_path='), `proconfig=${config || 'null'}`)
  assert('function is STABLE', volatility === 's', `provolatile=${volatility}`)

  const canExecute = scalar(`
    select has_function_privilege('authenticated', 'public.${FN_NAME}(uuid)', 'EXECUTE')::text;
  `)
  assert('authenticated can execute the function', canExecute === 'true', canExecute)

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 4 — fixtures: one item per bucket, plus a rounding edge case
// ---------------------------------------------------------------------------

function stageFixtures() {
  console.log('Stage 4: Fixtures')

  state.employeeId = Number(scalar('select coalesce(max(id), 0) + 1 from public.academy_users;'))
  psql(
    `
    insert into public.academy_users (id, login, first_name, last_name, full_name, role, status, auth_user_id)
    values (
      ${state.employeeId},
      'stock-health-verify-${state.runId}',
      'Stock', 'Health', 'Stock Health',
      'admin', 'active', '${state.authUserId}'
    );
  `,
    { label: 'insert fixture employee' }
  )
  state.cleanupNeeded = true

  state.snapshotId = scalar(`
    insert into public.procurement_snapshots (status, period_from, period_to, synced_at)
    values ('ready', current_date - 56, current_date, now())
    returning id;
  `)

  // ±20% tolerance band (norm=10 -> band [8,12], norm=14 -> band [11.2,16.8]):
  // avg_daily=0            -> no_demand      (excluded from 80/10/10)
  // stock=6,  avg=2  -> reserve=3,  norm=10  -> 3  < 8    -> under_norm
  // stock=28, avg=2  -> reserve=14, norm=14  -> in [11.2,16.8] -> on_norm
  // stock=60, avg=2  -> reserve=30, norm=14  -> 30 > 16.8 -> over_norm
  // stock=7,  avg=1.5 -> reserve=round(4.666..)=5, norm=5 (band [4,6]) -> on_norm (rounding edge case)
  // stock=22, avg=2  -> reserve=11, norm=10  -> in [8,12] but 11≠10: the case
  //   strict equality used to miss (would've been over_norm) — proves the
  //   tolerance band actually widened on_norm, not just kept old behaviour.
  const fixtures = [
    { stock: 5, avg: 0, norm: 14 },
    { stock: 6, avg: 2, norm: 10 },
    { stock: 28, avg: 2, norm: 14 },
    { stock: 60, avg: 2, norm: 14 },
    { stock: 7, avg: 1.5, norm: 5 },
    { stock: 22, avg: 2, norm: 10 },
  ]

  for (const [index, item] of fixtures.entries()) {
    const id = scalar(`
      insert into public.procurement_snapshot_items
        (snapshot_id, barcode, product_name, calculation_stock, avg_daily, norm_days, recommended_qty, final_order_qty)
      values (
        '${state.snapshotId}', 'STOCKHEALTH-${state.runId}-${index}', 'Stock health fixture ${index}',
        ${item.stock}, ${item.avg}, ${item.norm}, 0, 0
      )
      returning id;
    `)
    state.itemIds.push(id)
  }

  pass(`snapshot ${state.snapshotId} with 6 items covering all four buckets`)
  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 5 — behaviour: counts match hand-computed expectations
// ---------------------------------------------------------------------------

function stageBehaviour() {
  console.log('Stage 5: Aggregate behaviour as a buyer')

  const row = asBuyer(
    `select * from public.get_procurement_snapshot_stock_health('${state.snapshotId}');`,
    { label: 'call stock-health RPC' }
  ).stdout
  const [total, noDemand, under, on_, over] = row.split('|').map(Number)

  assert('total_count = 6', total === 6, `got ${total}`)
  assert('no_demand_count = 1 (avg_daily = 0 excluded from 80/10/10)', noDemand === 1, `got ${noDemand}`)
  assert('under_norm_count = 1', under === 1, `got ${under}`)
  assert(
    'on_norm_count = 3 (exact match, rounding edge case, and the ±20%-only case)',
    on_ === 3,
    `got ${on_}`
  )
  assert('over_norm_count = 1', over === 1, `got ${over}`)
  assert(
    'buckets partition the total (no double-counting, none dropped)',
    noDemand + under + on_ + over === total,
    `${noDemand}+${under}+${on_}+${over} != ${total}`
  )

  const emptyRow = asBuyer(
    `select * from public.get_procurement_snapshot_stock_health('${crypto.randomUUID()}');`,
    { label: 'call with a snapshot id that matches nothing' }
  ).stdout
  const [emptyTotal, emptyNoDemand, emptyUnder, emptyOn, emptyOver] = emptyRow.split('|').map(Number)
  assert(
    'an unknown snapshot id returns all zeros, not an error',
    [emptyTotal, emptyNoDemand, emptyUnder, emptyOn, emptyOver].every((n) => n === 0),
    emptyRow
  )

  console.log('')
}

function cleanup() {
  if (!state.container || !state.cleanupNeeded) return
  try {
    if (state.snapshotId) {
      psql(`delete from public.procurement_snapshots where id = '${state.snapshotId}';`)
    }
    if (state.employeeId) {
      psql(`delete from public.academy_users where id = ${state.employeeId};`)
    }
    console.log('Fixtures removed.\n')
  } catch (error) {
    console.warn(`⚠ cleanup incomplete: ${error.message}`)
    console.warn(`  snapshot ${state.snapshotId}, employee ${state.employeeId}`)
  }
}

async function main() {
  console.log('=== Procurement snapshot stock-health verification ===\n')
  try {
    stageStatic()

    if (STATIC_ONLY) {
      console.log(`Static checks only (${checks} passed). Run without --static-only to verify the database.\n`)
      return
    }

    stageEnvironment()
    stageIntrospection()
    stageFixtures()
    stageBehaviour()

    console.log(`=== All ${checks} checks passed ===\n`)
  } finally {
    cleanup()
  }
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}\n`)
  process.exit(1)
})
