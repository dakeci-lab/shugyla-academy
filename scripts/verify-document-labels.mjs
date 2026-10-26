#!/usr/bin/env node
/**
 * Verification — one wording for an order across the card, the PDF/Excel exports, the planner's delivery field and the orders list.
 *
 * Usage:
 *   npm run verify:document-labels
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let checks = 0
const ok = (name) => {
  checks += 1
  console.log(`  ✓ ${name}`)
}

const labelsSrc = read('src/config/documentLabels.js')
const labels = Object.fromEntries([...labelsSrc.matchAll(/^\s{2}(\w+): '([^']+)'/gm)].map((m) => [m[1], m[2]]))
assert.equal(labels.delivery, 'Ожидаемая доставка')
assert.equal(labels.totalAmount, 'Сумма заказа')
ok('the dictionary holds the canonical terms (delivery = «Ожидаемая доставка», total = «Сумма заказа»)')

const exporter = read('src/utils/purchaseOrderExport.js')
const consumers = {
  'order card': read('src/pages/platform/procurement/PurchaseDetailPage.jsx'),
  'planner bar': read('src/components/procurement/ProcurementSupplierPlanBar.jsx'),
  'planner modal': read('src/components/procurement/ProcurementPlannerView.jsx'),
  'orders list': read('src/components/procurement/PurchaseTable.jsx'),
}
// The words must come from the dictionary, not be retyped: none of these screens/exporters may contain the literals for the shared terms.
for (const key of ['supplier', 'orderDate', 'delivery', 'createdBy', 'comment', 'product', 'barcode', 'qty', 'price', 'amount', 'totalItems', 'totalAmount', 'documentTitle']) {
  assert.doesNotMatch(exporter, new RegExp(`['"\`>]${labels[key]}[:'"\`<]`), `exporter retypes «${labels[key]}»`)
}
for (const [name, src] of Object.entries(consumers)) {
  for (const key of ['delivery', 'createdBy', 'totalAmount']) {
    assert.doesNotMatch(src, new RegExp(`<dt>${labels[key]}</dt>|<span>${labels[key]}</span>`), `${name} retypes «${labels[key]}»`)
  }
  assert.match(src, /ORDER_LABELS/, `${name} does not use the dictionary`)
}
assert.match(exporter, /ORDER_LABELS as L/)
ok('PDF and Excel export, order card, planner bar / modal and the orders list take the shared terms from the dictionary')

assert.match(exporter, /\$\{L\.delivery\}: /)
assert.match(exporter, /\[L\.number, L\.product, L\.barcode, L\.qty, L\.price, L\.amount\]/)
assert.match(exporter, /L\.comment/)
ok('PDF and Excel print the same headers (delivery, price, amount) and both carry the comment')

console.log(`\nverify:document-labels — ${checks} checks passed`)
