#!/usr/bin/env node
/**
 * Verification — stage 5 of the mobile work: «Товары поставщика» / «Номенклатура» on phones
 * (full-screen window, product cards, details on tap, collapsible plan, one-column footer).
 *
 * Usage:
 *   npm run verify:mobile-supplier-goods
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

const modalCss = read('src/components/admin/AdminModal.css')
assert.match(read('src/components/admin/AdminModal.jsx'), /admin-modal-overlay--huge/)
assert.match(modalCss, /max-width: 640px\)\s*\{\s*\.admin-modal-overlay--huge[\s\S]*\.admin-modal--huge\s*\{[^}]*height: 100dvh/)
ok('big windows take the whole screen on phones (dynamic viewport height, no rounded corners)')

const table = read('src/components/procurement/document/CatalogTable.jsx')
const css = read('src/components/procurement/document/CatalogTable.css')
const phone = css.slice(css.indexOf('.ctbl__c-meta,\n.ctbl__detail'))
assert.match(table, /ctbl__c-check/)
assert.match(table, /ctbl__c-meta/)
assert.match(table, /ctbl__c-qty/)
assert.equal((table.match(/ctbl__hide-m/g) || []).length >= 8, true, 'number, weeks and numeric columns carry ctbl__hide-m')
assert.match(phone, /\.ctbl thead\s*\{\s*display: none/)
assert.match(phone, /grid-template-areas:\s*'check name qty'\s*'check meta qty'/)
assert.match(phone, /\.ctbl \.ctbl__hide-m\s*\{\s*display: none/)
ok('on phones a product is a card: checkbox, name and a short stock line, the quantity field on the right')
assert.match(phone, /\.ctbl \.ctbl__group td:nth-child\(n\)\s*\{[^}]*width: auto/)
ok('group header cells ignore the pinned-column widths of the desktop table')
assert.match(table, /isPhone \? \(\) => toggleDetail\(rowKey\)/)
assert.match(table, /ctbl__detail-weeks/)
assert.match(table, /showDetail/)
ok('tapping a name (phones only) opens the numbers and the eight weeks under the card')
assert.match(table, /ctbl__row--\$\{reserveTone\}/)
assert.match(phone, /\.ctbl tbody tr\.ctbl__row--below-norm/)
ok('the shelf tone is shown as a coloured edge of the card (no legend on phones)')

const goods = read('src/components/procurement/document/SupplierGoodsModal.jsx')
const goodsCss = read('src/components/procurement/document/SupplierGoodsModal.css')
assert.match(goods, /isPhone && plan \? \(\s*<details className="sgm__plan">/)
assert.match(goods, /sgm__close/)
assert.match(goodsCss, /max-width: 640px[\s\S]*\.sgm__close\s*\{\s*display: none/)
assert.match(goodsCss, /\.admin-modal__footer \.btn--primary\s*\{[^}]*flex: 1 1 100%/)
ok('the plan folds into one line, the footer is one column with a full-width «Добавить в документ»')

console.log(`\nverify:mobile-supplier-goods — ${checks} checks passed`)
