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
assert.doesNotMatch(table, /ShelfBar|shelf-bar/i)
ok('no shelf bar')
assert.match(modal, /placeholder="Товар или штрихкод…"/)
assert.match(modal, /ProcurementSupplierPlanBar/)
assert.match(modal, /PlatformSyncButton[\s\S]*Обновить остатки поставщика/)
assert.match(modal, /Остатки: \{formatSynced\(stockUpdatedAt\)\}/)
assert.doesNotMatch(modal, /syncProcurementPlanning/)
ok('search, plan bar and the stock-refresh button with «Остатки: дата» live in the window (no full sync from here)')
assert.match(modal, /refreshSupplierStock\(supplierId\)/)
const svc = read('src/services/procurementPlanningService.js')
assert.match(svc, /export async function refreshSupplierStock[\s\S]*action: 'refresh-supplier-stock', supplierId/)
const edge = read('supabase/functions/umag-procurement/index.ts')
assert.match(edge, /async function handleRefreshSupplierStock/)
assert.match(edge, /\.filter\(\(row\) => Number\(row\.supplierId\) === umagSupplierId\)/)
assert.match(edge, /procurement_refresh_supplier_stock/)
assert.match(edge, /action === 'refresh-supplier-stock'/)
ok('the button refreshes one supplier: one UMAG stock request, only that supplier\'s rows, one RPC (Edge function action)')
const mig = read('supabase/migrations/20261029150000_procurement_refresh_supplier_stock.sql')
assert.match(mig, /i\.platform_supplier_id = p_supplier_id/)
assert.match(mig, /procurement_apply_plan\(p_snapshot_id, p_supplier_id\)/)
assert.match(mig, /grant execute on function public\.procurement_refresh_supplier_stock\(uuid, uuid, jsonb\) to service_role/)
assert.doesNotMatch(mig.replace(/--.*$/gm, ''), /\bdrop\b|\bdelete\b/i)
ok('migration: updates only the supplier\'s rows, recomputes only its plan, service role only, additive')
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
assert.match(cloud, /addPurchaseOrderItemsCloud[\s\S]*\.insert\(rows\)/)
ok('bulk insert is one request; the totals are kept by the database triggers')

assert.match(modal, /Только к заказу \(\{toOrderCount\}\)/)
assert.match(modal, /Развернуть всё/)
assert.match(modal, /function selectRecommended/)
ok('«Только к заказу», «Развернуть всё», «Выбрать рекомендованные»')
assert.match(modal, /Выбрано: <b>\{picked\}<\/b>/)
assert.match(modal, /Минимальный заказ/)
assert.match(modal, /existingTotal \+ pickedSum/)
ok('footer shows the picked count and sum and the minimum-order shortfall (with what is already in the document)')
const bar = read('src/components/procurement/ProcurementSupplierPlanBar.jsx')
assert.match(bar, /DocumentDateBox/)
assert.doesNotMatch(bar, /type="date"|date-ru/)
ok('plan bar is one row with the Russian date field (no native English date, no duplicate line)')
assert.match(read('src/components/procurement/document/CatalogTable.css'), /\.ctbl__group button \{[^}]*color: var\(--color-text/)
ok('group buttons use the text colour (not the browser default blue)')

assert.match(modal, /selected\.has\(item\.barcode\) && item\.recommendedQty > 0 \? String\(item\.recommendedQty\)/)
assert.match(table, /placeholder=\{disabled \|\| item\.recommendedQty <= 0 \? '' : String\(item\.recommendedQty\)\}/)
assert.match(read('src/components/procurement/document/NomenclatureModal.jsx'), /selected\.has\(item\.barcode\) && item\.recommendedQty > 0/)
ok('the recommendation is a placeholder; ticking a row takes it as the quantity (both windows)')
const css = read('src/components/procurement/document/CatalogTable.css')
assert.match(css, /th:nth-child\(-n \+ 3\)[\s\S]*?position: sticky/)
ok('checkbox, number and product columns stay in view on horizontal scroll')

assert.match(table, /shelfToneFromItem\(item\)/)
assert.match(table, /ctbl__reserve--\$\{reserveTone\}/)
const tcss = read('src/components/procurement/document/CatalogTable.css')
assert.match(tcss, /ctbl__reserve--below-norm \{\s*background: #c2ecd0/)
assert.match(tcss, /ctbl__reserve--above-norm \{\s*background: #f6bcbc/)
ok('«Запас/дн» is tinted by the shelf stock vs the target (green: below, red: above), with a legend')
const { shelfToneFromItem } = await import(pathToFileURL(path.join(ROOT, 'src/utils/procurementPlanningMath.js')).href)
const tone = (stock, avg, target, cycle) => shelfToneFromItem({ calculationStock: stock, avgDaily: avg, targetDays: target, cycleDays: cycle })
assert.equal(tone(0, 4, 5, 4), 'below-norm')
assert.equal(tone(10, 4, 5, 4), 'below-norm')
assert.equal(tone(20, 4, 5, 4), null)
assert.equal(tone(37, 4, 5, 4), 'above-norm')
assert.equal(tone(5, 0, 5, 4), null)
assert.equal(tone(-3, 4, 5, 4), 'below-norm')
ok('an empty shelf is never red: the tone ignores goods in transit (they have their own column)')
assert.match(table, /Продажи по неделям, шт\./)
assert.match(table, /rgba\(5, 150, 105/)
ok('the eight weeks sit under one title with a per-row heat shade (one block, not eight separate numbers)')

assert.match(table, /ResizeObserver/)
assert.match(table, /--ctbl-view/)
assert.match(read('src/components/procurement/document/CatalogTable.css'), /width: var\(--ctbl-view, 100%\)/)
ok('group headers are as wide as the visible table, so they stay in view at any horizontal scroll position')

assert.match(table, /ctbl__weeks-label/)
assert.match(read('src/components/procurement/document/CatalogTable.css'), /\.ctbl__weeks-label \{\s*position: sticky;\s*left: 332px/)
ok('the «Продажи по неделям» title is pinned next to the fixed columns while the weeks scroll')

console.log(`\n${checks} checks passed`)
