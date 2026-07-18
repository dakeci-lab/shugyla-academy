#!/usr/bin/env node
/**
 * Verification: employee time tracker checkout UI + open-shift rules.
 *
 * Usage:
 *   npm run verify:time-tracker-checkout-ui
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  hasOpenAttendance,
  resolveWorkWindowShift,
  deriveTrackerStatus,
  isStaleOpenShift,
} from '../src/utils/shiftWorkWindow.js'
import {
  CHECKOUT_COOLDOWN_MS,
  formatCheckoutCooldownHint,
  getCheckoutCooldownRemainingMs,
} from '../src/utils/checkoutCooldown.js'

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

function shift(overrides = {}) {
  return {
    shiftDate: '2026-07-17',
    status: 'working',
    plannedStartTime: '09:00',
    plannedEndTime: '18:00',
    actualStartTime: null,
    actualEndTime: null,
    ...overrides,
  }
}

/** Mirrors resolveCanCheckOut open-attendance rule (source also statically asserted). */
function canCheckOutOpen(shiftRow) {
  return hasOpenAttendance(shiftRow)
}

function main() {
  console.log('=== Time tracker checkout UI verification ===\n')

  console.log('Stage 1: Open attendance after planned end')
  const openLate = shift({
    actualStartTime: '2026-07-17T09:10:00+05:00',
  })
  const afterEnd = new Date('2026-07-17T20:00:00+05:00')
  assert('hasOpenAttendance true', hasOpenAttendance(openLate))
  assert('stale after planned end', isStaleOpenShift(openLate, afterEnd))
  assert('checkout allowed after planned end', canCheckOutOpen(openLate) === true)

  console.log('\nStage 2: Day off with open attendance')
  const dayOffOpen = shift({
    status: 'day_off',
    actualStartTime: '2026-07-17T10:00:00+05:00',
  })
  assert('open on day_off still open', hasOpenAttendance(dayOffOpen))
  assert('checkout on day_off open', canCheckOutOpen(dayOffOpen))

  console.log('\nStage 3: Yesterday open preferred over today day-off')
  const yesterdayOpen = shift({
    shiftDate: '2026-07-16',
    plannedStartTime: '22:00',
    plannedEndTime: '06:00',
    actualStartTime: '2026-07-16T22:05:00+05:00',
  })
  const todayDayOff = shift({
    shiftDate: '2026-07-17',
    status: 'day_off',
  })
  const morning = new Date('2026-07-17T10:00:00+05:00')
  const resolved = resolveWorkWindowShift([yesterdayOpen, todayDayOff], morning)
  assert('active is yesterday open', resolved.activeShift?.shiftDate === '2026-07-16')
  assert('tracker working', deriveTrackerStatus(resolved.activeShift, morning) === 'working')
  assert('checkout allowed for stale overnight', canCheckOutOpen(resolved.activeShift))

  console.log('\nStage 4: No open shift')
  const ready = shift()
  assert('no open attendance', hasOpenAttendance(ready) === false)
  assert('checkout false without open', canCheckOutOpen(ready) === false)

  console.log('\nStage 5: Static wiring')
  const section = read('src/components/admin/sections/TimeTrackerSection.jsx')
  const homeCard = read('src/components/admin/sections/TimeTrackerHomeCard.jsx')
  const audit = read('src/utils/timeTrackerAudit.js')
  const attendance = read('src/utils/attendanceData.js')
  const edge = read('supabase/functions/employee-time-tracker-action/index.ts')
  const migration = read(
    'supabase/migrations/20260718013000_fix_attendance_checkout_open_shift_priority.sql'
  )
  const errors = read('src/utils/attendanceActionErrors.js')

  assert('home shows Завершить смену', homeCard.includes('Завершить смену'))
  assert('checkout gated by canCheckOut', homeCard.includes('{canCheckOut &&'))
  assert('open shift forces working variant', homeCard.includes('hasOpenShift'))
  assert('getTodayShiftState prioritizes open attendance', attendance.includes('actualStartTime && !shift.actualEndTime'))
  assert('double-press guard acting', section.includes('if (acting) return false'))
  assert('quiet refresh after mutation', section.includes('loadShift({ quiet: true })'))
  assert('no initializeData in section', !section.includes('initializeData'))
  assert('resolveCanCheckOut uses hasOpenAttendance', audit.includes('hasOpenAttendance(shift)'))
  assert('resolveCanCheckOut not gated by work window first', !audit.includes('if (!isOpenShiftWorkWindowActive'))
  assert('edge clock_out uses hasOpenAttendance', edge.includes('hasOpenAttendance(activeShift)'))
  assert('RPC migration prefers open attendance', migration.includes('actual_end_time is null'))
  assert('RPC migration orders by shift_date asc', migration.includes('order by shift_date asc'))
  assert('no employees.edit in TimeTrackerSection', !section.includes('employees.edit'))
  assert('HTTP 4xx not mapped as offline', errors.includes('if (status >= 400) return false'))
  assert('loading state shows skeleton not working title', homeCard.includes('HomeSkeleton'))

  console.log('\nStage 6: Checkout cooldown after shift start')
  const startAt = new Date('2026-07-17T09:00:00+05:00')
  const at20s = new Date(startAt.getTime() + 20_000)
  const at60s = new Date(startAt.getTime() + 60_000)
  const at90s = new Date(startAt.getTime() + 90_000)
  assert('cooldown is 60 seconds', CHECKOUT_COOLDOWN_MS === 60_000)
  assert(
    '20s after start still blocked',
    getCheckoutCooldownRemainingMs(startAt.toISOString(), at20s) === 40_000
  )
  assert(
    'exactly 60s unlocks',
    getCheckoutCooldownRemainingMs(startAt.toISOString(), at60s) === 0
  )
  assert(
    'after 60s remains unlocked',
    getCheckoutCooldownRemainingMs(startAt.toISOString(), at90s) === 0
  )
  assert(
    'no start time means no cooldown',
    getCheckoutCooldownRemainingMs(null, at20s) === 0
  )
  assert(
    'hint uses mm:ss',
    formatCheckoutCooldownHint(58_000) === 'Будет доступно через 00:58'
  )
  assert('section uses checkout cooldown helper', section.includes('getCheckoutCooldownRemainingMs'))
  assert('section disables checkout during cooldown', section.includes('checkoutDisabled'))
  assert('home card shows cooldown hint', homeCard.includes('checkoutCooldownHint'))
  assert('checkout handler re-checks cooldown', section.includes('getCheckoutCooldownRemainingMs(shift?.actualStartTime'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
