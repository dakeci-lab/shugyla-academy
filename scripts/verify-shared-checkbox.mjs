#!/usr/bin/env node
/**
 * Verification — one checkbox for the whole platform (the look of UMAG: 18px square, 4px corner, green border
 * and a green tick when ticked) and one clear green for ticked rows.
 *
 * Usage:
 *   npm run verify:shared-checkbox
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

const index = read('src/index.css')
assert.match(index, /:where\(input\[type='checkbox'\]\)\s*\{[^}]*appearance: none[^}]*width: 18px[^}]*height: 18px[^}]*border-radius: 4px/s)
ok('every checkbox is an 18px square with a 4px corner (not the round system one)')
assert.match(index, /:where\(input\[type='checkbox'\]\):checked\s*\{[^}]*border-color: var\(--color-primary[^}]*stroke='%23059669'/s)
assert.match(index, /:where\(input\[type='checkbox'\]\):indeterminate\s*\{[^}]*stroke='%23059669'/s)
ok('ticked: a white box with a green border and a green tick; «some» (select all) is a green dash')
assert.match(index, /--row-selected-bg: #d1fae5/)
assert.match(index, /--row-selected-hover: #bbf7d0/)
ok('one clear green for a ticked row (tokens in index.css)')

// No component keeps its own size / accent colour for a checkbox.
const cssFiles = []
;(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) walk(full)
    else if (full.endsWith('.css')) cssFiles.push(full)
  }
})(path.join(ROOT, 'src'))
const offenders = cssFiles.filter((file) => /accent-color/.test(fs.readFileSync(file, 'utf8')))
assert.deepEqual(offenders.map((file) => path.relative(ROOT, file)), [])
ok('no stylesheet paints a checkbox with accent-color any more (it made the system checkbox round and small)')
for (const [file, selector] of [
  ['src/components/platform/FilterComboField.css', '.pf-field__item input'],
  ['src/pages/platform/procurement/PurchaseDocumentsPage.css', '.pdl-check'],
  ['src/components/suppliers/settlements/UmagSettlementsPanel.css', '.umag-settlements__check'],
  ['src/components/admin/team/TeamManagementPage.css', '.team-matrix__checkbox'],
  ['src/components/admin/employees/EmployeeFilterPopover.css', '.employee-filter-popover__checkbox-row input'],
  ['src/components/sales/SalesShared.css', '.sales-bands__check input'],
]) {
  const css = read(file)
  const at = css.indexOf(selector)
  if (at === -1) continue
  const block = css.slice(at, css.indexOf('}', at))
  assert.doesNotMatch(block, /\b(width|height):/, `${selector} still sets its own size`)
}
ok('local rules no longer override the size of the shared checkbox')

// Ticked rows use the shared green.
assert.match(read('src/pages/platform/procurement/PurchaseDocumentsPage.css'), /\.pdl-row\.is-selected \.pgt__row-main\s*\{\s*background: var\(--row-selected-bg\)/)
assert.match(read('src/components/suppliers/settlements/UmagSettlementsPanel.css'), /umag-settlements__row--selected[\s\S]{0,120}var\(--row-selected-bg\)/)
assert.match(read('src/components/procurement/document/CatalogTable.css'), /tr\.is-selected td:not\(\.ctbl__week\)\s*\{\s*background: var\(--row-selected-bg\)/)
assert.match(read('src/components/procurement/document/CatalogTable.jsx'), /selected\.has\(item\.barcode\) \? ' is-selected'/)
assert.match(read('src/pages/platform/procurement/PurchaseDocumentPage.css'), /tr\.is-done td\s*\{\s*background: var\(--row-selected-bg\)/)
ok('ticked rows are clearly green in «Закуп», the payment history of «Расчёты», the product windows and the receiver checklist')

console.log(`\nverify:shared-checkbox — ${checks} checks passed`)
