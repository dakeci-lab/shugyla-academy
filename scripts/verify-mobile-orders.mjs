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
assert.match(css, /max-width: 720px\)[\s\S]*\.pdoc__cards\s*\{\s*grid-template-columns: 1fr 1fr/)
assert.match(css, /\.pdoc__cards > \.pdoc__group\s*\{\s*grid-column: 1 \/ -1;\s*grid-row: 1/)
ok('date and delivery sit side by side on phones, the supplier takes its own row')

const table = read('src/components/procurement/PurchaseTable.jsx')
assert.match(table, /pgt__pill \$\{order\.checkedAt \? 'pgt__pill--ok' : 'pgt__pill--wait'\}/)
assert.match(table, /order\.checkedAt \? 'Сверено' : 'Не сверено'/)
assert.doesNotMatch(table.slice(table.indexOf('mobileMeta={')), /тов\.|createdByName|№/)
ok('the phone row ends with the document status («Сверено» / «Не сверено») instead of a tick; no item count, number or author')
const ordersPageSrc = read('src/pages/platform/orders/OrdersPage.jsx')
assert.doesNotMatch(ordersPageSrc, /summaryText/)
ok('there is no «Сегодня ждём N поставок, M товаров» line, neither on phones nor on the web (the filter holds the period)')
const ordersCss = read('src/pages/platform/orders/OrdersPage.css')
const ordersPage = read('src/pages/platform/orders/OrdersPage.jsx')
assert.match(ordersPage, /\{isPhone \? \(\s*<PlatformFilterRow/)
assert.match(ordersPage, /presetOptions=\{ORDERS_PERIOD_PRESET_OPTIONS\}/)
assert.match(table, /className="pgt__day"/)
assert.match(table, /formatDocumentGroupLabel\(day\)/)
assert.match(ordersCss, /\.orders-page \.pgt__title\s*\{\s*font-size: 14px;\s*font-weight: 700/)
ok('phones: one «Фильтры» row (the full filter sheet like «Закуп»: quick periods with «Завтра», name / barcode / number, supplier, status), delivery-day groups, a compact row: supplier, sum, number of items, «Сверено»')

console.log(`\nverify:mobile-orders — ${checks} checks passed`)
