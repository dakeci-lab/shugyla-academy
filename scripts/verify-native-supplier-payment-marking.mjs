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
    resolveOwedAmount,
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
  assert(
    'CRITICAL: un-marked obligation with debt = 0 is STILL active/open — UMAG debt is fully untrusted',
    isActiveOpenObligation({ currentDebt: 0, originalSupplyAmount: 30000 }) === true
  )
  assert(
    'CRITICAL: un-marked obligation with debt = 0 does NOT derive as PAID',
    deriveObligationStatus({ currentDebt: 0, dueDate: '2026-01-01' }, '2026-09-15') !==
      OBLIGATION_STATUS.PAID
  )

  assert(
    'resolveOwedAmount ignores current_debt entirely, uses original_supply_amount',
    resolveOwedAmount({ currentDebt: 0, originalSupplyAmount: 42000 }) === 42000
  )
  assert(
    'resolveOwedAmount is 0 once platform-marked paid, regardless of amount',
    resolveOwedAmount({ platformPaidAt: '2026-09-15T00:00:00Z', originalSupplyAmount: 42000 }) === 0
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

function stageBackfillMigration() {
  console.log('Stage 1b: backfill migration — every supply gets tracked, old ones auto-resolved')
  const sql = read('supabase/migrations/20260915110000_native_payment_status_backfill.sql')

  assert(
    'auto-marks existing obligations already at debt <= 0',
    /update public\.supplier_payment_obligations[\s\S]{0,200}set platform_paid_at = now\(\)/.test(sql) &&
      sql.includes('and current_debt <= 0')
  )
  assert(
    'never re-marks an obligation that already has a native mark',
    /update public\.supplier_payment_obligations[\s\S]{0,150}where platform_paid_at is null/.test(sql)
  )
  assert(
    'backfills missing rows from umag_supplies with not exists guard (idempotent)',
    sql.includes('not exists (') && sql.includes('o.umag_supply_id = s.umag_supply_id')
  )
  assert('backfilled rows are also auto-marked paid', /insert into public\.supplier_payment_obligations[\s\S]*now\(\)\s*$/m.test(sql.split('from public.umag_supplies')[0]) || sql.includes('  now(),\n  now()\nfrom public.umag_supplies'))
  assert('skips already-deleted UMAG supplies when backfilling', sql.includes('s.is_source_deleted = false'))
  assert('upsert-safe (on conflict do nothing, never overwrites a native mark)', sql.includes('on conflict (umag_supply_id) do nothing'))
  console.log('')
}

function stageServerSync() {
  console.log('Stage 1c: umag-sync creates an obligation for every supply, never touches platform_* columns')
  const sync = read('supabase/functions/umag-sync/index.ts')
  const fn = sync.slice(
    sync.indexOf('async function refreshPaymentObligations'),
    sync.indexOf('async function refreshPaymentObligations') + 6000
  )

  assert(
    'no longer skips creating an obligation because debt <= 0',
    !/if \(!existing && \(isDeleted \|\| debt <= 0\)\) continue/.test(fn)
  )
  assert('still skips only for already-deleted supplies', /if \(!existing && isDeleted\) continue/.test(fn))
  assert(
    'the upsert payload never sets platform_paid_at/platform_paid_by/platform_payment_account_id',
    !/upsertRows\.push\(\{[\s\S]*?platform_paid/.test(fn)
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
    /markObligationPaid[\s\S]{0,400}platform_paid_at: paidAt/.test(service) &&
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
    'listPaymentObligations excludes platform-paid rows at the SQL level, NOT by current_debt',
    service.includes("query.is('platform_paid_at', null)") &&
      !service.includes(".gt('current_debt', 0).is('platform_paid_at', null)")
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
  assert(
    'per-document amount owed comes from resolveOwedAmount, not raw UMAG debt',
    panel.includes('resolveOwedAmount(ob)') && !panel.includes('formatUmagMoney(ob.currentDebt)')
  )
  console.log('')
}

async function main() {
  try {
    console.log('=== Native supplier payment marking ===\n')
    await stagePureLogic()
    stageBackfillMigration()
    stageServerSync()
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
