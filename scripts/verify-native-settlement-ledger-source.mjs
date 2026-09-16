#!/usr/bin/env node
/**
 * «Взаиморасчёты» payment events now come from our own "Оплачено" click
 * (platform_supplier_ledger_events, external_source='platform'), not UMAG's
 * document-payment feed — which became untrustworthy once staff started
 * marking UMAG documents paid immediately at receiving time. Refunds are
 * unaffected: they're real money events unrelated to the receiving-time
 * marking policy, so they still come from UMAG.
 *
 * Usage:
 *   npm run verify:native-settlement-ledger-source
 */

import fs from 'node:fs'
import path from 'node:path'
import { register } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

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

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

async function stagePureLogic() {
  console.log('Stage 1: buildNativeSettlementPaymentRows (pure)')
  const { buildNativeSettlementPaymentRows } = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/supplierPaymentObligations.js')).href
  )

  const rows = buildNativeSettlementPaymentRows(
    [
      { id: 'ob-1', platformSupplierId: 'sup-1', supplierName: 'Нарлен', umagSupplyId: 195740519, originalSupplyAmount: 42000, platformPaidAt: '2026-09-15T08:52:00Z', platformPaidBy: 7, platformPaymentAccountId: 'acc-1' },
      { id: 'ob-2', platformSupplierId: 'sup-1', supplierName: 'Нарлен', originalSupplyAmount: 5000, platformPaidAt: null },
    ],
    {
      accountNameById: { get: (id) => (id === 'acc-1' ? 'Сейф' : null) },
      employeeNameById: new Map([[7, 'Жасулан']]),
    }
  )

  assert('only marked-paid obligations produce a row', rows.length === 1)
  assert('amount is positive (classifies as a payment, not a refund)', rows[0].amount === 42000)
  assert('payment_time is the platform mark timestamp, not a UMAG time', rows[0].payment_time === '2026-09-15T08:52:00Z')
  assert('external_source is tagged platform', rows[0].external_source === 'platform')
  assert('account name resolved from platformPaymentAccountId', rows[0].account_name === 'Сейф')
  assert('employee name resolved from platformPaidBy', rows[0].user_name === 'Жасулан')
  assert('umag_payment_id is null (no real UMAG payment document)', rows[0].umag_payment_id === null)
  assert('linked_umag_supply_id carries the receiving document', rows[0].linked_umag_supply_id === 195740519)
  console.log('')
}

function stageEdgeFunction() {
  console.log('Stage 2: umag-sync stops writing supplier_payment ledger events from UMAG')
  const src = read('supabase/functions/_shared/umagDocumentPayments.ts')
  const fn = src.slice(src.indexOf('export async function rebuildLedgerEventsForPeriod'))

  assert(
    'the payment-loop event push is now gated on isRefund',
    /if \(isRefund\) \{\s*\n\s*events\.push\(\{/.test(fn)
  )
  assert(
    'balance_delta for the (refund-only) push is 0, matching supplier_refund semantics',
    /if \(isRefund\) \{[\s\S]{0,400}balance_delta: 0,/.test(fn)
  )
  console.log('')
}

function stageService() {
  console.log('Stage 3: markObligationPaid/unmarkObligationPaid write the platform-sourced ledger row')
  const service = read('src/services/supplierPaymentObligationsService.js')

  assert('markObligationPaid now takes the obligation object, not just its id', service.includes('export async function markObligationPaid(obligation,'))
  assert(
    'markObligationPaid upserts a platform_supplier_ledger_events row',
    /markObligationPaid[\s\S]{0,1200}from\('platform_supplier_ledger_events'\)[\s\S]{0,50}\.upsert\(/.test(service)
  )
  assert(
    "the upserted row is tagged external_source: 'platform' / event_type: 'supplier_payment'",
    /markObligationPaid[\s\S]{0,1400}external_source: 'platform'[\s\S]{0,100}external_id: String\(obligationId\)[\s\S]{0,100}event_type: 'supplier_payment'/.test(service)
  )
  assert(
    'upsert conflict target keeps one ledger row per obligation (idempotent re-mark)',
    service.includes("{ onConflict: 'external_source,event_type,external_id' }")
  )
  assert(
    'unmarkObligationPaid deletes the matching platform-sourced ledger row',
    /unmarkObligationPaid[\s\S]{0,600}from\('platform_supplier_ledger_events'\)[\s\S]{0,50}\.delete\(\)/.test(service)
  )
  assert(
    "the delete is scoped to external_source='platform' — never touches UMAG history",
    /unmarkObligationPaid[\s\S]{0,800}\.eq\('external_source', 'platform'\)/.test(service)
  )
  console.log('')
}

function stageCaller() {
  console.log('Stage 4: SupplierPaymentsPanel passes the obligation + names through')
  const panel = read('src/components/suppliers/payments/SupplierPaymentsPanel.jsx')

  assert('handleMarkPaid passes the full obligation, not just its id', /markObligationPaid\(ob, \{/.test(panel))
  assert('passes employeeName from the session user', /employeeName: user\?\.name/.test(panel))
  assert('passes accountName resolved via getPaymentAccountName', /accountName: getPaymentAccountName\(/.test(panel))
  console.log('')
}

function stageSettlementsQuery() {
  console.log('Stage 5: fetchUmagSettlementsBySupplier sources payments natively, refunds from UMAG')
  const service = read('src/services/umagSettlementsService.js')

  assert('imports buildNativeSettlementPaymentRows', service.includes('buildNativeSettlementPaymentRows'))
  assert(
    'queries supplier_payment_obligations for the period (native marks)',
    /from\('supplier_payment_obligations'\)[\s\S]{0,300}not\('platform_paid_at', 'is', null\)/.test(service)
  )
  assert(
    'raw UMAG payments loop is skipped for non-refunds',
    /for \(const payment of payments\) \{\s*\n\s*const isRefund = isUmagPaymentRefund\(payment\)\s*\n\s*if \(!isRefund\) continue/.test(service)
  )
  assert(
    'nativePaymentRows feed row.documentPaymentAmount / row.payments, not the raw UMAG feed',
    /for \(const payment of nativePaymentRows\) \{[\s\S]{0,300}row\.documentPaymentAmount/.test(service)
  )
  console.log('')
}

function stageUi() {
  console.log('Stage 6: OperationDetailSheet renders platform-sourced payment events accurately')
  const sheet = read('src/components/suppliers/settlements/OperationDetailSheet.jsx')

  assert('reads externalSource off the operation source', sheet.includes("externalSource: source.external_source || 'umag'"))
  assert('hides the UMAG-only "Документ UMAG" field for platform-sourced entries', /externalSource === 'platform' \? null : \(\s*\n\s*<div>\s*\n\s*<span>Документ UMAG<\/span>/.test(sheet))
  assert(
    'shows a distinct empty-state note for platform-sourced entries instead of the UMAG one',
    sheet.includes("Отмечено оплаченным вручную на платформе") &&
      /externalSource === 'platform'\s*\n\s*\? 'Отмечено оплаченным вручную/.test(sheet)
  )
  console.log('')
}

function stageMigration() {
  console.log('Stage 7: RLS lets clients write only external_source=\'platform\' ledger rows')
  const sql = read('supabase/migrations/20260916090000_native_ledger_events_platform_source.sql')

  assert('grants insert/update/delete to authenticated', sql.includes('grant insert, update, delete on table public.platform_supplier_ledger_events to authenticated'))
  assert('insert policy requires external_source = \'platform\'', /create policy platform_supplier_ledger_events_insert_platform[\s\S]{0,200}with check \(\s*\n\s*external_source = 'platform'/.test(sql))
  assert('update policy requires external_source = \'platform\' on both using and with check', (sql.match(/external_source = 'platform'/g) || []).length >= 5)
  assert('delete policy gated by supplier_payments.manage or suppliers.edit', /create policy platform_supplier_ledger_events_delete_platform[\s\S]{0,300}supplier_payments\.manage/.test(sql))
  console.log('')
}

async function main() {
  try {
    console.log('=== Native settlement ledger source («Взаиморасчёты» independent of UMAG payments) ===\n')
    await stagePureLogic()
    stageEdgeFunction()
    stageService()
    stageCaller()
    stageSettlementsQuery()
    stageUi()
    stageMigration()
    console.log(`Passed ${testsPassed}/${testsRun}\n`)
  } catch (err) {
    console.error(`\nFAILED: ${err.message}\n`)
    process.exitCode = 1
  }
}

main()
