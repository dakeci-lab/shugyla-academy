#!/usr/bin/env node
/**
 * Stage B: clear future plan shifts on employee termination (no Docker).
 *
 * Usage:
 *   npm run verify:employee-schedule-terminate-clear
 */

import fs from 'node:fs'
import path from 'node:path'
import { register } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

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

function rowHasAttendance(row) {
  if (!row) return false
  if (row.actual_start_time || row.actual_end_time) return true
  if (row.check_in_latitude != null || row.check_out_latitude != null) return true
  return false
}

/** Mirror of clearPlanShiftsAfterTerminationDate / local clearEmployeeShiftsAfterTermination */
function clearAfterTermination(rows, employeeId, terminatedAt) {
  let deleted = 0
  let retainedWithAttendance = 0
  const next = []
  for (const row of rows) {
    if (Number(row.employee_id) !== Number(employeeId)) {
      next.push(row)
      continue
    }
    if (String(row.shift_date) <= terminatedAt) {
      next.push(row)
      continue
    }
    if (rowHasAttendance(row)) {
      retainedWithAttendance += 1
      next.push(row)
      continue
    }
    deleted += 1
  }
  return { next, deleted, retainedWithAttendance }
}

function stageLogic() {
  console.log('Stage 1: termination clear semantics')
  const term = '2026-08-15'
  const rows = [
    { id: '1', employee_id: 9, shift_date: '2026-08-14', status: 'working' },
    { id: '2', employee_id: 9, shift_date: '2026-08-15', status: 'working' },
    { id: '3', employee_id: 9, shift_date: '2026-08-16', status: 'working' },
    {
      id: '4',
      employee_id: 9,
      shift_date: '2026-08-17',
      status: 'working',
      actual_start_time: '2026-08-17T04:00:00.000Z',
    },
    { id: '5', employee_id: 9, shift_date: '2026-08-18', status: 'day_off' },
    { id: '6', employee_id: 8, shift_date: '2026-08-20', status: 'working' },
  ]

  const first = clearAfterTermination(rows, 9, term)
  assert('deletes working after terminated_at without fact', first.deleted === 2)
  assert(
    'retains day with attendance after terminated_at',
    first.retainedWithAttendance === 1 &&
      first.next.some((row) => row.id === '4')
  )
  assert(
    'keeps days on/before terminated_at',
    first.next.some((row) => row.id === '1') && first.next.some((row) => row.id === '2')
  )
  assert(
    'does not touch other employees',
    first.next.some((row) => row.id === '6')
  )
  assert(
    'day_off after termination without fact is cleared',
    !first.next.some((row) => row.id === '5')
  )

  const second = clearAfterTermination(first.next, 9, term)
  assert('idempotent second clear deletes nothing', second.deleted === 0)
  assert(
    'attendance row still retained after second clear',
    second.next.some((row) => row.id === '4')
  )
  console.log('')
}

async function stageLocalAdapter() {
  console.log('Stage 2: local adapter export')
  const local = await import(
    pathToFileURL(path.join(ROOT, 'src/services/shiftLocalAdapter.js')).href
  )
  assert(
    'clearEmployeeShiftsAfterTermination exported',
    typeof local.clearEmployeeShiftsAfterTermination === 'function'
  )
  console.log('')
}

function stageStatic() {
  console.log('Stage 3: static contracts')
  const shared = read('supabase/functions/_shared/employeeScheduleWrite.ts')
  const updateFn = read('supabase/functions/admin-update-employee/index.ts')
  const platform = read('src/services/platformDataService.js')
  const local = read('src/services/shiftLocalAdapter.js')
  const employees = read('src/components/admin/sections/EmployeesSection.jsx')
  const profile = read('src/components/admin/sections/EmployeeProfileSection.jsx')
  const schedule = read('src/components/admin/sections/EmployeeScheduleSection.jsx')
  const pkg = read('package.json')
  const plan = read('docs/hr/plan-clear-shifts-on-termination.md')

  assert(
    'shared clearPlanShiftsAfterTerminationDate',
    shared.includes('export async function clearPlanShiftsAfterTerminationDate')
  )
  assert(
    'shared clearPlanShiftsFromDate uses attendance guard',
    shared.includes('export async function clearPlanShiftsFromDate') &&
      /clearPlanShiftsFromDate[\s\S]*hasShiftAttendanceHistory/.test(shared)
  )
  assert(
    'termination clear delegates to from-date helper',
    /clearPlanShiftsAfterTerminationDate[\s\S]*clearPlanShiftsFromDate/.test(shared)
  )
  assert(
    'admin-update-employee calls clear helper',
    updateFn.includes('clearPlanShiftsAfterTerminationDate')
  )
  assert(
    'admin-update-employee gates on terminated status',
    updateFn.includes('isTerminatedEmploymentStatus')
  )
  assert(
    'platform deactivate clears local shifts',
    platform.includes('clearEmployeeShiftsAfterTermination') &&
      platform.includes('deactivateEmployee')
  )
  assert(
    'local adapter clear function',
    local.includes('export async function clearEmployeeShiftsAfterTermination')
  )
  assert(
    'deactivate confirm mentions future shifts',
    employees.includes('Будущие смены без отметок') &&
      profile.includes('Будущие смены без отметок')
  )
  assert(
    'restore confirm warns shifts not restored',
    employees.includes('не восстановятся') && profile.includes('не восстановятся')
  )
  assert(
    'schedule reloads after termination fields change',
    schedule.includes('sharedEmployee?.terminatedAt')
  )
  assert('verify B registered', pkg.includes('verify:employee-schedule-terminate-clear'))
  assert('plan B doc exists', plan.includes('Этап B'))
  assert(
    'stage A delete path still present',
    read('supabase/functions/admin-manage-employee-schedule/index.ts').includes(
      "'delete_shift'"
    )
  )
  console.log('')
}

async function main() {
  try {
    console.log('=== Employee schedule terminate clear (stage B) ===\n')
    stageLogic()
    await stageLocalAdapter()
    stageStatic()
    console.log(`Passed ${testsPassed}/${testsRun}\n`)
  } catch (err) {
    console.error(`\nFAILED: ${err.message}\n`)
    process.exitCode = 1
  }
}

main()
