#!/usr/bin/env node
/**
 * Verification for employee home dashboard stability.
 *
 * Usage:
 *   npm run verify:home-dashboard
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
  console.log('=== Home dashboard verification ===\n')

  const platformHome = read('src/pages/platform/PlatformHome.jsx')
  const timeTracker = read('src/components/admin/sections/TimeTrackerSection.jsx')
  const homeCard = read('src/components/admin/sections/TimeTrackerHomeCard.jsx')
  const audit = read('src/utils/timeTrackerAudit.js')
  const shiftData = read('src/utils/shiftData.js')
  const attendance = read('src/utils/attendanceData.js')
  const errorBoundary = read('src/components/platform/PlatformErrorBoundary.jsx')

  console.log('Stage 1: Role-based home routing')

  assert('PlatformHome uses isAdmin for owner dashboard', platformHome.includes('isAdmin(user?.role)'))
  assert('employee home uses TimeTrackerSection', platformHome.includes('TimeTrackerSection'))
  assert('home variant prop', platformHome.includes('variant="home"'))
  assert('employee id from session user', platformHome.includes('employeeId={user?.id}'))

  console.log('Stage 2: Time tracker audit imports')

  assert('hasOpenAttendance imported', audit.includes('hasOpenAttendance'))
  assert(
    'import from shiftWorkWindow',
    audit.includes("from './shiftWorkWindow'") && audit.includes('hasOpenAttendance')
  )
  assert('resolveCanCheckOut allows open attendance', audit.includes('hasOpenAttendance(shift)'))

  console.log('Stage 3: Null-safe shift handling')

  assert('normalizeShift guards null computed', shiftData.includes('const safeComputed = computed ??'))
  assert('parseDateKey guards missing date', shiftData.includes("typeof dateKey !== 'string'"))
  assert('isPastShiftDay guards missing shiftDate', shiftData.includes('if (!shift?.shiftDate) return false'))
  assert('getTodayShiftState empty shift message', attendance.includes("code: 'no_schedule'"))
  assert('resolveHomeCardVariant optional state', homeCard.includes('state?.code'))
  assert('empty state title', homeCard.includes('На сегодня смена не назначена'))
  assert('empty state hint', homeCard.includes('На сегодня смена не назначена'))

  console.log('Stage 4: Loading and profile fallbacks')

  assert('loadShift try/catch', timeTracker.includes('try {') && timeTracker.includes('setLoadError(true)'))
  assert('welcome name fallback chain', timeTracker.includes("|| 'сотрудник'"))
  assert('shift null safe in home card', homeCard.includes('shift?.actualStartTime'))
  assert('no supplier form keys on home', !homeCard.includes('key={form'))

  console.log('Stage 5: Error boundary retry')

  assert('retry increments remount key', errorBoundary.includes('retryKey'))
  assert('retry remounts children', errorBoundary.includes('key={this.state.retryKey}'))
  assert('boundary logs error message', errorBoundary.includes('error?.message'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
