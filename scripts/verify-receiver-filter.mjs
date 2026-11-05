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

console.log(`\nverify:receiver-filter — ${checks} checks passed`)
