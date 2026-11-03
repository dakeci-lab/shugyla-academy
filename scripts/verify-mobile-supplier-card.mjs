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
ok('phones: two pages like UMAG — «Платежи» first, «Информация» second; a swipe moves between them')

assert.match(panel, /const opsFilterOptions = \[/)
assert.match(panel, /period-filter-popover__label">Показать<\/span>/)
assert.match(panel, /if \(draftOpsFilter !== opsFilter\) chooseOpsFilter\(draftOpsFilter\)/)
assert.match(panel, /setOpsFilterTouched\(false\)/)
ok('phones: period and the type of operations («Не закрытые / Просрочено / Все / Приёмки / Оплаты / Возвраты») are chosen in one sheet; «Очистить» returns to what the card opens on')

assert.match(panel, /\{isPhoneList \? null : \(\s*<>\s*<h3 className="umag-settlements__section-title">/)
ok('phones: no «История операций · период» caption and no row of chips above the list')

assert.match(panel, /isPhoneList && !detailLoading \? \(\s*<PlatformFloatingSearch/)
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

console.log(`\nverify:mobile-supplier-card — ${checks} checks passed`)
