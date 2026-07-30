#!/usr/bin/env node
/**
 * Verification: supplier ledger balance + UMAG document-payment wiring.
 * Usage: npm run verify:supplier-ledger
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  attachRunningBalances,
  balanceDeltaForLedgerEvent,
  debtDecrease,
  debtIncrease,
  LEDGER_EVENT_TYPES,
} from '../src/utils/supplierLedger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let testsRun = 0
let testsPassed = 0

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  testsRun += 1
  if (!condition) fail(`${name}${detail ? `: ${detail}` : ''}`)
  testsPassed += 1
  console.log(`  ✓ ${name}`)
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function nearly(a, b, eps = 0.01) {
  return Math.abs(Number(a) - Number(b)) <= eps
}

function main() {
  console.log('=== Supplier ledger verification ===\n')

  console.log('Balance delta map')
  assert('receiving +', balanceDeltaForLedgerEvent(LEDGER_EVENT_TYPES.RECEIVING, 100000) === 100000)
  assert('payment -', balanceDeltaForLedgerEvent(LEDGER_EVENT_TYPES.SUPPLIER_PAYMENT, 40000) === -40000)
  assert('return -', balanceDeltaForLedgerEvent(LEDGER_EVENT_TYPES.SUPPLIER_RETURN, 10000) === -10000)
  assert('refund 0 (no double count)', balanceDeltaForLedgerEvent(LEDGER_EVENT_TYPES.SUPPLIER_REFUND, 10000) === 0)
  assert('increase helper', debtIncrease(50) === 50 && debtIncrease(-50) === 0)
  assert('decrease helper', debtDecrease(-50) === 50 && debtDecrease(50) === 0)

  console.log('Partial payments running balance')
  const { eventsAsc, closingBalance } = attachRunningBalances(
    [
      { id: '1', eventType: LEDGER_EVENT_TYPES.RECEIVING, amount: 100000, occurredAt: '2026-07-01T10:00:00+05:00' },
      { id: '2', eventType: LEDGER_EVENT_TYPES.SUPPLIER_PAYMENT, amount: 40000, occurredAt: '2026-07-05T10:00:00+05:00' },
      { id: '3', eventType: LEDGER_EVENT_TYPES.SUPPLIER_PAYMENT, amount: 60000, occurredAt: '2026-07-10T10:00:00+05:00' },
    ],
    0
  )
  assert('after first payment saldо 60000', nearly(eventsAsc[1].runningBalance, 60000))
  assert('after full payment saldо 0', nearly(closingBalance, 0))

  console.log('Same-day stable order')
  const sameDay = attachRunningBalances([
    { id: 'b', eventType: LEDGER_EVENT_TYPES.SUPPLIER_PAYMENT, amount: 10, occurredAt: '2026-07-01T12:00:00+05:00' },
    { id: 'a', eventType: LEDGER_EVENT_TYPES.RECEIVING, amount: 100, occurredAt: '2026-07-01T12:00:00+05:00' },
  ])
  assert('same datetime uses id order', sameDay.eventsAsc[0].id === 'a')

  console.log('Return + refund no double decrease')
  const ret = attachRunningBalances([
    { id: '1', eventType: LEDGER_EVENT_TYPES.RECEIVING, amount: 100, occurredAt: '2026-07-01' },
    { id: '2', eventType: LEDGER_EVENT_TYPES.SUPPLIER_RETURN, amount: 30, occurredAt: '2026-07-02' },
    { id: '3', eventType: LEDGER_EVENT_TYPES.SUPPLIER_REFUND, amount: 30, occurredAt: '2026-07-03' },
  ])
  assert('closing after return+refund = 70', nearly(ret.closingBalance, 70))

  console.log('Decimal amounts')
  const dec = attachRunningBalances([
    { id: '1', eventType: LEDGER_EVENT_TYPES.RECEIVING, amount: 163570.7, occurredAt: '2026-07-10' },
    { id: '2', eventType: LEDGER_EVENT_TYPES.SUPPLIER_PAYMENT, amount: 100000, occurredAt: '2026-07-15' },
    { id: '3', eventType: LEDGER_EVENT_TYPES.SUPPLIER_PAYMENT, amount: 63570.7, occurredAt: '2026-07-17' },
  ])
  assert('decimal closes to 0', nearly(dec.closingBalance, 0))

  console.log('Structural')
  const migration = read('supabase/migrations/20260730120000_umag_document_payments_ledger.sql')
  assert('payments table', migration.includes('umag_document_payments'))
  assert('ledger table', migration.includes('platform_supplier_ledger_events'))
  assert('unique external key', migration.includes('platform_supplier_ledger_events_source_external_unique'))
  assert('rls payments', migration.includes('umag_document_payments_select_view'))

  const shared = read('supabase/functions/_shared/umagDocumentPayments.ts')
  assert('list-all endpoint', shared.includes('/rest/cabinet/fin/document-payment/list-all'))
  assert('classify refund zero delta', shared.includes("eventType: 'supplier_refund'") && shared.includes('balanceDelta: 0'))
  assert('targeted supply link maps', shared.includes('buildPaymentSupplierLinkMaps'))

  const sync = read('supabase/functions/umag-sync/index.ts')
  assert('sync imports payments', sync.includes('fetchDocumentPaymentsForPeriod'))
  assert('sync uses targeted payment maps', sync.includes('buildPaymentSupplierLinkMaps'))
  assert('sync rebuilds ledger', sync.includes('rebuildLedgerEventsForPeriod'))

  const service = read('src/services/umagSettlementsService.js')
  assert('service loads payments', service.includes("from('umag_document_payments')"))
  assert('service builds with payments', service.includes('buildSupplierOperationHistory('))

  const panel = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')
  assert('UI has increase/decrease columns', panel.includes('Увеличение') && panel.includes('Уменьшение'))
  assert('UI has saldо column', panel.includes('Сальдо'))
  assert('UI payments filter', panel.includes("{ id: 'payments'"))

  console.log(`\nSupplier ledger verification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (err) {
  console.error(`\nFAILED: ${err.message}\n`)
  process.exitCode = 1
}
