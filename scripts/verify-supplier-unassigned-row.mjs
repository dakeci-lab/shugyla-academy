#!/usr/bin/env node
/**
 * Verification — «Поставщик не выбран»: open obligations with no platform
 * supplier get their own row in «Поставщики», so its total equals «К оплате».
 *
 * Usage:
 *   npm run verify:supplier-unassigned-row
 */

import fs from 'fs'
import path from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

let checks = 0
const ok = (name) => {
  checks += 1
  console.log(`  ✓ ${name}`)
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const debt = await import(pathToFileURL(path.join(ROOT, 'src/services/supplierDebtService.js')).href)
assert.equal(debt.UNASSIGNED_SUPPLIER_NAME, 'Поставщик не выбран')
assert.notEqual(debt.UNASSIGNED_SUPPLIER_ID, '')
assert.ok(!/^[0-9a-f-]{36}$/i.test(debt.UNASSIGNED_SUPPLIER_ID), 'cannot collide with a real uuid')
ok('pseudo supplier has the agreed name and an id that cannot collide with a uuid')

const debtSrc = read('src/services/supplierDebtService.js')
assert.match(debtSrc, /\.is\('platform_supplier_id', null\)/)
assert.match(debtSrc, /\.is\('platform_paid_at', null\)/)
assert.match(debtSrc, /\.eq\('is_source_deleted', false\)/)
ok('unassigned debt uses the same native predicate as «К оплате»')

const svc = read('src/services/umagSettlementsService.js')
assert.match(svc, /if \(unassigned\) return query\.is\('platform_supplier_id', null\)/)
assert.match(svc, /platformSupplierId \|\| unassigned/)
ok('history is scoped to documents without a supplier (incl. native paid marks)')

const panel = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')
assert.match(panel, /includeUnassigned: true/)
assert.match(panel, /unassignedDebt !== 0 && supplierFilter\.size === 0 && !appliedShowArchived/)
assert.match(panel, /if \(supplier\.isVirtual\) \{[\s\S]{0,1200}?\n  \}\n\n  const archived/)
assert.doesNotMatch(panel.slice(panel.indexOf('if (supplier.isVirtual) {'), panel.indexOf('const archived = isSupplierDeleted(supplier)')), /IconActionButton/)
assert.match(panel, /platformSupplierId: supplier\.isVirtual \? null : supplier\.id/)
ok('row shown only when there is unassigned debt; no edit action; payments carry a null supplier')

console.log(`\nverify:supplier-unassigned-row — ${checks} checks passed`)
