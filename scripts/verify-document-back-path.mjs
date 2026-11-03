#!/usr/bin/env node
/**
 * Verification — a document returns to the list it was opened from («Заказы» or «Закуп»), whoever the user is.
 *
 * Usage:
 *   npm run verify:document-back-path
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

const { documentListPath } = await import(pathToFileURL(path.join(ROOT, 'src/utils/purchaseDocument.js')).href)
assert.equal(documentListPath('/platform/orders/abc'), '/platform/orders')
assert.equal(documentListPath('/platform/orders'), '/platform/orders')
ok('a document opened under /platform/orders returns to «Заказы»')
assert.equal(documentListPath('/platform/procurement/documents/abc'), '/platform/procurement')
assert.equal(documentListPath('/platform/procurement'), '/platform/procurement')
assert.equal(documentListPath(undefined), '/platform/procurement')
assert.equal(documentListPath('/platform/ordersX/abc'), '/platform/procurement')
ok('a document opened under /platform/procurement returns to «Закуп»')

const page = fs.readFileSync(path.join(ROOT, 'src/pages/platform/procurement/PurchaseDocumentPage.jsx'), 'utf8')
assert.match(page, /const LIST_PATH = documentListPath\(pathname\)/)
assert.doesNotMatch(page, /canEdit \? BUYER_LIST_PATH/)
ok('the page takes its list from the address, not from canEditPurchase()')
for (const use of [/backFallback: LIST_PATH/, /navigate\(LIST_PATH\)/, /navigate\(LIST_PATH, \{ replace: true \}\)/, /<Link to=\{LIST_PATH\}/]) {
  assert.match(page, use)
}
ok('«Закрыть», the phone back arrow, the redirect after deleting and «К списку» all use that list')

console.log(`\nverify:document-back-path — ${checks} checks passed`)
