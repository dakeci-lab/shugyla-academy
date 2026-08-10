#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATION = 'supabase/migrations/20260810160315_procurement_partial_supplier_generation.sql'
const EDGE = 'supabase/functions/umag-procurement/index.ts'

let passed = 0

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function assert(label, condition) {
  if (!condition) throw new Error(label)
  passed += 1
  console.log(`  ✓ ${label}`)
}

function main() {
  const sql = read(MIGRATION)
  const edge = read(EDGE)

  console.log('Procurement partial supplier generation\n')

  assert(
    'snapshot lifecycle includes partially_generated',
    sql.includes("'partially_generated', 'generated'")
  )
  assert(
    'purchase orders keep snapshot lineage',
    sql.includes('source_snapshot_id uuid') &&
      sql.includes('source_snapshot_revision integer')
  )
  assert(
    'legacy generated orders are backfilled without deletion',
    sql.includes('with legacy_links as') &&
      sql.includes('generated_purchase_order_id as purchase_order_id') &&
      !/delete\s+from\s+public\.purchase_orders/i.test(sql)
  )
  assert(
    'supplier order uniqueness is database-enforced',
    sql.includes('create unique index if not exists uq_purchase_orders_snapshot_revision_supplier')
  )
  assert(
    'selected-supplier RPC accepts uuid array',
    /generate_procurement_orders_from_snapshot\(\s*p_snapshot_id uuid,\s*p_expected_delivery_date date,\s*p_supplier_ids uuid\[\]/s.test(sql)
  )
  assert(
    'generation only reads ungenerated rows',
    /i\.generated_purchase_order_id is null[\s\S]*cardinality\(v_requested_supplier_ids\)/.test(sql)
  )
  assert(
    'generated rows are linked atomically',
    sql.includes('generated_purchase_order_id = v_order_id')
  )
  assert(
    'snapshot becomes partial while suppliers remain',
    /v_has_generated and v_has_remaining[\s\S]*v_next_status := 'partially_generated'/.test(sql)
  )
  assert(
    'working snapshot allows only ungenerated row edits',
    sql.includes("s.status in ('ready', 'partially_generated')") &&
      sql.includes('procurement_snapshot_items.generated_purchase_order_id is null')
  )
  assert(
    'norm recalculation skips generated order rows',
    /set_procurement_norm_rule_for_snapshot[\s\S]*i\.generated_purchase_order_id is null/.test(sql)
  )
  assert(
    'new privileged RPC is service_role-only',
    sql.includes(
      'grant execute on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text) to service_role'
    ) &&
      sql.includes(
        'revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text) from authenticated'
      )
  )
  assert(
    'legacy RPC signature delegates to idempotent implementation',
    /null::uuid\[\][\s\S]*p_created_by[\s\S]*p_created_by_name/.test(sql)
  )

  assert(
    'Edge accepts singular or multiple supplier selection',
    edge.includes('body.supplierId') && edge.includes('body.supplierIds')
  )
  assert(
    'Edge validates supplier UUIDs and size',
    edge.includes('UUID_PATTERN') && edge.includes('MAX_GENERATE_SUPPLIERS')
  )
  assert(
    'Edge passes supplier selection to RPC',
    edge.includes('p_supplier_ids: supplierIds.length > 0 ? supplierIds : null')
  )
  assert(
    'Edge keeps create and transfer permission checks',
    edge.includes('authz.permissions[PERMISSION_CREATE] !== true') &&
      edge.includes('authz.permissions[PERMISSION_TRANSFER] !== true')
  )

  console.log(`\nPassed ${passed}/16`)
}

try {
  main()
} catch (error) {
  console.error(`\nFAILED after ${passed}/16: ${error.message}`)
  process.exit(1)
}
