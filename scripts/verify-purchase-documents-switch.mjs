#!/usr/bin/env node
/**
 * Verification — stage 8 of «Закуп как документы»: the menu / routes are switched to the documents, the old order card
 * and its helpers are gone, the former planner stays only at /platform/procurement/plan.
 *
 * Usage: npm run verify:purchase-documents-switch
 */
import fs from 'fs'
import path from 'path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let checks = 0
const ok = (name) => {
  checks += 1
  console.log(`  ✓ ${name}`)
}

const app = read('src/App.jsx')
assert.match(app, /path="procurement"[\s\S]*?<PurchaseDocumentsPage \/>/)
assert.match(app, /path="procurement\/plan"[\s\S]*?<ProcurementPage \/>/)
assert.match(app, /path="procurement\/documents\/:id"[\s\S]*?<PurchaseDocumentPage \/>/)
assert.match(app, /path="orders\/:id"[\s\S]*?<PurchaseDocumentPage \/>/)
ok('«Закуп» = documents list; the old planner only at /procurement/plan; both document addresses use the document page')

const nav = read('src/platform/platformNav.js')
const order = ['procurement', 'orders', 'supplier-finance', 'warehouse'].map((id) => nav.indexOf(`id: '${id}'`))
assert.ok(order.every((i) => i > 0) && order.every((v, i) => i === 0 || order[i - 1] < v))
ok('menu «Закупки»: Закуп, Заказы, Расчёты, Склад')

for (const file of [
  'src/pages/platform/procurement/PurchaseDetailPage.jsx',
  'src/components/procurement/PurchaseItemsTable.jsx',
  'src/components/procurement/PurchaseItemForm.jsx',
  'src/components/procurement/CreatePurchaseForm.jsx',
  'src/components/procurement/PurchaseStatusBadge.jsx',
]) {
  assert.ok(!fs.existsSync(path.join(ROOT, file)), file)
}
ok('the old order card, items table, item form, create form and status badge are deleted')
assert.match(read('src/pages/platform/procurement/PurchaseDocumentPage.jsx'), /BUYER_LIST_PATH = '\/platform\/procurement'/)
ok('closing / deleting a document returns to «Закуп»')

console.log(`\n${checks} checks passed`)
