#!/usr/bin/env node
/**
 * Verification — «Без срока» becomes a setup-gap banner, not a same-tier
 * urgency section, in the embedded «К оплате» compact schedule.
 *
 * Structural checks against the real source + a pure-logic import of
 * buildPaymentScheduleView via extensionlessResolver. No live Supabase.
 *
 * Usage:
 *   npm run verify:supplier-finance-terms-missing-banner
 */

import fs from 'fs'
import path from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

const PANEL = 'src/components/suppliers/payments/SupplierPaymentsPanel.jsx'
const CSS = 'src/components/suppliers/payments/SupplierPaymentsPanel.css'
const UTILS = 'src/utils/supplierPaymentObligations.js'

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

async function main() {
  console.log('=== Supplier finance «Без срока» banner verification ===\n')

  const panelSrc = read(PANEL)
  const cssSrc = read(CSS)

  // --- Case 1: termsMissing is no longer a same-tier urgency section --------
  const sectionsMatch = panelSrc.match(/const COMPACT_SECTIONS = \[([\s\S]*?)\n\]/)
  assert.ok(sectionsMatch, 'COMPACT_SECTIONS array not found')
  const sectionsBody = sectionsMatch[1]
  assert.match(sectionsBody, /id: 'overdue'[\s\S]*id: 'today'[\s\S]*id: 'upcoming'/)
  assert.doesNotMatch(sectionsBody, /id: 'termsMissing'/)
  ok("Case 1: COMPACT_SECTIONS is overdue → today → upcoming only, no termsMissing entry")

  // --- Case 2: banner component exists and consumes the same view fields ----
  assert.match(panelSrc, /function MissingTermsBanner\(/)
  assert.match(panelSrc, /lists\.termsMissing/)
  assert.match(panelSrc, /summaries\.termsMissing/)
  ok('Case 2: MissingTermsBanner reuses buildPaymentScheduleView lists/summaries.termsMissing — no new data shape')

  // --- Case 3: banner is rendered above the urgency queue --------------------
  assert.match(
    panelSrc,
    /<MissingTermsBanner[\s\S]*?\/>\s*\n\s*\n\s*\{filteredSections\.length > 0 \? \(/
  )
  ok('Case 3: MissingTermsBanner renders before the overdue/today/upcoming wrap')

  // --- Case 4: collapsed by default, expandable ------------------------------
  assert.match(panelSrc, /useState\(false\)/)
  assert.match(panelSrc, /aria-expanded=\{expanded\}/)
  assert.match(panelSrc, /onClick=\{onToggle\}/)
  ok('Case 4: banner starts collapsed and toggles via an aria-expanded control')

  // --- Case 5: expanded banner still uses the shared row + configure action -
  assert.match(
    panelSrc,
    /MissingTermsBanner[\s\S]{0,2000}<CompactObligationRow/
  )
  assert.match(panelSrc, /className="spo-compact__configure"/)
  assert.match(panelSrc, /spo-compact__configure[\s\S]{0,400}Настроить отсрочку/)
  ok('Case 5: expanded banner rows reuse CompactObligationRow, keeping «Настроить отсрочку»')

  // --- Case 6: empty-state accounts for both queue and banner ---------------
  assert.match(
    panelSrc,
    /filteredSections\.length === 0 && filteredMissingGroups\.length === 0/
  )
  ok('Case 6: "Нет обязательств к оплате" only shows when both the queue and the banner are empty')

  // --- Case 7: CSS defines the banner, doesn't break the mobile row grid ----
  assert.match(cssSrc, /\.spo-compact__missing-banner-wrap/)
  assert.match(cssSrc, /\.spo-compact__missing-toggle/)
  assert.match(cssSrc, /\.spo-compact__missing-rows/)
  assert.doesNotMatch(cssSrc, /\.spo-compact__missing-rows \.spo-compact__row-main/)
  assert.match(cssSrc, /@media \(max-width: 640px\)[\s\S]*\.spo-compact__row-main/)
  ok('Case 7: banner CSS added without a desktop-grid override that would break the mobile row layout')

  // --- Case 8: pure logic untouched — lists.termsMissing still populated ----
  const { buildPaymentScheduleView } = await import(pathToFileURL(path.join(ROOT, UTILS)).href)
  const view = buildPaymentScheduleView(
    [
      { id: 'm1', currentDebt: 500, dueDate: null, platformSupplierId: 'sup-9', supplierName: 'Нарлен' },
      { id: 'm2', currentDebt: 300, dueDate: null, platformSupplierId: 'sup-8', supplierName: 'Райян' },
    ],
    '2026-08-30'
  )
  assert.equal(view.lists.termsMissing.length, 2)
  assert.equal(view.summaries.termsMissing, 800)
  ok('Case 8: buildPaymentScheduleView still groups terms-missing obligations per supplier (untouched)')

  console.log(`\n${checks} checks passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
