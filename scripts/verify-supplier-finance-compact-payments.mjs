#!/usr/bin/env node
/**
 * Verification for Этап 2.8 — compact embedded «К оплате» presentation.
 *
 * Structural checks against the real source + pure-logic imports of
 * buildPaymentScheduleView via extensionlessResolver. No live Supabase.
 *
 * Usage:
 *   npm run verify:supplier-finance-compact-payments
 */

import fs from 'fs'
import path from 'path'
import { execFileSync } from 'node:child_process'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

const PAYMENTS_PANEL = 'src/components/suppliers/payments/SupplierPaymentsPanel.jsx'
const PAYMENTS_CSS = 'src/components/suppliers/payments/SupplierPaymentsPanel.css'
const SETTLEMENTS_PANEL = 'src/components/suppliers/settlements/UmagSettlementsPanel.jsx'
const UTILS = 'src/utils/supplierPaymentObligations.js'
const DEBT_SERVICE = 'src/services/supplierDebtService.js'
const SUMMARY_SERVICE = 'src/services/supplierFinanceSummaryService.js'

let checks = 0
function ok(name) {
  checks += 1
  console.log(`  ✓ ${name}`)
}
function read(relPath) {
  const full = path.join(ROOT, relPath)
  if (!fs.existsSync(full)) throw new Error(`file not found: ${relPath}`)
  return fs.readFileSync(full, 'utf8')
}
function gitStatus(paths) {
  return execFileSync('git', ['status', '--porcelain', '--', ...paths], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim()
}

async function main() {
  console.log('=== Supplier finance compact payments verification (Этап 2.8) ===\n')

  const panelSrc = read(PAYMENTS_PANEL)
  const cssSrc = read(PAYMENTS_CSS)
  const settlementsSrc = read(SETTLEMENTS_PANEL)
  const utilsSrc = read(UTILS)

  // --- Case 1: embedded uses compact mode -----------------------------------
  assert.match(panelSrc, /embedded \? \(\s*\n\s*<CompactPaymentSchedule/)
  assert.match(panelSrc, /function CompactPaymentSchedule\(/)
  ok('Case 1: embedded SupplierPaymentsPanel renders CompactPaymentSchedule')

  // --- Case 2: standalone unchanged -----------------------------------------
  assert.match(panelSrc, /embedded = false,/)
  assert.match(panelSrc, /\) : \(\s*\n\s*<>\s*\n\s*<div className="spo-panel__tabs"/)
  assert.match(panelSrc, /<ObligationCard/)
  ok('Case 2: non-embedded path keeps legacy tabs + ObligationCard list')

  // --- Case 3: four groups in order -----------------------------------------
  assert.match(panelSrc, /const COMPACT_SECTIONS = \[[\s\S]*?id: 'overdue'[\s\S]*?id: 'today'[\s\S]*?id: 'upcoming'[\s\S]*?id: 'termsMissing'/)
  ok('Case 3: COMPACT_SECTIONS order is overdue → today → upcoming → termsMissing')

  // --- Case 4: group header uses view count + amount ------------------------
  assert.match(panelSrc, /tabCounts\[section\.id\]/)
  assert.match(panelSrc, /summaries\[section\.summaryKey\]/)
  assert.match(panelSrc, /\{section\.label\} · \{count\} · \{formatUmagMoney\(amount\)\}/)
  ok('Case 4: section headers use tabCounts + summaries from payment schedule view')

  // --- Case 5: no new status formula in compact presentation ----------------
  assert.doesNotMatch(panelSrc, /CompactPaymentSchedule[\s\S]{0,800}deriveObligationStatus/)
  assert.doesNotMatch(panelSrc, /CompactObligationRow[\s\S]{0,400}deriveObligationStatus/)
  assert.match(panelSrc, /formatCompactStatusText\(group, todayKey\)/)
  assert.match(panelSrc, /switch \(group\.status\)/)
  ok('Case 5: compact status text branches on group.status from view, not deriveObligationStatus')

  // --- Case 6: canonical debt untouched -------------------------------------
  const debtSrc = read(DEBT_SERVICE)
  assert.match(debtSrc, /export async function fetchCanonicalSupplierDebts/)
  const summarySrc = read(SUMMARY_SERVICE)
  assert.match(summarySrc, /debt: view\.summaries\.totalActiveDebt/)
  assert.doesNotMatch(panelSrc, /fetchCanonicalSupplierDebts/)
  ok('Case 6: no canonical debt business logic changed in SupplierPaymentsPanel')

  // --- Case 7: individual obligations (groups keyed per due date) -----------
  const { buildPaymentScheduleView } = await import(
    pathToFileURL(path.join(ROOT, UTILS)).href
  )
  const today = '2026-08-20'
  const view = buildPaymentScheduleView(
    [
      {
        id: 'a',
        currentDebt: 100,
        dueDate: '2026-08-12',
        platformSupplierId: 'sup-1',
        supplierName: 'Ленгерское',
      },
      {
        id: 'b',
        currentDebt: 200,
        dueDate: '2026-08-17',
        platformSupplierId: 'sup-1',
        supplierName: 'Ленгерское',
      },
    ],
    today
  )
  const overdue = view.lists.overdue
  assert.equal(overdue.length, 2)
  assert.ok(overdue.some((g) => g.dueDate === '2026-08-12'))
  assert.ok(overdue.some((g) => g.dueDate === '2026-08-17'))
  ok('Case 7: same supplier with different due dates stays as separate groups')

  // --- Case 8: overdue compact days -----------------------------------------
  assert.match(panelSrc, /OBLIGATION_STATUS\.OVERDUE[\s\S]{0,120}diffCalendarDays/)
  assert.match(panelSrc, /`\$\{days\} дн\.`/)
  ok('Case 8: overdue rows show compact N дн. via diffCalendarDays on group.dueDate')

  // --- Case 9: today status -------------------------------------------------
  assert.match(panelSrc, /case OBLIGATION_STATUS\.DUE_TODAY:[\s\S]{0,40}return 'Сегодня'/)
  ok('Case 9: due-today displays «Сегодня»')

  // --- Case 10: upcoming sort preserved -------------------------------------
  const upcomingView = buildPaymentScheduleView(
    [
      { id: 'u1', currentDebt: 50, dueDate: '2026-08-25', platformSupplierId: 's1', supplierName: 'A' },
      { id: 'u2', currentDebt: 60, dueDate: '2026-08-22', platformSupplierId: 's2', supplierName: 'B' },
    ],
    today
  )
  const upcoming = upcomingView.lists.upcoming
  assert.equal(upcoming[0].dueDate, '2026-08-22')
  assert.equal(upcoming[1].dueDate, '2026-08-25')
  ok('Case 10: upcoming groups stay sorted by nearest due date first')

  // --- Case 11: terms missing configure action ------------------------------
  assert.match(panelSrc, /className="spo-compact__configure"/)
  assert.match(panelSrc, /spo-compact__configure[\s\S]{0,400}Настроить отсрочку/)
  assert.match(panelSrc, /onConfigure=\{openConfigure\}/)
  ok('Case 11: terms-missing compact rows keep «Настроить отсрочку» action')

  // --- Case 12: row interaction (GroupDetail) -------------------------------
  assert.match(panelSrc, /onOpen=\{setSelectedGroup\}/)
  assert.match(panelSrc, /\{selectedGroup \? \(\s*\n\s*<GroupDetail/)
  assert.match(panelSrc, /onClick=\{\(\) => onOpen\(group\)\}/)
  ok('Case 12: compact row click opens existing GroupDetail sheet')

  // --- Case 13: no duplicate KPI in embedded -------------------------------
  assert.match(panelSrc, /\{!embedded && \(\s*\n\s*<div className="spo-panel__kpis"/)
  assert.doesNotMatch(panelSrc, /embedded \? [\s\S]{0,200}spo-panel__kpis/)
  ok('Case 13: KPI cards remain gated behind !embedded')

  // --- Case 14: no internal status tabs in embedded --------------------------
  assert.match(panelSrc, /embedded \? \([\s\S]*CompactPaymentSchedule[\s\S]*\) : \([\s\S]*spo-panel__tabs/)
  ok('Case 14: embedded branch renders CompactPaymentSchedule; legacy branch keeps spo-panel__tabs')

  // --- Case 15: desktop row structure ---------------------------------------
  assert.match(cssSrc, /\.spo-compact__supplier/)
  assert.match(cssSrc, /\.spo-compact__due/)
  assert.match(cssSrc, /\.spo-compact__status/)
  assert.match(cssSrc, /\.spo-compact__amount/)
  assert.doesNotMatch(cssSrc, /min-width:\s*900px/)
  ok('Case 15: compact CSS defines supplier/due/status/amount columns without rigid min-width')

  // --- Case 16: mobile responsive -------------------------------------------
  assert.match(cssSrc, /@media \(max-width: 640px\)[\s\S]*\.spo-compact__mobile-meta/)
  assert.match(cssSrc, /\.spo-compact__mobile-meta[\s\S]*display: none/)
  ok('Case 16: mobile layout uses spo-compact__mobile-meta without horizontal overflow table')

  // --- Case 17: canonical debt / summary formulas still present in source ---
  assert.match(debtSrc, /fetchAllSupabaseRows/)
  assert.match(debtSrc, /\.gt\('current_debt', 0\)/)
  assert.match(summarySrc, /fetchAllSupabaseRows/)
  ok('Case 17: canonical debt + summary formulas intact; financial reads use pagination helper')

  // --- Case 18: settlements untouched (source sentinel) -------------------
  assert.doesNotMatch(settlementsSrc, /spo-compact__/)
  ok('Case 18: UmagSettlementsPanel has no compact-payment presentation fork')

  // --- Business logic reuse sentinels ---------------------------------------
  assert.match(panelSrc, /buildPaymentScheduleView\(obligations, summaryData\.todayKey\)/)
  assert.match(panelSrc, /listPaymentObligations\(\{ includePaid: false \}\)/)
  assert.match(utilsSrc, /export function buildPaymentScheduleView/)
  ok('SupplierPaymentsPanel still uses listPaymentObligations + buildPaymentScheduleView')

  // --- Empty sections hidden ------------------------------------------------
  assert.match(panelSrc, /if \(groups\.length === 0\) return null/)
  ok('empty compact sections are omitted (not four «нет платежей» blocks)')

  // --- Nav / routes (source) ------------------------------------------------
  const navSrc = read('src/platform/platformNav.js')
  assert.doesNotMatch(navSrc, /supplier-finance/)
  ok('platformNav.js has no supplier-finance nav entry')

  console.log(`\n${checks} checks passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
