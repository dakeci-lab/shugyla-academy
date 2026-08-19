#!/usr/bin/env node
/**
 * Static + pure-logic checks for the umag-sync `sync_open_obligations` action.
 *
 * Guards the cross-month staleness fix: a receipt paid in a later month must be
 * re-read from UMAG for its own document month, otherwise the payment calendar
 * keeps mirroring an old debt.
 *
 * Usage:
 *   npm run verify:umag-open-obligations-sync
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SYNC = 'supabase/functions/umag-sync/index.ts'
const MAX_MONTHS = 12
let passed = 0

function ok(name) {
  passed += 1
  console.log(`  ✓ ${name}`)
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  assert.ok(start >= 0, `marker not found: ${startMarker}`)
  const end = source.indexOf(endMarker, start)
  assert.ok(end > start, `end marker not found: ${endMarker}`)
  return source.slice(start, end)
}

/** Mirrors monthPeriodKeys in the Edge function. */
function monthPeriodKeys(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    dateFrom: `${monthKey}-01`,
    dateTo: `${monthKey}-${String(lastDay).padStart(2, '0')}`,
  }
}

/** Mirrors the month selection in collectOpenObligationMonths. */
function selectMonths(monthKeys, currentMonth, maxMonths = MAX_MONTHS) {
  const months = new Set(monthKeys)
  months.add(currentMonth)
  const sorted = [...months].sort()
  const overflow = Math.max(0, sorted.length - maxMonths)
  return {
    months: sorted.slice(overflow),
    skippedOlder: sorted.slice(0, overflow),
  }
}

function checkStatic() {
  const sync = read(SYNC)

  assert.match(sync, /action === 'sync_open_obligations'/)
  assert.match(sync, /Поддерживается action=sync или action=sync_open_obligations/)
  assert.match(sync, /return \{ action: 'sync_open_obligations' \}/)
  assert.match(sync, /action: 'sync',\s*\n\s*dateFrom,/)
  ok('both actions validated, full-sync contract preserved')

  // An explicit period must be refused, not silently ignored.
  const validate = section(sync, 'function validateBody', 'async function createSyncRun')
  assert.match(validate, /for \(const key of \['dateFrom', 'dateTo', 'syncSuppliers'\]\)/)
  assert.match(validate, /период определяется автоматически/)
  ok('explicit period rejected for the derived-period action')

  assert.match(sync, new RegExp(`const MAX_OBLIGATION_SYNC_MONTHS = ${MAX_MONTHS}`))
  assert.match(sync, /const OBLIGATION_SYNC_TIME_BUDGET_MS = 120_000/)
  ok('month cap and time budget are explicit constants')

  const collect = section(
    sync,
    'async function collectOpenObligationMonths',
    'async function refreshPaymentObligations'
  )
  assert.match(collect, /'supplier_payment_obligations'/)
  assert.match(collect, /\.gt\('current_debt', 0\)/)
  assert.match(collect, /fetchPaginatedSupplies\(serviceClient, \(q\) =>\s*\n?\s*q\.eq\('is_source_deleted', false\)\.gt\('debt', 0\)/)
  assert.match(collect, /months\.add\(monthKeyFromDateKey\(aqtobeTodayDateKey\(\)\)\)/)
  assert.match(collect, /MAX_OBLIGATION_SYNC_MONTHS/)
  ok('months collected from obligations, open-debt supplies, and current month')

  const run = section(sync, 'async function runOpenObligationsSync', 'Deno.serve(')
  assert.match(run, /entity: 'obligations'/)

  // Parity with the previous payments sync, which always refreshed suppliers.
  // Without it a new supplier stays unmapped and its obligation is unnamed.
  assert.match(run, /fetchAllSuppliers\(session\)/)
  assert.match(run, /upsertSuppliers\(serviceClient, suppliersResult\.agents\)/)
  assert.match(run, /reconcileCanonicalSuppliers\(serviceClient, activeUmagIds\)/)
  assert.match(run, /Справочник поставщиков не обновлён/)
  assert.match(run, /loadPlatformSupplierMap\(serviceClient\)/)
  ok('supplier directory refreshed before supplies are mapped')

  assert.match(run, /monthPeriodKeys\(month\)/)
  assert.match(run, /aqtobePeriodBoundsMs\(period\.dateFrom, period\.dateTo\)/)
  assert.match(run, /fetchAllSupplies\(session, bounds\.fromTime, bounds\.toTime\)/)
  ok('each month is re-fetched from UMAG on whole-month bounds')

  // Deletion reconcile must keep every guard the full sync uses.
  assert.match(
    run,
    /aggregates\.aggregatesMatch &&\s*\n\s*source\.totalCount != null &&\s*\n\s*receivedIds\.size === suppliesResult\.supplies\.length/
  )
  assert.match(run, /reconcileMissingSupplies\(\s*\n?\s*serviceClient,\s*\n?\s*period\.dateFrom,/)
  ok('deletion reconcile keeps complete-snapshot guards')

  // A failing month must not abort the whole run.
  assert.match(run, /monthWarnings\.push\(`\$\{month\}: не удалось загрузить приёмки UMAG`\)/)
  assert.match(run, /remaining\.push\(\.\.\.plannedMonths\.slice\(i\)\)/)
  assert.match(run, /Нажмите синхронизацию повторно/)
  ok('per-month failures and budget exhaustion degrade to partial')

  assert.match(run, /refreshPaymentObligations\(\s*\n?\s*serviceClient,/)
  assert.match(run, /paymentObligations: obligationsRefresh/)
  assert.match(run, /scope: 'open_obligations'/)
  assert.match(run, /months: \{/)
  ok('obligations refreshed once and reported in the response')

  // The orphan pass is what finally closes obligations whose supply is already paid.
  const refresh = section(
    sync,
    'async function refreshPaymentObligations',
    'type MonthSyncOutcome'
  )
  assert.match(refresh, /'supplier_payment_obligations',\s*\n\s*'umag_supply_id',/)
  assert.match(refresh, /orphanSupplyIds/)
  assert.match(refresh, /SUPPLY_OBLIGATION_COLUMNS/)
  assert.match(refresh, /spo_orphan_obligations_reloaded/)
  ok('open obligations whose supply shows no debt are reloaded and closed')

  // UMAG stays the source of truth: debt is mirrored, never recomputed here.
  assert.match(refresh, /current_debt: debt/)
  assert.doesNotMatch(refresh, /umag_document_payments/)
  assert.doesNotMatch(refresh, /platform_supplier_ledger_events/)
  ok('debt is mirrored from UMAG supplies, not derived from payments')

  // One aggregate comparison shared by both sync paths.
  const helperUses = sync.match(/compareSupplyAggregates\(/g) || []
  assert.ok(helperUses.length >= 3, 'helper must be defined and used by both paths')
  assert.doesNotMatch(
    section(sync, 'Deno.serve(', 'const returnSource'),
    /const mismatches: string\[\] = \[\]/
  )
  ok('aggregate comparison is shared, not duplicated per path')

  const handler = section(sync, 'Deno.serve(', 'const runId = await createSyncRun')
  assert.match(
    handler,
    /if \(validated\.action === 'sync_open_obligations'\) \{\s*\n\s*return await runOpenObligationsSync/
  )
  ok('handler branches before starting a full-period run')
}

function checkMonthMath() {
  assert.deepEqual(monthPeriodKeys('2026-07'), {
    dateFrom: '2026-07-01',
    dateTo: '2026-07-31',
  })
  assert.deepEqual(monthPeriodKeys('2026-08'), {
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
  })
  assert.deepEqual(monthPeriodKeys('2026-02'), {
    dateFrom: '2026-02-01',
    dateTo: '2026-02-28',
  })
  assert.deepEqual(monthPeriodKeys('2024-02'), {
    dateFrom: '2024-02-01',
    dateTo: '2024-02-29',
  })
  assert.deepEqual(monthPeriodKeys('2025-12'), {
    dateFrom: '2025-12-01',
    dateTo: '2025-12-31',
  })
  ok('whole-month windows including leap February and December')

  // The reported bug: July receipt still open while today is in August.
  const july = selectMonths(['2026-07'], '2026-08')
  assert.deepEqual(july.months, ['2026-07', '2026-08'])
  assert.deepEqual(july.skippedOlder, [])
  ok('July obligation pulls July back into the sync window')

  const noDebt = selectMonths([], '2026-08')
  assert.deepEqual(noDebt.months, ['2026-08'])
  ok('current month is always synced even with no open debt')

  const duplicated = selectMonths(['2026-08', '2026-08', '2026-07'], '2026-08')
  assert.deepEqual(duplicated.months, ['2026-07', '2026-08'])
  ok('months are de-duplicated and sorted oldest first')

  const acrossYear = selectMonths(['2025-11', '2025-12', '2026-01'], '2026-01')
  assert.deepEqual(acrossYear.months, ['2025-11', '2025-12', '2026-01'])
  ok('ordering holds across a year boundary')

  const many = []
  for (let year = 2024; year <= 2025; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      many.push(`${year}-${String(month).padStart(2, '0')}`)
    }
  }
  // 24 stored months plus the current one, capped to the newest MAX_MONTHS.
  // The window counts months, not calendar distance, so a gap is expected.
  const capped = selectMonths(many, '2026-08')
  assert.equal(capped.months.length, MAX_MONTHS)
  assert.equal(capped.months[capped.months.length - 1], '2026-08')
  assert.equal(capped.months[0], '2025-02')
  assert.equal(capped.skippedOlder.length, many.length + 1 - MAX_MONTHS)
  assert.ok(capped.skippedOlder.every((month) => month < capped.months[0]))
  ok('cap keeps the newest months and reports the skipped older ones')
}

function main() {
  console.log('=== UMAG open obligations sync verification ===\n')
  checkStatic()
  checkMonthMath()
  console.log(`\n${passed} checks passed`)
}

main()
