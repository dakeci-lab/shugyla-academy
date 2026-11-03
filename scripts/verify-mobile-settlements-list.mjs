import assert from 'node:assert/strict'
import fs from 'node:fs'

let checks = 0
const ok = (m) => { checks += 1; console.log(`  ✓ ${m}`) }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const panel = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')
const shell = read('src/components/suppliers/finance/SupplierFinancePanel.jsx')
const shellCss = read('src/components/suppliers/finance/SupplierFinancePanel.css')

assert.match(panel, /isPhoneMain\s*\?\s*\(\s*<PlatformFilterRow/)
assert.match(panel, /hint="Показать, Поставщик, Удалённые"/)
ok('phones: the same «Фильтры» row as «Закуп» and «Заказы»')

assert.match(panel, /const defaultListView = isPhoneMain \? 'all' : 'debt'/)
assert.match(panel, /matchMedia\?\.\('\(max-width: 640px\)'\)\.matches \? 'all' : 'debt'/)
assert.match(panel, /viewOptions=\{\[[\s\S]*'С долгом'[\s\S]*'Просрочено'[\s\S]*'Все'/)
assert.match(panel, /<span className="period-filter-popover__label">Показать<\/span>/)
assert.match(panel, /suppliersReady && debtsSettled && !isPhoneMain \? \(/)
ok('«С долгом / Просрочено / Все» moved into the filter sheet; phones open on «Все», the web keeps «С долгом»; no chips in the top bar')

assert.match(panel, /<PlatformFloatingSearch[\s\S]*placeholder="Поиск по поставщику"/)
assert.match(read('src/components/platform/PlatformFloatingSearch.jsx'), /createPortal\([\s\S]*document\.body/)
assert.match(read('src/components/platform/PlatformFloatingSearch.css'), /\.pfs\s*\{[^}]*position: fixed[^}]*bottom: calc\(14px \+ env\(safe-area-inset-bottom/s)
ok('phones: the supplier search floats at the bottom of the screen (a pill, drawn in document.body)')

assert.match(shell, /headerActions=\{headerActions\}/)
assert.match(shell, /isPhone && canSync \?[\s\S]*platform-mobile-header__icon-btn[\s\S]*Синхронизация UMAG/)
assert.match(shell, /canSync && !isPhone \? \(\s*<PlatformSyncButton/)
ok('phones: the UMAG sync button is an icon in the page header next to «Расчёты»')

assert.match(shellCss, /max-width: 640px\)\s*\{[\s\S]*\.sfp-panel__sync-status,\s*\.sfp-panel__tools-slot\s*\{\s*display: none/)
ok('phones: the «UMAG · дата синка» line is not shown')

console.log(`\nverify:mobile-settlements-list — ${checks} checks passed`)
