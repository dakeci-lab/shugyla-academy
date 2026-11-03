#!/usr/bin/env node
/**
 * Verification — mobile foundation (stage 1) and the «Закуп» list on phones (stage 2):
 * bottom-sheet filter, «+» button, day groups, status pill.
 *
 * Usage:
 *   npm run verify:mobile-foundation
 */

import fs from 'fs'
import path from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

let checks = 0
const ok = (name) => {
  checks += 1
  console.log(`  ✓ ${name}`)
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const { documentGroupKey, formatDocumentGroupLabel } = await import(
  pathToFileURL(path.join(ROOT, 'src/utils/purchaseDocumentsList.js')).href
)

assert.equal(documentGroupKey({ status: 'draft', createdAt: '2026-10-30T10:00:00' }), '2026-10-30')
assert.equal(documentGroupKey({ status: 'saved', createdAt: '2026-10-28T12:00:00' }), '2026-10-28')
assert.equal(documentGroupKey({ status: 'saved' }), 'none')
ok('drafts and saved documents are grouped by creation day (no separate «Черновики» group)')
assert.equal(formatDocumentGroupLabel('none'), 'Без даты')
assert.match(formatDocumentGroupLabel('2026-10-30'), /^Пт, 30 Октября$/)
assert.match(formatDocumentGroupLabel('2026-10-28'), /^Ср, 28 Октября$/)
ok('group label reads «Пт, 30 Октября» (like UMAG)')

const modal = read('src/components/admin/AdminModal.jsx')
const modalCss = read('src/components/admin/AdminModal.css')
assert.match(modal, /sheet = false/)
assert.match(modalCss, /\.admin-modal-overlay--sheet[\s\S]{0,80}align-items: flex-end/)
assert.match(modalCss, /\.admin-modal--sheet[\s\S]{0,300}border-radius: 16px 16px 0 0/)
assert.match(modalCss, /\.admin-modal--sheet input[\s\S]{0,120}font-size: 16px/)
ok('AdminModal has a bottom-sheet variant for phones (inputs 16px, safe-area padding)')
assert.match(read('src/components/platform/PeriodFilterPopover.jsx'), /<AdminModal\s+sheet\s+title="Фильтры"/)
ok('the shared period filter opens as a bottom sheet on phones')

const fabCss = read('src/components/platform/PlatformFab.css')
assert.match(fabCss, /\.pfab\s*\{\s*display: none/)
assert.match(fabCss, /max-width: 640px[\s\S]*position: fixed/)
assert.match(fabCss, /color: #fff/)
const fab = read('src/components/platform/PlatformFab.jsx')
assert.match(fab, /createPortal\([\s\S]*document\.body\s*\)/)
assert.match(read('src/components/platform/PullToRefresh.css'), /will-change: transform/)
ok('the «+» button is phones-only with an explicit color (no Safari default blue) and is drawn in document.body — the page wrapper has will-change: transform, which would pin a fixed child to the end of a long list')

const page = read('src/pages/platform/procurement/PurchaseDocumentsPage.jsx')
assert.match(page, /<PlatformFab label="Создать заказ"/)
assert.match(page, /formatDocumentGroupLabel\(groupKey\)/)
assert.match(page, /pdl-pill/)
ok('the list renders the «+» button, day group headers and a status pill')
const pageCss = read('src/pages/platform/procurement/PurchaseDocumentsPage.css')
assert.match(pageCss, /max-width: 640px[\s\S]*\.pdl-bar > \.btn\s*\{\s*display: none/)
assert.match(pageCss, /\.pdl-row--draft \.pgt__cell[\s\S]{0,80}font-style: normal/)
ok('on phones the top «Создать» button is hidden and drafts are not gray italic')
assert.match(read('src/components/procurement/TablePagination.css'), /\.table-pagination \.sr-only/)
ok('the pagination page-size label stays visually hidden on every page')

const listPage = read('src/pages/platform/procurement/PurchaseDocumentsPage.jsx')
assert.match(listPage, /isPhone \? \(\s*<button[\s\S]*className="pdl-filter-row"/)
assert.match(listPage, /Дата, Поставщик, Статус документа, Название/)
assert.match(pageCss, /\.pdl-bar__chip\s*\{\s*display: none/)
const meta = listPage.slice(listPage.indexOf('mobileMeta={'), listPage.indexOf('</Fragment>'))
assert.match(meta, /formatDocumentTime\(order\)/)
assert.match(meta, /isDraft \? 'Черновик' : 'Сохранён'/)
assert.doesNotMatch(meta, /поз\.|доставка|createdByName|number/)
ok('phones: one «Фильтры» row (the period lives inside the filter); a list row is the supplier, the sum, the creation time and the status')

assert.match(pageCss, /\.pdl-row \.pgt__title\s*\{\s*font-size: 14px;\s*font-weight: 700/)
assert.match(pageCss, /\.pdl-row \.pgt__money\s*\{\s*font-size: 14px;\s*font-weight: 400/)
assert.match(pageCss, /\.pdl-row \.pdl-nonumber\s*\{[^}]*font-style: normal[^}]*color: var\(--color-text/)
ok('phone list text sizes follow UMAG (supplier 14px bold, sum 14px); «Поставщик не выбран» is not gray italic')

const sheet = read('src/components/platform/PeriodFilterPopover.jsx')
const sheetCss = read('src/components/platform/PeriodFilterPopover.css')
assert.match(sheet, /headerAction=\{[\s\S]*Очистить/)
assert.match(sheet, /period-sheet__apply[\s\S]*Применить/)
assert.match(sheet, /phone \? 'За период' : 'Период'/)
assert.match(sheet, /phone \? preset\.shortLabel : preset\.label/)
assert.match(read('src/utils/settlementsPeriod.js'), /shortLabel: '3 мес'/)
assert.match(sheetCss, /\.period-sheet \.period-filter-popover__presets\s*\{\s*flex-wrap: nowrap/)
assert.match(sheetCss, /\.period-sheet \.pf-field__label\s*\{\s*position: absolute/)
ok('phone filter sheet like UMAG: «Фильтры» + «Очистить» in the header, «За период», five chips in one row, plain outlined fields (names as placeholders), one full-width «Применить»')

assert.match(sheet, /\{phone \? null : \(\s*<>\s*<span className="period-filter-popover__label">Произвольный период<\/span>/)
assert.doesNotMatch(sheetCss, /period-filter-popover__date-field > span:first-child/)
ok('the phone filter has no «С / По» fields (UMAG has none); the desktop popover keeps them')

console.log(`\nverify:mobile-foundation — ${checks} checks passed`)
