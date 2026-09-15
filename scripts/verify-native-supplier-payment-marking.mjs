#!/usr/bin/env node
/**
 * Native "Оплачено" marking — instant, independent of UMAG's own debt sync.
 *
 * Usage:
 *   npm run verify:native-supplier-payment-marking
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
  console.log('Stage 1: pure status/formatting logic')
  const {
    isPlatformMarkedPaid,
    isActiveOpenObligation,
    deriveObligationStatus,
    OBLIGATION_STATUS,
    formatPlatformPaymentMark,
  } = await import(pathToFileURL(path.join(ROOT, 'src/utils/supplierPaymentObligations.js')).href)

  assert('unmarked obligation is not platform-paid', isPlatformMarkedPaid({}) === false)
  assert(
    'marked obligation is platform-paid (camelCase)',
    isPlatformMarkedPaid({ platformPaidAt: '2026-09-15T00:00:00Z' }) === true
  )
  assert(
    'marked obligation is platform-paid (snake_case row)',
    isPlatformMarkedPaid({ platform_paid_at: '2026-09-15T00:00:00Z' }) === true
  )

  assert(
    'a platform-marked-paid obligation is PAID even with open UMAG debt + overdue date',
    deriveObligationStatus(
      { platformPaidAt: '2026-09-15T00:00:00Z', currentDebt: 50000, dueDate: '2026-01-01' },
      '2026-09-15'
    ) === OBLIGATION_STATUS.PAID
  )
  assert(
    'an un-marked obligation with open debt is NOT paid',
    deriveObligationStatus({ currentDebt: 50000, dueDate: '2026-09-01' }, '2026-09-15') !==
      OBLIGATION_STATUS.PAID
  )

  assert(
    'platform-marked-paid obligation is excluded from active/open list even with debt > 0',
    isActiveOpenObligation({ platformPaidAt: '2026-09-15T00:00:00Z', currentDebt: 50000 }) ===
      false
  )
  assert(
    'un-marked obligation with debt > 0 is still active/open',
    isActiveOpenObligation({ currentDebt: 50000 }) === true
  )

  assert('formatPlatformPaymentMark returns null when not marked', formatPlatformPaymentMark({}) === null)
  const marked = formatPlatformPaymentMark({
    platformPaidAt: '2026-09-15T10:00:00Z',
    platformPaymentAccountId: null,
  })
  assert(
    'formatPlatformPaymentMark returns a non-empty label when marked',
    typeof marked === 'string' && marked.length > 0 && marked.includes('Оплачено вручную')
  )
  console.log('')
}

function stageMigration() {
  console.log('Stage 2: migration adds the 3 columns, no new RLS needed')
  const sql = read('supabase/migrations/20260915090000_native_supplier_payment_marking.sql')

  assert('adds platform_paid_at', sql.includes('platform_paid_at timestamptz'))
  assert('adds platform_paid_by (FK to academy_users)', sql.includes('platform_paid_by bigint') && sql.includes('references public.academy_users(id)'))
  assert('adds platform_payment_account_id (FK to payment_accounts)', sql.includes('platform_payment_account_id uuid') && sql.includes('references public.payment_accounts(id)'))
  assert('column additions are idempotent (add column if not exists)', sql.includes('add column if not exists platform_paid_at'))
  assert('does not touch current_debt or drop any column', !sql.includes('drop column'))
  console.log('')
}

function stageService() {
  console.log('Stage 3: service layer — instant local write, no UMAG round trip')
  const service = read('src/services/supplierPaymentObligationsService.js')

  assert('exports markObligationPaid', service.includes('export async function markObligationPaid'))
  assert('exports unmarkObligationPaid', service.includes('export async function unmarkObligationPaid'))
  assert(
    'markObligationPaid writes platform_paid_at/by/account in one update',
    /markObligationPaid[\s\S]{0,400}platform_paid_at: new Date\(\)\.toISOString\(\)/.test(service) &&
      /markObligationPaid[\s\S]{0,400}platform_paid_by/.test(service) &&
      /markObligationPaid[\s\S]{0,400}platform_payment_account_id/.test(service)
  )
  assert(
    'unmarkObligationPaid clears all three fields to null',
    /unmarkObligationPaid[\s\S]{0,400}platform_paid_at: null[\s\S]{0,200}platform_paid_by: null[\s\S]{0,200}platform_payment_account_id: null/.test(
      service
    )
  )
  assert(
    'neither mark function calls umag-sync / Edge Functions',
    !/markObligationPaid[\s\S]{0,600}(umag|functions\.invoke)/i.test(
      service.slice(service.indexOf('export async function markObligationPaid'))
    )
  )
  assert(
    'listPaymentObligations excludes platform-paid rows at the SQL level too',
    service.includes(".gt('current_debt', 0).is('platform_paid_at', null)")
  )
  assert('OBLIGATION_SELECT reads the 3 new columns', service.includes('platform_paid_at,') && service.includes('platform_paid_by,') && service.includes('platform_payment_account_id,'))
  assert('normalizeObligation maps all 3 new columns', service.includes('platformPaidAt: row.platform_paid_at') && service.includes('platformPaidBy: row.platform_paid_by') && service.includes('platformPaymentAccountId: row.platform_payment_account_id'))
  console.log('')
}

function stageUi() {
  console.log('Stage 4: UI — instant button, gated by supplier_payments.manage')
  const panel = read('src/components/suppliers/payments/SupplierPaymentsPanel.jsx')

  assert('imports canManageSupplierPayments', panel.includes('canManageSupplierPayments'))
  assert('imports markObligationPaid/unmarkObligationPaid', panel.includes('markObligationPaid') && panel.includes('unmarkObligationPaid'))
  assert('renders Оплачено button gated by canManagePayments', panel.includes('canManagePayments ?') && panel.includes("'Оплачено'"))
  assert('renders Отменить оплату for already-marked rows', panel.includes('Отменить оплату'))
  assert(
    'defaults the payment account to the supplier\'s own configured account (no extra prompt)',
    /handleMarkPaid[\s\S]{0,400}accountId: ob\.supplierPaymentAccountId/.test(panel)
  )
  assert('passes the current employee id as paidByEmployeeId', /paidByEmployeeId: user\?\.id/.test(panel))
  assert('optimistically patches the open sheet without waiting for reload', panel.includes('patchSelectedGroupObligation'))
  console.log('')
}

async function main() {
  try {
    console.log('=== Native supplier payment marking ===\n')
    await stagePureLogic()
    stageMigration()
    stageService()
    stageUi()
    console.log(`Passed ${testsPassed}/${testsRun}\n`)
  } catch (err) {
    console.error(`\nFAILED: ${err.message}\n`)
    process.exitCode = 1
  }
}

main()
