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

const fsCss = read('src/components/platform/PlatformFloatingSearch.css')
assert.match(panel, /total=\{canViewFinance \? \(debtLoading \? '…' : formatUmagMoney\(totalDebt\)\) : null\}/)
assert.match(read('src/components/platform/PlatformFloatingSearch.jsx'), /className="pfs-total"/)
assert.match(fsCss, /\.pfs-total\s*\{[^}]*position: fixed[^}]*bottom: 0/s)
assert.match(fsCss, /\.pfs\.pfs--with-total\s*\{\s*bottom: calc\(62px/)
assert.match(read('src/components/suppliers/settlements/UmagSettlementsPanel.css'), /\.umag-settlements--list \.pgt__foot\s*\{\s*display: none/)
ok('phones: the total of the list is pinned at the bottom of the screen under the search pill (not at the end of the table)')

assert.match(panel, /describeOpenDocuments\(\{ count: entry\?\.count \|\| 0 \}\)/)
assert.match(panel, /entry\?\.overdueCount && !isPhoneMain/)
ok('phones: a supplier row is the name, the number of unpaid documents and the sum — no «с 03.11», no «просрочено N»')

for (const [file, rule] of [
  ['src/components/platform/PlatformGridTable.css', /@media \(hover: hover\) \{\s*\.pgt__link:hover \{\s*text-decoration: underline/],
  ['src/components/platform/PlatformGridTable.css', /@media \(hover: hover\) \{\s*\.pgt__row:hover > \.pgt__row-main/],
  ['src/components/suppliers/settlements/UmagSettlementsPanel.css', /@media \(hover: hover\) \{\s*\.umag-settlements--list \.pgt__row:hover \.pgt__link/],
  ['src/components/suppliers/settlements/UmagSettlementsPanel.css', /@media \(hover: hover\) \{\s*\.umag-settlements__op-link:hover/],
]) assert.match(read(file), rule, `${file} ${rule}`)
ok('the underline / green name / row highlight appear only where there is a real mouse hover — no sticky green underline after a tap on a phone')

console.log(`\nverify:mobile-settlements-list — ${checks} checks passed`)
