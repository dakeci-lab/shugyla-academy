#!/usr/bin/env node
/**
 * Verification — stage 4 of «Закуп как документы»: the document page (docs/procurement/purchase-documents/PLAN.md).
 * Pure helpers run for real; UI checks assert on source.
 *
 * Usage: npm run verify:purchase-document-page
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

const doc = await import(pathToFileURL(path.join(ROOT, 'src/utils/purchaseDocument.js')).href)

assert.equal(doc.formatLongRuDate('2026-10-29'), 'чт, 29.10.2026')
ok('long Russian date')
assert.equal(doc.documentTitle({ number: 1047 }), 'Заказ №1047')
assert.equal(doc.documentTitle({ number: null }), 'Новый заказ')
ok('title: «Заказ №N» / «Новый заказ»')

const draft = { status: 'draft', supplierId: 's1', supplierName: 'Борте' }
const row = (qty, name = 'Колбаса') => ({ productName: name, orderQty: qty })
assert.match(doc.validateDocumentForSave(draft, []), /хотя бы один товар/)
assert.match(doc.validateDocumentForSave({ status: 'draft' }, [row(1)]), /поставщика/)
assert.match(doc.validateDocumentForSave(draft, [row(0, 'Сосиски')]), /«Сосиски»/)
assert.match(doc.validateDocumentForSave(draft, [row(0), row(0, 'B')]), /2 товаров/)
assert.equal(doc.validateDocumentForSave(draft, [row(3)]), '')
assert.match(doc.validateDocumentForSave({ ...draft, status: 'saved' }, [row(3)]), /только черновик/)
ok('save validation: items, supplier, quantity above zero, only drafts')
assert.equal(doc.documentTotal([{ orderQty: 2, purchasePrice: 150.4 }, { orderQty: 1, purchasePrice: 99 }]), 301 + 99)
ok('document total')
assert.deepEqual(
  doc.suppliersOrderedToday(
    [{ id: 1, orderWeekdays: ['thu'] }, { id: 2, orderWeekdays: ['fri'] }, { id: 3 }],
    'thu'
  ).map((s) => s.id),
  [1]
)
ok('«Сегодня» tab = suppliers with today as order day')

const page = read('src/pages/platform/procurement/PurchaseDocumentPage.jsx')
assert.match(page, /className="pdoc__status">\{draft \? 'Черновик' : 'Сохранён'\}/)
assert.doesNotMatch(page, /StatusBadge/)
ok('status is plain text')
for (const label of ['Сохранить', 'Закрыть', 'Удалить', 'Отменить', 'Скачать ▾']) {
  assert.ok(page.includes(label), label)
}
assert.doesNotMatch(page, /Сохранить как черновик/)
ok('buttons: Сохранить, Закрыть, Удалить, Отменить, Скачать; no «Сохранить как черновик»')
assert.match(page, /disabled=\{!itemsReady || items\.length > 0\}/)
ok('supplier is locked once the document has items')
assert.match(page, /Добавить комментарий/)
assert.match(page, /<AdminModal\s+title="Комментарий"/)
ok('comment opens in a small modal')
assert.match(page, /handleQtyCommit[\s\S]*updatePurchaseOrderItem/)
assert.match(page, /saveMeta\(\{ expectedDeliveryDate: value \}\)/)
ok('every edit is saved at once (quantity on blur, delivery date, supplier, comment)')
assert.doesNotMatch(page, /notifyChange|refresh\(\)|reloadProcurement/)
ok('no full reload from the card (per-order cache patch only)')
assert.match(page, /ConfirmDialog[\s\S]*Удалить черновик\?/)
assert.match(page, /ConfirmDialog[\s\S]*Отменить заказ\?/)
ok('delete and cancel ask for confirmation')

const app = read('src/App.jsx')
assert.match(app, /path="procurement\/documents\/:id"[\s\S]*?<PurchaseDocumentPage \/>/)
const list = read('src/pages/platform/procurement/PurchaseDocumentsPage.jsx')
assert.match(list, /DOCUMENT_PATH_PREFIX = '\/platform\/procurement\/documents'/)
ok('route registered; the list opens documents on the new page')

console.log(`\n${checks} checks passed`)
