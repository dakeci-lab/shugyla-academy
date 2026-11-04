import assert from 'node:assert/strict'
import fs from 'node:fs'

let checks = 0
const ok = (m) => { checks += 1; console.log(`  ✓ ${m}`) }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// Real module (the project's loader resolves extensionless imports the way Vite does).
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
globalThis.__VITE_ENV__ = {}
register(pathToFileURL(new URL('./lib/extensionlessResolver.mjs', import.meta.url).pathname))
const { bringsGoodsToday, suppliersWithGoodsFirst, suppliersOrderedToday } = await import('../src/utils/purchaseDocument.js')

const s = (id, order, delivery) => ({ id, name: id, orderWeekdays: order, deliveryWeekdays: delivery })
const mon = s('mon-same', ['mon'], ['mon'])
const monThu = s('mon-thu', ['mon', 'thu'], ['mon', 'thu'])
const partial = s('partial', ['mon', 'wed'], ['mon'])
const later = s('later', ['mon'], ['tue'])
const noDelivery = s('no-delivery', ['mon'], [])

assert.equal(bringsGoodsToday(mon, 'mon'), true)
assert.equal(bringsGoodsToday(monThu, 'thu'), true)
assert.equal(bringsGoodsToday(partial, 'mon'), true)
assert.equal(bringsGoodsToday(partial, 'wed'), false)
assert.equal(bringsGoodsToday(later, 'mon'), false)
assert.equal(bringsGoodsToday(noDelivery, 'mon'), false)
ok('«с собой» is decided by the day: order day and delivery day both include today')

const today = suppliersOrderedToday([later, mon, noDelivery, monThu, partial], 'mon')
assert.deepEqual(suppliersWithGoodsFirst(today, 'mon').map((x) => x.id), ['mon-same', 'mon-thu', 'partial', 'later', 'no-delivery'])
ok('today\'s suppliers with goods come first, the order inside each group is kept')

const picker = read('src/components/procurement/document/DocumentSupplierPicker.jsx')
assert.match(picker, /suppliersWithGoodsFirst\(suppliersOrderedToday/)
assert.match(picker, /is-with-goods/)
assert.match(picker, /docsup__tag">с собой</)
assert.match(read('src/components/procurement/document/DocumentSupplierPicker.css'), /\.docsup__option\.is-with-goods/)
ok('the supplier picker of a document shows them first, with a soft tint and the mark «с собой»')

const page = read('src/pages/platform/procurement/SupplierGoodsPage.jsx')
assert.match(page, /pickedByOrder = new Map\(\)/)
assert.match(page, /pickedByOrder\.delete\(id\)/)
assert.doesNotMatch(read('src/pages/platform/procurement/PurchaseDocumentPage.jsx'), /SupplierGoodsModal/)
assert.match(read('src/App.jsx'), /path="procurement\/documents\/:id\/goods"/)
ok('«Товары поставщика» is a page of its own (…/documents/:id/goods), the selection is remembered per document and cleared after «Добавить»')
assert.doesNotMatch(page, /type="checkbox"[\s\S]{0,40}onChange=\{\(\) => toggleItem/)
assert.match(page, /showChecks=\{false\}/)
assert.match(page, /const chosen = items\.filter\(\(item\) => !existingBarcodes\.has\(item\.barcode\) && \(Number\(quantityOf\(item\)\) \|\| 0\) > 0\)/)
assert.match(page, /Доставка \$\{formatPurchaseDay\(plan\.deliveryDate\)\} · /)
assert.match(page, /У поставщика нет товаров в последних данных UMAG/)
assert.match(read('src/components/procurement/document/CatalogTable.css'), /@media \(hover: hover\) \{\s*\.ctbl tbody tr\.is-selected:hover td/)
ok('there are no ticks on the goods page: a row with a quantity is picked, an empty one is not added; the plan line is one line («Доставка 05.11 · цель 9 дн.»); an empty supplier gets its own message; a ticked row has no hover band on touch')
assert.match(page, /isPhone && canSync && snapshot\?\.id/)
assert.match(page, /actions: headerActions/)
assert.match(page, /canSync && !isPhone \? \(\s*<PlatformSyncButton/)
ok('phones: the refresh of the supplier stock is an icon in the top right of the page header (not in the body)')
assert.match(page, /createPortal\(\s*<div className="sgp__bar"/)
assert.match(read('src/pages/platform/procurement/SupplierGoodsPage.css'), /\.sgp__bar \{\s*position: fixed;[^}]*bottom: 0;/)
assert.doesNotMatch(page, /Укажите количество у нужных товаров/)
ok('the bottom bar of the goods page is fixed to the bottom of the screen on web and phone (drawn in document.body, not carried along by the content); no hint text in it')
assert.match(page, /isPhone \? null : \(\s*<input\s+type="search"/)
assert.match(page, /<PlatformFloatingSearch\s+inline/)
assert.match(read('src/components/platform/PlatformFloatingSearch.css'), /\.pfs\.pfs--inline \{\s*position: static;/)
ok('phones: the search of the goods page is the same pill as in «Поставщики», under the «Добавить» button at the bottom; the button is called «Добавить (N)»')
const table = read('src/components/procurement/document/CatalogTable.jsx')
const tableCss = read('src/components/procurement/document/CatalogTable.css')
assert.match(table, /\/\^\(\\d\{4,\}\)\\s\+\(\.\+\)\$\//)
assert.match(table, /ctbl__row--todo/)
assert.match(tableCss, /tr\.ctbl__row--todo:not\(\.ctbl__group\) td\.ctbl__name \{\s*font-weight: 600;/)
assert.match(tableCss, /td\.ctbl__name \{\s*grid-area: name;\s*font-size: 15px;\s*font-weight: 400;/)
assert.match(tableCss, /\.ctbl__group button b \{\s*font-weight: 600;\s*color: var\(--color-text-secondary/)
ok('phones, goods list: a visible hierarchy — quiet group headings, regular names, heavier names only for goods to order; the article code moves from the name to the grey line')

console.log(`\nverify:supplier-with-goods — ${checks} checks passed`)
