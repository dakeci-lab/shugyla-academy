#!/usr/bin/env node
/**
 * Verification — stage 3 of the mobile work: «Заказы» for the receiver on phones
 * (list rows, period buttons, order items as cards with a pinned total).
 *
 * Usage:
 *   npm run verify:mobile-orders
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
let checks = 0
const ok = (name) => {
  checks += 1
  console.log(`  ✓ ${name}`)
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const page = read('src/pages/platform/procurement/PurchaseDocumentPage.jsx')
const css = read('src/pages/platform/procurement/PurchaseDocumentPage.css')

for (const cls of ['check', 'index', 'name', 'code', 'stock', 'sales', 'qty', 'price', 'sum', 'del']) {
  assert.match(page, new RegExp(`pdoc__c-${cls}`), `cell class pdoc__c-${cls} is missing`)
  assert.match(css, new RegExp(`\\.pdoc__c-${cls}\\b`), `no phone style for pdoc__c-${cls}`)
}
ok('every items-table cell has a role class and a phone style')

const phone = css.slice(css.indexOf('max-width: 640px', css.indexOf('.pdoc__unit')))
assert.match(phone, /\.pdoc__table thead\s*\{\s*display: none/)
assert.match(phone, /grid-template-areas/)
assert.match(phone, /\.pdoc__table-wrap\s*\{\s*overflow: visible/)
assert.match(phone, /\.pdoc__table tfoot\s*\{[^}]*position: sticky[^}]*bottom: 0/)
ok('on phones the items table is a card grid and the «Итого» row is pinned to the bottom')
assert.match(page, /pdoc__unit/)
assert.match(css, /\.pdoc__unit\s*\{\s*display: none/)
ok('the unit next to the quantity is phones-only (desktop table is unchanged)')
assert.match(css, /\.pdoc__cards > \.pdoc__card:nth-child\(2\)\s*\{[^}]*grid-column: 1 \/ -1/)
ok('date and delivery sit side by side on phones, the supplier takes its own row')

const table = read('src/components/procurement/PurchaseTable.jsx')
assert.match(table, /pgt__pill pgt__pill--ok/)
ok('the orders list marks reconciled orders with a pill on phones')
const ordersCss = read('src/pages/platform/orders/OrdersPage.css')
assert.match(ordersCss, /max-width: 640px[\s\S]*\.orders-page__presets\s*\{[^}]*flex-wrap: nowrap/)
assert.match(ordersCss, /\.orders-page__preset\s*\{[^}]*min-height: 40px/)
ok('period buttons stay in one scrolling row with 40px touch targets')

console.log(`\nverify:mobile-orders — ${checks} checks passed`)
