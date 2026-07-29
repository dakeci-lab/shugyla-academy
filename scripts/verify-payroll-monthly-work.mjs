#!/usr/bin/env node
/**
 * Verification: shared monthly work summary for payroll + employee profile.
 *
 * Usage:
 *   npm run verify:payroll-monthly-work
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

function pad2(value) {
  return String(value).padStart(2, '0')
}

function toDateKey(value) {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/)
    return match ? match[1] : null
  }
  return null
}

function monthBounds(year, month) {
  const start = `${year}-${pad2(month)}-01`
  const lastDay = new Date(year, month, 0).getDate()
  return { start, end: `${year}-${pad2(month)}-${pad2(lastDay)}` }
}

/** Inline mirror of summarizeEmployeeMonthlyWork (Node cannot load Vite ESM graph). */
function summarize(shifts, { year, month, employee = null } = {}) {
  const { start, end } = monthBounds(year, month)
  let planned = 0
  let worked = 0
  for (const shift of shifts || []) {
    const date = toDateKey(shift.shiftDate)
    if (!date || date < start || date > end) continue
    const terminatedAt = toDateKey(employee?.terminatedAt)
    if (terminatedAt && date > terminatedAt) continue
    if (shift.status !== 'working') continue
    planned += 1
    if (shift.actualStartTime && shift.actualEndTime) worked += 1
  }
  return { plannedShifts: planned, workedShifts: worked }
}

function workingShift(employeeId, date, { start = '09:00', end = '18:00' } = {}) {
  return {
    employeeId,
    shiftDate: date,
    status: 'working',
    actualStartTime: start,
    actualEndTime: end,
  }
}

function plannedOnly(employeeId, date) {
  return {
    employeeId,
    shiftDate: date,
    status: 'working',
    actualStartTime: null,
    actualEndTime: null,
  }
}

function runStaticChecks() {
  console.log('Stage 1: Static wiring')
  const summary = read('src/utils/employeeMonthlyWorkSummary.js')
  const payroll = read('src/utils/salaryPayroll.js')
  const period = read('src/utils/employeePeriodSummary.js')
  const section = read('src/components/admin/payroll/PayrollSection.jsx')
  const employeeData = read('src/utils/employeeData.js')
  const pkg = read('package.json')

  assert('shared aggregator module exists', summary.includes('summarizeEmployeeMonthlyWork'))
  assert('does not clip by hiredAt', summary.includes('Do NOT clip by hiredAt'))
  assert('filters to calendar month', summary.includes('filterShiftsToCalendarMonth'))
  assert('payroll uses shared batch builder', payroll.includes('buildMonthlyWorkSummaryByEmployee'))
  assert('payroll no longer clips by hiredAt compare', !payroll.includes('shiftDate < hiredAt'))
  assert('profile uses monthly aggregator', period.includes('summarizeEmployeeMonthlyWork'))
  assert(
    'payroll load passes year/month into stats',
    /buildPayrollShiftStatsByEmployee\(\s*monthShifts,\s*employeesById,\s*year,\s*month/.test(section),
  )
  assert(
    'hiredAt does not fall back to created_at',
    !employeeData.includes('raw.hiredAt ?? raw.hired_at ?? raw.createdAt'),
  )
  assert('EmployeePeriodSummary passes year/month', read('src/components/admin/employees/EmployeePeriodSummary.jsx').includes('summarizeEmployeePeriod(shifts, { year, month })'))
  assert('verify script registered', pkg.includes('verify:payroll-monthly-work'))
}

function runDomainTests() {
  console.log('\nStage 2: Domain scenarios (algorithm mirror)')

  const aisanaShifts = []
  for (let day = 1; day <= 31; day += 1) {
    const date = `2026-07-${pad2(day)}`
    if (day === 12) {
      aisanaShifts.push({
        employeeId: 101,
        shiftDate: date,
        status: 'day_off',
        actualStartTime: null,
        actualEndTime: null,
      })
      continue
    }
    if (day === 1) aisanaShifts.push(workingShift(101, '2026-08-01'))
    if (day >= 30) aisanaShifts.push(plannedOnly(101, date))
    else aisanaShifts.push(workingShift(101, date))
  }

  const aisana = summarize(aisanaShifts, {
    year: 2026,
    month: 7,
    employee: { hiredAt: '2026-07-10', terminatedAt: null },
  })
  assert('aisana planned = 30 (ignores hire clip + day off + Aug pad)', aisana.plannedShifts === 30)
  assert('aisana worked = 28', aisana.workedShifts === 28)

  // Regression: old hiredAt clip would yield 21 / 19
  const oldClip = (() => {
    const hiredAt = '2026-07-10'
    let planned = 0
    let worked = 0
    for (const shift of aisanaShifts) {
      const date = toDateKey(shift.shiftDate)
      if (!date || date < '2026-07-01' || date > '2026-07-31') continue
      if (date < hiredAt) continue
      if (shift.status !== 'working') continue
      planned += 1
      if (shift.actualStartTime && shift.actualEndTime) worked += 1
    }
    return { planned, worked }
  })()
  assert('old hire clip under-counted aisana plan', oldClip.planned === 21)
  assert('old hire clip under-counted aisana worked', oldClip.worked === 19)

  const mahabbatBuilt = []
  // 8 working days before hire + 13 calendar days Jul 19–31 = 21 planned if hire-clipped wrongly.
  for (const day of [1, 2, 3, 4, 7, 8, 9, 10]) {
    mahabbatBuilt.push(workingShift(202, `2026-07-${pad2(day)}`))
  }
  mahabbatBuilt.push(
    { employeeId: 202, shiftDate: '2026-07-05', status: 'day_off', actualStartTime: null, actualEndTime: null },
    { employeeId: 202, shiftDate: '2026-07-06', status: 'sick_leave', actualStartTime: null, actualEndTime: null },
  )
  for (let day = 19; day <= 31; day += 1) {
    const date = `2026-07-${pad2(day)}`
    // 3 incomplete at month end → worked 10 of 13 post-hire days
    if (day >= 29) mahabbatBuilt.push(plannedOnly(202, date))
    else mahabbatBuilt.push(workingShift(202, date))
  }
  const mahabbat = summarize(mahabbatBuilt, {
    year: 2026,
    month: 7,
    employee: { hiredAt: '2026-07-19' },
  })
  assert('mahabbat planned = 21', mahabbat.plannedShifts === 21)
  assert('mahabbat worked = 18', mahabbat.workedShifts === 18)

  const oldMahabbatClip = (() => {
    const hiredAt = '2026-07-19'
    let planned = 0
    let worked = 0
    for (const shift of mahabbatBuilt) {
      const date = toDateKey(shift.shiftDate)
      if (!date || date < hiredAt) continue
      if (shift.status !== 'working') continue
      planned += 1
      if (shift.actualStartTime && shift.actualEndTime) worked += 1
    }
    return { planned, worked }
  })()
  assert('old hire clip under-counted mahabbat plan', oldMahabbatClip.planned === 13)
  assert('old hire clip under-counted mahabbat worked', oldMahabbatClip.worked === 10)

  const night = summarize(
    [
      workingShift(1, '2026-07-15', { start: '13:00', end: '00:00' }),
      workingShift(1, '2026-07-16', { start: '13:00', end: '00:00' }),
    ],
    { year: 2026, month: 7 },
  )
  assert('night shifts count once by start date', night.plannedShifts === 2 && night.workedShifts === 2)

  const openShift = summarize(
    [{ employeeId: 1, shiftDate: '2026-07-20', status: 'working', actualStartTime: '09:00', actualEndTime: null }],
    { year: 2026, month: 7 },
  )
  assert('open shift in plan only', openShift.plannedShifts === 1 && openShift.workedShifts === 0)

  const terminated = summarize(
    [workingShift(1, '2026-07-20'), workingShift(1, '2026-07-25')],
    { year: 2026, month: 7, employee: { terminatedAt: '2026-07-22' } },
  )
  assert('post-termination excluded', terminated.plannedShifts === 1 && terminated.workedShifts === 1)

  const empty = summarize([], { year: 2026, month: 7 })
  assert('empty month zero', empty.plannedShifts === 0 && empty.workedShifts === 0)

  const futureMonth = summarize(
    [plannedOnly(1, '2026-09-01'), plannedOnly(1, '2026-09-02')],
    { year: 2026, month: 9 },
  )
  assert('future month plan without worked', futureMonth.plannedShifts === 2 && futureMonth.workedShifts === 0)
}

try {
  console.log('=== Payroll monthly work summary verification ===\n')
  runStaticChecks()
  runDomainTests()
  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
