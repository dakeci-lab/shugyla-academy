#!/usr/bin/env node
/**
 * Verification — «Расчёты» built like «Закуп»: a supplier opens as its own page (address), a document-style
 * header (title, «К оплате» on the right, «Закрыть» / «Редактировать», compact cards), list tools in one row,
 * readable dark supplier names, the return button reads «Оплатить».
 *
 * Usage:
 *   npm run verify:settlements-like-purchases
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

const app = read('src/App.jsx')
assert.match(app, /path="supplier-finance\/:supplierId"/)
ok('a supplier has its own address /platform/supplier-finance/:supplierId (Back, reload and links work)')

const panel = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')
assert.match(panel, /const \{ supplierId: routeSupplierId \} = useParams\(\)/)
assert.match(panel, /const selectedId = routeSupplierId \|\| null/)
assert.match(panel, /navigate\(id \? `\/platform\/supplier-finance\/\$\{encodeURIComponent\(id\)\}` : '\/platform\/supplier-finance'\)/)
assert.doesNotMatch(panel, /useState\(null\)\s*\n\s*const \[debtSummary/)
ok('the open supplier comes from the address, not from component state')

assert.match(panel, /function SupplierDocHeader\(/)
assert.doesNotMatch(panel, /SupplierIdentityCard|← К списку поставщиков/)
assert.match(panel, /className="sd-head"/)
assert.match(panel, /Закрыть\s*<\/button>/)
assert.match(panel, /Редактировать\s*<\/button>/)
assert.match(panel, /usePlatformPageTitle\('Расчёты', '', \{ showBack: true, backFallback: '\/platform\/supplier-finance' \}\)/)
ok('the supplier page has a document header with «Закрыть» / «Редактировать» (no «← К списку»); phones get the back arrow of the header')
assert.match(panel, /!isPhone \? \(\s*<div className="sd-bar">/)
assert.match(panel, /isPhone && editable \? \(\s*<IconActionButton variant="edit"/)
assert.match(panel, /<details className="sd-fold">/)
ok('on phones the pencil sits next to the name and the cards fold into one')
assert.doesNotMatch(panel.slice(panel.indexOf('function SupplierDocHeader('), panel.indexOf('function UmagSupplierDetail(')), /Удалить/)
ok('«Удалить» is not on the supplier page — only inside «Редактировать поставщика»')

assert.match(panel, /<span className="umag-settlements__pay-btn"|className="umag-settlements__pay-btn"/)
const cell = panel.slice(panel.indexOf('function OperationStatusCell'), panel.indexOf('/** Second line under the operation name'))
assert.match(cell, /\n\s*Оплатить\n/)
assert.doesNotMatch(cell, /Получили возврат/)
ok('a return is paid with the same «Оплатить» button')

const css = read('src/components/suppliers/settlements/UmagSettlementsPanel.css')
assert.match(css, /\.umag-settlements--list \.pgt__link\s*\{\s*color: var\(--color-text, #0f172a\);\s*font-weight: 600/)
assert.match(css, /\.umag-settlements__ops-filter--active\s*\{[^}]*color: var\(--color-text, #0f172a\)/)
ok('supplier names are dark and bold (green only on hover); a chosen chip keeps dark text')

const bar = read('src/components/suppliers/finance/SupplierFinancePanel.jsx')
assert.match(bar, /sfp-panel__tools-slot/)
assert.match(panel, /toolsSlot && listTools \? createPortal\(listTools, toolsSlot\) : listTools/)
ok('the list chips and search sit in the same row as «Фильтр» and the UMAG refresh')

assert.match(panel, /isPhoneList \? \(\s*<div className="sd-ops">/)
assert.match(panel, /className="sd-op__main"/)
assert.match(panel, /<span className="sd-op__status">\s*<OperationStatusCell/)
assert.match(css, /\.sd-op\s*\{[^}]*grid-template-columns: 18px minmax\(0, 1fr\) auto/)
assert.match(css, /\.sd-op__status \.umag-settlements__pay-btn\s*\{\s*height: var\(--pf-control-h\)/)
ok('phone operation rows: tick | name + amount / sub-line | «Оплатить» word button; bulk bar is compact')

console.log(`\nverify:settlements-like-purchases — ${checks} checks passed`)
