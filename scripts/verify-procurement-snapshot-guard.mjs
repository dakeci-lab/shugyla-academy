#!/usr/bin/env node
/**
 * Verification for the procurement snapshot guard permission fix.
 *
 * Bug: buyers editing planning quantities hit
 *   permission denied for table procurement_snapshots
 * because procurement_snapshot_items_guard_update() ran as the caller and its
 * `select ... for share` on procurement_snapshots needs UPDATE privilege,
 * which role `authenticated` must never have.
 *
 * Fix: the guard is `security definer` (owner postgres, search_path pinned).
 *
 * This script proves three things at once:
 *   1. the guard now runs with definer rights,
 *   2. role `authenticated` was NOT granted UPDATE on procurement_snapshots,
 *   3. the guard still rejects everything it rejected before.
 *
 * Usage:
 *   npm run supabase:local:verify-procurement-snapshot-guard
 *   node scripts/verify-procurement-snapshot-guard.mjs --static-only
 */

import { spawnSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROJECT_ID = 'shugyla-academy'
const MIGRATION = 'supabase/migrations/20260812032500_fix_procurement_snapshot_guard_security_definer.sql'
const GUARD_FN = 'procurement_snapshot_items_guard_update'
const STATIC_ONLY = process.argv.includes('--static-only')

const state = {
  container: null,
  runId: crypto.randomUUID().slice(0, 8),
  authUserId: crypto.randomUUID(),
  employeeId: null,
  snapshotId: null,
  itemId: null,
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
// psql plumbing (same pattern as the other supabase:local:* verify scripts)
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
    "set local role authenticated",
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

  assert('migration replaces the guard function', sql.includes(`create or replace function public.${GUARD_FN}()`))
  assert('guard is security definer', /security definer/i.test(sql))
  assert('search_path stays pinned to empty', /set search_path = ''/.test(sql))
  assert('owner is reset to postgres', /alter function public\.procurement_snapshot_items_guard_update\(\) owner to postgres/i.test(sql))
  assert('FOR SHARE lock is preserved', /for share/i.test(sql))

  // The body must be the previous version verbatim. Compare the guard bodies of
  // the last two migrations that define it, ignoring the header line we added.
  const previous = read('supabase/migrations/20260810160315_procurement_partial_supplier_generation.sql')
  const bodyOf = (source) => {
    const start = source.indexOf(`create or replace function public.${GUARD_FN}()`)
    if (start === -1) fail('guard function not found while comparing bodies')
    const open = source.indexOf('as $$', start)
    const close = source.indexOf('$$;', open)
    if (open === -1 || close === -1) fail('could not delimit guard body')
    return source
      .slice(open + 'as $$'.length, close)
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim() !== '')
      .join('\n')
  }

  assert(
    'guard body is unchanged from the previous migration',
    bodyOf(sql) === bodyOf(previous),
    'only the function header may change in this PR'
  )

  // Hard guarantee: nobody widened user privileges to work around the error.
  const migrationsDir = path.join(ROOT, 'supabase/migrations')
  const offenders = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .filter((name) => {
      const body = fs.readFileSync(path.join(migrationsDir, name), 'utf8')
      return /grant[^;]*\bupdate\b[^;]*procurement_snapshots\b[^;]*\bto\s+authenticated/is.test(body)
    })

  assert(
    'no migration grants UPDATE on procurement_snapshots to authenticated',
    offenders.length === 0,
    offenders.join(', ')
  )

  // A security definer function runs as postgres. Prove this one cannot be used
  // as a lever: it only reads a status and raises, it writes nothing anywhere.
  const body = sql.slice(sql.indexOf('as $$'), sql.indexOf('$$;'))
  const lowered = body.toLowerCase()

  assert('guard uses no dynamic SQL', !/\bexecute\s+/.test(lowered), 'execute in a definer body is an injection surface')
  assert('guard inserts nothing', !/\binsert\s+into\b/.test(lowered))
  assert('guard deletes nothing', !/\bdelete\s+from\b/.test(lowered))
  assert(
    'guard writes only to the row being validated',
    !/\bupdate\s+public\./.test(lowered),
    'a BEFORE trigger must only touch NEW'
  )
  assert(
    'guard reads only the parent snapshot',
    (lowered.match(/from\s+public\.\w+/g) || []).every((match) =>
      match.includes('procurement_snapshots')
    )
  )

  // Column grants must stay narrow: the planning columns and nothing else.
  const planningMigration = read('supabase/migrations/20260809072915_procurement_planning_v1.sql')
  const grantBlock = planningMigration.match(
    /grant update \(([^)]*)\)\s*on table public\.procurement_snapshot_items to authenticated/i
  )
  assert('column-level UPDATE grant on snapshot items exists', Boolean(grantBlock))

  const grantedColumns = (grantBlock?.[1] || '')
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean)
    .sort()

  assert(
    'authenticated may update only final_order_qty, manual_override, updated_at',
    grantedColumns.join(',') === 'final_order_qty,manual_override,updated_at',
    grantedColumns.join(',') || '(none)'
  )

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
// Stage 3 — the function is a definer, the role is not privileged
// ---------------------------------------------------------------------------

function stageIntrospection() {
  console.log('Stage 3: Function and grants')

  const row = scalar(`
    select p.prosecdef::text
           || '|' || pg_get_userbyid(p.proowner)
           || '|' || coalesce(array_to_string(p.proconfig, ','), '')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '${GUARD_FN}';
  `)

  if (!row) fail(`function public.${GUARD_FN} not found — is the migration applied?`)
  const [secdef, owner, config] = row.split('|')

  assert('guard runs as security definer', secdef === 'true', `prosecdef=${secdef}`)
  assert('guard is owned by postgres', owner === 'postgres', `owner=${owner}`)
  assert('guard pins search_path', config.includes('search_path='), `proconfig=${config || 'null'}`)

  const grants = scalar(`
    select coalesce(string_agg(distinct privilege_type, ',' order by privilege_type), '')
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'procurement_snapshots'
      and grantee = 'authenticated';
  `)
  assert(
    'authenticated holds SELECT only on procurement_snapshots',
    grants === 'SELECT',
    `grants=${grants || 'none'}`
  )

  // A definer function must not be callable as an RPC: the trigger fires it
  // without needing EXECUTE, so nobody else should hold that privilege.
  const directExecute = scalar(`
    select coalesce(string_agg(role_name, ',' order by role_name), '')
    from (
      select unnest(array['anon', 'authenticated', 'service_role']) as role_name
    ) roles
    where has_function_privilege(
      role_name,
      'public.${GUARD_FN}()',
      'EXECUTE'
    );
  `)
  assert(
    'the guard cannot be invoked directly by API roles',
    directExecute === '',
    `execute still granted to: ${directExecute}`
  )

  const updatableColumns = scalar(`
    select coalesce(string_agg(column_name, ',' order by column_name), '')
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'procurement_snapshot_items'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE';
  `)
  assert(
    'column grants on snapshot items stayed narrow',
    updatableColumns === 'final_order_qty,manual_override,updated_at',
    updatableColumns || '(none)'
  )

  const trigger = scalar(`
    select count(*)::text
    from pg_trigger
    where tgrelid = 'public.procurement_snapshot_items'::regclass
      and not tgisinternal
      and tgname = 'trg_procurement_snapshot_items_guard_update';
  `)
  assert('update guard trigger is still attached', trigger === '1', `count=${trigger}`)

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 4 — fixtures
// ---------------------------------------------------------------------------

function stageFixtures() {
  console.log('Stage 4: Fixtures')

  state.employeeId = Number(
    scalar('select coalesce(max(id), 0) + 1 from public.academy_users;')
  )

  psql(`
    insert into public.academy_users (id, login, first_name, last_name, full_name, role, status, auth_user_id)
    values (
      ${state.employeeId},
      'guard-verify-${state.runId}',
      'Guard', 'Verify', 'Guard Verify',
      'admin', 'active', '${state.authUserId}'
    );
  `, { label: 'insert fixture employee' })
  state.cleanupNeeded = true

  state.snapshotId = scalar(`
    insert into public.procurement_snapshots (status, period_from, period_to, synced_at)
    values ('ready', current_date - 56, current_date, now())
    returning id;
  `)

  state.itemId = scalar(`
    insert into public.procurement_snapshot_items
      (snapshot_id, barcode, product_name, calculation_stock, avg_daily, norm_days, recommended_qty, final_order_qty)
    values ('${state.snapshotId}', 'GUARD-${state.runId}', 'Guard fixture', 10, 2, 14, 18, 18)
    returning id;
  `)

  pass(`snapshot ${state.snapshotId} in status ready with one item`)
  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 5 — behaviour
// ---------------------------------------------------------------------------

function stageBehaviour() {
  console.log('Stage 5: Guard behaviour as a buyer')

  // The privilege gap that caused the bug must still exist for direct access:
  // the fix moved the lock inside a definer function, it did not open the table.
  const direct = asBuyer(
    `select 1 from public.procurement_snapshots where id = '${state.snapshotId}' for share`,
    { expectFailure: true, label: 'direct FOR SHARE as authenticated' }
  )
  assert(
    'authenticated still cannot lock procurement_snapshots directly',
    /permission denied/i.test(direct.stderr),
    direct.stderr || '(no error text)'
  )

  // The actual regression: editing a planning field on a ready snapshot.
  asBuyer(
    `update public.procurement_snapshot_items set final_order_qty = 25 where id = '${state.itemId}'`,
    { label: 'buyer edits final_order_qty' }
  )
  const saved = scalar(
    `select final_order_qty::numeric(14,0)::text from public.procurement_snapshot_items where id = '${state.itemId}';`
  )
  assert('buyer edit is persisted', saved === '25', `final_order_qty=${saved}`)

  // Guard invariant 1: fact columns stay immutable.
  const facts = asBuyer(
    `update public.procurement_snapshot_items set calculation_stock = 999 where id = '${state.itemId}'`,
    { expectFailure: true, label: 'fact column edit' }
  )
  assert(
    'fact columns remain immutable',
    /fact columns are immutable|permission denied|violates row-level security/i.test(facts.stderr),
    facts.stderr || '(no error text)'
  )

  // Column grants: norm_days is a planning field the guard allows in principle,
  // but authenticated was never granted it. The grant must still win.
  const normDays = asBuyer(
    `update public.procurement_snapshot_items set norm_days = 21 where id = '${state.itemId}'`,
    { expectFailure: true, label: 'norm_days edit' }
  )
  assert(
    'a column outside the grant list cannot be updated',
    /permission denied|violates row-level security/i.test(normDays.stderr),
    normDays.stderr || '(no error text)'
  )

  // Linkage to a generated order is not the user's field either.
  const linkage = asBuyer(
    `update public.procurement_snapshot_items set generated_purchase_order_id = null where id = '${state.itemId}'`,
    { expectFailure: true, label: 'generated order linkage edit' }
  )
  assert(
    'the generated-order link cannot be touched by a user',
    /permission denied|violates row-level security|immutable/i.test(linkage.stderr),
    linkage.stderr || '(no error text)'
  )

  // Repeat-order contract (20260814134910): generated_purchase_order_id is a
  // last-order pointer, not a write lock. The buyer must be able to enter the
  // next quantity after an order was created.
  psql(`
    insert into public.purchase_orders (supplier_name, status, purchase_date, workflow_mode)
    values ('GUARD-${state.runId}', 'draft', current_date, 'simple');
  `)
  const orderId = scalar(
    `select id from public.purchase_orders where supplier_name = 'GUARD-${state.runId}' order by created_at desc limit 1;`
  )
  psql(`
    update public.procurement_snapshot_items
       set generated_purchase_order_id = '${orderId}'
     where id = '${state.itemId}';
  `)

  asBuyer(
    `update public.procurement_snapshot_items set final_order_qty = 40 where id = '${state.itemId}'`,
    { label: 'edit qty on a row that already has order history' }
  )
  const afterHistory = scalar(
    `select final_order_qty::numeric(14,0)::text from public.procurement_snapshot_items where id = '${state.itemId}';`
  )
  assert(
    'rows with previous orders stay editable for the next quantity',
    afterHistory === '40',
    `final_order_qty=${afterHistory}`
  )

  psql(`
    update public.procurement_snapshot_items
       set generated_purchase_order_id = null
     where id = '${state.itemId}';
  `)
  psql(`delete from public.purchase_orders where id = '${orderId}';`)

  // A generated snapshot remains a working planning document: the buyer can
  // type the next quantity after current qty was reset to 0.
  psql(`update public.procurement_snapshots set status = 'generated' where id = '${state.snapshotId}';`)
  asBuyer(
    `update public.procurement_snapshot_items set final_order_qty = 31 where id = '${state.itemId}'`,
    { label: 'edit on a generated snapshot' }
  )
  const generatedQty = scalar(
    `select final_order_qty::numeric(14,0)::text from public.procurement_snapshot_items where id = '${state.itemId}';`
  )
  assert(
    'planning qty stays editable after the snapshot is generated',
    generatedQty === '31',
    `final_order_qty=${generatedQty}`
  )

  psql(`update public.procurement_snapshots set status = 'failed' where id = '${state.snapshotId}';`)
  const frozen = asBuyer(
    `update public.procurement_snapshot_items set final_order_qty = 99 where id = '${state.itemId}'`,
    { expectFailure: true, label: 'edit on a failed snapshot' }
  )
  assert(
    'planning fields stay frozen outside a working snapshot',
    /working snapshot|status is ready|violates row-level security|permission denied/i.test(frozen.stderr),
    frozen.stderr || '(no error text)'
  )
  psql(`update public.procurement_snapshots set status = 'ready' where id = '${state.snapshotId}';`)
  psql(
    `update public.procurement_snapshot_items set final_order_qty = 25, manual_override = true where id = '${state.itemId}';`
  )

  const unchanged = scalar(
    `select final_order_qty::numeric(14,0)::text from public.procurement_snapshot_items where id = '${state.itemId}';`
  )
  assert('rejected edits left the value untouched', unchanged === '25', `final_order_qty=${unchanged}`)

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
  console.log('=== Procurement snapshot guard verification ===\n')
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
