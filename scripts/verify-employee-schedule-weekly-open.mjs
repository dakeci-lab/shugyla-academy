#!/usr/bin/env node
/**
 * Verify weekly schedule → employee editor click flow.
 *
 * Usage:
 *   npm run verify:employee-schedule-weekly-open
 */

import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function main() {
  console.log('Employee schedule weekly open verification\n')

  const schedule = read('src/components/admin/sections/WorkScheduleSection.jsx')
  const editor = read('src/components/admin/sections/EmployeeScheduleSection.jsx')
  const page = read('src/pages/platform/PlatformEmployeeSchedule.jsx')
  const mobile = read('src/components/admin/TeamScheduleMobileCard.jsx')
  const workforce = read('src/services/workforceAdminService.js')
  const permissions = read('src/config/permissions.js')

  console.log('Stage 1: Weekly table click flow')
  assert('openEmployeeSchedule navigates to employee schedule route', schedule.includes('/platform/employees/${employeeId}/schedule'))
  assert('week query preserved in navigation', schedule.includes('?week='))
  assert('click uses employee id from row', schedule.includes('openEmployeeSchedule(emp.id)'))
  assert('edit permission gates open action', schedule.includes('canEditEmployeeSchedule'))
  assert('view-only users see plain name', schedule.includes('canEditSchedule ? ('))
  assert('desktop aria-label for employee edit', schedule.includes('Редактировать график сотрудника'))
  assert('week restored from URL on return', schedule.includes("searchParams.get('week')"))
  console.log('')

  console.log('Stage 2: Employee editor contract')
  assert('editor uses workforce bundle in cloud mode', editor.includes('fetchEmployeeWorkforceBundle'))
  assert('editor does not rely on sync getEmployeeById in cloud path', !editor.match(/const employee = getEmployeeById/))
  assert('local mode still uses getEmployeeById', editor.includes('getEmployeeById(Number(employeeId))'))
  assert('weekStartKey initializes month', editor.includes('getInitialMonth(weekStartKey)'))
  assert('back navigation preserves week', editor.includes('/platform/employees/schedule?week='))
  assert('not found only after load', editor.includes('employeeMissing'))
  assert('existing calendar editor reused', editor.includes('EmployeeScheduleCalendar'))
  assert('existing day modal reused', editor.includes('ShiftDayEditModal'))
  assert('existing bulk modal reused', editor.includes('BulkScheduleModal'))
  console.log('')

  console.log('Stage 3: ID contract')
  assert('workforce normalizes academy user id', workforce.includes('normalizeWorkforceEmployeeId'))
  assert('bundle matches Number(row.id)', workforce.includes('Number(row.id) === normalizedId'))
  assert('shifts filtered by employeeId', workforce.includes('Number(row.employeeId) === normalizedId'))
  assert('no auth_user_id in schedule navigation', !schedule.includes('auth_user_id'))
  assert('no name-based employee lookup in editor', !editor.match(/find\([^)]*name/i))
  console.log('')

  console.log('Stage 4: Permissions and accessibility')
  assert('schedule.edit permission defined', permissions.includes('SCHEDULE_EDIT'))
  assert('canEditEmployeeSchedule helper exists', permissions.includes('canEditEmployeeSchedule'))
  assert('mobile keyboard open supported', mobile.includes("event.key === 'Enter'"))
  assert('mobile aria-label present', mobile.includes('Редактировать график сотрудника'))
  assert('mobile name click stops card toggle propagation', mobile.includes('event.stopPropagation()'))
  assert('route passes weekStartKey prop', page.includes('weekStartKey={weekStartKey}'))
  console.log('')

  console.log('Stage 5: Scope guard')
  assert('verifier script registered', read('package.json').includes('verify:employee-schedule-weekly-open'))
  const diff = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  const changed = `${diff.stdout}\n${spawnSync('git', ['diff', '--name-only', '--cached'], { cwd: ROOT, encoding: 'utf8' }).stdout}`
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const forbidden = changed.filter((file) =>
    /webPush|vapid|notification|send-test-web-push|dispatch-time-tracker-notifications/i.test(file)
  )
  assert('notification/VAPID files not in diff', forbidden.length === 0, forbidden.join(', '))
  console.log('')

  console.log(`Employee schedule weekly open verification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (err) {
  console.error(`FAILED: ${err.message}`)
  process.exit(1)
}
