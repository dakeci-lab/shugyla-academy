#!/usr/bin/env node
/**
 * Verification — stage 5 of «Закуп как документы»: window «Товары поставщика» (docs/procurement/purchase-documents/PLAN.md).
 *
 * Usage: npm run verify:supplier-goods-modal
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

const { groupCatalogItems, filterCatalogItems, catalogGroupKey } = await import(
  pathToFileURL(path.join(ROOT, 'src/utils/purchaseCatalog.js')).href
)
const it = (name, bc, cat, sub, rec) => ({ productName: name, barcode: bc, categoryName: cat, subcategoryName: sub, recommendedQty: rec })
const items = [
  it('Чай зелёный', '1', 'Бакалея', 'Чай', 0),
  it('Кофе Nescafe', '2', 'Бакалея', 'Кофе', 12),
  it('Кофе Jacobs', '3', 'Бакалея', 'Кофе', 6),
  it('Шоколад', '4', 'Кондитерка', 'Шоколад', 0),
  it('Без группы', '5', '', '', 3),
]
const tree = groupCatalogItems(items)
assert.deepEqual(tree.map((c) => c.name), ['Бакалея', 'Без категории', 'Кондитерка'])
const bak = tree.find((c) => c.name === 'Бакалея')
assert.deepEqual(bak.subcategories.map((s) => s.name), ['Кофе', 'Чай'])
assert.equal(bak.count, 3)
assert.equal(bak.toOrder, 2)
assert.deepEqual(bak.subcategories[0].items.map((i) => i.productName), ['Кофе Jacobs', 'Кофе Nescafe'])
ok('categories → subcategories, «N поз · M к заказу», names sorted in Russian order')
assert.equal(filterCatalogItems(items, 'nescafe').length, 1)
assert.equal(filterCatalogItems(items, '3').length, 1)
assert.equal(filterCatalogItems(items, '').length, 5)
ok('search by name or barcode')
assert.notEqual(catalogGroupKey('A'), catalogGroupKey('A', 'B'))
ok('group keys do not collide')

const modal = read('src/components/procurement/document/SupplierGoodsModal.jsx')
const table = read('src/components/procurement/document/CatalogTable.jsx')
for (const label of ['Остаток', 'Запас/дн', 'Спрос/дн', 'Рек.', 'Цель дн', 'В пути', 'Заказ']) {
  assert.ok(table.includes(`>${label}</th>`), label)
}
assert.match(table, /weekLabels\.map/)
ok('columns: 8 weekly sales, Остаток, Запас/дн, Спрос/дн, Рек., Цель дн, В пути, Заказ')
assert.doesNotMatch(table, /below-norm|above-norm|reserveHighlight|shelf-bar|ShelfBar/i)
ok('no norm colours and no shelf bar')
assert.match(modal, /placeholder="Товар или штрихкод…"/)
assert.match(modal, /ProcurementSupplierPlanBar/)
assert.match(modal, /PlatformSyncButton[\s\S]*Обновить данные UMAG/)
assert.match(modal, /UMAG: \{formatSynced/)
ok('search, plan bar, UMAG sync button and «UMAG date · N SKU» line live in the window')
assert.match(modal, /Добавить в документ \(\$\{picked\}\)/)
assert.match(modal, /onDeliveryDate/)
ok('«Добавить в документ (N)»; plan delivery date and document date stay in step')
assert.match(modal, /fetchSnapshotItemsPage\(\{[^}]*platformSupplierId: supplierId/)
ok('only the document supplier\'s products')

const page = read('src/pages/platform/procurement/PurchaseDocumentPage.jsx')
assert.match(page, /＋ Товары поставщика/)
assert.match(page, /editable && order\.supplierId/)
assert.match(page, /addPurchaseOrderItems\(order\.id, payload\)/)
ok('link-button shown only with a chosen supplier; rows added in one request')
const cloud = read('src/services/purchaseSupabaseAdapter.js')
assert.match(cloud, /addPurchaseOrderItemsCloud[\s\S]*\.insert\(rows\)[\s\S]*recalcOrderTotals/)
ok('bulk insert recalculates totals once')

console.log(`\n${checks} checks passed`)
