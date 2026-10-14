#!/usr/bin/env node
/**
 * Verification: saving a single supplier must not trigger a full platform
 * reload, and obligation terms must be refreshed in batched writes.
 *
 * Measured on prod 2026-10-14: updateSupplier -> refreshData() re-fetched every
 * module (16 sequential purchase_order_items requests) and took ~15 s.
 *
 * Usage:
 *   npm run verify:supplier-save-no-full-reload
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

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const fnBody = (src, name) => {
  const start = src.indexOf(`export async function ${name}(`)
  if (start < 0) throw new Error(`function not found: ${name}`)
  const next = src.indexOf('\nexport ', start + 10)
  return src.slice(start, next < 0 ? undefined : next)
}

const service = read('src/services/platformDataService.js')
const adapter = read('src/services/suppliersSupabaseAdapter.js')
const obligations = read('src/services/supplierPaymentObligationsService.js')

console.log('platformDataService: supplier writes patch the cache')
for (const name of ['updateSupplier', 'deleteSupplier', 'archiveSupplier']) {
  const body = fnBody(service, name)
  assert(`${name} patches cache first`, /replaceCachedSupplier|removeCachedSupplier/.test(body))
  assert(`${name} reloads everything only as a fallback`, /!(replace|remove)CachedSupplier\([^)]*\)\) await refreshData\(\)/.test(body))
}

console.log('suppliersSupabaseAdapter: update returns the saved row')
const upd = fnBody(adapter, 'updateSupplier')
assert('update selects the saved row', /\.select\('\*'\)/.test(upd))
assert('update returns mapped supplier', /return row \? rowToSupplier\(row\) : null/.test(upd))
assert('archive returns the update result', /return updateSupplier\(supplierId, \{ status: SUPPLIER_STATUS\.ARCHIVED \}\)/.test(adapter))

console.log('refreshObligationTermsForSupplier: batched, parallel writes')
const refresh = fnBody(obligations, 'refreshObligationTermsForSupplier')
assert('groups rows by identical patch', /groups\.set\(key/.test(refresh))
assert('writes a group with .in(id, chunk)', /\.in\('id', chunk\)/.test(refresh))
assert('groups are written in parallel', /Promise\.all\(writes\)/.test(refresh))
assert('no per-row .eq(id) update loop', !/\.eq\('id', row\.id\)/.test(refresh))
assert('paid rows are still excluded', /\.is\('platform_paid_at', null\)/.test(refresh))
assert('platform_paid_at is never written', !/platform_paid_at:/.test(refresh))

console.log(`\nOK — ${checks} checks`)
