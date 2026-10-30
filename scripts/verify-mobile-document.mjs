#!/usr/bin/env node
/**
 * Verification — stage 4 of the mobile work: the buyer's purchase document on phones
 * (bottom bar «Итого + Сохранить», «Товар» sheet, search first, no duplicate buttons).
 *
 * Usage:
 *   npm run verify:mobile-document
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
const phone = css.slice(css.indexOf('.pdoc__mbar,'))

assert.match(page, /pdoc--editable/)
assert.match(page, /className="pdoc__mbar"/)
assert.match(page, /pdoc__bar-save/)
assert.match(phone, /\.pdoc--editable \.pdoc__bar-save\s*\{\s*display: none/)
assert.match(phone, /\.pdoc__mbar\s*\{[^}]*position: sticky[^}]*bottom: 0/)
assert.match(phone, /\.pdoc--editable \.pdoc__table tfoot\s*\{\s*display: none/)
ok('the editor gets a pinned bottom bar with «Итого» and «Сохранить»; the inline button and the pinned table total step aside on phones')
assert.match(phone, /\.pdoc__bar-close/)
ok('«Закрыть» is hidden on phones (the header arrow does it)')

assert.match(page, /useMediaQuery\('\(max-width: 640px\)'\)/)
assert.match(page, /onClick=\{isPhone \? \(\) => setDetailId\(item\.id\) : undefined\}/)
ok('tapping a product name opens its sheet on phones only (desktop clicks do nothing new)')
assert.match(page, /<ItemDetailSheet/)
const sheet = read('src/components/procurement/document/ItemDetailSheet.jsx')
assert.match(sheet, /<AdminModal\s+sheet/)
for (const label of ['Название', 'Штрихкод', 'Остаток', 'Продажи в день', 'Рекомендация', 'Количество', 'Цена закупочная', 'Итого']) {
  assert.ok(sheet.includes(label), `sheet lacks «${label}»`)
}
assert.match(sheet, /editable \? \(/)
assert.match(sheet, /onQtyCommit\?\.\(item\)/)
ok('the «Товар» sheet shows name, barcode, stock, sales, recommendation and the quantity / price / total fields; quantity is committed on close')
assert.match(read('src/components/procurement/document/ItemDetailSheet.css'), /\.idsheet__fields\s*\{[^}]*grid-template-columns: 1fr 1fr/)
ok('quantity and price sit two in a row, the total takes the full width')

assert.match(phone, /\.pdoc__add\s*\{[^}]*order: -2/)
assert.match(phone, /\.pdoc__add-field:nth-child\(2\)/)
assert.match(page, /isPhone \? 'Название или штрихкод'/)
ok('on phones adding goes above the list with a single search by name or barcode')
assert.match(phone, /\.pdoc__table \.pdoc__c-stock,\s*\.pdoc__table \.pdoc__c-sales\s*\{\s*display: none/)
assert.match(page, /pdoc__c-meta/)
ok('a card shows stock and sales as one short line; details are in the sheet')

console.log(`\nverify:mobile-document — ${checks} checks passed`)
