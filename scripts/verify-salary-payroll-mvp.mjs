#!/usr/bin/env node
/**
 * Verification: salary payroll MVP foundation.
 *
 * Usage:
 *   npm run verify:salary-payroll-mvp
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
  console.log('=== Salary payroll MVP verification ===\n')

  const migration = read('supabase/migrations/20260718250000_salary_payroll_foundation.sql')
  const utils = read('src/utils/salaryPayroll.js')
  const service = read('src/services/salaryPayrollService.js')
  const list = read('src/components/admin/payroll/PayrollSection.jsx')
  const detail = read('src/components/admin/payroll/PayrollRecordSection.jsx')
  const app = read('src/App.jsx')
  const pkg = read('package.json')

  console.log('Stage 1: Schema')
  assert('salary_periods table', migration.includes('create table if not exists public.salary_periods'))
  assert('salary_records table', migration.includes('create table if not exists public.salary_records'))
  assert('salary_allowances table', migration.includes('create table if not exists public.salary_allowances'))
  assert('salary_deductions table', migration.includes('create table if not exists public.salary_deductions'))
  assert('payroll.view RLS', migration.includes("payroll.view"))
  assert('payroll.calculate RLS', migration.includes("payroll.calculate"))

  console.log('\nStage 2: Domain / service')
  assert('status catalog', utils.includes('draft') && utils.includes('paid'))
  assert('compute totals', utils.includes('computeSalaryTotals'))
  assert('ensure period', service.includes('ensureSalaryPeriod'))
  assert('ensure record', service.includes('ensureSalaryRecord'))
  assert('recalculate persist', service.includes('recalculateAndPersistTotals') || service.includes('total_payable'))

  console.log('\nStage 3: UI / routes')
  assert('list page wired', app.includes('PlatformPayroll') && app.includes('employees/payroll'))
  assert('detail route', app.includes('employees/payroll/records/:recordId'))
  assert('month bar', list.includes('SchedulePeriodBar'))
  assert('filter popover', list.includes('PayrollFilterPopover'))
  assert('search without label toolbar', list.includes('Поиск по ФИО') && !list.includes('EmployeeSearchToolbar'))
  assert('comment modal', list.includes('PayrollCommentModal'))
  assert('table list', list.includes('payroll-table') && list.includes('Комментарий'))
  assert('manual blocks', detail.includes('Основной оклад') && detail.includes('Начисления') && detail.includes('Удержания'))
  assert('no time-tracker import in payroll', !list.includes('timeTracker') && !detail.includes('timeTracker'))
  assert('verify script registered', pkg.includes('verify:salary-payroll-mvp'))
  assert(
    'employee pageSize within edge limit',
    list.includes('EMPLOYEE_PAGE_SIZE = 100') && !list.includes('pageSize: 200')
  )
  assert('list built from employees not only records', list.includes('listAllActiveEmployeesForPayroll'))

  const sidebar = read('src/components/platform/PlatformSidebar.jsx')
  assert('payroll hidden on mobile nav', sidebar.includes('hideDesktopOnlyNavItems') && sidebar.includes('employees-payroll'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
