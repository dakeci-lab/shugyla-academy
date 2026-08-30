#!/usr/bin/env node
/**
 * Verification — «Расчёты» detail sheets (GroupDetail in «К оплате»,
 * OperationDetailSheet in «Взаиморасчёты») portal to document.body.
 *
 * Bug: both sheets are `position: fixed`, but were rendered inline, deep
 * inside the routed page tree. Every platform page is wrapped by
 * PullToRefresh, whose .pull-to-refresh__body has `will-change: transform`
 * set unconditionally (PullToRefresh.css) — per the CSS spec that creates a
 * containing block for `position: fixed` descendants, same as an actual
 * transform would. So the sheet was centering inside that page-length box
 * instead of the viewport, landing off-screen until the user scrolled to
 * roughly the middle of the whole page. AdminModal.jsx already solves this
 * correctly via createPortal(..., document.body); this fix applies the same
 * pattern to the two hand-rolled sheets.
 *
 * Usage:
 *   npm run verify:supplier-finance-detail-sheets-portal
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const PAYMENTS_PANEL = 'src/components/suppliers/payments/SupplierPaymentsPanel.jsx'
const OPERATION_SHEET = 'src/components/suppliers/settlements/OperationDetailSheet.jsx'
const PULL_TO_REFRESH_CSS = 'src/components/platform/PullToRefresh.css'
const ADMIN_MODAL = 'src/components/admin/AdminModal.jsx'

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

function main() {
  console.log('=== Supplier finance detail sheets — portal-to-body verification ===\n')

  // --- Case 1: the root cause is real and still present ---------------------
  const pullCss = read(PULL_TO_REFRESH_CSS)
  assert.match(pullCss, /\.pull-to-refresh__body\s*\{[^}]*will-change:\s*transform;/)
  ok('Case 1: .pull-to-refresh__body still has unconditional will-change:transform — confirms the containing-block hazard this fix works around is real, not hypothetical')

  // --- Case 2: the existing correct pattern this fix mirrors ----------------
  const adminModalSrc = read(ADMIN_MODAL)
  assert.match(adminModalSrc, /import \{ createPortal \} from 'react-dom'/)
  assert.match(adminModalSrc, /return createPortal\(/)
  assert.match(adminModalSrc, /document\.body\s*\)\s*\n\}/)
  ok('Case 2: AdminModal.jsx already portals to document.body — the pattern this fix follows, not a new one')

  // --- Case 3: GroupDetail (К оплате) portals to document.body --------------
  const paymentsSrc = read(PAYMENTS_PANEL)
  assert.match(paymentsSrc, /import \{ createPortal \} from 'react-dom'/)
  const groupDetailFn = paymentsSrc.slice(
    paymentsSrc.indexOf('function GroupDetail'),
    paymentsSrc.indexOf('\n}', paymentsSrc.indexOf('function GroupDetail')) + 2
  )
  assert.match(groupDetailFn, /return createPortal\(/)
  assert.match(groupDetailFn, /spo-panel__sheet-backdrop/)
  assert.match(groupDetailFn, /,\s*\n\s*document\.body\s*\n\s*\)/)
  ok('Case 3: GroupDetail (row detail sheet in «К оплате») returns createPortal(..., document.body)')

  // --- Case 4: OperationDetailSheet (Взаиморасчёты) portals too --------------
  const opSheetSrc = read(OPERATION_SHEET)
  assert.match(opSheetSrc, /import \{ createPortal \} from 'react-dom'/)
  assert.match(opSheetSrc, /return createPortal\(/)
  assert.match(opSheetSrc, /umag-op-detail__backdrop/)
  assert.match(opSheetSrc, /,\s*\n\s*document\.body\s*\n\s*\)/)
  ok('Case 4: OperationDetailSheet (operation detail in «Взаиморасчёты») returns createPortal(..., document.body)')

  // --- Case 5: no behavior/content change, only the render target -----------
  assert.match(paymentsSrc, /role="dialog"[\s\S]{0,40}aria-modal="true"[\s\S]{0,40}aria-label=\{group\.name\}/)
  assert.match(opSheetSrc, /role="dialog"[\s\S]{0,40}aria-modal="true"[\s\S]{0,40}aria-label=\{headerFromHistory\.title\}/)
  ok('Case 5: dialog role/aria-modal/aria-label markup unchanged — only the portal target moved')

  console.log(`\n${checks} checks passed`)
}

main()
