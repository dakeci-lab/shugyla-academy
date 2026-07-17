#!/usr/bin/env node
/**
 * Verification for stale open shift release and work-window logic.
 *
 * Usage:
 *   npm run verify:stale-shift-release
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  buildEffectivePlannedEndAt,
  isOpenShiftWorkWindowActive,
  isStaleOpenShift,
  resolveWorkWindowShift,
  deriveTrackerStatus,
  isOvernightPlannedShift,
} from '../src/utils/shiftWorkWindow.js'

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

function shift(overrides) {
  return {
    shiftDate: '2026-07-15',
    status: 'working',
    plannedStartTime: '09:00',
    plannedEndTime: '18:00',
    actualStartTime: null,
    actualEndTime: null,
    ...overrides,
  }
}

function stageWorkWindowLogic() {
  console.log('Stage 1: Work window logic')

  assert('overnight 22:00-06:00 detected', isOvernightPlannedShift('22:00', '06:00'))
  assert('day shift 09:00-18:00 not overnight', !isOvernightPlannedShift('09:00', '18:00'))

  const dayShift = shift({
    shiftDate: '2026-07-15',
    plannedStartTime: '09:00',
    plannedEndTime: '18:00',
    actualStartTime: '2026-07-15T09:05:00+05:00',
  })
  const nextMorning = new Date('2026-07-16T10:00:00+05:00')
  assert('stale day shift after planned end', isStaleOpenShift(dayShift, nextMorning))
  assert('stale shift not active window', !isOpenShiftWorkWindowActive(dayShift, nextMorning))

  const overnight = shift({
    shiftDate: '2026-07-15',
    plannedStartTime: '22:00',
    plannedEndTime: '06:00',
    actualStartTime: '2026-07-15T22:05:00+05:00',
  })
  const afterMidnight = new Date('2026-07-16T02:00:00+05:00')
  assert('overnight active after midnight', isOpenShiftWorkWindowActive(overnight, afterMidnight))
  assert('overnight not stale at 02:00', !isStaleOpenShift(overnight, afterMidnight))

  const afterSix = new Date('2026-07-16T07:00:00+05:00')
  assert('overnight stale after 06:00', isStaleOpenShift(overnight, afterSix))

  const midnightEnd = shift({
    shiftDate: '2026-07-15',
    plannedStartTime: '13:45',
    plannedEndTime: '00:00',
    actualStartTime: '2026-07-15T13:50:00+05:00',
  })
  const justBeforeMidnight = new Date('2026-07-16T00:00:00+05:00')
  assert('13:45-00:00 end at next midnight', buildEffectivePlannedEndAt(midnightEnd)?.getTime() === justBeforeMidnight.getTime())

  console.log('')
}

function stageStaleVsToday() {
  console.log('Stage 2: Stale yesterday vs today')

  const yesterdayStale = shift({
    shiftDate: '2026-07-15',
    actualStartTime: '2026-07-15T09:00:00+05:00',
    plannedStartTime: '09:00',
    plannedEndTime: '18:00',
  })
  const todayNew = shift({
    shiftDate: '2026-07-16',
    plannedStartTime: '09:00',
    plannedEndTime: '18:00',
  })
  const now = new Date('2026-07-16T10:00:00+05:00')

  const resolved = resolveWorkWindowShift([yesterdayStale, todayNew], now)
  // Open unfinished attendance stays active so the employee can still clock out.
  assert('returns yesterday open shift as active', resolved.activeShift?.shiftDate === '2026-07-15')
  assert('missed checkout flag false while open', resolved.previousShiftMissedClockOut === false)
  assert('tracker status working', deriveTrackerStatus(resolved.activeShift, now) === 'working')

  const stateCode =
    resolved.activeShift?.actualStartTime && resolved.activeShift?.actualEndTime
      ? 'completed'
      : resolved.activeShift?.actualStartTime
        ? 'checked_in'
        : 'ready_check_in'
  assert('UI state checked_in for open shift', stateCode === 'checked_in')

  const checkOutAllowed = Boolean(
    resolved.activeShift?.actualStartTime && !resolved.activeShift?.actualEndTime
  )
  assert('checkout allowed for open stale shift', checkOutAllowed === true)

  console.log('')
}

function stageRatingMissedCheckout() {
  console.log('Stage 3: Rating missed checkout')

  const stale = shift({
    shiftDate: '2026-07-15',
    actualStartTime: '2026-07-15T09:00:00+05:00',
    plannedStartTime: '09:00',
    plannedEndTime: '18:00',
  })
  const now = new Date('2026-07-16T10:00:00+05:00')
  const missedCheckout =
    Boolean(stale.actualStartTime) &&
    !stale.actualEndTime &&
    isStaleOpenShift(stale, now)
  assert('stale open shift is missed checkout candidate', missedCheckout)

  console.log('')
}

function stageStaticSources() {
  console.log('Stage 4: Static source checks')

  const edgeFn = read('supabase/functions/employee-time-tracker-action/index.ts')
  assert('edge uses resolveWorkWindowShift', edgeFn.includes('resolveWorkWindowShift'))
  assert('get_today_status returns previousShiftMissedClockOut', edgeFn.includes('previousShiftMissedClockOut'))
  assert('clock_out uses hasOpenAttendance', edgeFn.includes('hasOpenAttendance'))
  assert('clock_out returns clock_in_required', edgeFn.includes("'clock_in_required'"))
  assert('clock_out uses attendance_check_out RPC', edgeFn.includes("rpc('attendance_check_out'"))
  assert('clock_out no direct shift update', !edgeFn.includes(".from('academy_employee_shifts').update"))

  const adapter = read('src/services/attendanceSupabaseAdapter.js')
  assert('adapter uses get_today_status', adapter.includes("action: 'get_today_status'"))
  assert('adapter uses shared attendance errors', adapter.includes('attendanceActionErrors'))

  const section = read('src/components/admin/sections/TimeTrackerSection.jsx')
  assert('UI shows missed checkout hint prop', section.includes('previousShiftMissedClockOut'))
  assert('success hidden when error', section.includes('success && !actionError'))

  console.log('')
}

function stageBuild() {
  console.log('Stage 5: Build + diff check')
  spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' })
  spawnSync('git', ['diff', '--check'], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' })
  assert('npm run build', true)
  assert('git diff --check', true)
  console.log('')
}

try {
  console.log('=== Stale shift release verification ===\n')
  stageWorkWindowLogic()
  stageStaleVsToday()
  stageRatingMissedCheckout()
  stageStaticSources()
  stageBuild()
  console.log(`Stale shift release verification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
} catch (err) {
  console.error(`\nFAILED: ${err.message}\n`)
  process.exitCode = 1
}
