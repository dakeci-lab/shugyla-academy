#!/usr/bin/env node
/**
 * Verification — stage 7 of «Закуп как документы»: the receiver's «Заказы» list and the read-only document.
 *
 * Usage: npm run verify:receiver-orders
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

const { selectReceiverOrders } = await import(pathToFileURL(path.join(ROOT, 'src/utils/purchaseDocumentsList.js')).href)
const o = (id, status, delivery, supplier) => ({ id, status, expectedDeliveryDate: delivery, supplierName: supplier })
const list = selectReceiverOrders(
  [
    o('a', 'saved', '2026-10-29', 'Борте'),
    o('b', 'draft', '2026-10-29', 'Алиди'),
    o('c', 'saved', '2026-10-29', 'Алиди'),
    o('d', 'saved', '2026-10-30', 'Яр'),
    o('e', 'saved', '2026-11-20', 'Далеко'),
    o('f', 'saved', null, 'Без даты'),
  ],
  { dateFrom: '2026-10-29', dateTo: '2026-10-31' }
)
assert.deepEqual(list.map((x) => x.id), ['d', 'c', 'a'])
ok('saved orders only, cut by delivery date, newest delivery first, then supplier')

const page = read('src/pages/platform/orders/OrdersPage.jsx')
assert.match(page, /SETTLEMENTS_PERIOD_PRESET_OPTIONS/)
assert.doesNotMatch(page, /\+ Новый заказ|createPurchaseOrder|CreatePurchaseForm|isOrderDraft/)
ok('quick period presets; no creation and no drafts in the receiver list')
const table = read('src/components/procurement/PurchaseTable.jsx')
assert.doesNotMatch(table, /StatusBadge/)
assert.match(table, /pgt__checked/)
ok('«Сверено» is plain green text, no status pills')

const doc = read('src/pages/platform/procurement/PurchaseDocumentPage.jsx')
assert.match(doc, /canViewOrders\(user\)/)
assert.match(doc, /showChecklist = saved && !canEdit && canMarkChecked/)
assert.match(doc, /loadOrderChecklist\(id\)/)
assert.match(doc, /Сверено: \{doneCount\} из \{items\.length\}/)
assert.match(doc, /Всё сверено/)
assert.match(doc, /Снять отметку/)
ok('read-only document: row checkboxes kept in the browser, «Сверено: N из M», «Всё сверено» / «Снять отметку»')
assert.match(doc, /readerView \? null : <th className="r">Остаток<\/th>/)
assert.match(doc, /Комментарий: \{order\.comment\}/)
ok('no stock / sales columns for the receiver; the comment is a banner')
assert.match(read('src/App.jsx'), /path="orders\/:id"[\s\S]*?<PurchaseDocumentPage \/>/)
ok('/platform/orders/:id opens the new document page')

console.log(`\n${checks} checks passed`)
