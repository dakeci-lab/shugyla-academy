#!/usr/bin/env node
/**
 * Verification — «Заказы», «Расчёты», «Склад»: the pencil at the right end of a row (as in UMAG), one size for the
 * controls of the top bars, the date link of «Склад» in the platform's green. No bulk «Действие» menu there (yet).
 *
 * Usage:
 *   npm run verify:page-controls
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

// --- «Заказы» -----------------------------------------------------------------------------------------
const table = read('src/components/procurement/PurchaseTable.jsx')
assert.match(table, /key: 'edit', label: '', width: 44, align: 'end', mobile: 'hide'/)
assert.match(table, /<IconActionButton\s+variant="edit"\s+label="Открыть"/)
assert.match(table, /<PencilIcon size=\{16\} \/>/)
assert.match(table, /interactive\s+onClick=\{\(\) => navigate\(path\)\}/)
assert.match(table, /event\.stopPropagation\(\)/)
ok('«Заказы»: a pencil at the right of each order opens it; the row stays clickable (no button inside a button); hidden on phones')
const ordersCss = read('src/pages/platform/orders/OrdersPage.css')
assert.match(ordersCss, /\.orders-page__preset\s*\{[^}]*height: var\(--pf-control-h\)[^}]*border-radius: var\(--pf-control-radius\)[^}]*font-size: var\(--pf-control-fs\)/s)
ok('«Заказы»: the period buttons have the size of every top-bar control (38px, 4px, 13.5px)')
const ordersPage = read('src/pages/platform/orders/OrdersPage.jsx')
assert.doesNotMatch(ordersPage, /PlatformActionsMenu|type="checkbox"/)
ok('«Заказы»: no checkboxes and no «Действие» menu (nothing meaningful to do in bulk for the receiver)')

// --- «Расчёты» ---------------------------------------------------------------------------------------
const panel = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')
assert.match(panel, /\.\.\.\(canEdit \? \[\{ key: 'edit', label: '', width: 44, align: 'end', mobile: 'hide' \}\] : \[\]\)/)
assert.match(panel, /canEdit && s\.id !== UNASSIGNED_SUPPLIER_ID \?\s*\(\s*<IconActionButton\s+variant="edit"\s+label="Редактировать поставщика"\s+onClick=\{\(\) => openEdit\(s\)\}/)
ok('«Расчёты»: a pencil in each supplier row opens «Редактировать поставщика»; not for «Поставщик не выбран», not without the right to edit')
const css = read('src/components/suppliers/settlements/UmagSettlementsPanel.css')
for (const rule of ['.umag-settlements__ops-filter {', '.umag-settlements__search {']) {
  const block = css.slice(css.indexOf(rule), css.indexOf('}', css.indexOf(rule)))
  assert.match(block, /height: var\(--pf-control-h\)/, rule)
  assert.match(block, /border-radius: var\(--pf-control-radius\)/, rule)
  assert.match(block, /font-size: var\(--pf-control-fs\)/, rule)
}
assert.match(read('src/components/suppliers/finance/SupplierFinancePanel.css'), /\.sfp-panel__sync \.platform-search-toolbar__icon-btn\s*\{\s*width: var\(--pf-control-h\);\s*height: var\(--pf-control-h\);\s*border-radius: var\(--pf-control-radius\)/)
ok('«Расчёты»: filter chips, search and the refresh button have the same size and corner as «Фильтр»')

// --- «Склад» -----------------------------------------------------------------------------------------
const warehouse = read('src/components/procurement/ProcurementWarehouseView.jsx')
assert.match(warehouse, /<IconActionButton\s+variant="edit"\s+label="Открыть"[\s\S]{0,200}openSnapshot\(snapshot\)/)
assert.match(warehouse, /<PencilIcon size=\{16\} \/>/)
assert.doesNotMatch(warehouse, /proc-wh__icon-btn/)
ok('«Склад»: a pencil opens the snapshot; the download button is the shared icon button too')
assert.match(read('src/components/procurement/ProcurementWarehouseView.css'), /\.proc-wh__date-link\s*\{[^}]*color: #047857/s)
ok('«Склад»: the date link is the platform green, not blue')

// --- one blue pencil everywhere -------------------------------------------------------------------------
const button = read('src/components/admin/IconActionButton.jsx')
const buttonCss = read('src/components/admin/IconActionButton.css')
assert.match(button, /variant === 'edit'\s*\?\s*'icon-action-btn--edit'/)
assert.match(buttonCss, /\.icon-action-btn--edit\s*\{[^}]*color: var\(--color-action, #1976d2\)[^}]*border-color: var\(--color-action, #1976d2\)/)
assert.match(read('src/index.css'), /--color-action: #1976d2/)
const pencilFiles = [
  'src/components/admin/employees/EmployeeListTable.jsx',
  'src/components/suppliers/settlements/UmagSettlementsPanel.jsx',
  'src/components/procurement/PurchaseTable.jsx',
  'src/components/procurement/ProcurementWarehouseView.jsx',
  'src/pages/platform/procurement/PurchaseDocumentsPage.jsx',
]
for (const file of pencilFiles) {
  const text = read(file)
  const buttons = text.match(/<IconActionButton(?:(?!<\/IconActionButton>)[\s\S])*?<PencilIcon/g) || []
  assert.ok(buttons.length > 0, file)
  for (const tag of buttons) assert.match(tag, /variant="edit"/, `a pencil in ${file} is not the blue edit button`)
}
ok('every pencil button (documents, orders, suppliers, supplier card, warehouse, users) is the same blue one, like UMAG')

console.log(`\nverify:page-controls — ${checks} checks passed`)
