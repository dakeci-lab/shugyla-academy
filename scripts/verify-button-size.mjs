#!/usr/bin/env node
/**
 * Verification — one height for every button on the web (≥641px): the token --pf-control-h (32px, like UMAG),
 * taken by .btn (also btn--sm / btn--lg), the filter trigger, icon buttons, pay buttons and the bars' controls.
 * The length follows the label (no wrapping). Phones keep their own sizes.
 *
 * Usage:
 *   npm run verify:button-size
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
assert.match(index, /@media \(min-width: 641px\)\s*\{\s*:root\s*\{\s*--pf-control-h: 32px/)
ok('the web button height is one token: 32px (the phone value stays separate)')
assert.match(index, /@media \(min-width: 641px\)\s*\{[^@]*?\.btn,\s*\.btn--sm,\s*\.btn--lg\s*\{[^}]*height: var\(--pf-control-h\)[^}]*white-space: nowrap/s)
ok('.btn, .btn--sm and .btn--lg all have that height, never wrap their label, and share padding / font / corner')

for (const [file, needle] of [
  ['src/components/platform/PlatformFilterTrigger.css', /\.pf-trigger\s*\{[^}]*height: var\(--pf-control-h/s],
  ['src/components/admin/IconActionButton.css', /\.icon-action-btn\s*\{[^}]*height: var\(--pf-control-h/s],
  ['src/components/platform/PlatformSearchToolbar.css', /\.platform-search-toolbar__icon-btn\s*\{[^}]*height: var\(--pf-control-h/s],
  ['src/components/suppliers/settlements/UmagSettlementsPanel.css', /\.umag-settlements__pay-btn\s*\{[^}]*height: var\(--pf-control-h\)/s],
  ['src/components/admin/team/TeamManagementPage.css', /\.team-role-select__control\s*\{[^}]*height: var\(--pf-control-h/s],
  ['src/components/platform/PlatformActionsMenu.css', /\.pact\s*\{[^}]*height: var\(--pf-control-h/s],
]) {
  assert.match(read(file), needle, file)
}
ok('filter trigger, icon buttons, toolbar buttons, «Оплатить», role picker and the «Действие» menu take the same token')

// No stylesheet may give a button class its own fixed pixel height on the web.
const cssFiles = []
;(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) walk(full)
    else if (full.endsWith('.css')) cssFiles.push(full)
  }
})(path.join(ROOT, 'src'))
const offenders = []
for (const file of cssFiles) {
  const css = read(path.relative(ROOT, file))
  for (const block of css.matchAll(/(^|\n)([^{}@\n][^{}]*\b(?:btn|button)\b[^{}]*)\{([^}]*)\}/g)) {
    const selector = block[2].trim()
    if (/@media|:root/.test(selector)) continue
    const body = block[3]
    const m = body.match(/(?:^|[;\s])(?:min-)?height:\s*(\d+(?:\.\d+)?)px/)
    if (m && !/icon-btn|close|remove|stepper|nav-btn|back|burger|fab|pfab/.test(selector)) {
      offenders.push(`${path.relative(ROOT, file)}: ${selector} → ${m[0].trim()}`)
    }
  }
}
// Known intentional exceptions: tabs, pagination arrows, avatar, phone-only sizes.
const allowed = /mobile\.css|EmployeeEditModal|UmagSettlementsPanel\.css: \.(suppliers-modal-footer|umag-settlements__bulk|sd-selbar)|ProcurementPlannerView|DocumentSupplierPicker|TablePagination|PlatformMobileHeader|PlatformSidebar|PlatformUserMenu|SalesShared|PlatformDesktopNav|AdminModal|PeriodFilterPopover|SupplierGoodsModal|SupplierGoodsPage|CatalogTable|ProcurementSupplierPlanBar|PurchaseDocumentPage|OperationDetailSheet|TeamManagementPage|PlatformSyncButton|FilterComboField|IconActionButton|ItemDetailSheet|PlatformGridTable|PullToRefresh|ProfilePage/
const real = offenders.filter((line) => !allowed.test(line))
assert.deepEqual(real, [], 'a button class sets its own pixel height:\n' + real.join('\n'))
ok('no page stylesheet gives a button its own fixed height (only the shared token decides)')

// --- every «Удалить» button: filled red with white text, one red ---
assert.match(index, /--color-danger: #c03c34/)
assert.match(index, /\.btn--danger\s*\{\s*color: #fff;\s*background: var\(--color-danger\)/)
assert.match(read('src/components/admin/ConfirmDialog.jsx'), /'btn--danger'/)
assert.match(read('src/pages/platform/procurement/PurchaseDocumentPage.jsx'), /className="btn btn--danger" disabled=\{busy\} onClick=\{\(\) => setConfirm\('delete'\)\}/)
assert.match(read('src/components/ProfileAvatarEditor.jsx'), /className="btn btn--danger btn--sm"/)
ok('«Удалить» (in the document, in every confirmation, «Удалить фото») is one filled red button, #c03c34')

// --- fields share the height of the buttons on the web ---
const web = index.slice(index.indexOf('@media (min-width: 641px)'))
assert.match(web, /input:not\(\[type='checkbox'\]\)[\s\S]{0,460}select:not\(\[multiple\]\):not\(\[size\]\)\s*\{[^}]*height: var\(--pf-control-h\)[^}]*min-height: var\(--pf-control-h\)/)
assert.match(read('src/components/procurement/document/DocumentDateBox.css'), /min-height: var\(--pf-control-h, 36px\)/)
assert.match(read('src/components/procurement/document/DocumentSupplierPicker.css'), /min-height: var\(--pf-control-h, 36px\)/)
ok('text / search / number / date / select fields (also inputs without a type) have the button height on the web; textareas keep theirs')

console.log(`\nverify:button-size — ${checks} checks passed`)
