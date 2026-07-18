#!/usr/bin/env node
/**
 * Structural verification for Stage 5 — Home workforce summary workload.
 *
 * Usage:
 *   npm run verify:home-workforce-summary
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
  console.log('=== Home workforce summary verification (Stage 5) ===\n')

  const edge = read('supabase/functions/admin-team-workforce-data/index.ts')
  const fields = read('supabase/functions/_shared/workforceFields.ts')
  const cors = read('supabase/functions/_shared/cors.ts')
  const service = read('src/services/workforceAdminService.js')
  const owner = read('src/components/admin/OwnerDashboard.jsx')
  const coalesce = read('src/lib/requestCoalesce.js')
  const schedule = read('src/components/admin/sections/WorkScheduleSection.jsx')
  const profile = read('src/components/admin/sections/EmployeeProfileSection.jsx')

  console.log('Stage 1: Home summary view')
  assert('home-summary allowed view', edge.includes("'home-summary'"))
  assert('home-summary requires single day', edge.includes('rangeDays !== 1'))
  assert('home-summary rejects employee_id', /view === 'home-summary'[\s\S]*?forbidden_field/.test(edge))
  assert('HOME_SUMMARY_EMPLOYEE_SELECT lean', fields.includes('HOME_SUMMARY_EMPLOYEE_SELECT'))
  assert('HOME_SUMMARY_SHIFT_SELECT lean', fields.includes('HOME_SUMMARY_SHIFT_SELECT'))
  assert(
    'home uses nested shift→employee select or sequential lean selects',
    edge.includes('HOME_SUMMARY_SHIFT_WITH_EMPLOYEE_SELECT') ||
      (/view === 'home-summary'[\s\S]*?HOME_SUMMARY_SHIFT_SELECT[\s\S]*?HOME_SUMMARY_EMPLOYEE_SELECT/.test(
        edge
      ) &&
        edge.includes(".in('id', [...shiftIds])"))
  )
  assert(
    'home does not rely on full-staff second query when fused',
    edge.includes('HOME_SUMMARY_SHIFT_WITH_EMPLOYEE_SELECT')
      ? !edge.includes(".in('id', [...shiftIds])")
      : edge.includes(".in('id', [...shiftIds])")
  )

  console.log('Stage 2: Frontend Home wiring')
  assert('fetchHomeWorkforceSummary exported', service.includes('export async function fetchHomeWorkforceSummary'))
  assert('OwnerDashboard uses fetchHomeWorkforceSummary', owner.includes('fetchHomeWorkforceSummary'))
  assert('OwnerDashboard does not use view dashboard', !owner.includes("view: 'dashboard'"))
  assert('Home uses selectedDateKey day', owner.includes('fetchHomeWorkforceSummary(selectedDateKey)'))
  assert(
    'coalesce key includes view',
    service.includes('admin-team-workforce-data:${sessionUserId}:${dateFrom}:${dateTo}:${view}:')
  )
  assert('coalesce util present', coalesce.includes('export function coalesceInFlight'))
  assert('coalesce clears on settle', coalesce.includes('inFlight.delete(key)'))

  console.log('Stage 3: PII / field budgets')
  assert(
    'home employee select omits avatar_url',
    !/HOME_SUMMARY_EMPLOYEE_SELECT\s*=\s*'[^']*avatar_url/.test(fields)
  )
  assert(
    'home employee select omits role_id',
    !/HOME_SUMMARY_EMPLOYEE_SELECT\s*=\s*'[^']*role_id/.test(fields)
  )
  assert('home shift select omits comment', !/HOME_SUMMARY_SHIFT_SELECT\s*=\s*'[^']*comment/.test(fields))
  assert('no email in home selects', !fields.includes('email') || !/HOME_SUMMARY_[^=]*=\s*'[^']*email/.test(fields))
  assert('no login/phone in home selects', !/HOME_SUMMARY_[^=]*=\s*'[^']*(login|phone)/.test(fields))

  console.log('Stage 4: Formula / tracker / other contracts')
  assert('OwnerDashboard keeps buildDailyMetrics', owner.includes('function buildDailyMetrics'))
  assert('late grace still from settings', owner.includes('lateGraceMinutes'))
  assert('health formula preserved', owner.includes('problemEmployeeIds'))
  assert('Schedule still uses fetchTeamWorkforceData', schedule.includes('fetchTeamWorkforceData'))
  assert('Schedule uses view schedule', schedule.includes("view: 'schedule'"))
  assert('Profile still uses fetchEmployeeWorkforceBundle', profile.includes('fetchEmployeeWorkforceBundle'))

  console.log('Stage 5: Server-Timing + security')
  assert('buildServerTimingHeader exported', cors.includes('export function buildServerTimingHeader'))
  assert('Server-Timing exposed', cors.includes('Access-Control-Expose-Headers'))
  assert('home-summary emits Server-Timing', edge.includes('Server-Timing') || edge.includes('timingResponse'))
  assert('home-summary requires team permission', /case 'home-summary':[\s\S]*?hasTeam/.test(edge) || /case 'dashboard':\s*\n\s*case 'home-summary':/.test(edge))
  assert('MAX_RANGE_DAYS retained', edge.includes('MAX_RANGE_DAYS'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
