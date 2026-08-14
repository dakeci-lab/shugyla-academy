#!/usr/bin/env node
/**
 * Verification for repeat analytics purchase orders.
 *
 * Usage:
 *   npm run verify:procurement-repeat-analytics-orders
 *   npm run supabase:local:verify-procurement-repeat-analytics-orders
 */

import { spawn, spawnSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROJECT_ID = process.env.SUPABASE_PROJECT_ID || 'shugyla-academy'
const MIGRATION = 'supabase/migrations/20260814134910_procurement_repeat_analytics_orders.sql'
const EDGE = 'supabase/functions/umag-procurement/index.ts'
const CLIENT = 'src/services/procurementPlanningService.js'
const PLANNER = 'src/components/procurement/ProcurementPlannerView.jsx'
const FINGERPRINT_MODULE = 'src/utils/procurementAttemptFingerprint.js'
const STATIC_ONLY = process.argv.includes('--static-only')

const state = {
  container: null,
  runId: crypto.randomUUID().slice(0, 8),
  authUserId: crypto.randomUUID(),
  employeeId: null,
  supplierId: null,
  snapshotId: null,
  itemId: null,
  barcode: null,
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

function extractRoutine(sql, marker) {
  const start = sql.indexOf(marker)
  if (start === -1) return ''
  const open = sql.indexOf('as $$', start)
  const close = sql.indexOf('$$;', open)
  if (open === -1 || close === -1) return ''
  return sql.slice(start, close + 3)
}

function extractPolicy(sql, name) {
  const marker = `create policy ${name}`
  const start = sql.indexOf(marker)
  if (start === -1) return ''
  const close = sql.indexOf(';', start)
  if (close === -1) return ''
  return sql.slice(start, close + 1)
}

function read(relPath) {
  const full = path.join(ROOT, relPath)
  if (!fs.existsSync(full)) fail(`file not found: ${relPath}`)
  return fs.readFileSync(full, 'utf8')
}

async function loadFingerprint() {
  return import(pathToFileURL(path.join(ROOT, FINGERPRINT_MODULE)).href)
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  })
}

function psql(sql, { expectFailure = false, allowFailure = false, label = '' } = {}) {
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
  if (!allowFailure) {
    if (expectFailure && ok) {
      fail(`${label || 'statement'} was expected to fail but succeeded`)
    }
    if (!expectFailure && !ok) {
      fail(`${label || 'statement'} failed: ${(result.stderr || result.stdout || '').trim()}`)
    }
  }

  return {
    ok,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  }
}

function scalar(sql) {
  const noise = /^(INSERT|UPDATE|DELETE|SELECT|CREATE|ALTER|DROP|SET|BEGIN|COMMIT)\b/i
  return psql(sql)
    .stdout.split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !noise.test(line))
    .join('\n')
}

function asRole(role, sql, options = {}) {
  const claims = JSON.stringify({ sub: state.authUserId, role })
  const wrapped = [
    'begin',
    `set local role ${role}`,
    `set local request.jwt.claims = '${claims}'`,
    sql,
    'commit',
  ].join('; ')
  return psql(wrapped, options)
}

function asBuyer(sql, options = {}) {
  return asRole('authenticated', sql, options)
}

function currentFingerprint() {
  const qty = Number(
    scalar(
      `select final_order_qty::text from public.procurement_snapshot_items where id = '${state.itemId}'`
    )
  )
  return computeFingerprint({
    snapshotId: state.snapshotId,
    supplierId: state.supplierId,
    expectedDeliveryDate: '2099-01-15',
    items: [{ barcode: state.barcode, qty }],
  })
}

let computeFingerprint = null
let fingerprintFixtureExpected = null

function generateRpc({
  snapshotId = state.snapshotId,
  supplierId = state.supplierId,
  attemptKey = null,
  fingerprint = undefined,
  deliveryDate = '2099-01-15',
} = {}) {
  const keySql = attemptKey ? `'${attemptKey}'::uuid` : 'null'
  const resolvedFp =
    fingerprint === undefined && attemptKey ? currentFingerprint() : fingerprint
  const fpSql = resolvedFp == null ? 'null' : `'${String(resolvedFp).replace(/'/g, "''")}'`
  return scalar(`
    select public.generate_procurement_orders_from_snapshot(
      '${snapshotId}'::uuid,
      '${deliveryDate}'::date,
      array['${supplierId}'::uuid],
      'verify',
      'Verify',
      ${keySql},
      ${fpSql}
    )::text;
  `)
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    fail(`RPC did not return JSON: ${text}`)
  }
}

function countOrders() {
  return Number(
    scalar(`
      select count(*)::text
      from public.purchase_orders
      where source_snapshot_id = '${state.snapshotId}'
        and workflow_mode = 'analytics'
        and supplier_id = '${state.supplierId}';
    `)
  )
}

function countReceiving() {
  return Number(
    scalar(`
      select count(*)::text
      from public.receiving_documents as d
      join public.purchase_orders as po on po.id = d.purchase_order_id
      where po.source_snapshot_id = '${state.snapshotId}'
        and po.workflow_mode = 'analytics'
        and po.supplier_id = '${state.supplierId}';
    `)
  )
}

function countEmptyOrders() {
  return Number(
    scalar(`
      select count(*)::text
      from public.purchase_orders as po
      where po.source_snapshot_id = '${state.snapshotId}'
        and po.workflow_mode = 'analytics'
        and po.attempt_key is not null
        and not exists (
          select 1 from public.purchase_order_items as i
          where i.purchase_order_id = po.id
        );
    `)
  )
}

function setQty(qty) {
  psql(`
    update public.procurement_snapshot_items
       set final_order_qty = ${qty},
           manual_override = true
     where id = '${state.itemId}';
  `)
}

function countedQty() {
  return Number(
    scalar(`
      select coalesce(sum(i.ordered_qty), 0)::text
      from public.purchase_order_items as i
      join public.purchase_orders as po on po.id = i.purchase_order_id
      where po.source_snapshot_id = '${state.snapshotId}'
        and i.barcode = '${state.barcode}'
        and po.status <> 'cancelled';
    `)
  )
}

async function stageStatic() {
  console.log('Stage 1: Static lint of exact function/policy bodies (no DB)')

  const sql = read(MIGRATION)
  const edge = read(EDGE)
  const client = read(CLIENT)
  const planner = read(PLANNER)
  const fpMod = await loadFingerprint()
  computeFingerprint = fpMod.computeAttemptPayloadFingerprint
  fingerprintFixtureExpected = fpMod.ATTEMPT_FINGERPRINT_FIXTURE.expected
  const generateFn = extractRoutine(
    sql,
    'create function public.generate_procurement_orders_from_snapshot('
  )
  const guardFn = extractRoutine(
    sql,
    'create or replace function public.procurement_snapshot_items_guard_update()'
  )
  const cancelFn = extractRoutine(
    sql,
    'create or replace function public.procurement_cancel_order(p_order_id uuid)'
  )
  const fingerprintFn = extractRoutine(
    sql,
    'create or replace function auth_private.procurement_attempt_fingerprint('
  )
  const updateOrders = extractPolicy(sql, 'purchase_orders_update_simple')
  const insertItems = extractPolicy(sql, 'purchase_order_items_insert_simple')
  const deleteItems = extractPolicy(sql, 'purchase_order_items_delete_simple')
  const updateReceiving = extractPolicy(sql, 'receiving_documents_update_simple')
  const updateReceivingItems = extractPolicy(sql, 'receiving_items_update_simple')

  assert(
    'migration created by supabase migration new timestamp',
    /20260814134910_procurement_repeat_analytics_orders\.sql$/.test(MIGRATION)
  )
  assert(
    'JS fingerprint fixture matches the published spec',
    fpMod.computeAttemptPayloadFingerprint(fpMod.ATTEMPT_FINGERPRINT_FIXTURE) ===
      fingerprintFixtureExpected
  )
  assert(
    'SQL fingerprint builder uses the same canonical spec and qty helper',
    fingerprintFn.includes("'shugyla.procurement.attempt.fp.v1'") &&
      fingerprintFn.includes('auth_private.procurement_canonical_qty(item.qty)') &&
      fingerprintFn.includes('order by item.barcode') &&
      !/md5\s*\(/i.test(fingerprintFn)
  )
  assert('drops the exclusive supplier unique index', sql.includes('drop index if exists public.uq_purchase_orders_snapshot_revision_supplier'))
  assert(
    'attempt_key unique excludes cancelled so a post-cancel reorder can insert',
    /uq_purchase_orders_analytics_attempt_key[\s\S]{0,280}status <> 'cancelled'/.test(sql)
  )
  assert('does not create an allocations table', !/create table[\s\S]*allocation/i.test(sql))
  assert(
    'resets current qty to 0 after generate and keeps override to protect consumed zero from norms',
    generateFn.includes('final_order_qty = 0') &&
      generateFn.includes('manual_override = true') &&
      generateFn.includes('applyNormDaysChange')
  )
  assert(
    'planning qty is no longer locked by generated_purchase_order_id',
    !sql.includes('generated order rows are immutable') &&
      !sql.includes('generated_purchase_order_id is immutable once set')
  )
  assert(
    'item guard reads snapshot status without FOR SHARE (no reverse-lock with generate)',
    guardFn.includes("from public.procurement_snapshots as s") &&
      guardFn.includes('where s.id = new.snapshot_id;') &&
      !/for share/i.test(guardFn)
  )
  assert(
    'generate locks snapshot FOR UPDATE before locking snapshot items',
    generateFn.indexOf('from public.procurement_snapshots') <
      generateFn.indexOf('from public.procurement_snapshot_items as i') &&
      generateFn.includes('from public.procurement_snapshots\n  where id = p_snapshot_id\n  for update;') &&
      generateFn.includes(
        'from public.procurement_snapshot_items as i\n    where i.snapshot_id = p_snapshot_id\n      and i.platform_supplier_id = v_supplier.supplier_id\n    for update;'
      )
  )
  assert(
    'generate accumulates this-attempt order ids inside the supplier loop',
    generateFn.includes('v_order_ids uuid[] := \'{}\';') &&
      generateFn.includes('v_order_ids := array_append(v_order_ids, v_order_id);') &&
      generateFn.includes('v_order_ids := array_append(v_order_ids, v_existing.id);') &&
      !/array_agg\(po\.id/.test(generateFn)
  )
  assert(
    'explicit attempt_key requires the client fingerprint with no nullable hole',
    generateFn.includes("raise exception 'attempt_key requires payload fingerprint'") &&
      generateFn.includes(
        'if p_attempt_key is not null and v_client_fp is distinct from v_server_fp then'
      ) &&
      generateFn.includes(
        'and v_client_fp is distinct from v_existing.generation_payload_fingerprint'
      )
  )
  assert(
    'legacy lookup skips cancelled orders',
    generateFn.includes("and po.status <> 'cancelled'")
  )
  assert(
    'cancel restores consumed planning qty and clears a cancelled pointer',
    cancelFn.includes('final_order_qty = poi.ordered_qty') &&
      cancelFn.includes('generated_purchase_order_id = null')
  )
  assert(
    'table UPDATE is revoked and attempt_key is not in the column re-grant',
    sql.includes('revoke insert, update on table public.purchase_orders from authenticated') &&
      /grant update \([\s\S]*receiving_document_id[\s\S]*updated_at\n\) on table public.purchase_orders/.test(
        sql
      ) &&
      !/grant update \([\s\S]*attempt_key[\s\S]*\) on table public.purchase_orders/.test(sql)
  )
  assert(
    'purchase_orders_update_simple body is simple-only with WITH CHECK',
    updateOrders ===
      `create policy purchase_orders_update_simple
  on public.purchase_orders
  for update
  to authenticated
  using (
    auth_private.current_employee_is_active()
    and workflow_mode = 'simple'
  )
  with check (
    auth_private.current_employee_is_active()
    and workflow_mode = 'simple'
    and attempt_key is null
    and source_snapshot_id is null
    and generation_payload_fingerprint is null
  );`
  )
  assert(
    'broad analytics UPDATE policies are dropped, not recreated',
    sql.includes('drop policy if exists purchase_orders_update_active_employee') &&
      !/create policy purchase_orders_update_active_employee/.test(sql)
  )
  assert(
    'purchase_order_items_insert_simple body is simple-only',
    insertItems ===
      `create policy purchase_order_items_insert_simple
  on public.purchase_order_items
  for insert
  to authenticated
  with check (
    auth_private.current_employee_is_active()
    and auth_private.purchase_order_is_simple(purchase_order_id)
  );`
  )
  assert(
    'purchase_order_items_delete_simple body is simple-only',
    deleteItems ===
      `create policy purchase_order_items_delete_simple
  on public.purchase_order_items
  for delete
  to authenticated
  using (
    auth_private.current_employee_is_active()
    and auth_private.purchase_order_is_simple(purchase_order_id)
  );`
  )
  assert(
    'analytics items insert/delete no longer allow draft bypass',
    sql.includes('drop policy if exists purchase_order_items_insert_simple_or_analytics_draft') &&
      sql.includes('drop function if exists auth_private.purchase_order_analytics_draft(uuid);') &&
      !/create policy purchase_order_items_insert_simple_or_analytics_draft/.test(sql) &&
      !/create or replace function auth_private.purchase_order_analytics_draft/.test(sql)
  )
  assert(
    'receiving_documents_update_simple body is simple-only; warehouse keeps RPC path',
    updateReceiving ===
      `create policy receiving_documents_update_simple
  on public.receiving_documents
  for update
  to authenticated
  using (
    auth_private.current_employee_is_active()
    and workflow_mode = 'simple'
  )
  with check (
    auth_private.current_employee_is_active()
    and workflow_mode = 'simple'
  );` &&
      !/create policy receiving_documents_update_active_employee/.test(sql)
  )
  assert(
    'receiving_items_update_simple body is simple-only',
    updateReceivingItems ===
      `create policy receiving_items_update_simple
  on public.receiving_items
  for update
  to authenticated
  using (
    auth_private.current_employee_is_active()
    and auth_private.receiving_document_is_simple(receiving_document_id)
  )
  with check (
    auth_private.current_employee_is_active()
    and auth_private.receiving_document_is_simple(receiving_document_id)
  );`
  )
  assert(
    'backfill is partitioned and skips a live holder of the legacy key',
    sql.includes('Invariant: at most one non-cancelled analytics order per legacy key') &&
      sql.includes('row_number() over (') &&
      sql.includes('inner_po.id asc') &&
      sql.includes('and other.attempt_key = ranked.legacy_key')
  )
  assert('working snapshot includes generated', sql.includes("'ready', 'partially_generated', 'generated'"))
  assert(
    'legacy clients get a stable per-supplier key',
    sql.includes('procurement_legacy_attempt_key') &&
      sql.includes('p_attempt_key uuid default null')
  )
  assert('same key with a different payload is an explicit conflict', generateFn.includes('attempt_key payload conflict'))
  assert('refuses empty orders', generateFn.includes('cannot create an order without items'))
  assert(
    'new generate signature keeps service_role-only execute',
    sql.includes(
      'grant execute on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text, uuid, text) to service_role'
    ) &&
      sql.includes(
        'revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text, uuid, text) from authenticated'
      )
  )
  assert('does not use auth.role()', !/auth\.role\s*\(/.test(sql))
  assert(
    'USING and WITH CHECK are both present on snapshot item updates',
    /create policy procurement_snapshot_items_update_edit[\s\S]*using \([\s\S]*with check \(/s.test(sql)
  )
  assert(
    'SECURITY DEFINER generate pins search_path',
    /create function public\.generate_procurement_orders_from_snapshot\([\s\S]*security definer\s*set search_path = ''/s.test(
      generateFn
    )
  )
  assert(
    'Edge requires fingerprint with attemptKey and forwards both',
    edge.includes('p_attempt_key: attemptKey || null') &&
      edge.includes('p_payload_fingerprint: payloadFingerprint || null') &&
      edge.includes('attemptKey && !payloadFingerprint')
  )
  assert('Edge maps payload conflict to 409', edge.includes("'ATTEMPT_CONFLICT'"))
  assert(
    'service API accepts attemptKey without blocking on generatedPurchaseOrderId',
    client.includes('attemptKey = ') &&
      client.includes('fetchSnapshotSkuOrderHistory') &&
      client.includes('countsAsOrdered') &&
      client.includes('fetchSnapshotAttemptItems')
  )
  assert(
    'page load attaches batched SKU history, not a per-row N+1',
    client.includes('unassignedOnly = false') &&
      client.includes(".is('platform_supplier_id', null)") &&
      client.includes('fetchSnapshotSkuOrderAggregates') &&
      client.includes('foldCountedSkuOrderAggregates') &&
      client.includes('orderedQtyTotal') &&
      client.includes('orderedDocumentCount') &&
      client.includes(".neq('purchase_orders.status', 'cancelled')") &&
      client.includes(".in('barcode', chunk)")
  )
  assert(
    'old clients can still omit attemptKey, but an explicit key always carries a fingerprint',
    client.includes('...(attemptKey ? { attemptKey, payloadFingerprint } : {})') &&
      client.includes('if (attemptKey && !payloadFingerprint)')
  )
  assert(
    'planner never toasts a created-0 order with a foreign id',
    planner.includes('result.nothingToOrder') &&
      planner.includes('result.idempotentReplay') &&
      !planner.includes('itemsOrdered || selectedSupplierSummary')
  )

  console.log('')
}

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

  const applied = scalar(`
    select count(*)::text
    from supabase_migrations.schema_migrations
    where version = '20260814134910';
  `)
  if (applied !== '1') {
    fail('migration 20260814134910 is not applied locally — run `npx supabase migration up --local`')
  }
  pass('repeat-orders migration is applied')
  console.log('')
}

function stageIntrospection() {
  console.log('Stage 3: Live function overloads and grants')

  const args = scalar(`
    select string_agg(pg_get_function_identity_arguments(p.oid), ' | ' order by pg_get_function_identity_arguments(p.oid))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'generate_procurement_orders_from_snapshot';
  `)
  assert(
    'public generate overloads are the guarded 7-arg and deprecated 4-arg',
    args.includes('p_attempt_key uuid') &&
      args.includes('p_payload_fingerprint text') &&
      !args.includes('selected_unsafe') &&
      args.split(' | ').length === 2,
    args
  )

  const unsafe = scalar(`
    select count(*)::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'generate_procurement_orders_from_snapshot_selected_unsafe';
  `)
  assert('unguarded selected_unsafe implementation is gone', unsafe === '0', unsafe)

  const executeRoles = scalar(`
    select coalesce(string_agg(role_name, ',' order by role_name), '')
    from (
      select unnest(array['anon', 'authenticated', 'service_role']) as role_name
    ) roles
    where has_function_privilege(
      role_name,
      'public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text, uuid, text)',
      'EXECUTE'
    );
  `)
  assert('only service_role may execute generate', executeRoles === 'service_role', executeRoles)

  const uniqueIdx = scalar(`
    select (count(*) filter (where indexname = 'uq_purchase_orders_analytics_attempt_key'))::text
           || '|' ||
           (count(*) filter (where indexname = 'uq_purchase_orders_snapshot_revision_supplier'))::text
    from pg_indexes
    where schemaname = 'public';
  `)
  assert('attempt_key unique exists and old supplier unique is gone', uniqueIdx === '1|0', uniqueIdx)

  const definer = scalar(`
    select p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'generate_procurement_orders_from_snapshot'
      and pg_get_function_identity_arguments(p.oid) like '%p_attempt_key%';
  `)
  assert('generate is security definer with pinned search_path', definer.startsWith('true|') && definer.includes('search_path='), definer)

  const fpLive = scalar(`
    select auth_private.procurement_attempt_fingerprint(
      '11111111-1111-4111-8111-111111111111'::uuid,
      '22222222-2222-4222-8222-222222222222'::uuid,
      '2026-08-14'::date,
      '[{"barcode":"0002","qty":2.5},{"barcode":"0001","qty":10},{"barcode":"skip","qty":0}]'::jsonb
    );
  `)
  assert(
    'live SQL fingerprint matches the shared JS fixture byte-for-byte',
    fpLive === fingerprintFixtureExpected,
    JSON.stringify({ fpLive, fingerprintFixtureExpected })
  )

  console.log('')
}

function stageFixtures() {
  console.log('Stage 4: Fixtures')

  state.employeeId = Number(scalar('select coalesce(max(id), 0) + 1 from public.academy_users;'))
  state.barcode = `REPEAT-${state.runId}`

  psql(`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
    )
    values (
      '${state.authUserId}',
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'repeat-verify-${state.runId}@local.test',
      crypt('verify-only', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      false,
      false
    );
  `, { label: 'insert fixture auth user' })
  state.cleanupNeeded = true

  psql(`
    insert into public.academy_users (id, login, first_name, last_name, full_name, role, status, auth_user_id)
    values (
      ${state.employeeId},
      'repeat-verify-${state.runId}',
      'Repeat', 'Verify', 'Repeat Verify',
      'admin', 'active', '${state.authUserId}'
    );
  `, { label: 'insert fixture employee' })

  state.supplierId = scalar(`
    insert into public.platform_suppliers (name, status)
    values ('Repeat supplier ${state.runId}', 'active')
    returning id;
  `)

  state.snapshotId = scalar(`
    insert into public.procurement_snapshots (status, period_from, period_to, synced_at, revision)
    values ('ready', current_date - 56, current_date, now(), 1)
    returning id;
  `)

  state.itemId = scalar(`
    insert into public.procurement_snapshot_items
      (snapshot_id, barcode, product_name, platform_supplier_id, umag_supplier_name,
       calculation_stock, avg_daily, purchase_price, norm_days, recommended_qty, final_order_qty, manual_override)
    values (
      '${state.snapshotId}', '${state.barcode}', 'Repeat milk', '${state.supplierId}',
      'Repeat supplier', 10, 2, 100, 14, 18, 7, true
    )
    returning id;
  `)

  pass(`snapshot ${state.snapshotId} / item ${state.itemId}`)
  console.log('')
}

function stageGenerateContract() {
  console.log('Stage 5: Generate / retry / cancel')

  const key1 = crypto.randomUUID()
  const key2 = crypto.randomUUID()
  const first = parseJson(generateRpc({ attemptKey: key1 }))
  assert('first generate creates one order', first.orders_created === 1, JSON.stringify(first))
  assert('first generate writes items', first.items_ordered === 1, JSON.stringify(first))
  const firstOrderId = first.purchase_order_ids?.[0]
  assert('first generate returns this-attempt order id', Boolean(firstOrderId), JSON.stringify(first))
  assert(
    'this-attempt response does not list every snapshot order',
    Array.isArray(first.purchase_order_ids) && first.purchase_order_ids.length === 1,
    JSON.stringify(first)
  )

  const missingFp = psql(
    `select public.generate_procurement_orders_from_snapshot(
      '${state.snapshotId}'::uuid,
      '2099-01-15'::date,
      array['${state.supplierId}'::uuid],
      'verify',
      'Verify',
      '${crypto.randomUUID()}'::uuid,
      null
    );`,
    { expectFailure: true, label: 'attempt key without fingerprint' }
  )
  assert(
    'explicit attempt_key without fingerprint is rejected',
    /attempt_key requires payload fingerprint/i.test(missingFp.stderr + missingFp.stdout),
    missingFp.stderr || missingFp.stdout
  )
  assert('qty resets to 0 after success', scalar(`select final_order_qty::numeric(14,0)::text from public.procurement_snapshot_items where id = '${state.itemId}'`) === '0')
  assert('one analytics order after first generate', countOrders() === 1)
  assert('one receiving document after first generate', countReceiving() === 1)

  const replay = parseJson(generateRpc({ attemptKey: key1, fingerprint: first.payload_fingerprint }))
  assert('same attempt_key is a replay', replay.idempotent_replay === true && replay.orders_created === 0, JSON.stringify(replay))
  assert(
    'replay returns the original order id from this attempt',
    replay.purchase_order_ids?.[0] === firstOrderId,
    JSON.stringify(replay)
  )
  assert('retry does not spawn a second order', countOrders() === 1)

  const conflict = psql(
    `select public.generate_procurement_orders_from_snapshot(
      '${state.snapshotId}'::uuid,
      '2099-01-15'::date,
      array['${state.supplierId}'::uuid],
      'verify',
      'Verify',
      '${key1}'::uuid,
      'shugyla.procurement.attempt.fp.v1\nsnapshot=${state.snapshotId}\nsupplier=${state.supplierId}\ndate=2099-01-15\n${state.barcode}=99'
    );`,
    { expectFailure: true, label: 'same key different fingerprint' }
  )
  assert(
    'same key with a different payload is a conflict',
    /attempt_key payload conflict/i.test(conflict.stderr + conflict.stdout),
    conflict.stderr || conflict.stdout
  )

  setQty(4)
  const second = parseJson(generateRpc({ attemptKey: key2 }))
  assert('new attempt_key creates a second order', second.orders_created === 1, JSON.stringify(second))
  const secondOrderId = second.purchase_order_ids?.[0]
  assert(
    'second attempt response points to the second order, not the first',
    Boolean(secondOrderId) &&
      secondOrderId !== firstOrderId &&
      (second.purchase_order_ids || []).length === 1,
    JSON.stringify({ firstOrderId, second })
  )
  assert('two sequential generates produce two orders', countOrders() === 2)
  assert('two sequential generates produce two receiving documents', countReceiving() === 2)
  assert('no empty orders after sequential generates', countEmptyOrders() === 0)
  assert('counted ordered qty is 7 + 4', countedQty() === 11)

  asBuyer(`select public.procurement_cancel_order('${firstOrderId}'::uuid)`)
  assert('cancelled order is excluded from counted qty', countedQty() === 4)
  assert('cancelled order is still readable', scalar(`select status from public.purchase_orders where id = '${firstOrderId}'`) === 'cancelled')
  assert(
    'cancelling an order that is no longer the live pointer does not clobber the next draft',
    scalar(`select final_order_qty::numeric(14,0)::text from public.procurement_snapshot_items where id = '${state.itemId}'`) === '0'
  )

  setQty(3)
  const afterCancel = parseJson(generateRpc({ attemptKey: crypto.randomUUID() }))
  assert('a new key after cancel creates another order', afterCancel.orders_created === 1, JSON.stringify(afterCancel))
  assert('three orders exist after cancel + reorder', countOrders() === 3)

  const remaining = secondOrderId
  psql(`update public.purchase_orders set status = 'draft' where id = '${remaining}';`)
  assert('draft still counts as ordered', countedQty() === 7)
  psql(`update public.purchase_orders set status = 'received' where id = '${remaining}';`)
  assert('received still counts as ordered', countedQty() === 7)

  const legacyKey = scalar(`
    select auth_private.procurement_legacy_attempt_key(
      '${state.snapshotId}'::uuid,
      1,
      '${state.supplierId}'::uuid
    )::text;
  `)
  setQty(9)
  const legacyFirst = parseJson(generateRpc({ attemptKey: null }))
  assert('legacy generate without attempt_key creates an order', legacyFirst.orders_created === 1, JSON.stringify(legacyFirst))
  const afterLegacy = countOrders()
  const legacyRetry = parseJson(generateRpc({ attemptKey: null }))
  assert(
    'legacy retry without attempt_key does not spawn another order',
    legacyRetry.orders_created === 0 && countOrders() === afterLegacy,
    JSON.stringify(legacyRetry)
  )
  assert('legacy key is stored on the spawned-safe order', scalar(`
    select count(*)::text
    from public.purchase_orders
    where source_snapshot_id = '${state.snapshotId}'
      and attempt_key = '${legacyKey}'::uuid
      and status <> 'cancelled';
  `) === '1')

  const legacyOrderId = legacyFirst.purchase_order_ids?.[0]
  asBuyer(`select public.procurement_cancel_order('${legacyOrderId}'::uuid)`)
  assert(
    'cancel restores consumed qty when the pointer still belongs to that order',
    scalar(`select final_order_qty::numeric(14,0)::text from public.procurement_snapshot_items where id = '${state.itemId}'`) === '9'
  )
  const legacyAfterCancel = parseJson(generateRpc({ attemptKey: null }))
  assert(
    'legacy client can create a new order after cancel instead of replaying the cancelled one',
    legacyAfterCancel.orders_created === 1 &&
      legacyAfterCancel.purchase_order_ids?.[0] !== legacyOrderId,
    JSON.stringify(legacyAfterCancel)
  )

  const historicId = scalar(`
    insert into public.purchase_orders (
      supplier_id, supplier_name, status, purchase_date, workflow_mode,
      source_snapshot_id, source_snapshot_revision
    ) values (
      '${state.supplierId}', 'Historic', 'awaiting_receiving', current_date, 'analytics',
      '${state.snapshotId}', 1
    )
    returning id;
  `)
  assert(
    'historical analytics orders without attempt_key remain readable',
    scalar(`select (attempt_key is null)::text from public.purchase_orders where id = '${historicId}'`) === 'true'
  )

  console.log('')
}

function psqlPromise(sql) {
  return new Promise((resolve) => {
    const child = spawn(
      'docker',
      ['exec', '-i', state.container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A'],
      { cwd: ROOT }
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (code) => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() })
    })
    child.stdin.write(sql)
    child.stdin.end()
  })
}

async function stageConcurrency() {
  console.log('Stage 6: Concurrent attempts')

  const sameKey = crypto.randomUUID()
  const beforeSame = countOrders()
  setQty(5)
  const sameFp = currentFingerprint().replace(/'/g, "''")
  const sameResults = await Promise.all([
    psqlPromise(`
      select public.generate_procurement_orders_from_snapshot(
        '${state.snapshotId}'::uuid, '2099-01-15'::date,
        array['${state.supplierId}'::uuid], 'verify', 'Verify',
        '${sameKey}'::uuid, '${sameFp}'
      );
    `),
    psqlPromise(`
      select public.generate_procurement_orders_from_snapshot(
        '${state.snapshotId}'::uuid, '2099-01-15'::date,
        array['${state.supplierId}'::uuid], 'verify', 'Verify',
        '${sameKey}'::uuid, '${sameFp}'
      );
    `),
  ])
  const sameOk = sameResults.filter((result) => result.code === 0)
  assert('concurrent same attempt_key calls both complete or one replays', sameOk.length === 2, JSON.stringify(sameResults))
  assert('concurrent same attempt_key creates exactly one extra order', countOrders() === beforeSame + 1)
  assert('concurrent same key did not create an empty order', countEmptyOrders() === 0)

  const keyA = crypto.randomUUID()
  const keyB = crypto.randomUUID()
  setQty(6)
  const firstDifferent = parseJson(generateRpc({ attemptKey: keyA }))
  assert('first of separately entered qty creates an order', firstDifferent.orders_created === 1)
  setQty(2)
  const beforeRace = countOrders()
  const raceFp = currentFingerprint().replace(/'/g, "''")
  const raced = await Promise.all([
    psqlPromise(`
      select public.generate_procurement_orders_from_snapshot(
        '${state.snapshotId}'::uuid, '2099-01-15'::date,
        array['${state.supplierId}'::uuid], 'verify', 'Verify',
        '${keyB}'::uuid, '${raceFp}'
      );
    `),
    psqlPromise(`
      select public.generate_procurement_orders_from_snapshot(
        '${state.snapshotId}'::uuid, '2099-01-15'::date,
        array['${state.supplierId}'::uuid], 'verify', 'Verify',
        '${crypto.randomUUID()}'::uuid, '${raceFp}'
      );
    `),
  ])
  const racedOk = raced.filter((result) => result.code === 0)
  assert('concurrent different keys with current qty both return', racedOk.length === 2, JSON.stringify(raced))
  assert(
    'concurrent different keys on the same qty create at most one extra order',
    countOrders() === beforeRace + 1,
    `orders=${countOrders()} before=${beforeRace}`
  )
  assert('no zero-item analytics order after concurrent different keys', countEmptyOrders() === 0)
  assert('separately entered qty produced two additional orders across the sequence', beforeRace === beforeSame + 2)

  setQty(3)
  const lockKey = crypto.randomUUID()
  const lockFp = currentFingerprint().replace(/'/g, "''")
  const lockRace = await Promise.all([
    psqlPromise(`
      select public.generate_procurement_orders_from_snapshot(
        '${state.snapshotId}'::uuid, '2099-01-15'::date,
        array['${state.supplierId}'::uuid], 'verify', 'Verify',
        '${lockKey}'::uuid, '${lockFp}'
      );
    `),
    psqlPromise(`
      update public.procurement_snapshot_items
         set final_order_qty = 4
       where id = '${state.itemId}';
    `),
  ])
  const deadlock = lockRace.some((result) =>
    /deadlock detected|lock timeout|canceling statement due to lock timeout/i.test(
      `${result.stderr}\n${result.stdout}`
    )
  )
  assert(
    'qty update does not deadlock against generate after removing snapshot FOR SHARE',
    !deadlock &&
      lockRace[1].code === 0 &&
      (lockRace[0].code === 0 ||
        /attempt_key payload conflict|cannot create an order without items/i.test(lockRace[0].stderr)),
    JSON.stringify(lockRace)
  )

  console.log('')
}

function stageRlsAndSimple() {
  console.log('Stage 7: RLS and simple workflow')

  const analyticsInsert = asBuyer(
    `insert into public.purchase_orders (supplier_name, status, purchase_date, workflow_mode)
     values ('blocked-analytics-${state.runId}', 'draft', current_date, 'analytics')`,
    { expectFailure: true, label: 'direct analytics insert' }
  )
  assert(
    'authenticated cannot insert analytics purchase orders',
    /row-level security|permission denied/i.test(analyticsInsert.stderr + analyticsInsert.stdout),
    analyticsInsert.stderr || analyticsInsert.stdout
  )

  asBuyer(
    `insert into public.purchase_orders (supplier_name, status, purchase_date, workflow_mode)
     values ('simple-${state.runId}', 'draft', current_date, 'simple')`,
    { label: 'simple purchase insert' }
  )
  const simpleId = scalar(
    `select id from public.purchase_orders where supplier_name = 'simple-${state.runId}'`
  )
  assert('simple workflow insert is allowed', Boolean(simpleId))

  asBuyer(
    `insert into public.purchase_order_items (purchase_order_id, product_name, barcode, ordered_qty)
     values ('${simpleId}', 'Simple milk', 'SIMPLE-${state.runId}', 2)`,
    { label: 'simple item insert' }
  )
  assert(
    'simple items can be written',
    scalar(`select count(*)::text from public.purchase_order_items where purchase_order_id = '${simpleId}'`) === '1'
  )

  const liveAnalyticsId = scalar(`
    select id from public.purchase_orders
    where source_snapshot_id = '${state.snapshotId}'
      and workflow_mode = 'analytics'
      and status = 'awaiting_receiving'
    order by created_at desc
    limit 1;
  `)
  const analyticsItem = asBuyer(
    `insert into public.purchase_order_items (purchase_order_id, product_name, barcode, ordered_qty)
     values ('${liveAnalyticsId}', 'Forged', 'FORGED-${state.runId}', 99)`,
    { expectFailure: true, label: 'direct analytics item insert' }
  )
  assert(
    'authenticated cannot append items to a live analytics order',
    /row-level security|permission denied/i.test(analyticsItem.stderr + analyticsItem.stdout),
    analyticsItem.stderr || analyticsItem.stdout
  )

  asBuyer(
    `delete from public.purchase_orders where id = '${liveAnalyticsId}'`,
    { allowFailure: true, label: 'direct analytics delete' }
  )
  assert(
    'authenticated cannot delete analytics orders',
    scalar(`select count(*)::text from public.purchase_orders where id = '${liveAnalyticsId}'`) === '1'
  )

  asBuyer(
    `update public.purchase_orders set status = 'draft' where id = '${liveAnalyticsId}'`,
    { allowFailure: true, label: 'direct analytics status flip' }
  )
  assert(
    'authenticated cannot flip analytics orders to draft',
    scalar(`select status from public.purchase_orders where id = '${liveAnalyticsId}'`) !== 'draft'
  )
  assert(
    'attempt_key is not updatable by authenticated',
    scalar(`
      select has_column_privilege('authenticated', 'public.purchase_orders', 'attempt_key', 'UPDATE')::text
    `) === 'false'
  )
  assert(
    'payload fingerprint is not updatable by authenticated',
    scalar(`
      select has_column_privilege('authenticated', 'public.purchase_orders', 'generation_payload_fingerprint', 'UPDATE')::text
    `) === 'false'
  )
  assert(
    'source_snapshot_id is not updatable by authenticated',
    scalar(`
      select has_column_privilege('authenticated', 'public.purchase_orders', 'source_snapshot_id', 'UPDATE')::text
    `) === 'false'
  )

  const analyticsItemCountBefore = scalar(
    `select count(*)::text from public.purchase_order_items where purchase_order_id = '${liveAnalyticsId}'`
  )
  asBuyer(
    `delete from public.purchase_order_items where purchase_order_id = '${liveAnalyticsId}'`,
    { allowFailure: true, label: 'direct analytics item delete' }
  )
  assert(
    'authenticated cannot delete analytics order items',
    scalar(
      `select count(*)::text from public.purchase_order_items where purchase_order_id = '${liveAnalyticsId}'`
    ) === analyticsItemCountBefore && analyticsItemCountBefore !== '0'
  )

  const receivingId = scalar(`
    select id from public.receiving_documents
    where purchase_order_id = '${liveAnalyticsId}'
    limit 1;
  `)
  asBuyer(
    `update public.receiving_documents set comment = 'forged' where id = '${receivingId}'`,
    { allowFailure: true, label: 'direct analytics receiving update' }
  )
  assert(
    'authenticated cannot mutate analytics receiving documents',
    scalar(`select coalesce(comment, '') from public.receiving_documents where id = '${receivingId}'`) !== 'forged'
  )

  const receivingInsert = asBuyer(
    `insert into public.receiving_documents (purchase_order_id, supplier_name, status, workflow_mode)
     values ('${liveAnalyticsId}', 'forged', 'awaiting_receiving', 'analytics')`,
    { expectFailure: true, label: 'direct analytics receiving insert' }
  )
  assert(
    'authenticated cannot insert analytics receiving documents',
    /row-level security|permission denied/i.test(receivingInsert.stderr + receivingInsert.stdout),
    receivingInsert.stderr || receivingInsert.stdout
  )

  asBuyer(
    `update public.receiving_items set comment = 'forged' where receiving_document_id = '${receivingId}'`,
    { allowFailure: true, label: 'direct analytics receiving item update' }
  )
  assert(
    'authenticated cannot mutate analytics receiving items',
    scalar(`
      select count(*)::text from public.receiving_items
      where receiving_document_id = '${receivingId}' and coalesce(comment, '') = 'forged'
    `) === '0'
  )

  const receivingItemInsert = asBuyer(
    `insert into public.receiving_items (receiving_document_id, product_name, ordered_qty)
     values ('${receivingId}', 'Forged', 1)`,
    { expectFailure: true, label: 'direct analytics receiving item insert' }
  )
  assert(
    'authenticated cannot insert analytics receiving items',
    /row-level security|permission denied/i.test(receivingItemInsert.stderr + receivingItemInsert.stdout),
    receivingItemInsert.stderr || receivingItemInsert.stdout
  )

  asBuyer(
    `update public.purchase_orders set comment = 'simple-ok' where id = '${simpleId}'`,
    { label: 'simple purchase update' }
  )
  assert(
    'simple workflow update is allowed',
    scalar(`select comment from public.purchase_orders where id = '${simpleId}'`) === 'simple-ok'
  )

  asBuyer(
    `update public.procurement_snapshot_items set final_order_qty = 1 where id = '${state.itemId}'`,
    { label: 'buyer edits next qty' }
  )
  assert(
    'buyer can enter the next quantity after previous orders',
    scalar(`select final_order_qty::numeric(14,0)::text from public.procurement_snapshot_items where id = '${state.itemId}'`) === '1'
  )

  const factEdit = asBuyer(
    `update public.procurement_snapshot_items set calculation_stock = 1 where id = '${state.itemId}'`,
    { expectFailure: true, label: 'fact column edit' }
  )
  assert(
    'fact columns remain immutable',
    /fact columns are immutable|permission denied|row-level security/i.test(factEdit.stderr + factEdit.stdout)
  )

  console.log('')
}

function cleanup() {
  if (!state.container || !state.cleanupNeeded) return
  try {
    if (state.snapshotId) {
      psql(`
        delete from public.receiving_documents
        where purchase_order_id in (
          select id from public.purchase_orders where source_snapshot_id = '${state.snapshotId}'
        );
      `)
      psql(`delete from public.purchase_orders where source_snapshot_id = '${state.snapshotId}';`)
      psql(`delete from public.purchase_orders where supplier_name in ('simple-${state.runId}', 'Historic', 'blocked-analytics-${state.runId}');`)
      psql(`delete from public.procurement_snapshots where id = '${state.snapshotId}';`)
    }
    if (state.supplierId) {
      psql(`delete from public.platform_suppliers where id = '${state.supplierId}';`)
    }
    if (state.employeeId) {
      psql(`delete from public.academy_users where id = ${state.employeeId};`)
    }
    if (state.authUserId) {
      psql(`delete from auth.users where id = '${state.authUserId}';`)
    }
    console.log('Fixtures removed.\n')
  } catch (error) {
    console.warn(`⚠ cleanup incomplete: ${error.message}`)
  }
}

async function main() {
  console.log('=== Repeat analytics purchase orders verification ===\n')
  try {
    await stageStatic()
    if (STATIC_ONLY) {
      console.log(`Static checks only (${checks} passed). Run without --static-only against local Supabase.\n`)
      return
    }
    stageEnvironment()
    stageIntrospection()
    stageFixtures()
    stageGenerateContract()
    await stageConcurrency()
    stageRlsAndSimple()
    console.log(`=== All ${checks} checks passed ===\n`)
  } finally {
    cleanup()
  }
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}\n`)
  process.exit(1)
})
