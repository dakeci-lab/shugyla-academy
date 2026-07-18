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
  assert('month bar', list.includes('PlatformPeriodHeader'))
  assert('filter popover', list.includes('PayrollFilterPopover'))
  assert(
    'unified search toolbar',
    list.includes('PlatformSearchToolbar') && list.includes('Поиск по ФИО'),
  )
  assert('comment modal', list.includes('PayrollCommentModal'))
  assert(
    'ledger table columns',
    list.includes('payroll-table') &&
      list.includes('Оклад') &&
      list.includes('Начисления') &&
      list.includes('Удержания') &&
      list.includes('К выдаче') &&
      list.includes('Аванс') &&
      list.includes('Остаток') &&
      list.includes('Выплачено'),
  )
  assert('no status column in list', !list.includes('Статус расчёта'))
  assert('role under name', list.includes('payroll-table__role'))
  assert('totals row', list.includes('payroll-table__totals') && list.includes('payroll-summary'))
  assert('comment icon only', list.includes('PayrollCommentModal') && list.includes('CommentIcon'))
  assert('inline salary editing', list.includes('PayrollInlineMoneyCell'))
  assert('lines popup', list.includes('PayrollLinesModal'))
  assert('no open card button', !list.includes("Открыть'") && !list.includes('getPayrollRecordPath') && !list.includes('navigate(getPayroll'))
  assert('advance upsert service', service.includes('upsertSalaryAdvance'))

  const recordPage = read('src/pages/platform/PlatformPayrollRecord.jsx')
  assert('record page redirects to ledger', recordPage.includes('Navigate') && recordPage.includes('getPayrollListPath'))

  assert('no time-tracker import in payroll', !list.includes('timeTracker'))
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
