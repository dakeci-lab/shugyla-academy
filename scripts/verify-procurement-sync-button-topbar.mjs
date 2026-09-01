#!/usr/bin/env node
/**
 * Verification: manual UMAG sync button moved from the search toolbar to the
 * page topbar (top-right, next to the ABC help «?»), freeing width for search.
 *
 * Usage:
 *   npm run verify:procurement-sync-button-topbar
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
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

function main() {
  console.log('=== Procurement planning: sync button in topbar ===\n')

  const planner = read('src/components/procurement/ProcurementPlannerView.jsx')
  const plannerCss = read('src/components/procurement/ProcurementPlannerView.css')

  console.log('Stage 1: Sync button lives in the topbar, not the search actions')

  const topbarStart = planner.indexOf('const headerStrip = (')
  const topbarEnd = planner.indexOf('if (!isCloudMode())', topbarStart)
  assert('headerStrip block found', topbarStart >= 0 && topbarEnd > topbarStart)
  const headerStripBlock = planner.slice(topbarStart, topbarEnd)

  assert('PlatformSyncButton rendered inside headerStrip', headerStripBlock.includes('<PlatformSyncButton'))
  assert(
    'sync button is the last thing in the topbar (after chips/help)',
    headerStripBlock.indexOf('proc-planner__chips') < headerStripBlock.indexOf('<PlatformSyncButton'),
  )

  const searchToolbarStart = planner.indexOf('<PlatformSearchToolbar')
  const searchToolbarEnd = planner.indexOf('renderColumnSettingsGear()', searchToolbarStart)
  assert('search toolbar block found', searchToolbarStart >= 0 && searchToolbarEnd > searchToolbarStart)
  const searchToolbarBlock = planner.slice(searchToolbarStart, searchToolbarEnd)
  assert(
    'sync button no longer in search toolbar actions',
    !searchToolbarBlock.includes('<PlatformSyncButton'),
  )
  assert(
    'orderable toggle still in search toolbar actions (untouched)',
    searchToolbarBlock.includes('proc-planner__orderable-toggle'),
  )
  assert(
    'create button still in search toolbar actions (untouched)',
    searchToolbarBlock.includes('proc-planner__create-btn'),
  )

  console.log('\nStage 2: Tooltip flips below the button in its new top position')

  assert(
    'sync button tooltip wrap has topbar modifier class',
    headerStripBlock.includes('proc-planner__tip-wrap proc-planner__tip-wrap--topbar'),
  )
  assert(
    'topbar modifier flips tooltip to render below, not above',
    /\.proc-planner__tip-wrap--topbar\[data-tooltip\]::after\s*\{[^}]*top:\s*calc\(100% \+ 6px\)/s.test(
      plannerCss,
    ),
  )
  assert(
    'base tooltip (search toolbar buttons) still opens upward',
    /\.proc-planner__tip-wrap\[data-tooltip\]::after\s*\{[^}]*bottom:\s*calc\(100% \+ 6px\)/s.test(
      plannerCss,
    ),
  )

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
