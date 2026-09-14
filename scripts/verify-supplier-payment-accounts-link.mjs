#!/usr/bin/env node
/**
 * PR 2: connect platform_suppliers / supplier_payment_obligations to
 * payment_accounts, retiring the old cash/transfer/deferral/mixed enum.
 *
 * Usage:
 *   npm run verify:supplier-payment-accounts-link
 */

import fs from 'node:fs'
import path from 'node:path'
import { register } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

// Local (non-cloud) mode — see scripts/lib/extensionlessResolver.mjs.
globalThis.__VITE_ENV__ = {}

// Minimal in-memory localStorage so paymentAccountsLocalAdapter/suppliersLocalAdapter
// can run for real outside a browser.
const memoryStore = new Map()
globalThis.localStorage = {
  getItem: (key) => (memoryStore.has(key) ? memoryStore.get(key) : null),
  setItem: (key, value) => memoryStore.set(key, String(value)),
  removeItem: (key) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
}

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

async function stageResolveTerms() {
  console.log('Stage 1: resolveSupplierPaymentTerms / resolveObligationTermsPatch (pure)')
  const { resolveSupplierPaymentTerms, resolveObligationTermsPatch, computeDueDateFromTerms } =
    await import(pathToFileURL(path.join(ROOT, 'src/utils/supplierPaymentObligations.js')).href)

  assert(
    'account with configured days',
    (() => {
      const t = resolveSupplierPaymentTerms({ paymentAccountId: 'acc-1', deferralDays: 14 })
      return t.accountId === 'acc-1' && t.days === 14 && t.configured === true
    })()
  )
  assert(
    'account with no days configured (null) — still carries the account',
    (() => {
      const t = resolveSupplierPaymentTerms({ paymentAccountId: 'acc-1', deferralDays: null })
      return t.accountId === 'acc-1' && t.days === null && t.configured === false
    })()
  )
  assert(
    'no account, days configured — method independent of term',
    (() => {
      const t = resolveSupplierPaymentTerms({ paymentAccountId: null, deferralDays: 0 })
      return t.accountId === null && t.days === 0 && t.configured === true
    })()
  )
  assert(
    'snake_case fallback (payment_account_id/deferral_days)',
    (() => {
      const t = resolveSupplierPaymentTerms({ payment_account_id: 'acc-2', deferral_days: 5 })
      return t.accountId === 'acc-2' && t.days === 5
    })()
  )
  assert(
    'out-of-range days -> unconfigured',
    resolveSupplierPaymentTerms({ paymentAccountId: 'acc-1', deferralDays: 400 }).configured ===
      false
  )

  assert(
    'due date unaffected by account presence',
    computeDueDateFromTerms('2026-09-01', { configured: true, days: 14 }) === '2026-09-15'
  )
  assert(
    'no due date when unconfigured, even with an account',
    computeDueDateFromTerms('2026-09-01', { accountId: 'acc-1', configured: false, days: null }) ===
      null
  )

  const termsA = { accountId: 'acc-1', days: 14, configured: true }
  const patch = resolveObligationTermsPatch(null, termsA, '2026-09-01')
  assert(
    'patch snapshots account + days + due_date',
    patch?.payment_account_id_snapshot === 'acc-1' &&
      patch?.deferment_days_snapshot === 14 &&
      patch?.due_date === '2026-09-15'
  )
  assert(
    'idempotent — no patch when snapshot already matches',
    resolveObligationTermsPatch(
      {
        paymentAccountIdSnapshot: 'acc-1',
        defermentDaysSnapshot: 14,
        dueDate: '2026-09-15',
      },
      termsA,
      '2026-09-01'
    ) === null
  )
  assert(
    'account change alone (same days) still produces a patch',
    resolveObligationTermsPatch(
      { paymentAccountIdSnapshot: 'acc-OLD', defermentDaysSnapshot: 14, dueDate: '2026-09-15' },
      termsA,
      '2026-09-01'
    )?.payment_account_id_snapshot === 'acc-1'
  )
  assert(
    'clearing terms resets days/due_date to null but keeps account snapshot',
    (() => {
      const cleared = { accountId: 'acc-1', days: null, configured: false }
      const p = resolveObligationTermsPatch(
        { paymentAccountIdSnapshot: 'acc-1', defermentDaysSnapshot: 14, dueDate: '2026-09-15' },
        cleared,
        '2026-09-01'
      )
      return (
        p?.payment_account_id_snapshot === 'acc-1' &&
        p?.deferment_days_snapshot === null &&
        p?.due_date === null
      )
    })()
  )
  console.log('')
}

async function stageFormatting() {
  console.log('Stage 2: formatting helpers (pure + cache-backed)')
  const { formatDeferralDaysTerm, formatSupplierPaymentTerms } = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/supplierData.js')).href
  )
  const { formatPaymentAccountSnapshot, formatPaymentTermsDaysSnapshot } = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/supplierPaymentObligations.js')).href
  )
  const { createPaymentAccount, ensurePaymentAccountsLoaded } = await import(
    pathToFileURL(path.join(ROOT, 'src/services/paymentAccountsService.js')).href
  )

  assert('empty string -> Не настроено (not "сразу" — Number("") === 0 trap)', formatDeferralDaysTerm('') === 'Не настроено')
  assert('null -> Не настроено', formatDeferralDaysTerm(null) === 'Не настроено')
  assert('0 -> сразу', formatDeferralDaysTerm(0) === 'сразу')
  assert('14 -> 14 дней', formatDeferralDaysTerm(14) === '14 дней')

  // Warm the real local-mode cache (seeded «Наличные»/«Перевод») for real name resolution.
  const accounts = await ensurePaymentAccountsLoaded(true)
  const cash = accounts.find((a) => a.name === 'Наличные')
  assert('local adapter seeded Наличные (for cache warm-up)', Boolean(cash))

  assert(
    'formatSupplierPaymentTerms resolves the real account name from cache',
    formatSupplierPaymentTerms({ paymentAccountId: cash.id, deferralDays: 14 }) ===
      'Наличные — 14 дней'
  )
  assert(
    'unknown/unset account -> Не настроено, term still shown',
    formatSupplierPaymentTerms({ paymentAccountId: null, deferralDays: 0 }) ===
      'Не настроено — сразу'
  )

  assert(
    'formatPaymentAccountSnapshot resolves by id',
    formatPaymentAccountSnapshot({ paymentAccountIdSnapshot: cash.id }) === 'Наличные'
  )
  assert(
    'formatPaymentAccountSnapshot: no snapshot -> Не настроено',
    formatPaymentAccountSnapshot({ paymentAccountIdSnapshot: null }) === 'Не настроено'
  )
  assert(
    'formatPaymentTermsDaysSnapshot: 0 -> Сразу',
    formatPaymentTermsDaysSnapshot({ defermentDaysSnapshot: 0 }) === 'Сразу'
  )
  assert(
    'formatPaymentTermsDaysSnapshot: 14 -> 14 дн.',
    formatPaymentTermsDaysSnapshot({ defermentDaysSnapshot: 14 }) === '14 дн.'
  )
  assert(
    'formatPaymentTermsDaysSnapshot: null -> Не настроено',
    formatPaymentTermsDaysSnapshot({ defermentDaysSnapshot: null }) === 'Не настроено'
  )

  // Renaming an account retroactively changes what old snapshots display —
  // that's the whole point of snapshotting an id, not a copied label.
  const renamed = await createPaymentAccount({ name: 'Kaspi Gold (verify)' })
  await ensurePaymentAccountsLoaded(true)
  assert(
    'a freshly created account resolves by id immediately after cache warm',
    formatPaymentAccountSnapshot({ paymentAccountIdSnapshot: renamed.id }) === 'Kaspi Gold (verify)'
  )
  console.log('')
}

function stageMigration() {
  console.log('Stage 3: migration — FK columns, backfill, old columns dropped')
  const sql = read('supabase/migrations/20260914130000_supplier_payment_accounts_link.sql')

  assert(
    'adds platform_suppliers.payment_account_id',
    sql.includes('alter table public.platform_suppliers') &&
      sql.includes('add column if not exists payment_account_id uuid references public.payment_accounts(id)')
  )
  assert('drops platform_suppliers.payment_type', sql.includes('alter table public.platform_suppliers drop column if exists payment_type'))
  assert(
    'backfills cash -> Наличные, else -> Перевод (suppliers)',
    sql.includes("when ps.payment_type = 'cash' then 'Наличные' else 'Перевод'")
  )
  assert(
    'adds supplier_payment_obligations.payment_account_id_snapshot',
    sql.includes('add column if not exists payment_account_id_snapshot uuid references public.payment_accounts(id)')
  )
  assert(
    'drops payment_terms_type_snapshot',
    sql.includes('alter table public.supplier_payment_obligations drop column if exists payment_terms_type_snapshot')
  )
  assert(
    'backfills obligations snapshot only where a type was actually recorded',
    sql.includes('spo.payment_terms_type_snapshot is not null')
  )
  assert('indexes the new FK', sql.includes('idx_platform_suppliers_payment_account_id'))
  console.log('')
}

function stageServerWiring() {
  console.log('Stage 4: umag-sync (Edge Function) — authoritative server logic')
  const edge = read('supabase/functions/umag-sync/index.ts')

  assert('resolveTermsSnapshot reads payment_account_id, not payment_type', edge.includes('supplier?.payment_account_id ?? null') && !edge.includes('resolveTermsSnapshot(supplier: {\n  payment_type'))
  assert('no more type/legacy branching in resolveTermsSnapshot', !edge.includes('legacy: boolean'))
  assert('SupplierTermsRow uses payment_account_id', edge.includes('payment_account_id: string | null'))
  assert('supplier select fetches payment_account_id', edge.includes("'id, payment_account_id, deferral_days, is_merged, merged_into_supplier_id'"))
  assert('obligations select fetches payment_account_id_snapshot', edge.includes('payment_account_id_snapshot, deferment_days_snapshot, due_date'))
  assert('upsert writes payment_account_id_snapshot', edge.includes('payment_account_id_snapshot: paymentAccountIdSnapshot'))
  assert('no leftover spo_legacy_payment_type warning', !edge.includes('spo_legacy_payment_type'))
  assert(
    'new UMAG suppliers get a resolved default payment_account_id (looked up from payment_accounts, not a hardcoded string)',
    edge.includes("payment_account_id: defaultPaymentAccountId") &&
      edge.includes(".from('payment_accounts')") &&
      edge.includes("eq('name', 'Наличные')")
  )
  assert('new UMAG suppliers get deferral_days: 0 explicitly (was left unset before)', edge.includes('deferral_days: 0,'))
  console.log('')
}

function stageAdaptersAndForm() {
  console.log('Stage 5: adapters, SupplierForm, SupplierPaymentsPanel')
  const localAdapter = read('src/services/suppliersLocalAdapter.js')
  const cloudAdapter = read('src/services/suppliersSupabaseAdapter.js')
  const supplierData = read('src/utils/supplierData.js')
  const form = read('src/components/suppliers/SupplierForm.jsx')
  const panel = read('src/components/suppliers/payments/SupplierPaymentsPanel.jsx')

  assert('local adapter reads/writes payment_account_id', localAdapter.includes('payment_account_id: row.payment_account_id') && localAdapter.includes('payment_account_id: supplier.paymentAccountId || DEFAULT_CASH_ACCOUNT_ID'))
  assert('cloud adapter writes payment_account_id (no fabricated cash fallback)', cloudAdapter.includes('payment_account_id: data.paymentAccountId ?? null') && !cloudAdapter.includes('PAYMENT_TYPE'))
  assert('normalizeSupplier exposes paymentAccountId', supplierData.includes('paymentAccountId: raw.paymentAccountId ?? raw.payment_account_id ?? null'))
  assert('PAYMENT_TYPE enum fully removed from supplierData', !supplierData.includes('export const PAYMENT_TYPE'))

  assert('form renders a Способ оплаты select', form.includes('Способ оплаты') && form.includes('paymentAccounts.map'))
  assert('form loads accounts via getPaymentAccountsForAssignment (includes inactive-if-selected)', form.includes('getPaymentAccountsForAssignment'))
  assert('срок оплаты field is independent — no derivePaymentTypeFromDays left', !form.includes('derivePaymentTypeFromDays'))
  assert('payload sends paymentAccountId and deferralDays independently', form.includes('paymentAccountId: form.paymentAccountId || null') && form.includes('deferralDays: validDays ? days : null'))

  assert('payments panel splits Способ + Срок (not a single combined Условия line)', panel.includes('formatPaymentAccountSnapshot(ob)') && panel.includes('formatPaymentTermsDaysSnapshot(ob)'))
  console.log('')
}

async function main() {
  try {
    console.log('=== Supplier <-> payment accounts link (PR 2/2) ===\n')
    await stageResolveTerms()
    await stageFormatting()
    stageMigration()
    stageServerWiring()
    stageAdaptersAndForm()
    console.log(`Passed ${testsPassed}/${testsRun}\n`)
  } catch (err) {
    console.error(`\nFAILED: ${err.message}\n`)
    process.exitCode = 1
  }
}

main()
