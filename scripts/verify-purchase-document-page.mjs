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

// Lesson: a <button> without an explicit colour is drawn in the browser's default blue (Safari).
for (const file of [
  'src/components/procurement/document/DocumentSupplierPicker.css',
  'src/components/procurement/document/CatalogTable.css',
  'src/pages/platform/procurement/PurchaseDocumentPage.css',
]) {
  const css = read(file).replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of css.matchAll(/([^{}]*\bbutton\b[^{}]*|[^{}]*(?:__button|__option|__remove|__link)\b[^{}]*)\{([^}]*)\}/g)) {
    const selector = m[1].trim()
    if (/:hover|:disabled|::|\[aria-selected='true'\]/.test(selector)) continue
    if (!/\bcolor:/.test(m[2]) && /background|border|cursor/.test(m[2])) {
      assert.fail(`${file}: "${selector}" styles a button without an explicit text colour`)
    }
  }
}
ok('every styled button in the document UI has an explicit text colour (no default blue)')

// Speed of add / remove: the row disappears at once, the server answer is reused (no second read), reads run in parallel.
assert.match(page, /setFullOrder\(\(prev\) => \(prev \? \{ \.\.\.prev, items: prev\.items\.filter/)
assert.match(page, /setFullOrder\(before\)/)
assert.doesNotMatch(page.slice(page.indexOf('async function handleDeleteItem'), page.indexOf('async function addProduct')), /reloadOrder\(\)/)
ok('removing a row is instant (optimistic) and restores the list on failure; no extra read after it')
const adapter = read('src/services/purchaseSupabaseAdapter.js')
assert.match(adapter, /Promise\.all\(\[\s*supabase\.from\('purchase_orders'\)/)
assert.match(adapter, /const needsOrder = items\.some/)
const service = read('src/services/purchaseDataService.js')
assert.match(service, /return afterOrderChange\(orderId\)/)
ok('fewer round trips: header + items read in parallel, the order is not read before a bulk insert, the fresh order is returned once')

const trig = read('supabase/migrations/20261029160000_purchase_order_totals_trigger.sql')
for (const kind of ['after insert', 'after update', 'after delete']) assert.ok(trig.includes(`${kind} on public.purchase_order_items`), kind)
assert.match(trig, /for each statement execute function public\.purchase_order_items_recalc_totals\(\)/)
const callers = adapter.split('\n').filter((line) => /await recalcOrderTotals\(/.test(line))
assert.equal(callers.length, 0)
ok('order totals are kept by statement-level triggers (insert / update / delete); the client no longer re-reads and rewrites them')

console.log(`\n${checks} checks passed`)
