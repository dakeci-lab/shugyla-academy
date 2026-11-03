import assert from 'node:assert/strict'
import fs from 'node:fs'

let checks = 0
const ok = (m) => { checks += 1; console.log(`  ✓ ${m}`) }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const panel = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')

assert.match(panel, /filterTrigger = isPhoneList \? \(\s*<PlatformFilterRow/)
assert.match(panel, /hint="Период, Тип операций"/)
ok('phones: the supplier card has the same single «Фильтры» row as the lists')

assert.match(panel, /const opsFilterOptions = \[/)
assert.match(panel, /period-filter-popover__label">Показать<\/span>/)
assert.match(panel, /if \(draftOpsFilter !== opsFilter\) chooseOpsFilter\(draftOpsFilter\)/)
assert.match(panel, /setOpsFilterTouched\(false\)/)
ok('phones: period and the type of operations («Не закрытые / Просрочено / Все / Приёмки / Оплаты / Возвраты») are chosen in one sheet; «Очистить» returns to what the card opens on')

assert.match(panel, /\{isPhoneList \? null : \(\s*<>\s*<h3 className="umag-settlements__section-title">/)
ok('phones: no «История операций · период» caption and no row of chips above the list')

assert.match(panel, /isPhoneList && !detailLoading && selectedOps\.length === 0 \? \(\s*<PlatformFloatingSearch/)
assert.match(panel, /placeholder="Номер или сумма"/)
ok('phones: the document search floats at the bottom (hidden while rows are ticked, the pay bar takes that place)')

assert.match(panel, /usePlatformPageTitle\(\s*selected && isPhoneMain \? selected\.name : 'Расчёты'/)
assert.match(panel, /umag-settlements__header-edit/)
assert.match(panel, /sd-head--phone/)
ok('phones: the supplier name is the page title and the pencil is a header icon (not in the card body)')

assert.match(panel, /className="pgt__day"/)
assert.match(panel, /formatDocumentGroupLabel\(dayKey\)/)
assert.match(panel, /sd-pill sd-pill--overdue/)
ok('phones: operations are grouped by day like «Закуп», overdue is a red pill')

console.log(`\nverify:mobile-supplier-card — ${checks} checks passed`)
