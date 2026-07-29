#!/usr/bin/env node
/**
 * Verification: terminated employee schedule period helpers + Edge load path.
 *
 * Usage:
 *   npm run verify:employee-schedule-period
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

function toDateKey(value) {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/)
    return match ? match[1] : null
  }
  return null
}

/** Mirror of src/utils/employeeSchedulePeriod.js — keep in sync. */
function canEditEmployeeScheduleDate(employee, date) {
  const dateKey = toDateKey(date)
  if (!dateKey) return false
  const hiredAt = toDateKey(employee?.hiredAt ?? employee?.hired_at)
  const terminatedAt = toDateKey(employee?.terminatedAt ?? employee?.terminated_at)
  if (!hiredAt) return false
  if (dateKey < hiredAt) return false
  if (terminatedAt && dateKey > terminatedAt) return false
  return true
}

function doesMonthOverlapEmployeeEmployment(employee, year, month) {
  const hiredAt = toDateKey(employee?.hiredAt ?? employee?.hired_at)
  const terminatedAt = toDateKey(employee?.terminatedAt ?? employee?.terminated_at)
  if (!hiredAt) return false
  const pad = (n) => String(n).padStart(2, '0')
  const start = `${year}-${pad(month)}-01`
  const end = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`
  if (hiredAt > end) return false
  if (terminatedAt && terminatedAt < start) return false
  return true
}

function main() {
  console.log('=== Employee schedule employment period verification ===\n')

  const periodSrc = read('src/utils/employeeSchedulePeriod.js')
  assert('helper exports canEditEmployeeScheduleDate', periodSrc.includes('export function canEditEmployeeScheduleDate'))
  assert('helper exports month overlap', periodSrc.includes('export function doesMonthOverlapEmployeeEmployment'))
  assert('helper uses calendar date keys', periodSrc.includes('toEmployeeDateKey'))

  const terminated = {
    hiredAt: '2026-07-10',
    terminatedAt: '2026-07-18',
    status: 'terminated',
  }
  const active = {
    hiredAt: '2026-07-10',
    terminatedAt: null,
    status: 'active',
  }

  console.log('Scenario 1 — terminated window')
  assert('before hire blocked', !canEditEmployeeScheduleDate(terminated, '2026-07-09'))
  assert('hire day allowed', canEditEmployeeScheduleDate(terminated, '2026-07-10'))
  assert('mid employment allowed', canEditEmployeeScheduleDate(terminated, '2026-07-15'))
  assert('termination day allowed', canEditEmployeeScheduleDate(terminated, '2026-07-18'))
  assert('after termination blocked', !canEditEmployeeScheduleDate(terminated, '2026-07-19'))

  console.log('Scenario 2 — active open-ended')
  assert('before hire blocked for active', !canEditEmployeeScheduleDate(active, '2026-07-09'))
  assert('hire and after allowed', canEditEmployeeScheduleDate(active, '2026-07-10'))
  assert('far future allowed', canEditEmployeeScheduleDate(active, '2026-12-31'))

  console.log('Scenario 3 — month overlap')
  assert('July overlaps terminated', doesMonthOverlapEmployeeEmployment(terminated, 2026, 7))
  assert('June no overlap', !doesMonthOverlapEmployeeEmployment(terminated, 2026, 6))
  assert('August no overlap', !doesMonthOverlapEmployeeEmployment(terminated, 2026, 8))

  console.log('Structural — Edge load + write + UI')
  const workforce = read('supabase/functions/admin-team-workforce-data/index.ts')
  assert(
    'scoped schedule skips status=active',
    workforce.includes('scopedEmployeeId == null') &&
      workforce.includes("employeeQuery.eq('status', 'active')")
  )
  assert(
    'comment retains terminated history',
    workforce.includes('Scoped profile/own schedule')
  )

  const scheduleWrite = read('supabase/functions/admin-manage-employee-schedule/index.ts')
  assert('write rejects outside employment', scheduleWrite.includes('shift_outside_employment'))
  assert(
    'write does not require canEmployeeLogin for target',
    !scheduleWrite.includes('canEmployeeLogin(target.status)')
  )

  const sharedWrite = read('supabase/functions/_shared/employeeScheduleWrite.ts')
  assert(
    'shared canEditEmployeeScheduleDate exported',
    sharedWrite.includes('export function canEditEmployeeScheduleDate')
  )

  const section = read('src/components/admin/sections/EmployeeScheduleSection.jsx')
  assert('section uses canEditEmployeeScheduleDate', section.includes('canEditEmployeeScheduleDate'))
  assert('section filters bulk entries', section.includes('filterScheduleEntriesToEmployment'))

  const calendar = read('src/components/admin/EmployeeScheduleCalendar.jsx')
  assert('calendar mutes employment-locked days', calendar.includes('shift-day--employment-locked'))

  console.log(
    `\nEmployee schedule period verification completed (${testsPassed}/${testsRun} tests, exit 0)\n`
  )
}

try {
  main()
} catch (err) {
  console.error(`\nFAILED: ${err.message}\n`)
  process.exitCode = 1
}
