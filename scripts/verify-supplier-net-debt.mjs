#!/usr/bin/env node
/**
 * Verification — the debt of a supplier is NET: unpaid receipts minus unpaid returns (2026-11-07).
 * Real numbers of «ТОО Қарқын-2030» (prod): receipts 243 698,32 + 348 663,03, returns 9 176,10 + 3 106,956 → 580 078,29.
 *
 * Usage: npm run verify:supplier-net-debt
 */
import fs from 'fs'
import path from 'path'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let checks = 0
const ok = (name) => {
  checks += 1
  console.log(`  ✓ ${name}`)
}

const { buildNativeDebtSummary, UNASSIGNED_SUPPLIER_ID } = await import(pathToFileURL(path.join(ROOT, 'src/services/supplierDebtService.js')).href)

const SUP = 'sup-qarqyn'
const receipt = (amount, due) => ({ platform_supplier_id: SUP, original_supply_amount: amount, due_date: due, supply_document_date: '2026-11-04' })
const ret = (amount, supplier = SUP) => ({ platform_supplier_id: supplier, amount })

const summary = buildNativeDebtSummary({
  rows: [receipt('243698.3200', '2026-11-11'), receipt('348663.0300', '2026-11-14')],
  returnRows: [ret('9176.1000'), ret('3106.9560')],
  todayKey: '2026-11-07',
})
const e = summary.get(SUP)
assert.equal(e.receiptsAmount, 592361.35)
assert.equal(e.returnsAmount, 12283.06)
assert.equal(e.amount, 580078.29)
assert.equal(e.count, 2)
assert.equal(e.returnsCount, 2)
ok('the net debt of «ТОО Қарқын-2030»: 592 361,35 − 12 283,06 = 580 078,29 (it showed 592 361,35 before)')

assert.equal(buildNativeDebtSummary({ rows: [receipt(100, '2026-11-01')], returnRows: [], todayKey: '2026-11-07' }).get(SUP).amount, 100)
ok('no returns: the debt is the receipts, as before')

const creditOnly = buildNativeDebtSummary({ rows: [], returnRows: [ret(5000)], todayKey: '2026-11-07' }).get(SUP)
assert.equal(creditOnly.amount, -5000)
assert.equal(creditOnly.count, 0)
const over = buildNativeDebtSummary({ rows: [receipt(1000, '2026-11-20')], returnRows: [ret(1500.5)], todayKey: '2026-11-07' }).get(SUP)
assert.equal(over.amount, -500.5)
ok('returns above the debt (or returns only): a negative balance — the supplier owes us')

const overdue = buildNativeDebtSummary({
  rows: [receipt(1000, '2026-11-01'), receipt(2000, '2026-11-30')],
  returnRows: [ret(400)],
  todayKey: '2026-11-07',
}).get(SUP)
assert.equal(overdue.overdueCount, 1)
assert.equal(overdue.overdueAmount, 1000)
assert.equal(overdue.amount, 2600)
ok('«просрочено» stays the overdue receipts only (a return has no due date)')

const unassigned = buildNativeDebtSummary({
  rows: [],
  returnRows: [ret(300, null)],
  unassignedRows: [{ platform_supplier_id: null, original_supply_amount: 700, due_date: null, supply_document_date: '2026-11-01' }],
  includeUnassigned: true,
  todayKey: '2026-11-07',
})
assert.equal(unassigned.get(UNASSIGNED_SUPPLIER_ID).amount, 700)
assert.equal(unassigned.get(UNASSIGNED_SUPPLIER_ID).returnsAmount, 0)
ok('the virtual «Поставщик не выбран» row stays the sum of its unpaid invoices (returns without a supplier are not netted)')

const service = read('src/services/supplierDebtService.js')
assert.match(service, /\.from\('umag_supply_returns'\)[\s\S]*?\.eq\('is_source_deleted', false\)[\s\S]*?\.is\('platform_refunded_at', null\)/)
const panel = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')
assert.match(panel, /returnsNote = entry\?\.returnsAmount > 0/)
assert.match(panel, /umag-settlements__id-balance-amount--credit/)
assert.match(panel, /key: 'returns', label: 'Неполученные возвраты'/)
ok('open returns = not deleted in UMAG and no «деньги получены» mark; the list, the card header and the «Информация» tab show the split')

console.log(`\n${checks} checks passed`)
