#!/usr/bin/env node
/**
 * Verification — stage 29: bonus goods («5+1», whole parts) and discounts (per row, per invoice) in purchase orders.
 *
 * Usage: npm run verify:order-bonus-discount
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
const data = await import(pathToFileURL(path.join(ROOT, 'src/utils/purchaseData.js')).href)
const doc = await import(pathToFileURL(path.join(ROOT, 'src/utils/purchaseDocument.js')).href)
const math = await import(pathToFileURL(path.join(ROOT, 'src/utils/procurementPlanningMath.js')).href)

// --- the bonus rule: whole parts only ------------------------------------------------------------------------
assert.equal(data.calcBonusFromPromo(12, 5, 1), 2)
assert.equal(data.calcBonusFromPromo(7, 5, 1), 1)
assert.equal(data.calcBonusFromPromo(4, 5, 1), 0)
assert.equal(data.calcBonusFromPromo(10, 5, 2), 4)
assert.equal(data.calcBonusFromPromo(9, 3, 1), 3)
assert.equal(data.calcBonusFromPromo(10, 0, 1), 0)
ok('bonus = whole parts: 5+1 → 12 gives 2, 7 gives 1, 4 gives 0; 5+2 → 10 gives 4; 3+1 → 9 gives 3')
assert.deepEqual(data.parsePromo('5+1'), { buy: 5, free: 1 })
assert.deepEqual(data.parsePromo(' 5 + 2 '), { buy: 5, free: 2 })
assert.equal(data.parsePromo(''), null)
assert.equal(data.parsePromo('пять плюс один'), null)
assert.equal(data.parsePromo('0+1'), null)
assert.equal(data.formatPromo(5, 1), '5+1')
assert.equal(data.formatPromo(null, null), '')
ok('the promo is typed as «5+1» (spaces allowed); nonsense and zeros are rejected')

// --- the discount: base price stays, the sum is from the discounted price -------------------------------------
assert.equal(data.calcLineTotal(23, 155), 3565)
assert.equal(data.calcLineTotal(23, 155, 5), 3386.75)
assert.equal(data.calcLineTotal(23, 155, 10), 3208.5)
assert.equal(data.calcLineTotal(10, 100, 150), 0, 'a discount above 100% is clamped')
assert.equal(data.calcLineTotal(10, 100, -5), 1000, 'a negative discount is ignored')
assert.equal(data.discountedPrice(155, 5), 147.25)
ok('line total = qty × base price × (1 − discount), kopecks like the database (23 × 155 at 5% = 3 386,75)')

const item = data.normalizePurchaseItem({
  id: 'i1',
  ordered_qty: 12,
  purchase_price: 200,
  bonus_qty: 2,
  promo_buy: 5,
  promo_free: 1,
  discount_pct: 10,
})
assert.equal(item.bonusQty, 2)
assert.equal(item.promoBuy, 5)
assert.equal(item.discountPct, 10)
assert.equal(item.lineTotal, 2160)
assert.equal(data.itemReceiveQty(item), 14)
assert.equal(data.normalizePurchaseItem({ id: 'x', promo_buy: 5 }).promoBuy, null, 'half a promo is no promo')
assert.equal(data.normalizePurchaseItem({ id: 'x' }).discountPct, 0)
ok('rows carry bonus / promo / discount (snake_case and camelCase); what arrives = ordered + bonus; empty by default')

const items = [
  data.normalizePurchaseItem({ id: 'a', ordered_qty: 10, purchase_price: 100, discount_pct: 10, bonus_qty: 2 }),
  data.normalizePurchaseItem({ id: 'b', ordered_qty: 5, purchase_price: 200 }),
]
assert.deepEqual(doc.documentTotals(items), { discounted: 1900, base: 2000, saved: 100, qty: 15, bonus: 2 })
assert.equal(data.calcOrderTotal(items), 1900)
ok('totals show both sums: by the base price (2000) and with the discount (1900), and the difference (100)')

const exported = math.mapPurchaseOrderForExport({ items })
assert.equal(exported.withBonus, true)
assert.equal(exported.withDiscount, true)
assert.equal(exported.totalAmount, 1900)
assert.equal(exported.baseTotal, 2000)
assert.equal(exported.discountTotal, 100)
assert.equal(exported.items[0].receiveQty, 12)
assert.equal(exported.items[0].discountedPrice, 90)
assert.equal(math.mapPurchaseOrderForExport({ items: [items[1]] }).withBonus, false)
ok('the export knows the bonus and the discount; an order without them keeps the old columns')

const order = data.normalizePurchaseOrder({ id: 'o', discount_pct: 7, items: [] })
assert.equal(order.discountPct, 7)
assert.equal(data.normalizePurchaseOrder({ id: 'o' }).discountPct, 0)
ok('the order carries the invoice discount (default 0)')

// --- code and database ---------------------------------------------------------------------------------------
const adapter = read('src/services/purchaseSupabaseAdapter.js')
assert.match(adapter, /bonus_qty: item\.bonusQty/)
assert.match(adapter, /discount_pct: item\.discountPct/)
assert.match(adapter, /export async function setOrderDiscountCloud/)
assert.match(adapter, /\.eq\('discount_pct', previousPct\)/)
ok('the Supabase adapter writes the row fields; the invoice discount reaches only the rows that still carry the previous invoice discount')
const page = read('src/pages/platform/procurement/PurchaseDocumentPage.jsx')
assert.match(page, /calcBonusFromPromo\(next, item\.promoBuy, item\.promoFree\)/)
assert.match(page, /bonusQty: next, promoBuy: null, promoFree: null/)
assert.match(page, /catalogProductToItem\(product, \{ discountPct: order\.discountPct/)
assert.match(page, /Скидка на накладную, %/)
assert.match(page, /showBonusCols = editable \|\| hasBonus/)
ok('document: the quantity keeps the bonus of a promo row in step; a typed bonus drops the rule; new rows inherit the invoice discount; the receiver sees the columns only when the order has them')
const migration = read('supabase/migrations/20261105230000_order_bonus_discount.sql')
assert.match(migration, /purchase_order_items_calc_line_total/)
assert.match(migration, /sum\(poi\.ordered_qty \+ coalesce\(poi\.bonus_qty, 0\)\)/)
assert.match(migration, /grant insert \(bonus_qty, promo_buy, promo_free, discount_pct\)/)
assert.ok(fs.existsSync(path.join(ROOT, 'docs/db/stage-29-order-bonus-discount/rollback.sql')))
ok('stage 29: migration (columns, line trigger, «Сохранить» with the discount, «в пути» with the bonus, column grants), rollback and docs are in the repo')

// A row edit writes only the changed columns; never the ones `authenticated` may not update (that was a 403 for every edit).
const patchColumns = adapter.match(/export const ITEM_PATCH_COLUMNS = \{([\s\S]*?)\n\}/)[1]
for (const forbidden of ["'id'", "'purchase_order_id'", "'created_at'", "'total_amount'"]) {
  assert.ok(!patchColumns.includes(forbidden), `${forbidden} must not be written by a row edit`)
}
assert.match(adapter, /\.update\(itemPatchToRow\(patch\)\)[\s\S]{0,200}\.select\('id'\)/)
assert.doesNotMatch(adapter, /ITEM_READONLY_COLUMNS|row\.created_at = current\.created_at/)
ok('a row edit writes only the changed columns (no id / purchase_order_id / created_at / total_amount): the database rejected the whole update with 403 before, and two quick edits of one row cannot overwrite each other')

// --- Autosave like UMAG (2026-11-06) --------------------------------------------------------------------------------
assert.match(page, /document\.addEventListener\('pointerdown', leaveField, true\)/)
assert.match(page, /active\.dataset\.autosave/)
assert.match(page, /window\.addEventListener\('pagehide', saveBeforeLeaving\)/)
assert.match(page, /async function flushDrafts\(\)/)
assert.match(page, /if \(hasDrafts\(\)\) \{\s*await flushDrafts\(\)\s*const fresh = await reloadOrder\(\)/)
assert.match(page, /async function handleClose\(\) \{\s*if \(hasDrafts\(\)\) await flushDrafts\(\)/)
assert.match(page, /const totals = documentTotals\(liveItems\)/)
assert.match(page, /<SaveProgressBar state=\{saveState\} \/>/)
assert.match(read('src/hooks/useSaveTracker.js'), /setState\('saving'\)[\s\S]*setState\(hadError \? 'error' : 'saved'\)/)
ok('autosave like UMAG: a tap outside a number field saves it, «Сохранить» / «Закрыть» / hiding the tab send what is typed first, totals follow the typed numbers, a green line shows the saving')

// A number that grows must not push the table out of the screen: fixed column widths, names wrap in every view.
assert.match(page, /const TABLE_COL_WIDTH = \{/)
assert.match(page, /<colgroup>[\s\S]*TABLE_COL_WIDTH\[key\]/)
assert.match(page, /style=\{isPhone \? undefined : \{ minWidth: tableMinWidth \}\}/)
const pageCss = read('src/pages/platform/procurement/PurchaseDocumentPage.css')
assert.match(pageCss, /@media \(min-width: 641px\) \{\s*\.pdoc__table \{\s*table-layout: fixed;/)
assert.match(pageCss, /\.pdoc__table td\.pdoc__c-name \{\s*white-space: normal;/)
assert.doesNotMatch(pageCss, /\.pdoc__table td:nth-child\(2\)/)
assert.match(pageCss, /@media \(min-width: 641px\) and \(max-width: 1300px\) \{\s*\.pdoc__table-wrap \{\s*overflow-x: auto;/)
ok('web table: fixed column widths (a sum with kopecks no longer widens its column and pushes the table out), names wrap in «Приёмка» too (the rule was «second cell»), a narrower screen scrolls sideways instead of cutting the sum off')

console.log(`\n${checks} checks passed`)
