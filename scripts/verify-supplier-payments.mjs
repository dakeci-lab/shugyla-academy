#!/usr/bin/env node
/**
 * Static + pure-logic checks for supplier payment obligations module.
 *
 * Usage:
 *   npm run verify:supplier-payments
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
let passed = 0

function ok(name) {
  passed += 1
  console.log(`  ✓ ${name}`)
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function addCalendarDays(dateKey, days) {
  const [y, m, d] = String(dateKey).split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d) + Number(days) * 86_400_000
  const dt = new Date(utc)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function diffCalendarDays(fromKey, toKey) {
  const [fy, fm, fd] = String(fromKey).split('-').map(Number)
  const [ty, tm, td] = String(toKey).split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

function deriveStatus(debt, dueDate, today) {
  if (!(debt > 0)) return 'paid'
  if (!dueDate) return 'terms_missing'
  if (dueDate === today) return 'due_today'
  if (dueDate < today) return 'overdue'
  return 'upcoming'
}

function main() {
  console.log('=== Supplier payments verification ===\n')

  const migration = read('supabase/migrations/20260727040000_supplier_payment_obligations.sql')
  assert.match(migration, /create table if not exists public\.supplier_payment_obligations/)
  assert.match(migration, /deferment_days_snapshot/)
  assert.match(migration, /due_date/)
  assert.match(migration, /supplier_payments\.view/)
  assert.match(migration, /unique \(umag_supply_id\)/)
  assert.match(migration, /revoke all on table public\.supplier_payment_obligations from anon/)
  assert.doesNotMatch(migration, /\borganization_id\b\s/)
  ok('migration schema + permissions + RLS')

  const sync = read('supabase/functions/umag-sync/index.ts')
  assert.match(sync, /refreshPaymentObligations/)
  assert.match(sync, /terms_snapshot_created_at/)
  assert.match(sync, /First snapshot only when missing/)
  ok('umag-sync refreshes obligations without rewriting snapshots')

  const utils = read('src/utils/supplierPaymentObligations.js')
  assert.match(utils, /Asia\/Aqtobe/)
  assert.match(utils, /TERMS_MISSING/)
  assert.match(utils, /buildPaymentScheduleView/)
  ok('status helpers use Aqtobe calendar dates')

  const panel = read('src/components/suppliers/payments/SupplierPaymentsPanel.jsx')
  assert.match(panel, /Сегодня к оплате/)
  assert.match(panel, /Отсроченная задолженность/)
  assert.match(panel, /Прогноз платежей/)
  assert.doesNotMatch(panel, /setInterval/)
  ok('payments UI dashboard without polling')

  const nav = read('src/platform/platformNav.js')
  assert.match(nav, /Оплаты поставщикам/)
  assert.match(nav, /supplier-payments/)
  ok('nav item under Закупки')

  const app = read('src/App.jsx')
  assert.match(app, /SupplierPaymentsPage/)
  assert.match(app, /supplier-payments/)
  ok('route wired')

  const form = read('src/components/suppliers/SupplierForm.jsx')
  assert.match(form, /validateSupplierDeferralDays/)
  assert.match(form, /SupplierPaymentsSummary/)
  assert.match(form, /max=\"365\"/)
  ok('supplier form validates deferral days and shows payments summary')

  assert.equal(addCalendarDays('2026-07-28', 7), '2026-08-04')
  assert.equal(addCalendarDays('2026-07-28', 0), '2026-07-28')
  assert.equal(addCalendarDays('2026-07-28', 14), '2026-08-11')
  ok('due_date = doc date + deferment days')

  const today = '2026-08-04'
  assert.equal(deriveStatus(100, '2026-08-04', today), 'due_today')
  assert.equal(deriveStatus(100, '2026-08-03', today), 'overdue')
  assert.equal(deriveStatus(100, '2026-08-09', today), 'upcoming')
  assert.equal(deriveStatus(100, null, today), 'terms_missing')
  assert.equal(deriveStatus(0, '2026-08-01', today), 'paid')
  assert.equal(diffCalendarDays(today, '2026-08-09'), 5)
  assert.equal(diffCalendarDays(today, '2026-08-03'), -1)
  ok('status and day-diff rules')

  console.log(`\n${passed} checks passed`)
}

main()
