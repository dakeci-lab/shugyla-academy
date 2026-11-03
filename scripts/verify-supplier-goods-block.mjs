#!/usr/bin/env node
/**
 * Verification — the document header like UMAG: the supplier card with «Баланс», and next to it, in one frame,
 * a «＋ Товары поставщика» block that exists only once a supplier is chosen (blue, like UMAG's).
 *
 * Usage:
 *   npm run verify:supplier-goods-block
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
let checks = 0
const ok = (name) => {
  checks += 1
  console.log(`  ✓ ${name}`)
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const page = read('src/pages/platform/procurement/PurchaseDocumentPage.jsx')
const css = read('src/pages/platform/procurement/PurchaseDocumentPage.css')

assert.match(page, /<div className="pdoc__group">[\s\S]*pdoc__card--supplier[\s\S]*editable && order\.supplierId && isCloudMode\(\) \? \(\s*<div className="pdoc__goods-block">/)
assert.doesNotMatch(page, /className="pdoc__link"/)
ok('«＋ Товары поставщика» is a block next to the supplier card (same group), shown only for an editor with a chosen supplier; the old link under the picker is gone')
assert.match(css, /\.pdoc__group\s*\{[^}]*border: 1px solid[^}]*\}/s)
assert.match(css, /\.pdoc__goods-block\s*\{[^}]*border-left: 1px solid/s)
assert.match(css, /\.pdoc__goods-btn\s*\{[^}]*color: var\(--color-action, #1976d2\)/s)
ok('one frame with a divider line; the button is blue like UMAG')
assert.match(css, /\.pdoc__cards > \.pdoc__card\s*\{\s*flex: 0 0 280px/)
ok('header cards are compact (own width, left to right), not three stretched thirds')

assert.match(page, /canViewUmagSettlements\(user\) && isCloudMode\(\)/)
assert.match(page, /fetchNativeSupplierDebtSummary\(\{ platformSupplierIds: \[debtSupplierId\] \}\)/)
assert.match(page, /Баланс: <b className="num">\{formatPurchaseAmount\(supplierDebt\)\}/)
assert.match(page, /supplierDebt != null \?/)
ok('«Баланс» (what we owe the supplier) is shown in the supplier card for users who see payments; nothing is shown while it is unknown')
assert.match(css, /max-width: 720px\)[\s\S]*\.pdoc__group\s*\{[^}]*flex-direction: column/)
ok('on phones the block is a full-width button under the supplier')

console.log(`\nverify:supplier-goods-block — ${checks} checks passed`)
