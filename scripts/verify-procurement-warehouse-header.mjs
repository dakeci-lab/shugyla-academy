#!/usr/bin/env node
/**
 * Verification — «Склад» detail header: drop the order-status badge and
 * period text (Склад is a stock snapshot, not an order-generation view —
 * that status/period belongs to the Заказы tab, not here), and move
 * «Скачать Excel» to sit next to the search input instead of spanning the
 * full header width disconnected from it.
 *
 * Usage:
 *   npm run verify:procurement-warehouse-header
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const VIEW = 'src/components/procurement/ProcurementWarehouseView.jsx'
const CSS = 'src/components/procurement/ProcurementWarehouseView.css'

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
  console.log('=== Procurement warehouse header verification ===\n')

  const src = read(VIEW)
  const css = read(CSS)

  // --- Case 1: status badge and period text are gone from the detail head --
  assert.doesNotMatch(src, /Заказы частично сформированы/)
  assert.doesNotMatch(src, /STATUS_LABELS/)
  assert.doesNotMatch(src, /statusTone\(/)
  assert.doesNotMatch(src, /Период: \{formatPeriod/)
  assert.doesNotMatch(src, /function formatPeriod/)
  ok('Case 1: order-status badge (STATUS_LABELS/statusTone) and "Период: ..." text removed — Склад is a stock snapshot, not an order-generation view')

  // --- Case 2: dead CSS for the removed badge/period isn't left behind -----
  assert.doesNotMatch(css, /\.proc-wh__status\b/)
  assert.doesNotMatch(css, /\.proc-wh__detail-period\b/)
  ok('Case 2: .proc-wh__status*/.proc-wh__detail-period CSS rules removed along with their only usage')

  // --- Case 3: the detail head still shows the sync timestamp title --------
  assert.match(src, /Синхронизация от \{formatUmagDateTime\(selected\.syncedAt \|\| selected\.createdAt\)\}/)
  ok('Case 3: the sync-timestamp title itself is untouched — only status/period removed')

  // --- Case 4: export button moved into the search toolbar's actions slot --
  const detailBlock = src.slice(src.indexOf('if (selected) {'), src.indexOf('if (historyLoading'))
  assert.doesNotMatch(detailBlock, /<\/div>\s*\n\s*<button[\s\S]{0,80}proc-wh__export-btn/) // no longer a sibling of proc-wh__detail-head's closing div
  assert.match(detailBlock, /<PlatformSearchToolbar[\s\S]*?actions=\{/)
  assert.match(detailBlock, /actions=\{[\s\S]*?proc-wh__export-btn[\s\S]*?\}\s*\n\s*\/>/)
  ok('Case 4: «Скачать Excel» now renders via PlatformSearchToolbar\'s actions prop, next to the search input')

  console.log(`\n${checks} checks passed`)
}

main()
