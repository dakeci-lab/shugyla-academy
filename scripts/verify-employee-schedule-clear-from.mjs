#!/usr/bin/env node
/**
 * Stage C: clear schedule from date (inclusive), including past terminated_at.
 *
 * Usage:
 *   npm run verify:employee-schedule-clear-from
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

function clearFromDate(rows, employeeId, fromDate, { inclusive = true } = {}) {
  let deleted = 0
  let retainedWithAttendance = 0
  const next = []
  for (const row of rows) {
    if (Number(row.employee_id) !== Number(employeeId)) {
      next.push(row)
      continue
    }
    const dateKey = String(row.shift_date)
    const beforeFrom = inclusive ? dateKey < fromDate : dateKey <= fromDate
    if (beforeFrom) {
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
  console.log('Stage 1: clear-from semantics')
  const from = '2026-08-16'
  const rows = [
    { id: 'a', employee_id: 3, shift_date: '2026-08-15', status: 'working' },
    { id: 'b', employee_id: 3, shift_date: '2026-08-16', status: 'working' },
    { id: 'c', employee_id: 3, shift_date: '2026-08-17', status: 'day_off' },
    {
      id: 'd',
      employee_id: 3,
      shift_date: '2026-08-18',
      status: 'working',
      actual_start_time: '2026-08-18T04:00:00.000Z',
    },
    { id: 'e', employee_id: 3, shift_date: '2026-08-20', status: 'working' },
  ]

  const result = clearFromDate(rows, 3, from, { inclusive: true })
  assert('deletes inclusive fromDate without fact', result.deleted === 3)
  assert(
    'keeps days before fromDate',
    result.next.some((row) => row.id === 'a') && !result.next.some((row) => row.id === 'b')
  )
  assert(
    'keeps attendance days on/after fromDate',
    result.retainedWithAttendance === 1 && result.next.some((row) => row.id === 'd')
  )

  // Terminated repair: from day after termination still clears > terminated_at
  const terminatedAt = '2026-08-10'
  const tail = [
    { id: 't1', employee_id: 3, shift_date: '2026-08-10', status: 'working' },
    { id: 't2', employee_id: 3, shift_date: '2026-08-11', status: 'working' },
    { id: 't3', employee_id: 3, shift_date: '2026-08-12', status: 'working' },
  ]
  const repair = clearFromDate(tail, 3, '2026-08-11', { inclusive: true })
  assert(
    'terminated repair clears days after terminated_at',
    repair.deleted === 2 && repair.next.some((row) => row.id === 't1')
  )
  assert(
    'exclusive mode matches termination clear',
    clearFromDate(tail, 3, terminatedAt, { inclusive: false }).deleted === 2
  )
  console.log('')
}

async function stageLocal() {
  console.log('Stage 2: local adapter')
  const local = await import(
    pathToFileURL(path.join(ROOT, 'src/services/shiftLocalAdapter.js')).href
  )
  assert(
    'clearEmployeeShiftsFromDate exported',
    typeof local.clearEmployeeShiftsFromDate === 'function'
  )
  assert(
    'termination clear still exported',
    typeof local.clearEmployeeShiftsAfterTermination === 'function'
  )
  console.log('')
}

function stageStatic() {
  console.log('Stage 3: static contracts')
  const shared = read('supabase/functions/_shared/employeeScheduleWrite.ts')
  const edge = read('supabase/functions/admin-manage-employee-schedule/index.ts')
  const cloud = read('src/services/shiftSupabaseAdapter.js')
  const platform = read('src/services/platformDataService.js')
  const section = read('src/components/admin/sections/EmployeeScheduleSection.jsx')
  const modal = read('src/components/admin/ClearScheduleFromDateModal.jsx')
  const pkg = read('package.json')
  const plan = read('docs/hr/plan-clear-shifts-from-date.md')

  assert('shared clearPlanShiftsFromDate', shared.includes('clearPlanShiftsFromDate'))
  const clearBlock = edge.match(
    /if \(action === 'clear_shifts_from'\) \{[\s\S]*?\n  \}/
  )
  assert("Edge action clear_shifts_from", edge.includes("'clear_shifts_from'"))
  assert(
    'Edge clear uses shared helper and skips employment gate',
    Boolean(clearBlock) &&
      clearBlock[0].includes('clearPlanShiftsFromDate') &&
      !clearBlock[0].includes('canEditEmployeeScheduleDate')
  )
  assert('cloud clear_shifts_from', cloud.includes("'clear_shifts_from'"))
  assert('platform clearEmployeeShiftsFromDate', platform.includes('clearEmployeeShiftsFromDate'))
  assert(
    'UI button label',
    section.includes('Очистить график с даты…') && section.includes('ClearScheduleFromDateModal')
  )
  assert('modal inclusive copy', modal.includes('включительно'))
  assert('modal confirm mentions attendance', modal.includes('без отметок прихода/ухода'))
  assert('verify C registered', pkg.includes('verify:employee-schedule-clear-from'))
  assert('plan C doc', plan.includes('Этап C'))
  assert("stage A delete still present", edge.includes("'delete_shift'"))
  console.log('')
}

async function main() {
  try {
    console.log('=== Employee schedule clear-from (stage C) ===\n')
    stageLogic()
    await stageLocal()
    stageStatic()
    console.log(`Passed ${testsPassed}/${testsRun}\n`)
  } catch (err) {
    console.error(`\nFAILED: ${err.message}\n`)
    process.exitCode = 1
  }
}

main()
