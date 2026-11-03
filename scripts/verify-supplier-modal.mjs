#!/usr/bin/env node
/**
 * Verification — «Редактировать поставщика» (and the shared form window): no «Синхронизировано с UMAG» banner,
 * selects are not clipped (same height rule as inputs), «Удалить» / «Уволить» are the shared red button,
 * labels line up with the fields.
 *
 * Usage:
 *   npm run verify:supplier-modal
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

const form = read('src/components/suppliers/SupplierForm.jsx')
assert.doesNotMatch(form, /Синхронизировано с UMAG/)
assert.doesNotMatch(form, /ID \$\{form\.umagSupplierId\}/)
assert.match(form, /form\.isUmagActive === false \?/)
assert.match(form, /supplier-form__local-hint/)
ok('the «Синхронизировано с UMAG · ID» banner is gone; only «Неактивен в UMAG» and the «Не связан с UMAG» warning remain')

const index = read('src/index.css')
const web = index.slice(index.indexOf('@media (min-width: 641px)'))
assert.match(web, /select:not\(\[multiple\]\):not\(\[size\]\)\s*\{[^}]*height: var\(--pf-control-h\)[^}]*padding-top: 0;\s*padding-bottom: 0/)
ok('selects follow the same height rule as the inputs with the same weight, so a component padding of 10px can no longer clip their text')

const panel = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')
assert.match(panel, /className="btn btn--danger suppliers-modal-footer__status-action"[\s\S]{0,160}Удалить\s*<\/button>/)
assert.doesNotMatch(panel, /Удалить поставщика\s*<\/button>/)
const employee = read('src/components/admin/employees/EmployeeEditModal.jsx')
assert.match(employee, /className="btn btn--danger employees-modal-footer__status-action"/)
const panelCss = read('src/components/suppliers/settlements/UmagSettlementsPanel.css')
const empCss = read('src/components/admin/employees/EmployeeEditModal.css')
assert.doesNotMatch(panelCss, /status-action--danger/)
assert.doesNotMatch(empCss, /status-action--danger/)
ok('«Удалить» (supplier) and «Уволить сотрудника» are the shared filled red button; the gray 44px variants are gone')
assert.match(panelCss, /max-width: 480px\)[\s\S]*suppliers-modal-footer__status-action\s*\{\s*width: 100%;\s*min-height: 44px/)
ok('the 44px touch size of those buttons stays on phones only')

assert.match(read('src/components/suppliers/SupplierForm.css'), /\.supplier-form__payment-terms\s*\{[^}]*padding: 0/s)
assert.match(read('src/components/suppliers/SupplierWeekdaySelector.css'), /\.supplier-weekday-selector__legend\s*\{[^}]*padding: 0/s)
ok('«Способ оплаты», «Дни заказа» … line up with the fields above (no 2–3px shift)')

console.log(`\nverify:supplier-modal — ${checks} checks passed`)
