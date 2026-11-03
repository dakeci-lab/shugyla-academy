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
assert.match(css, /\.pdoc__cards\s*\{\s*display: grid;[^}]*grid-template-columns: 260px minmax\(400px, 1fr\) 260px/)
assert.match(css, /max-width: 1080px\)\s*\{\s*\.pdoc__cards\s*\{\s*grid-template-columns: 1fr 1fr;\s*\}\s*\.pdoc__cards > \.pdoc__group\s*\{\s*grid-column: 1 \/ -1/)
ok('header: date | supplier (takes the remaining width, so a long name and the goods block always fit) | delivery; under 1080px the supplier goes on its own row on top')

assert.match(page, /canViewUmagSettlements\(user\) && isCloudMode\(\)/)
assert.match(page, /fetchNativeSupplierDebtSummary\(\{ platformSupplierIds: \[debtSupplierId\] \}\)/)
assert.match(page, /Баланс: <b className="num">\{formatPurchaseAmount\(supplierDebt\)\}/)
assert.match(page, /supplierDebt != null \?/)
ok('«Баланс» (what we owe the supplier) is shown in the supplier card for users who see payments; nothing is shown while it is unknown')
assert.match(css, /max-width: 720px\)[\s\S]*\.pdoc__group\s*\{[^}]*flex-direction: column/)
ok('on phones the block is a full-width button under the supplier')

assert.match(page, /showSuccess\('Поставщик успешно выбран'\)/)
ok('choosing a supplier shows the green «Поставщик успешно выбран» notice (top right, like UMAG)')
assert.match(css, /\.pdoc__goods-block\s*\{[^}]*animation: pdoc-goods-in 0\.35s/s)
assert.match(css, /@keyframes pdoc-goods-in/)
assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*\.pdoc__goods-block\s*\{\s*animation: none/)
ok('the «＋ Товары поставщика» block slides out smoothly (and not at all for reduced motion)')
assert.match(css, /\.pdoc__group > \.pdoc__card--supplier\s*\{\s*flex: 1 1 auto;\s*min-width: 0/)
assert.match(css, /\.pdoc__goods-block\s*\{\s*flex: none/)
ok('the supplier card may shrink (min-width 0) and the goods block never does, so nothing sticks out')

console.log(`\nverify:supplier-goods-block — ${checks} checks passed`)
