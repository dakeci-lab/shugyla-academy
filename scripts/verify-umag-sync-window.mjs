#!/usr/bin/env node
/**
 * Verification: umag-sync never reaches further back than SYNC_WINDOW_DAYS (60), and large id lists are read in chunks.
 * Spec: docs/incidents/2026-10-20-umag-sync-url-limit.md
 *
 * Usage:
 *   npm run verify:umag-sync-window
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let checks = 0
function assert(name, condition) {
  if (!condition) throw new Error(name)
  checks += 1
  console.log(`  ✓ ${name}`)
}

const config = read('supabase/functions/_shared/umagConfig.ts')
const edge = read('supabase/functions/umag-sync/index.ts')

assert('window constant is 60 days', /export const SYNC_WINDOW_DAYS = 60\b/.test(config))
assert('edge function imports the window', /SYNC_WINDOW_DAYS,/.test(edge))
assert('effectiveFrom is clamped to today − window',
  /const windowStart = addCalendarDays\(todayKey, -SYNC_WINDOW_DAYS\)/.test(edge) &&
  /const effectiveFrom = widenedFrom < windowStart \? windowStart : widenedFrom/.test(edge))
assert('existing supplies/returns/suppliers are read in chunks (URL limit)',
  (edge.match(/fetchRowsByIdsInChunks\(/g) || []).length >= 4)
assert('no unchunked .in() over the full id list for umag_supplies',
  !/\.from\('umag_supplies'\)\s*\.select\('id, umag_supply_id, is_source_deleted'\)\s*\.in\(/.test(edge))
assert('save error names the document and the database reason', edge.includes('rowError.message') && edge.includes('upsertDetail'))

console.log(`\nOK — ${checks} checks`)
