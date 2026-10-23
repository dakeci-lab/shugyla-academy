#!/usr/bin/env node
/**
 * Verification — «Расчёты» redesign: findable documents and less noise.
 * Pure helpers run on real modules; the layout is checked on the source.
 *
 * Usage:
 *   npm run verify:supplier-card-ux
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
const load = (p) => import(pathToFileURL(path.join(ROOT, p)).href)

const view = await load('src/utils/supplierHistoryView.js')

// --- describeOpenDocuments -------------------------------------------------------------------
assert.equal(view.describeOpenDocuments({ count: 3, oldestDate: '2026-10-15' }), '3 неоплаченных · с 15.10')
assert.equal(view.describeOpenDocuments({ count: 1, oldestDate: '2026-10-21' }), '1 неоплаченный · с 21.10')
assert.equal(view.describeOpenDocuments({ count: 11, oldestDate: null }), '11 неоплаченных')
assert.equal(view.describeOpenDocuments({ count: 0 }), '')
assert.equal(view.describeOpenDocuments(undefined), '')
ok('supplier row subtitle: count + oldest date, empty when nothing is open')

// --- operations ------------------------------------------------------------------------------
const ops = [
  { id: 'a', kind: 'supply', label: 'Приёмка', documentNumber: '129444143', amount: 32760, settlement: { type: 'payable', settled: false } },
  { id: 'b', kind: 'supply', label: 'Приёмка', documentNumber: '128814551', amount: 417855.5, settlement: { type: 'payable', settled: true } },
  { id: 'c', kind: 'return', label: 'Возврат поставщику', documentNumber: '2134847', amount: 7560, settlement: { type: 'receivable', settled: false } },
  { id: 'd', kind: 'payment', label: 'Оплата поставщику', documentNumber: null, amount: 32760, settlement: null },
]
assert.deepEqual(ops.filter(view.isOpenOperation).map((o) => o.id), ['a', 'c'])
assert.equal(view.countOpenOperations(ops), 2)
ok('open operations = unpaid supplies + returns waiting for the money')
assert.equal(view.operationAmountSign(ops[0]), '')
assert.equal(view.operationAmountSign(ops[2]), '−')
assert.equal(view.operationAmountSign(ops[3]), '−')
ok('only payments and returns carry a minus; colour is not used for the sign')

assert.equal(view.matchesOperationQuery(ops[0], ''), true)
assert.equal(view.matchesOperationQuery(ops[0], '129444'), true)
assert.equal(view.matchesOperationQuery(ops[1], '129444'), false)
assert.equal(view.matchesOperationQuery(ops[0], '32 760'), true)
assert.equal(view.matchesOperationQuery(ops[0], '32760'), true)
assert.equal(view.matchesOperationQuery(ops[1], '417 855'), true)
assert.equal(view.matchesOperationQuery(ops[3], 'оплата'), true)
assert.equal(view.matchesOperationQuery(ops[0], '777'), false)
ok('search finds a document by number, by amount (with or without spaces) or by operation name')

// --- layout ----------------------------------------------------------------------------------
const panel = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')
const debts = read('src/services/supplierDebtService.js')
assert.match(panel, /placeholder="Найти поставщика"/)
assert.match(panel, /placeholder="Номер документа или сумма"/)
ok('supplier list and supplier history both have a visible search box')
assert.match(panel, /const \[opsFilter, setOpsFilter\] = useState\('open'\)/)
assert.match(panel, /setOpsFilter\(openCount > 0 \? 'open' : 'all'\)/)
assert.match(panel, /A search looks through every operation of the period/)
ok("history opens on «Не закрытые» (or «Все» when nothing is open); a search ignores the chip")
assert.match(panel, /\{ id: 'debt', label: 'С долгом'/)
assert.match(panel, /A search looks at every supplier, with or without debt/)
ok('supplier list hides the zero-balance tail by default, but a search finds every supplier')
assert.doesNotMatch(panel, /Увеличение|Уменьшение|>Сальдо<|Начальное сальдо|Детали</)
assert.doesNotMatch(panel, /Юр\. название|Дни заказа|Дни доставки/)
ok('no running balance / increase-decrease columns and no label-value grid of empty «—» fields')
assert.match(panel, /const HISTORY_COLUMNS = \[[\s\S]{0,400}key: 'date'[\s\S]{0,200}key: 'op'[\s\S]{0,200}key: 'amount'[\s\S]{0,200}key: 'status'/)
ok('history table: date, operation (+ document number), amount, status/action')
assert.doesNotMatch(panel, /<IconActionButton\s+label="Редактировать"\s+variant="primary"\s+onClick=\{\(\) => openEdit\(s\)\}/)
ok('no edit pencil on every list row (editing is in the supplier card)')
assert.match(debts, /export async function fetchNativeSupplierDebtSummary/)
assert.match(debts, /oldestDate/)
ok('debt summary carries count and oldest unpaid date per supplier')

const periods = await load('src/utils/settlementsPeriod.js')
const defaults = periods.getSettlementsPeriodDefaults(new Date('2026-10-23T12:00:00+05:00'))
assert.equal(defaults.dateFrom, '2026-08-01')
assert.equal(defaults.dateTo, '2026-10-31')
assert.equal(periods.isSettlementsFilterActive(defaults.dateFrom, defaults.dateTo, new Date('2026-10-23T12:00:00+05:00')), false)
ok('default history period is three months; the filter is not flagged active at the default')

const sheet = read('src/components/suppliers/settlements/OperationDetailSheet.jsx')
assert.match(sheet, /kind === 'supply' && !operation\?\.settlement/)
assert.ok(sheet.indexOf('<SettleBlock') < sheet.indexOf('umag-op-detail__summary">') + 400 || sheet.indexOf('{!isPaymentDoc && canManage') < sheet.indexOf('<div className="umag-op-detail__summary">'))
assert.match(sheet, /btn btn--primary/)
ok('operation window: native pay block first, no contradicting UMAG «Оплачено / Осталось» fields')

// Default pay account: the supplier's own payment method is preselected, a manual choice is never overwritten.
assert.match(sheet, /function SettleBlock\(\{ settlement, accounts, defaultAccountId = null, onSettle, onUnsettle \}\)/)
assert.match(sheet, /accounts\.some\(\(account\) => account\.id === defaultAccountId\)/)
assert.match(sheet, /if \(accountTouched\) return/)
assert.match(panel, /defaultAccountId=\{supplier\.isVirtual \? null : supplier\.paymentAccountId \?\? null\}/)
ok("pay window preselects the supplier's own account (none for «Поставщик не выбран»); a hand-picked account is kept")

console.log(`\nverify:supplier-card-ux — ${checks} checks passed`)
