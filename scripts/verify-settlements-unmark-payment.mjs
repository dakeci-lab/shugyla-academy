#!/usr/bin/env node
/**
 * «Взаиморасчёты» — «Отменить оплату» directly on a native "Оплата
 * поставщику" entry in a supplier's «История операций», instead of a
 * separate "Оплаченные" screen. Only ever available for entries this
 * platform itself created (external_source='platform') — never for raw
 * UMAG-sourced history.
 *
 * Usage:
 *   npm run verify:settlements-unmark-payment
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function stagePureLogic() {
  console.log('Stage 1: buildNativeSettlementPaymentRows carries obligation_id')
  const src = read('src/utils/supplierPaymentObligations.js')
  assert(
    'native settlement payment rows include obligation_id (not just the composite id string)',
    /obligation_id: ob\.id,/.test(src)
  )
  console.log('')
}

function stageDetailSheet() {
  console.log('Stage 2: OperationDetailSheet renders "Отменить оплату" only for native platform-sourced payments')
  const sheet = read('src/components/suppliers/settlements/OperationDetailSheet.jsx')

  assert(
    'accepts canManage and onUnmark props',
    /canManage = false,\s*\n\s*onUnmark,/.test(sheet)
  )
  assert(
    'reads obligationId from source.obligation_id',
    sheet.includes('obligationId: source.obligation_id || null,')
  )
  assert(
    'canUnmark requires canManage AND kind===payment AND externalSource===platform AND a real obligationId',
    /const canUnmark =\s*\n\s*canManage &&\s*\n\s*kind === 'payment' &&\s*\n\s*headerFromHistory\.externalSource === 'platform' &&\s*\n\s*headerFromHistory\.obligationId != null/.test(
      sheet
    )
  )
  assert(
    'the button is gated by canUnmark, not just isPaymentDoc — never shown for raw UMAG-sourced or refund entries',
    /\{canUnmark \? \(\s*\n\s*<button/.test(sheet)
  )
  assert(
    'clicking calls onUnmark(obligationId), not a hardcoded id',
    /onUnmark\?\.\(headerFromHistory\.obligationId\)/.test(sheet)
  )
  assert(
    'button is disabled while the unmark request is in flight',
    /disabled=\{unmarking\}/.test(sheet)
  )
  console.log('')
}

function stagePanelWiring() {
  console.log('Stage 3: UmagSettlementsPanel wires the real unmarkObligationPaid + permission + reload')
  const panel = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')

  assert(
    'imports unmarkObligationPaid from the obligations service (not a reinvented mutation)',
    /import \{\s*\n\s*refreshObligationTermsForSupplier,\s*\n\s*unmarkObligationPaid,\s*\n\} from '\.\.\/\.\.\/\.\.\/services\/supplierPaymentObligationsService'/.test(
      panel
    )
  )
  assert(
    'imports canManageSupplierPayments and computes canManagePayments at the top level',
    panel.includes('canManageSupplierPayments') &&
      panel.includes('const canManagePayments = canManageSupplierPayments(user)')
  )
  assert(
    'canManagePayments is threaded into UmagSupplierDetail',
    /<UmagSupplierDetail[\s\S]{0,300}canManagePayments=\{canManagePayments\}/.test(panel)
  )
  assert(
    'handleUnmarkPayment calls the real unmarkObligationPaid(obligationId)',
    /async function handleUnmarkPayment\(obligationId\) \{\s*\n\s*try \{\s*\n\s*await unmarkObligationPaid\(obligationId\)/.test(
      panel
    )
  )
  assert(
    'after unmarking: closes the sheet, backs out of the drilldown (onBack), and reloads the list (onSyncComplete) — same pattern as handleSync/applyFilter, no in-place patch of stale local state',
    /setSelectedOperation\(null\)\s*\n\s*onBack\(\)\s*\n\s*onSyncComplete\?\.\(\)/.test(panel)
  )
  assert(
    'a failed unmark shows an error toast, never a silent failure',
    /showError\?\.\(err\.message \|\| 'Не удалось отменить отметку оплаты'\)/.test(panel)
  )
  assert(
    'OperationDetailSheet receives canManage + onUnmark from the drilldown',
    /<OperationDetailSheet[\s\S]{0,150}canManage=\{canManagePayments\}[\s\S]{0,80}onUnmark=\{handleUnmarkPayment\}/.test(
      panel
    )
  )
  console.log('')
}

function main() {
  try {
    console.log('=== «Взаиморасчёты» — cancel a native payment mark from its own history entry ===\n')
    stagePureLogic()
    stageDetailSheet()
    stagePanelWiring()
    console.log(`Passed ${testsPassed}/${testsRun}\n`)
  } catch (err) {
    console.error(`\nFAILED: ${err.message}\n`)
    process.exitCode = 1
  }
}

main()
