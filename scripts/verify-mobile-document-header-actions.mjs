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

assert.match(actions, /aria-label=\{cancelLabel\}[\s\S]*<CancelDocIcon/)
assert.match(actions, /cancelLabel = 'Отменить заказ'/)
assert.match(icons, /export function CancelDocIcon/)
assert.doesNotMatch(actions, /Скачать (Excel|PDF)|call\('export'/)
assert.doesNotMatch(actions, /MoreIcon|aria-label="Ещё"|commentLabel/)
ok('a saved document gets a «cancel» icon in the header; there is no «⋯» menu at all; «Скачать» is not in the header')

assert.match(page, /isPhone \? \(\s*<section className="pdoc__mcomment">/)
assert.match(page, /const \[commentBlockOpen, setCommentBlockOpen\] = useState\(false\)/)
assert.match(page, /aria-expanded=\{commentBlockOpen\}/)
assert.match(page, /onBlur=\{\(\) => \{\s*if \(commentText !== \(order\.comment \|\| ''\)\)/)
ok('phones: «Комментарий» is a collapsible block like UMAG, closed by default; a draft saves it when the field loses focus')

assert.match(page, /\{canDownload \? \(\s*<div className="pdoc__menu" ref=\{exportRef\}>/)
assert.match(page, /isPhone && saved && itemsReady && items\.length > 0 \? \(\s*<div className="pdoc__mbar pdoc__mbar--download">/)
assert.match(page, /className="btn btn--primary"[\s\S]{0,200}Скачать\s*<\/button>/)
ok('«Скачать» exists only for a saved document: a menu in the desktop bar, the green button of the bottom bar on phones')

assert.match(page, /\{commentLabel && !isPhone \? \(/)
assert.match(page, /\{!isPhone \? \(\s*<div className="pdoc__bar">/)
const mbar = page.slice(page.indexOf('<div className="pdoc__mbar">'), page.indexOf('{detailId &&'))
assert.doesNotMatch(mbar, /Сохранить/)
ok('phones no longer show the big «Добавить комментарий», «Удалить», «Скачать» and «Сохранить» buttons; the bottom bar keeps only the total')

assert.match(page, /phoneHandlersRef\.current = \{/)
ok('header handlers are read through a ref (the header node stays stable, no render loop)')

assert.match(page, /items\.length === 0 && !isPhone \? \(\s*<tr>\s*<td colSpan=\{9\} className="pdoc__empty">/)
ok('phones: no «Товаров пока нет.» line under «Товары (0)» (the heading already says it)')

const css = read('src/pages/platform/procurement/PurchaseDocumentPage.css')
assert.match(css, /\.pdoc--editable,\s*\.pdoc--has-download-bar\s*\{\s*min-height: calc\(100dvh - 52px/)
assert.match(css, /\.pdoc--editable \.pdoc__mbar,\s*\.pdoc--has-download-bar \.pdoc__mbar\s*\{\s*margin: auto -12px -40px/)
assert.match(css, /\.pdoc__mbar-total\s*\{[^}]*flex-direction: row[^}]*justify-content: space-between/)
ok('phones: the bottom bar sticks to the bottom of the screen even for a short document; «Итого» on the left, the sum on the right')

console.log(`\nverify:mobile-document-header-actions — ${checks} checks passed`)
