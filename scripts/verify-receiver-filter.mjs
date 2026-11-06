import assert from 'node:assert/strict'
import fs from 'node:fs'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

let checks = 0
const ok = (m) => { checks += 1; console.log(`  ✓ ${m}`) }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

globalThis.__VITE_ENV__ = {}
register(pathToFileURL(new URL('./lib/extensionlessResolver.mjs', import.meta.url).pathname))
const period = await import('../src/utils/settlementsPeriod.js')
const list = await import('../src/utils/purchaseDocumentsList.js')

const { ORDERS_PERIOD_PRESET_OPTIONS, SETTLEMENTS_PERIOD_PRESET: P, getSettlementsPeriodDates, resolveSettlementsPeriodPreset, addDaysToDateKey, toSettlementsDateKey } = period
assert.deepEqual(
  ORDERS_PERIOD_PRESET_OPTIONS.map((o) => o.id),
  [P.YESTERDAY, P.TODAY, P.TOMORROW, P.WEEK, P.MONTH]
)
ok('the receiver\'s quick periods: Вчера, Сегодня, Завтра, Неделя, Месяц (no «Три месяца»)')

const today = toSettlementsDateKey()
const tomorrow = addDaysToDateKey(today, 1)
assert.deepEqual(getSettlementsPeriodDates(P.TOMORROW), { dateFrom: tomorrow, dateTo: tomorrow })
assert.equal(resolveSettlementsPeriodPreset(tomorrow, tomorrow), P.TOMORROW)
ok('«Завтра» is the next calendar day and is recognised back from the dates')

const { selectReceiverOrders, RECEIVER_STATUS } = list
const saved = (id, supplierId, supplierName, delivery, extra = {}) => ({
  id, supplierId, supplierName, status: 'saved', expectedDeliveryDate: delivery, number: 1000 + id.length, ...extra,
})
const orders = [
  saved('a1', 's1', 'Алиди', today, { checkedAt: '2026-11-05T10:00:00Z' }),
  saved('a2', 's2', 'Базар', today),
  saved('a3', 's1', 'Алиди', tomorrow),
  { id: 'd1', supplierId: 's1', supplierName: 'Алиди', status: 'draft', expectedDeliveryDate: today },
]
const day = (d) => ({ dateFrom: d, dateTo: d, supplierIds: [], status: '', q: '' })
assert.deepEqual(selectReceiverOrders(orders, day(today)).map((o) => o.id).sort(), ['a1', 'a2'])
assert.deepEqual(selectReceiverOrders(orders, day(tomorrow)).map((o) => o.id), ['a3'])
assert.deepEqual(selectReceiverOrders(orders, { ...day(today), supplierIds: ['s2'] }).map((o) => o.id), ['a2'])
assert.deepEqual(selectReceiverOrders(orders, { ...day(today), status: RECEIVER_STATUS.CHECKED }).map((o) => o.id), ['a1'])
assert.deepEqual(selectReceiverOrders(orders, { ...day(today), status: RECEIVER_STATUS.UNCHECKED }).map((o) => o.id), ['a2'])
assert.deepEqual(selectReceiverOrders(orders, { ...day(today), q: 'базар' }).map((o) => o.id), ['a2'])
assert.deepEqual(selectReceiverOrders(orders, { ...day(today), q: 'tovar' }, new Set(['a1'])).map((o) => o.id), ['a1'])
ok('the receiver\'s list: saved orders by DELIVERY date, narrowed by supplier, «Сверено» / «Не сверено» and a text (supplier, number, or an item found by name / barcode)')

const page = read('src/pages/platform/orders/OrdersPage.jsx')
assert.match(page, /findPurchaseOrderIdsByItemText/)
assert.match(page, /presetOptions=\{ORDERS_PERIOD_PRESET_OPTIONS\}/)
assert.match(page, /<PlatformFilterTrigger/)
assert.match(page, /<FilterComboField/)
assert.match(page, /RECEIVER_STATUS\.UNCHECKED/)
ok('«Заказы» use the shared filter (period, name / barcode / number, supplier, status) on the phone and on the web, ')
assert.doesNotMatch(page, /orders-page__presets|pickPreset/)
assert.doesNotMatch(page, /summaryText|describeOrdersSummary/)
assert.match(page, /className="orders-page__search"/)
assert.match(page, /<PlatformFloatingSearch/)
assert.match(page, /clearTimeout\(timer\)/)
ok('2026-11-05: nothing of the filter stands outside it — no period buttons and no «Сегодня ждём…» line; the web has the standard search box next to «Фильтр», the phone has the floating search at the bottom (the same text as the filter\'s «Название, штрихкод или номер»; the server search for items waits for a pause in typing)')
const doc = read('src/pages/platform/procurement/PurchaseDocumentPage.jsx')
assert.match(doc, /const receivingView = documentListPath\(pathname\) === '\/platform\/orders'/)
assert.match(doc, /const canEdit = canEditPurchase\(user\) && !receivingView/)
ok('the document view follows the ADDRESS: from «Заказы» every role (director, buyer, receiver) gets the same read-only receiving view (ticks per row, «Сверено», prices and «Скачать» stay; no «Отменить», no editing); the buyer\'s editing view is only under «Закуп»')
const tbl = read('src/components/procurement/PurchaseTable.jsx')
assert.match(tbl, /className=\{order\.checkedAt \? 'ord-row ord-row--checked' : 'ord-row ord-row--unchecked'\}/)
assert.doesNotMatch(tbl, /key: 'checked'/)
assert.match(read('src/pages/platform/orders/OrdersPage.css'), /@media \(min-width: 641px\) \{\s*\.ord-row--unchecked \.pgt__row-main/)
ok('the web table of «Заказы»: «Не сверено» looks like a draft (muted italic), «Сверено» like a saved document (green number and line under the sum); the phone row is unchanged')
const rdoc = read('src/pages/platform/procurement/PurchaseDocumentPage.jsx')
assert.match(rdoc, /async function handleReceive\(\)/)
assert.match(rdoc, /setConfirm\('receive'\)/)
assert.match(rdoc, /confirm === 'unreceive'/)
assert.match(rdoc, /aria-label="Отметить все строки"/)
assert.doesNotMatch(rdoc, /Всё сверено|Снять отметку/)
assert.match(rdoc, /showChecklist \? \(order\.checkedAt \? order\.checkedByName/)
assert.match(read('src/components/procurement/PurchaseTable.jsx'), /\{ key: 'creator', label: 'Принял'/)
assert.match(read('src/components/procurement/PurchaseTable.jsx'), /order\.checkedAt \? order\.checkedByName/)
ok('receiving: «Сохранить» next to «Закрыть» saves the order as accepted on the name of the user (an incomplete tick list asks first), «Отменить приёмку» asks for a confirmation and reopens the ticks; one tick in the table head ticks / clears all rows; the list shows «Принял» (blank until accepted) instead of «Создал»')
const pcss = read('src/pages/platform/procurement/PurchaseDocumentPage.css')
assert.match(rdoc, /placeholder="Поиск по таблице"/)
assert.match(rdoc, /const totalQty = items\.reduce/)
assert.match(rdoc, /pdoc__total-qty/)
assert.match(pcss, /@media \(min-width: 641px\) \{\s*\.pdoc__table-wrap \{\s*overflow-x: clip;[\s\S]*\.pdoc__table tfoot td \{\s*position: sticky;\s*bottom: 0;/)
ok('the product table of a document (web): «Поиск по таблице» (name / barcode) above it; the footer row «Итого» carries the total quantity and the total sum of the whole document and is pinned to the bottom edge of the screen while the table scrolls')
const pcss2 = read('src/pages/platform/procurement/PurchaseDocumentPage.css')
assert.match(rdoc, /className="pdoc__counter"/)
assert.match(pcss2, /@media \(min-width: 641px\) \{\s*\.pdoc__items \{\s*border: 0;[\s\S]*\.pdoc__table-wrap \{\s*border: 1px solid/)
assert.match(pcss2, /\.pdoc__table-search \{\s*flex: 1 1 auto;\s*max-width: none;/)
ok('web, like UMAG: the counter of the ticked rows («Сверено: N из M», on the left) and «Поиск по таблице» (next to it, wide) are separate blocks OUTSIDE the table frame; the table is the framed block')
assert.doesNotMatch(read('src/pages/platform/procurement/PurchaseDocumentPage.css'), /tr\.is-done[^{]*\{[^}]*(line-through|opacity)/)
ok('a ticked row is only highlighted (green), the text is neither struck through nor dimmed')
assert.match(read('src/platform/platformNav.js'), /id: 'orders',\s*path: '\/platform\/orders',\s*label: 'Приёмка'/)
assert.match(read('src/config/permissionCatalog.js'), /receiving: 'Приёмка'/)
ok('the section is called «Приёмка» (menu, title, roles matrix); the address /platform/orders is unchanged')
assert.match(rdoc, /const canDownload = saved && \(!showChecklist \|\| Boolean\(order\?\.checkedAt\)\)/)
assert.match(rdoc, /\{canDownload \? \(\s*<div className="pdoc__menu"/)
assert.match(rdoc, /isPhone && canDownload && itemsReady/)
assert.match(read('src/pages/platform/procurement/PurchaseDocumentPage.css'), /tfoot \.pdoc__total-qty,\s*\.pdoc__table tfoot \.pdoc__total-gap \{\s*display: none;/)
ok('«Скачать» exists only for a saved document; in «Приёмка» only after the receiving is saved («Сохранить»), on the web and on the phone; the phone totals bar stays «Итого» + sum')
assert.match(read('src/pages/platform/procurement/PurchaseDocumentPage.css'), /\.pdoc__c-check \{\s*grid-area: del;\s*justify-self: end;/)
ok('phones: the tick of a row of the receiving view stands on the right, in the place of the «×» of the buyer\'s document (like «Закуп»)')
assert.match(read('src/pages/platform/procurement/PurchaseDocumentPage.jsx'), /\(!isPhone \|\| !editable\)/)
assert.match(read('src/pages/platform/procurement/PurchaseDocumentPage.css'), /\.pdoc__table-search \{\s*order: 5;\s*flex: 1 1 100%/)
ok('phones: «Поиск по таблице» is a full-width field under «Товары (N)» / «Сверено» for read-only documents (the draft has its own add-field)')
const docSrc = read('src/pages/platform/procurement/PurchaseDocumentPage.jsx')
assert.match(docSrc, /const showTicks = showChecklist && !order\?\.checkedAt/)
assert.match(docSrc, /\{showTicks \? \(\s*<th className="pdoc__c-check">/)
assert.match(docSrc, /\{showTicks \? \(\s*<td className="pdoc__c-check">/)
ok('after «Сохранить» the whole tick column (head and rows) is gone from the saved receiving, not just disabled')
const ordersPageSrc = read('src/pages/platform/orders/OrdersPage.jsx')
assert.match(ordersPageSrc, /describeSettlementsPeriod\(filter\.dateFrom, filter\.dateTo\)/)
assert.match(ordersPageSrc, /pf-filter-chip orders-page__chip/)
ok('«Приёмка» (web): the chosen period is a chip next to «Фильтр» like in «Закуп» («Сегодня», «Неделя» or the dates); × returns to today, only when the period was changed')

console.log(`\nverify:receiver-filter — ${checks} checks passed`)
