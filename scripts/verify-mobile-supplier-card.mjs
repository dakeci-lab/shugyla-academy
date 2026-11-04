import assert from 'node:assert/strict'
import fs from 'node:fs'

let checks = 0
const ok = (m) => { checks += 1; console.log(`  ✓ ${m}`) }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const panel = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')

assert.match(panel, /showFilterIcon = isPhoneList && canViewFinance && phoneTab === 'pay'/)
assert.match(panel, /aria-label="Фильтры"/)
ok('phones: the filter is an icon of the page header next to the pencil, only on the «Платежи» page')

assert.match(panel, /\{ id: 'pay', label: 'Платежи' \},\s*\{ id: 'info', label: 'Информация' \}/)
assert.match(panel, /setPhoneTab\(dx < 0 \? 'info' : 'pay'\)/)
assert.match(panel, /onTouchMove/)
assert.match(panel, /translateX\(calc\(\$\{phoneTab === 'pay' \? 0 : -50\}% \+ \$\{dragX \?\? 0\}px\)\)/)
assert.match(panel, /sd-tabs__bar/)
assert.match(read('src/components/suppliers/settlements/UmagSettlementsPanel.css'), /\.sd-pages\s*\{[^}]*touch-action: pan-y/)
ok('phones: two pages like UMAG — «Платежи» first, «Информация» second; the pages follow the finger and settle on release; the tab underline moves with them')

assert.match(panel, /const opsFilterOptions = \[/)
assert.match(panel, /period-filter-popover__label">Показать<\/span>/)
assert.match(panel, /if \(draftOpsFilter !== opsFilter\) chooseOpsFilter\(draftOpsFilter\)/)
assert.match(panel, /setOpsFilterTouched\(false\)/)
ok('phones: period and the type of operations («Не закрытые / Просрочено / Все / Приёмки / Оплаты / Возвраты») are chosen in one sheet; «Очистить» returns to what the card opens on')

assert.match(panel, /\{isPhoneList \? null : \(\s*<>\s*<h3 className="umag-settlements__section-title">/)
ok('phones: no «История операций · период» caption and no row of chips above the list')

assert.match(panel, /isPhoneList && phoneTab === 'pay' && !detailLoading \? \(\s*<PlatformFloatingSearch/)
assert.match(panel, /total=\{formatUmagMoney\(supplier\.debt \?\? 0\)\}/)
ok('phones: the search floats at the bottom and the debt total is pinned under it')

assert.match(panel, /usePlatformPageTitle\(isPhoneList \? supplier\.name : ''/)
assert.match(panel, /umag-settlements__header-edit/)
ok('phones: the supplier name is the page title and the pencil is a header icon')

const rows = panel.slice(panel.indexOf('<div className="sd-ops">'), panel.indexOf('<PgtTable columns={historyColumns}>'))
assert.doesNotMatch(rows, /checkbox|pgt__day|OperationStatusCell/)
assert.match(rows, /formatUmagDate\(op\.sortAt\)/)
assert.match(rows, /sd-pill sd-pill--overdue/)
ok('phones: one flat list — no day groups, no ticks, no «Оплатить» button; number, amount, date and the red «Просрочено» pill; a tap opens the payment window')

assert.match(panel, /sd-info__card/)
ok('phones: the supplier data lives on the «Информация» page')

const headerCss = read('src/components/platform/PlatformMobileHeader.css')
assert.match(headerCss, /\.platform-mobile-header__actions\s*\{[^}]*gap: 8px/)
assert.doesNotMatch(read('src/components/suppliers/settlements/UmagSettlementsPanel.css'), /header-filter\s*\{[^}]*margin/)
ok('the gap between header icons is set once, in the header container (no page adds its own margin)')

const sheet = read('src/components/suppliers/settlements/OperationDetailSheet.jsx')
const sheetCss = read('src/components/suppliers/settlements/OperationDetailSheet.css')
assert.match(sheet, /function PayDialog\(/)
const dialog = sheet.slice(sheet.indexOf('function PayDialog('), sheet.indexOf('export default function OperationDetailSheet'))
assert.doesNotMatch(dialog, /userName|Сотрудник|source\.account/)
assert.match(sheet, /openToSettle \? \(\s*<PayDialog/)
assert.match(sheetCss, /\.umag-op-detail__backdrop\s*\{[^}]*align-items: center/)
assert.doesNotMatch(dialog, /Отмена\s*<\/button>/)
assert.match(sheetCss, /max-width: 640px\) \{\s*\.umag-op-detail__backdrop:has\(\.umag-op-detail__pay-amount\) \{\s*align-items: flex-end;/)
ok('the payment window of an open document: document, big sum, deadline, account, one «Оплатить» button (no «Отмена»: «×» and the background close it); a full-width sheet at the bottom on phones, centred on the web; no UMAG employee / account')

assert.match(read('src/index.css'), /--row-pressed-bg: #eef1f5/)
assert.match(read('src/components/suppliers/settlements/UmagSettlementsPanel.css'), /\.sd-op:active\s*\{\s*background: var\(--row-pressed-bg\)/)
assert.match(read('src/components/platform/PlatformGridTable.css'), /\.pgt__row-main--button:active\s*\{\s*background: var\(--row-pressed-bg\)/)
ok('a pressed row (touch) gets a soft grey (--row-pressed-bg), not the green of a ticked row; the same in the supplier card and in the lists')

assert.match(read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx'), /onClick=\{isPhoneMain \? \(\) => setSelectedId\(s\.id\) : undefined\}\s*interactive=\{isPhoneMain\}/)
ok('phones: a row of the «Расчёты» list is one tappable row (opens the card) and gets the same soft press highlight')

assert.match(read('src/pages/platform/procurement/PurchaseDocumentPage.css'), /tr:not\(\.is-done\):has\(\.pdoc__c-name:active\)\s*\{\s*background: var\(--row-pressed-bg\)/)
ok('phones: a product row of the purchase / order document gets the same soft press highlight (a row ticked by the receiver stays green)')

const gridCss = read('src/components/platform/PlatformGridTable.css')
assert.match(gridCss, /\.pgt \{\s*margin-inline: calc\(-1 \* var\(--page-gutter, 12px\)\);[^}]*border-left: 0;[^}]*border-radius: 0;/)
assert.match(read('src/components/platform/PlatformFilterRow.css'), /margin-inline: calc\(-1 \* var\(--page-gutter, 12px\)\);[^}]*border-radius: 0;/)
assert.match(read('src/pages/platform/procurement/ProcurementPage.css'), /\.procurement-list-panel \{\s*margin-inline: calc\(-1 \* var\(--page-gutter, 12px\)\)/)
assert.match(read('src/pages/platform/procurement/PurchaseDocumentPage.css'), /\.pdoc__items \{\s*margin-inline: calc\(-1 \* var\(--page-gutter, 12px\)\)/)
assert.match(read('src/layouts/PlatformLayout.css'), /--page-gutter: 12px/)
ok('phones: lists (tables, the filter row, the supplier history, the product list of a document) run edge to edge like UMAG — no block with margins and rounded corners')

assert.match(read('src/pages/platform/procurement/PurchaseDocumentPage.css'), /\.pdoc__items-title \{\s*padding-inline: 16px;[\s\S]*\.pdoc__add \{\s*padding-inline: 16px;[\s\S]*tbody tr:not\(:has\(\.pdoc__c-check\)\)/)
ok('phones: the title, the search, the button and the rows of a document product list start at one left edge (16px), no empty ticks column')

console.log(`\nverify:mobile-supplier-card — ${checks} checks passed`)
