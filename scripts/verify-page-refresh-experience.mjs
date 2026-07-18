#!/usr/bin/env node
/**
 * Verification for PWA page refresh UX (stale-while-refresh + fixed header).
 *
 * Usage:
 *   npm run verify:page-refresh-experience
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
  console.log('=== Page refresh experience verification ===\n')

  const layout = read('src/layouts/PlatformLayout.jsx')
  const ptr = read('src/components/platform/PullToRefresh.jsx')
  const indicator = read('src/components/platform/PageRefreshIndicator.jsx')
  const ctx = read('src/context/PullToRefreshContext.jsx')
  const owner = read('src/components/admin/OwnerDashboard.jsx')
  const schedule = read('src/components/admin/sections/WorkScheduleSection.jsx')
  const tracker = read('src/components/admin/sections/TimeTrackerSection.jsx')
  const employees = read('src/components/admin/sections/EmployeesSection.jsx')
  const profile = read('src/components/admin/sections/EmployeeProfileSection.jsx')

  console.log('Stage 1: Shared indicator')
  assert('PageRefreshIndicator component exists', indicator.includes('page-refresh-indicator'))
  assert('compact label Обновление', indicator.includes("'Обновление'") || indicator.includes('"Обновление"'))
  assert('PullToRefresh uses PageRefreshIndicator', ptr.includes('PageRefreshIndicator'))
  assert('no fullscreen loader in indicator', !indicator.includes('academy-data-loading'))

  console.log('Stage 2: Header stays outside refresh transform')
  assert('layout wraps main outside PullToRefresh', layout.includes('platform-layout__main'))
  assert('mobile header before PullToRefresh', (() => {
    const headerIdx = layout.indexOf('<PlatformMobileHeader')
    const ptrIdx = layout.indexOf('<PullToRefresh ')
    return headerIdx !== -1 && ptrIdx !== -1 && headerIdx < ptrIdx
  })())
  assert('content only inside PullToRefresh', layout.includes('platform-layout__content') && layout.includes('platform-layout__refresh'))
  assert('header not nested inside PullToRefresh', !/<PullToRefresh\s[\s\S]*?<PlatformMobileHeader/.test(layout))

  console.log('Stage 3: Quiet / stale-while-refresh')
  assert('performRefresh passes quiet:true', ctx.includes('quiet: true'))
  assert('useRefreshIndicator exported', ctx.includes('export function useRefreshIndicator'))
  assert('isRefreshing tracked', ctx.includes('isRefreshing'))
  assert('OwnerDashboard respects quiet', owner.includes('options?.quiet === true'))
  assert('WorkSchedule respects quiet', schedule.includes('options?.quiet === true'))
  assert('TimeTracker refresh uses quiet', tracker.includes('loadShift({ quiet: true })'))
  assert('Employees list respects quiet', employees.includes('options?.quiet === true'))
  assert('Employee profile respects quiet', profile.includes('options?.quiet === true'))

  console.log('Stage 4: No business-logic rewrites')
  assert('Edge functions untouched', !layout.includes('admin-list-employees'))
  assert('global reload retained', layout.includes('onGlobalRefresh={reload}'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
