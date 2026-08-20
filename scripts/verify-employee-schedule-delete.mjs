#!/usr/bin/env node
/**
 * Stage A: delete shift day → «Нет смены» (no Docker).
 *
 * Usage:
 *   npm run verify:employee-schedule-delete
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

/** Mirror of Edge assertShiftDeleteAllowed / hasShiftAttendanceHistory (snake_case rows). */
function rowHasAttendance(row) {
  if (!row) return false
  if (row.actual_start_time || row.actual_end_time) return true
  if (row.check_in_latitude != null || row.check_out_latitude != null) return true
  return false
}

function assertShiftDeleteAllowed(existing) {
  if (!existing) return null
  if (rowHasAttendance(existing)) return 'shift_has_attendance_history'
  return null
}

async function stageGuards() {
  console.log('Stage 1: attendance + delete guards')
  const { hasShiftAttendanceHistory } = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/shiftAttendanceGuard.js')).href
  )
  const { removeShiftFromList } = await import(
    pathToFileURL(path.join(ROOT, 'src/hooks/useScheduleBackgroundSync.js')).href
  )
  const { isShiftDayClearValue, SHIFT_DAY_CLEAR } = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/shiftData.js')).href
  )

  assert(
    'plan-only shift has no attendance',
    hasShiftAttendanceHistory({
      status: 'working',
      plannedStartTime: '09:00',
      plannedEndTime: '19:00',
    }) === false
  )
  assert(
    'actual start blocks attendance-free',
    hasShiftAttendanceHistory({ actualStartTime: '2026-08-20T04:00:00.000Z' }) === true
  )
  assert(
    'delete allowed without attendance',
    assertShiftDeleteAllowed({
      shift_date: '2026-08-21',
      status: 'working',
      actual_start_time: null,
      actual_end_time: null,
    }) === null
  )
  assert(
    'delete rejected with actual_start_time',
    assertShiftDeleteAllowed({
      shift_date: '2026-08-21',
      status: 'working',
      actual_start_time: '2026-08-21T04:00:00.000Z',
    }) === 'shift_has_attendance_history'
  )
  assert(
    'delete rejected with check-in geo',
    assertShiftDeleteAllowed({
      shift_date: '2026-08-21',
      check_in_latitude: 50.2,
    }) === 'shift_has_attendance_history'
  )
  assert(
    'idempotent delete when row missing',
    assertShiftDeleteAllowed(null) === null
  )

  const list = [
    { shiftDate: '2026-08-20', status: 'working' },
    { shiftDate: '2026-08-21', status: 'working' },
  ]
  const next = removeShiftFromList(list, '2026-08-21')
  assert(
    'removeShiftFromList drops the day',
    next.length === 1 && next[0].shiftDate === '2026-08-20'
  )
  assert('SHIFT_DAY_CLEAR is UI sentinel', isShiftDayClearValue(SHIFT_DAY_CLEAR) === true)
  assert('working is not clear sentinel', isShiftDayClearValue('working') === false)

  // In-memory mirror of local adapter delete semantics (no browser localStorage).
  const store = [
    {
      employee_id: 7,
      shift_date: '2026-08-22',
      status: 'working',
      actual_start_time: null,
      actual_end_time: null,
    },
    {
      employee_id: 7,
      shift_date: '2026-08-23',
      status: 'working',
      actual_start_time: '2026-08-23T04:00:00.000Z',
      actual_end_time: null,
    },
  ]
  function deleteFromStore(employeeId, shiftDate) {
    const idx = store.findIndex(
      (row) => Number(row.employee_id) === Number(employeeId) && row.shift_date === shiftDate
    )
    if (idx < 0) return { deleted: false }
    if (rowHasAttendance(store[idx])) {
      throw new Error('shift_has_attendance_history')
    }
    store.splice(idx, 1)
    return { deleted: true }
  }
  assert('delete without fact removes row', deleteFromStore(7, '2026-08-22').deleted === true)
  assert(
    'row gone after delete',
    !store.some((row) => row.shift_date === '2026-08-22')
  )
  let blocked = false
  try {
    deleteFromStore(7, '2026-08-23')
  } catch (err) {
    blocked = err.message === 'shift_has_attendance_history'
  }
  assert('delete with fact is rejected', blocked === true)
  assert(
    'fact row still present after rejected delete',
    store.some((row) => row.shift_date === '2026-08-23')
  )
  console.log('')
}

function stageStatic() {
  console.log('Stage 2: static contracts')
  const edge = read('supabase/functions/admin-manage-employee-schedule/index.ts')
  const shared = read('supabase/functions/_shared/employeeScheduleWrite.ts')
  const cloud = read('src/services/shiftSupabaseAdapter.js')
  const local = read('src/services/shiftLocalAdapter.js')
  const platform = read('src/services/platformDataService.js')
  const modal = read('src/components/admin/ShiftDayEditModal.jsx')
  const section = read('src/components/admin/sections/EmployeeScheduleSection.jsx')
  const sync = read('src/hooks/useScheduleBackgroundSync.js')
  const shiftData = read('src/utils/shiftData.js')
  const pkg = read('package.json')

  assert('Edge allows delete_shift', edge.includes("'delete_shift'"))
  assert('Edge delete path present', edge.includes("action === 'delete_shift'"))
  assert('Edge uses assertShiftDeleteAllowed', edge.includes('assertShiftDeleteAllowed'))
  assert('Edge deletes from academy_employee_shifts', edge.includes(".delete()") && edge.includes("academy_employee_shifts"))
  assert('shared exports assertShiftDeleteAllowed', shared.includes('export function assertShiftDeleteAllowed'))
  assert('cloud adapter delete_shift', cloud.includes("'delete_shift'") && cloud.includes('deleteEmployeeShift'))
  assert('local adapter deleteEmployeeShift', local.includes('export async function deleteEmployeeShift'))
  assert('local blocks attendance on delete', local.includes('rowHasAttendanceHistory'))
  assert('platform deleteEmployeeShiftDay', platform.includes('deleteEmployeeShiftDay'))
  assert('sync enqueueClear', sync.includes('enqueueClear') && sync.includes('deleteEmployeeShiftDay'))
  assert('SHIFT_DAY_CLEAR sentinel', shiftData.includes("SHIFT_DAY_CLEAR = 'no_shift'"))
  assert('modal has Нет смены option', modal.includes('SHIFT_DAY_CLEAR_OPTION') && modal.includes('Нет смены'))
  assert('modal calls onClear', modal.includes('onClear'))
  assert('modal hides clear when attendance', modal.includes('hasShiftAttendanceHistory') && modal.includes('canClearToEmpty'))
  assert('section wires onClear', section.includes('onClear={handleClearShift}') && section.includes('enqueueClear'))
  assert('verify script registered', pkg.includes('verify:employee-schedule-delete'))
  assert('no DB none status in SHIFT_STATUS', !shiftData.includes("NONE: 'none'") && !shiftData.includes("NO_SHIFT:"))
  console.log('')
}

async function main() {
  try {
    console.log('=== Employee schedule delete (stage A) ===\n')
    await stageGuards()
    stageStatic()
    console.log(`Passed ${testsPassed}/${testsRun}\n`)
  } catch (err) {
    console.error(`\nFAILED: ${err.message}\n`)
    process.exitCode = 1
  }
}

main()
