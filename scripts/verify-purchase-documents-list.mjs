#!/usr/bin/env node
/**
 * Verification — stage 3 of «Закуп как документы»: the new «Закуп» documents list
 * (docs/procurement/purchase-documents/PLAN.md). Pure list logic runs the real module; UI checks assert on source.
 *
 * Usage: npm run verify:purchase-documents-list
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

const { selectPurchaseDocuments, DEFAULT_DOCUMENTS_FILTER } = await import(
  pathToFileURL(path.join(ROOT, 'src/utils/purchaseDocumentsList.js')).href
)

const order = (id, status, number, createdAt, supplierId, supplierName) => ({
  id,
  status,
  number,
  createdAt,
  supplierId,
  supplierName,
})
const orders = [
  order('a', 'saved', 1001, '2026-10-27T08:00:00Z', 's1', 'Алиди Нестле'),
  order('b', 'saved', 1002, '2026-10-28T08:00:00Z', 's2', 'Борте'),
  order('c', 'saved', 1000, '2026-09-01T08:00:00Z', 's1', 'Алиди Нестле'),
  order('d', 'draft', null, '2026-08-01T08:00:00Z', null, ''),
  order('e', 'draft', null, '2026-10-29T08:00:00Z', 's2', 'Борте'),
]
const week = { ...DEFAULT_DOCUMENTS_FILTER, dateFrom: '2026-10-26', dateTo: '2026-11-01' }

let ids = selectPurchaseDocuments(orders, week).map((o) => o.id)
assert.deepEqual(ids, ['e', 'd', 'b', 'a'])
ok('drafts first (newest first) and always shown; saved cut by creation period, newest number first')

ids = selectPurchaseDocuments(orders, { ...week, supplierIds: ['s2'] }).map((o) => o.id)
assert.deepEqual(ids, ['e', 'b'])
ok('supplier filter applies to drafts too (draft without a supplier drops out)')

ids = selectPurchaseDocuments(orders, { ...week, status: 'saved' }).map((o) => o.id)
assert.deepEqual(ids, ['b', 'a'])
ok('status filter')

ids = selectPurchaseDocuments(orders, { ...week, q: '1002' }).map((o) => o.id)
assert.deepEqual(ids, ['b'])
ids = selectPurchaseDocuments(orders, { ...week, q: 'нестле' }).map((o) => o.id)
assert.deepEqual(ids, ['a'])
ids = selectPurchaseDocuments(orders, { ...week, q: 'молоко' }, new Set(['a', 'e'])).map((o) => o.id)
assert.deepEqual(ids, ['e', 'a'])
ok('search: number, supplier name, and ids found by item name/barcode from the server')

const page = read('src/pages/platform/procurement/PurchaseDocumentsPage.jsx')
for (const label of ['Номер', 'Создан', 'Поставщик', 'Доставка', 'Позиций', 'Сумма', 'Создал', 'Комментарий']) {
  assert.ok(page.includes(`label: '${label}'`), label)
}
ok('columns: Номер, Создан, Поставщик, Доставка, Позиций, Сумма, Создал, Комментарий')
assert.match(page, /SETTLEMENTS_PERIOD_PRESET\.WEEK/)
ok('default period is «Неделя»')
assert.match(page, /＋ Создать/)
assert.match(page, /createPurchaseOrder\(\{\s*supplierId: null/)
ok('«+ Создать» makes an empty draft without a supplier')
assert.match(page, /<PgtFoot/)
ok('totals row «Итого по списку»')
assert.doesNotMatch(page, /type="checkbox"|Действие/)
ok('no bulk checkboxes / «Действие» menu')
assert.doesNotMatch(page, /StatusBadge|PurchaseStatusBadge/)
ok('status is a line and text, not a pill')
assert.match(page, /pdl-sum--draft/)
assert.match(page, /pdl-sum--saved/)
ok('line under the sum: gray for draft, green for saved')

const svc = read('src/services/purchaseDataService.js')
const cloud = read('src/services/purchaseSupabaseAdapter.js')
assert.match(svc, /export async function findPurchaseOrderIdsByItemText/)
assert.match(cloud, /searchOrderIdsByItemTextCloud[\s\S]*purchase_order_items[\s\S]*product_name\.ilike[\s\S]*barcode\.ilike/)
ok('item-text search is served by the server (list holds headers only)')

const app = read('src/App.jsx')
assert.match(app, /path="procurement"[\s\S]*?ROUTE_KEYS\.PROCUREMENT[\s\S]*?<PurchaseDocumentsPage \/>/)
assert.match(app, /path="procurement\/documents" element=\{<Navigate to="\/platform\/procurement"/)
ok('the list is the «Закуп» page /platform/procurement (behind its route key); the old /documents address redirects')

console.log(`\n${checks} checks passed`)
