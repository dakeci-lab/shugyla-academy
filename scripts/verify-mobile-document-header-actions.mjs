import assert from 'node:assert/strict'
import fs from 'node:fs'

let checks = 0
const ok = (m) => { checks += 1; console.log(`  ✓ ${m}`) }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const page = read('src/pages/platform/procurement/PurchaseDocumentPage.jsx')
const actions = read('src/pages/platform/procurement/PurchaseDocumentPhoneActions.jsx')
const icons = read('src/components/icons/PlatformIcons.jsx')

assert.match(icons, /export function CheckIcon/)
assert.match(icons, /export function MoreIcon/)
ok('the shared icon set has a plain check mark and «⋯»')

assert.match(page, /actions: phoneActions/)
assert.match(page, /isPhone && order \? \(\s*<PurchaseDocumentPhoneActions/)
ok('on phones the document passes its actions to the header slot of usePlatformPageTitle')

assert.match(actions, /aria-label="Удалить"[\s\S]*<TrashIcon/)
assert.match(actions, /aria-label="Сохранить"[\s\S]*<CheckIcon/)
assert.match(actions, /pdoc-phone-actions__delete/)
ok('trash can and check mark are icon buttons in the header (no words)')

for (const label of ['Скачать Excel', 'Скачать PDF', 'Отменить заказ']) assert.ok(actions.includes(label), label)
assert.match(actions, /commentLabel \? \(/)
ok('download, comment and cancel live in the «⋯» menu')

assert.match(page, /\{commentLabel && !isPhone \? \(/)
assert.match(page, /\{!isPhone \? \(\s*<div className="pdoc__bar">/)
const mbar = page.slice(page.indexOf('<div className="pdoc__mbar">'), page.indexOf('{detailId &&'))
assert.doesNotMatch(mbar, /Сохранить/)
ok('phones no longer show the big «Добавить комментарий», «Удалить», «Скачать» and «Сохранить» buttons; the bottom bar keeps only the total')

assert.match(page, /phoneHandlersRef\.current = \{/)
ok('header handlers are read through a ref (the header node stays stable, no render loop)')

console.log(`\nverify:mobile-document-header-actions — ${checks} checks passed`)
