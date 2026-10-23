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

const table = read('src/components/procurement/PurchaseItemsTable.jsx')
assert.match(table, /const showAnalytics = canEditItems/)
for (const label of ['Остаток', 'Продажи/день', 'Рекомендация']) {
  assert.match(table, new RegExp(`\\{showAnalytics && <th>${label.replace('/', '\\/')}</th>\\}`), label)
}
ok('stock / sales per day / recommendation columns only while a draft is being edited')
assert.match(table, /const showComment = items\.some\(\(item\) => String\(item\.comment \?\? ''\)\.trim\(\) !== ''\)/)
assert.match(table, /\{showComment && <th>Комментарий<\/th>\}/)
assert.doesNotMatch(table, /\|\| '—'/)
ok('Комментарий column only when some item has one; no «—» placeholders in the items table')
const page = read('src/pages/platform/procurement/PurchaseDetailPage.jsx')
assert.match(page, /\{order\.comment \? \(\s*\n\s*<div className="purchase-detail__meta-wide">/)
assert.doesNotMatch(page, /order\.comment \|\| '—'/)
ok('the order card shows the comment row only when there is a comment')

const list = read('src/components/procurement/PurchaseTable.jsx')
const keys = [...list.slice(list.indexOf('const columns = ['), list.indexOf(']\n\n  return (')).matchAll(/key: '(\w+)'/g)].map((m) => m[1])
assert.deepEqual(keys.filter((key) => key !== 'actions'), ['delivery', 'supplier', 'items', 'amount', 'status', 'created', 'creator'])
ok('orders list: delivery and supplier first, created / creator last')

// Checklist: checkbox first, row number second, nothing persisted.
const headStart = table.indexOf('<thead>')
const head = table.slice(headStart, table.indexOf('</thead>'))
assert.ok(head.indexOf('purchase-items__check-col') < head.indexOf('purchase-items__num-col'))
assert.ok(head.indexOf('purchase-items__num-col') < head.indexOf('Наименование товара'))
ok('items table: checkbox column first, «№» second, then the product')
assert.match(table, /\{index \+ 1\}/)
assert.match(table, /const \[checkedIds, setCheckedIds\] = useState\(\(\) => new Set\(\)\)/)
assert.doesNotMatch(table, /localStorage|sessionStorage|supabase|fetch\(|indexedDB/)
ok('row numbers are 1-based; «сверено» marks are plain component state — never saved anywhere')
assert.match(table, /Сверено: \{checkedCount\} из \{items\.length\}/)
ok('a «Сверено: N из M» counter is shown above the table')

console.log(`\nverify:orders-receiver-view — ${checks} checks passed`)
