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
assert.match(page, /type="checkbox"/)
assert.match(page, /<PlatformActionsMenu/)
ok('checkboxes and the «Действие» menu (bulk deletion of drafts, 2026-11-03) — see verify:documents-bulk-actions')
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


{
  const lib = await import(pathToFileURL(path.join(ROOT, 'src/utils/purchaseDocumentsList.js')).href)
  const orders = [
    { id: 'a', status: 'saved', number: 1001, createdAt: '2026-11-03T05:00:00Z', supplierId: 's' },
    { id: 'b', status: 'draft', createdAt: '2026-11-03T09:00:00Z', supplierId: 's' },
    { id: 'c', status: 'saved', number: 1002, createdAt: '2026-11-03T07:00:00Z', supplierId: 's' },
    { id: 'd', status: 'draft', createdAt: '2026-11-02T09:00:00Z', supplierId: 's' },
  ]
  const f = { dateFrom: '2026-11-02', dateTo: '2026-11-08', supplierIds: [], status: '', q: '' }
  const phone = lib.selectPurchaseDocuments(orders, f, new Set(), { chronological: true }).map((o) => o.id)
  assert.deepEqual(phone, ['b', 'c', 'a', 'd'])
  const desktop = lib.selectPurchaseDocuments(orders, f, new Set()).map((o) => o.id)
  assert.deepEqual(desktop, ['b', 'd', 'c', 'a'])
  console.log('  ✓ phones: one list by creation time (a draft can sit below a saved document); desktop keeps drafts first')
}

assert.match(
  read('src/pages/platform/procurement/PurchaseDocumentsPage.jsx'),
  /<span className="pgt__title pdl-nonumber">Поставщик не выбран<\/span>/
)
ok('«Поставщик не выбран» has the same size as a supplier name (pgt__title): a document without a supplier no longer looks bigger')

assert.match(read('src/pages/platform/procurement/PurchaseDocumentsPage.css'), /\.pdl-table \.pgt__row-main,\s*\.pdl-table \.pgt__foot \{\s*font-size: 14px;/)
assert.match(read('src/pages/platform/orders/OrdersPage.css'), /\.ord-row \.pgt__row-main \{\s*font-size: 14px;/)
ok('web lists «Закуп» and «Приёмка»: the whole row is 14px in every status (dates and names of people no longer inherit 16px)')

console.log(`\n${checks} checks passed`)
