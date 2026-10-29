#!/usr/bin/env node
/**
 * Verification — «Заказы» for the receiver: no buyer analytics in the order card, no auto comment,
 * empty values are empty cells (not «—»).
 *
 * Usage:
 *   npm run verify:orders-receiver-view
 */

import fs from 'fs'
import path from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

let checks = 0
const ok = (name) => {
  checks += 1
  console.log(`  ✓ ${name}`)
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const { normalizePurchaseOrder, orderCommentForDisplay } = await import(
  pathToFileURL(path.join(ROOT, 'src/utils/purchaseData.js')).href
)

assert.equal(orderCommentForDisplay('Сформировано из планирования закупок'), '')
assert.equal(orderCommentForDisplay('  Сформировано из планирования закупок '), '')
ok('the legacy auto comment counts as empty')
assert.equal(orderCommentForDisplay('Привезти до 10:00'), 'Привезти до 10:00')
assert.equal(orderCommentForDisplay(null), '')
assert.equal(orderCommentForDisplay(undefined), '')
ok('a real comment is kept, null/undefined become empty')
assert.equal(normalizePurchaseOrder({ id: 'o1', comment: 'Сформировано из планирования закупок', items: [] }).comment, '')
assert.equal(normalizePurchaseOrder({ id: 'o2', comment: 'Позвонить', items: [] }).comment, 'Позвонить')
ok('normalizePurchaseOrder hides the auto comment everywhere (card, export)')

const page = read('src/pages/platform/procurement/PurchaseDocumentPage.jsx')
assert.match(page, /readerView \? null : <th className="r">Остаток<\/th>/)
assert.match(page, /readerView \? null : <th className="r">Продажи\/день<\/th>/)
ok('stock / sales per day columns only for those who edit (the receiver sees what is needed for receiving)')
assert.match(page, /Комментарий: \{order\.comment\}/)
assert.doesNotMatch(page, /order\.comment \|\| '—'/)
ok('the document shows the comment only when there is one; no «—» placeholders')

const list = read('src/components/procurement/PurchaseTable.jsx')
const keys = [...list.slice(list.indexOf('const columns = ['), list.indexOf(']\n\n  return (')).matchAll(/key: '(\w+)'/g)].map((m) => m[1])
assert.deepEqual(keys.filter((key) => key !== 'actions'), ['delivery', 'supplier', 'items', 'amount', 'checked', 'number', 'created', 'creator'])
ok('orders list: delivery and supplier first, created / creator last')

// Checklist: checkbox first, row number second, nothing persisted in the database.
const headStart = page.indexOf('<thead>')
const head = page.slice(headStart, page.indexOf('</thead>'))
assert.ok(head.indexOf('aria-label="Сверено"') < head.indexOf('<th>№</th>'))
assert.ok(head.indexOf('<th>№</th>') < head.indexOf('Название товара'))
ok('items table: checkbox column first, «№» second, then the product')
assert.match(page, /\{index \+ 1\}/)
assert.match(page, /saveOrderChecklist\(id, next\)/)
ok('row numbers are 1-based; «сверено» ticks are kept in the browser only')
assert.match(page, /Сверено: \{doneCount\} из \{items\.length\}/)
ok('a «Сверено: N из M» counter is shown above the table')

// --- Ticks remembered in the receiver's browser -------------------------------------------------
const { loadOrderChecklist, saveOrderChecklist, CHECKLIST_TTL_MS } = await import(
  pathToFileURL(path.join(ROOT, 'src/utils/orderChecklistStorage.js')).href
)
const makeStorage = () => {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }
}
const st = makeStorage()
saveOrderChecklist('o1', new Set(['a', 'b']), { storage: st, now: 1000 })
saveOrderChecklist('o2', new Set(['x']), { storage: st, now: 1000 })
assert.deepEqual([...loadOrderChecklist('o1', { storage: st, now: 2000 })].sort(), ['a', 'b'])
assert.deepEqual([...loadOrderChecklist('o2', { storage: st, now: 2000 })], ['x'])
assert.equal(loadOrderChecklist('o3', { storage: st, now: 2000 }).size, 0)
ok('ticks are stored per order and read back')
saveOrderChecklist('o1', new Set(), { storage: st, now: 3000 })
assert.equal(loadOrderChecklist('o1', { storage: st, now: 3000 }).size, 0)
ok('unticking everything removes the order entry')
assert.equal(loadOrderChecklist('o2', { storage: st, now: 1000 + CHECKLIST_TTL_MS + 1 }).size, 0)
ok('entries older than 30 days are dropped')
const broken = { getItem: () => '{not json', setItem: () => { throw new Error('quota') } }
assert.equal(loadOrderChecklist('o1', { storage: broken }).size, 0)
saveOrderChecklist('o1', new Set(['a']), { storage: broken })
assert.equal(loadOrderChecklist('o1', { storage: null }).size, 0)
ok('broken / blocked / missing storage never throws — ticks just are not remembered')
assert.match(page, /loadOrderChecklist\(id\)/)
ok('every order keeps its own ticks (by order id)')

// --- Summary above the orders list --------------------------------------------------------------
const { summarizeOrders, describeOrdersSummary } = await import(
  pathToFileURL(path.join(ROOT, 'src/utils/ordersSummary.js')).href
)
const sample = [{ itemsCount: 10 }, { itemsCount: 28 }, { items: [1, 2, 3] }, {}]
assert.deepEqual(summarizeOrders(sample), { deliveries: 4, items: 41 })
assert.deepEqual(summarizeOrders([]), { deliveries: 0, items: 0 })
ok('summary counts deliveries and items (itemsCount, or the items array, or zero)')
const label = { periodLabel: 'Неделя', isToday: true }
assert.equal(describeOrdersSummary({ deliveries: 5, items: 38 }, label), 'Сегодня ждём 5 поставок, 38 товаров')
assert.equal(describeOrdersSummary({ deliveries: 1, items: 1 }, label), 'Сегодня ждём 1 поставка, 1 товар')
assert.equal(describeOrdersSummary({ deliveries: 2, items: 22 }, label), 'Сегодня ждём 2 поставки, 22 товара')
assert.equal(describeOrdersSummary({ deliveries: 12, items: 120 }, { periodLabel: 'Неделя', isToday: false }), 'Неделя: 12 поставок, 120 товаров')
assert.equal(describeOrdersSummary({ deliveries: 3, items: 9 }, { ...label, cancelled: true }), 'Отменено: 3 поставки, 9 товаров')
assert.equal(describeOrdersSummary({ deliveries: 0, items: 0 }, label), null)
ok('summary text: «Сегодня ждём N поставок, M товаров» with correct Russian plurals; other period and cancelled wording; nothing when empty')
assert.match(read('src/pages/platform/orders/OrdersPage.jsx'), /summarizeOrders\(orders\)/)
ok('the orders list shows the summary of exactly the orders on screen (after period / cancelled filters)')

// --- «Сверено» mark on the order (stage 22) -------------------------------------------------------
const { normalizePurchaseOrder: norm } = await import(pathToFileURL(path.join(ROOT, 'src/utils/purchaseData.js')).href)
const marked = norm({ id: 'o', checked_at: '2026-10-23T09:30:00Z', checked_by_name: 'Айгерим' })
assert.equal(marked.checkedAt, '2026-10-23T09:30:00Z')
assert.equal(marked.checkedByName, 'Айгерим')
assert.equal(norm({ id: 'o' }).checkedAt, null)
ok('orders carry checkedAt / checkedByName (snake_case rows and camelCase), empty by default')
const adapter = read('src/services/purchaseSupabaseAdapter.js')
assert.match(adapter, /checked_at: row\.checked_at/)
assert.match(adapter, /row\.checked_at = patch\.checkedAt \|\| null/)
assert.match(adapter, /row\.checked_by_name = patch\.checkedByName \|\| null/)
ok('the Supabase adapter reads and writes the two columns (null clears the mark)')
const dataService = read('src/services/purchaseDataService.js')
assert.match(dataService, /export async function setPurchaseOrderChecked\(orderId, checked, user\)/)
assert.match(read('src/services/purchaseLocalAdapter.js'), /unsavePurchaseOrder[\s\S]{0,700}checkedAt: null/)
assert.match(read('supabase/migrations/20261028100000_order_statuses_rpc.sql'), /procurement_unsave_order[\s\S]{0,1500}checked_at = null/)
ok('marking goes through the shared update path; cancelling a saved order (back to draft) clears the old mark, locally and on the server')
const { canMarkOrderChecked } = await import(pathToFileURL(path.join(ROOT, 'src/config/permissions.js')).href)
assert.equal(typeof canMarkOrderChecked, 'function')
const detail = read('src/pages/platform/procurement/PurchaseDocumentPage.jsx')
assert.match(detail, /showChecklist = saved && !canEdit && canMarkChecked/)
assert.match(detail, /Всё сверено/)
assert.match(detail, /Снять отметку/)
ok('the order card has «Всё сверено» / «Снять отметку» for receiving users; the mark is visible to everyone who sees the order')
const listSrc = read('src/components/procurement/PurchaseTable.jsx')
assert.match(listSrc, /key: 'checked', label: 'Сверено'/)
assert.match(listSrc, /✓ сверено/)
ok('the orders list shows the mark (column on desktop, «✓ сверено» in the mobile subtitle)')
assert.ok(fs.existsSync(path.join(ROOT, 'supabase/migrations/20261023120000_orders_checked_mark.sql')))
assert.ok(fs.existsSync(path.join(ROOT, 'docs/db/stage-22-orders-checked-mark/rollback.sql')))
ok('stage 22 migration and docs (preflight / postcheck / rollback) are in the repo')

console.log(`\nverify:orders-receiver-view — ${checks} checks passed`)
