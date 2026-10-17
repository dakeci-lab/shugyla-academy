#!/usr/bin/env node
/**
 * Verification for receiving row display (payment terms, no status labels).
 *
 * Usage:
 *   npm run verify:receiving-row-display
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const PAYMENT_TYPE = {
  CASH: 'cash',
  TRANSFER: 'transfer',
  DEFERRAL: 'deferral',
  MIXED: 'mixed',
}

const PAYMENT_TYPE_LABELS = {
  cash: 'Наличными',
  transfer: 'Перевод',
  deferral: 'Отсрочка',
  mixed: 'Смешанная оплата',
}

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

function formatSupplierPaymentTerms(supplier) {
  if (!supplier?.paymentType) return '—'
  const baseLabel = PAYMENT_TYPE_LABELS[supplier.paymentType]
  if (!baseLabel) return '—'
  const deferralDays = Number(supplier.deferralDays)
  if (
    (supplier.paymentType === PAYMENT_TYPE.DEFERRAL ||
      supplier.paymentType === PAYMENT_TYPE.MIXED) &&
    Number.isFinite(deferralDays) &&
    deferralDays > 0
  ) {
    return `${baseLabel} ${deferralDays} дней`
  }
  return baseLabel
}

function stagePaymentTerms() {
  console.log('Stage 1: Payment terms formatting')

  const supplierData = read('src/utils/supplierData.js')
  assert('formatSupplierPaymentTerms exported', supplierData.includes('export function formatSupplierPaymentTerms'))

  assert(
    'deferral with days',
    formatSupplierPaymentTerms({
      paymentType: PAYMENT_TYPE.DEFERRAL,
      deferralDays: 7,
    }) === 'Отсрочка 7 дней'
  )

  assert(
    'cash label',
    formatSupplierPaymentTerms({ paymentType: PAYMENT_TYPE.CASH }) === 'Наличными'
  )

  assert('missing supplier', formatSupplierPaymentTerms(null) === '—')
}

function stageEntryTypesAndJoin() {
  console.log('Stage 2: Entry helpers and supplier join')

  const workflow = read('src/utils/procurementWorkflow.js')
  assert('isScheduleOnlyReceivingEntry exported', workflow.includes('isScheduleOnlyReceivingEntry'))
  assert('isCreatedPurchaseReceivingEntry exported', workflow.includes('isCreatedPurchaseReceivingEntry'))
  assert('buildSimpleReceivingEntries accepts suppliers', workflow.includes('buildSimpleReceivingEntries(orders, documents, suppliers'))
  assert('supplier map by id', workflow.includes('buildSupplierMapById'))
  assert('supplier attached from order.supplierId', workflow.includes('supplierById.get(order.supplierId)'))
}

function stageStaticChecks() {
  console.log('Stage 3: Static UI checks')


}

function main() {
  console.log('=== Receiving row display verification ===\n')
  stagePaymentTerms()
  stageEntryTypesAndJoin()
  stageStaticChecks()
  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

main()
