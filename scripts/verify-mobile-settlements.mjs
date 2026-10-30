#!/usr/bin/env node
/**
 * Verification — stage 6 of the mobile work: «Расчёты» on phones (supplier filter as a bottom sheet,
 * supplier card as a sheet with «Наши настройки» first, one row of weekdays, 16px fields).
 *
 * Usage:
 *   npm run verify:mobile-settlements
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

const panel = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')
assert.match(panel, /const isPhone = useMediaQuery\('\(max-width: 900px\)'\)/)
assert.match(panel, /if \(isPhone\) \{\s*return \(\s*<AdminModal sheet title="Фильтр"/)
assert.match(panel, /if \(!open \|\| isPhone\) return undefined/)
ok('the supplier list filter opens as a bottom sheet on phones (the click-outside popover is desktop only)')
assert.match(panel, /<AdminModal\s+sheet\s+title="Редактировать поставщика"/)
ok('the supplier card edit window is a bottom sheet on phones')

const form = read('src/components/suppliers/SupplierForm.jsx')
const formCss = read('src/components/suppliers/SupplierForm.css')
assert.match(form, /supplier-form__identity--locked/)
assert.match(form, /className="supplier-form__ours"/)
assert.match(formCss, /max-width: 640px\)\s*\{\s*\.supplier-form__identity--locked\s*\{\s*order: 2/)
ok('on phones «Наши настройки» come first, the read-only UMAG data goes below')

assert.match(read('src/components/suppliers/SupplierWeekdaySelector.css'), /max-width: 640px\)\s*\{\s*\.supplier-weekday-selector__grid\s*\{\s*grid-template-columns: repeat\(7/)
ok('all seven weekdays fit one row on phones')
assert.match(read('src/components/suppliers/settlements/UmagSettlementsPanel.css'), /max-width: 640px\)\s*\{\s*\.umag-settlements input\[type='text'\][\s\S]*font-size: 16px/)
ok('the fields of «Расчёты» are 16px on phones (no page zoom on focus in iOS Safari)')

console.log(`\nverify:mobile-settlements — ${checks} checks passed`)
