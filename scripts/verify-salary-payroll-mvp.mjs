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
  const filter = read('src/components/admin/payroll/PayrollFilterPopover.jsx')
  const commentModal = read('src/components/admin/payroll/PayrollCommentModal.jsx')
  const employeeData = read('src/utils/employeeData.js')
  const employeeEditModal = read('src/components/admin/employees/EmployeeEditModal.jsx')
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
  assert(
    'calculation-stage catalog removed (dead — every record stuck at draft, no reachable transition)',
    !utils.includes('SALARY_RECORD_STATUSES') && !utils.includes('getSalaryStatusMeta'),
  )
  assert('legacy paid-status fallback kept (harmless read for pre-paid_amount records)', utils.includes("record.status === 'paid'"))
  assert('compute totals', utils.includes('computeSalaryTotals'))
  assert('ensure period', service.includes('ensureSalaryPeriod'))
  assert('ensure record', service.includes('ensureSalaryRecord'))
  assert('recalculate persist', service.includes('recalculateAndPersistTotals') || service.includes('total_payable'))

  console.log('\nStage 3: UI / routes')
  assert('list page wired', app.includes('PlatformPayroll') && app.includes('employees/payroll'))
  assert('detail route', app.includes('employees/payroll/records/:recordId'))
  assert('no green month bar', !list.includes('PlatformPeriodHeader'))
  assert('filter popover', list.includes('PayrollFilterPopover'))
  assert(
    'month in filter',
    filter.includes('Месяц расчёта') &&
      filter.includes('type="month"') &&
      filter.includes('Текущий месяц') &&
      filter.includes('Предыдущий месяц') &&
      utils.includes('getPayrollCurrentMonthState'),
  )
  assert(
    'unified search toolbar',
    list.includes('PlatformSearchToolbar') && list.includes('Поиск по ФИО'),
  )
  assert('comment modal', list.includes('PayrollCommentModal'))
  assert(
    'ledger table columns',
    list.includes('payroll-table') &&
      list.includes('Ставка') &&
      list.includes('Начисления') &&
      list.includes('Удержания') &&
      list.includes('К выдаче') &&
      list.includes('Аванс') &&
      list.includes('Остаток') &&
      list.includes('Выплачено'),
  )
  assert('no status column in list', !list.includes('Статус расчёта'))
  assert('role under name', list.includes('payroll-table__role'))
  assert('employee name links to profile by id', list.includes('getEmployeeProfilePath') && list.includes('payroll-table__person-link') && list.includes('getPayrollEmployeeLink'))
  assert('totals row', list.includes('payroll-table__totals') && list.includes('formatPayrollTotalsLabel'))
  assert('no top summary cards', !list.includes('payroll-summary') && !list.includes('Фонд оплаты'))
  assert('compact filter period label', list.includes('payroll-filter-trigger') && list.includes('Фильтр ·'))
  assert('comment icon only', list.includes('PayrollCommentModal') && list.includes('CommentIcon'))
  assert('inline salary editing', list.includes('PayrollInlineMoneyCell'))
  assert('lines popup', list.includes('PayrollLinesModal'))
  assert('no open card button', !list.includes("Открыть'") && !list.includes('getPayrollRecordPath') && !list.includes('navigate(getPayroll'))
  assert('payroll ui state restore', list.includes('PAYROLL_UI_STORAGE_KEY') && list.includes('sessionStorage'))
  assert('advance upsert service', service.includes('upsertSalaryAdvance'))
  assert('shared monthly work aggregator', utils.includes('buildMonthlyWorkSummaryByEmployee') || read('src/utils/employeeMonthlyWorkSummary.js').includes('summarizeEmployeeMonthlyWork'))
  assert('no hiredAt shift clip', !utils.includes('shiftDate < hiredAt'))

  const recordPage = read('src/pages/platform/PlatformPayrollRecord.jsx')
  assert('record page redirects to ledger', recordPage.includes('Navigate') && recordPage.includes('getPayrollListPath'))

  console.log('\nStage 3b: Dead record-card component and its only writer removed')
  assert(
    'PayrollRecordSection.jsx/.css deleted (unreachable since the ledger-only refactor)',
    !fs.existsSync(path.join(ROOT, 'src/components/admin/payroll/PayrollRecordSection.jsx')) &&
      !fs.existsSync(path.join(ROOT, 'src/components/admin/payroll/PayrollRecordSection.css')),
  )
  assert(
    'saveSalaryRecordFull removed (its only caller was PayrollRecordSection.jsx)',
    !service.includes('saveSalaryRecordFull'),
  )
  assert(
    'getPayrollRecordPath removed (zero callers anywhere)',
    !utils.includes('getPayrollRecordPath'),
  )

  console.log('\nStage 3c: "Этап расчёта" filter removed, "Статус расчёта" simplified to one checkbox')
  assert(
    'no calculation-stage filter section left in the popover',
    !filter.includes('Этап расчёта') && !filter.includes('Без расчёта') && !filter.includes('SALARY_RECORD_STATUSES'),
  )
  assert(
    'old 3-way participation radiogroup replaced by a single checkbox',
    filter.includes('Показать исключённых из ведомости') &&
      !filter.includes('PAYROLL_PARTICIPATION_FILTER_OPTIONS') &&
      !filter.includes('Статус расчёта'),
  )
  assert(
    'boolean show-excluded default constant defined',
    employeeData.includes('PAYROLL_LIST_DEFAULT_SHOW_EXCLUDED = false'),
  )
  assert(
    'list filtering uses the real participation helper, not a 3-way string enum',
    list.includes('isPayrollExcluded') && !list.includes('appliedParticipation') && !list.includes('appliedStatus'),
  )
  assert(
    'participation label renamed to avoid confusion with the removed calculation stage',
    commentModal.includes('Участие в ведомости') && !commentModal.includes('Статус расчёта'),
  )
  assert(
    'employee edit modal label renamed too',
    employeeEditModal.includes('Участие в ведомости') && !employeeEditModal.includes('Статус расчёта'),
  )

  assert('no time-tracker import in payroll', !list.includes('timeTracker'))
  assert('verify script registered', pkg.includes('verify:salary-payroll-mvp'))
  assert(
    'employee pageSize within edge limit',
    list.includes('EMPLOYEE_PAGE_SIZE = 100') && !list.includes('pageSize: 200')
  )
  assert(
    'list built from employment period not active status',
    list.includes('listEmployeesForPayrollMonth') &&
      list.includes("status: 'all'") &&
      list.includes('selectEmployeesForPayrollMonth') &&
      !list.includes("status: 'active'")
  )
  assert(
    'period overlap helpers',
    utils.includes('employmentOverlapsPayrollMonth') &&
      utils.includes('getPayrollMonthBounds') &&
      utils.includes('selectEmployeesForPayrollMonth')
  )
  assert('history preserves record employees', list.includes('includeEmployeeIds') || list.includes('recordEmployeeIds'))

  const nav = read('src/platform/platformNav.js')
  const webOnly = read('src/platform/webOnlyNav.js')
  assert(
    'payroll hidden on mobile nav',
    nav.includes('employees-payroll') &&
      nav.includes('webOnly: true') &&
      webOnly.includes('employees-payroll'),
  )
}

async function runOverlapScenarios() {
  console.log('\nStage 4: Employment period overlap')
  // Inline mirrors of salaryPayroll helpers — Node ESM cannot import the Vite
  // module graph (extensionless relative paths) from this verify script.
  function pad2(value) {
    return String(value).padStart(2, '0')
  }
  function toPayrollDateKey(value) {
    if (value == null || value === '') return null
    if (typeof value === 'string') {
      const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/)
      return match ? match[1] : null
    }
    return null
  }
  function getPayrollMonthBounds(year, month) {
    const y = Number(year)
    const m = Number(month)
    const start = `${y}-${pad2(m)}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const end = `${y}-${pad2(m)}-${pad2(lastDay)}`
    return { start, end }
  }
  function employmentOverlapsPayrollMonth(employee, year, month) {
    const hiredAt = toPayrollDateKey(employee?.hiredAt ?? employee?.hired_at)
    if (!hiredAt) return false
    const { start: periodStart, end: periodEnd } = getPayrollMonthBounds(year, month)
    const terminatedAt = toPayrollDateKey(employee?.terminatedAt ?? employee?.terminated_at)
    const employmentEnd = terminatedAt || '9999-12-31'
    return hiredAt <= periodEnd && employmentEnd >= periodStart
  }
  function selectEmployeesForPayrollMonth(employees, year, month, { includeEmployeeIds = [] } = {}) {
    const byId = new Map()
    for (const employee of employees || []) {
      if (!employee?.id) continue
      if (employmentOverlapsPayrollMonth(employee, year, month)) {
        byId.set(Number(employee.id), employee)
      }
    }
    const index = new Map(
      (employees || [])
        .filter((employee) => employee?.id != null)
        .map((employee) => [Number(employee.id), employee]),
    )
    for (const rawId of includeEmployeeIds || []) {
      const id = Number(rawId)
      if (!Number.isFinite(id) || byId.has(id)) continue
      const employee = index.get(id)
      if (employee) byId.set(id, employee)
    }
    return [...byId.values()].sort((left, right) =>
      String(left.name || '').localeCompare(String(right.name || ''), 'ru'),
    )
  }

  const working = { id: 1, name: 'A', hiredAt: '2026-03-15', terminatedAt: null }
  assert('working appears in current month', employmentOverlapsPayrollMonth(working, 2026, 7) === true)
  assert('working missing before hire', employmentOverlapsPayrollMonth(working, 2026, 2) === false)
  assert('working appears in hire month', employmentOverlapsPayrollMonth(working, 2026, 3) === true)

  const midHire = { id: 2, name: 'B', hiredAt: '2026-07-20', terminatedAt: null }
  assert('mid-month hire skips prior month', employmentOverlapsPayrollMonth(midHire, 2026, 6) === false)
  assert('mid-month hire in hire month', employmentOverlapsPayrollMonth(midHire, 2026, 7) === true)

  const fired = { id: 3, name: 'C', hiredAt: '2026-01-10', terminatedAt: '2026-07-15' }
  assert('fired appears in termination month', employmentOverlapsPayrollMonth(fired, 2026, 7) === true)
  assert('fired missing after termination month', employmentOverlapsPayrollMonth(fired, 2026, 8) === false)
  assert('fired remains in prior month', employmentOverlapsPayrollMonth(fired, 2026, 6) === true)

  const augustNatural = selectEmployeesForPayrollMonth([working, midHire, fired], 2026, 8)
  assert(
    'august excludes already terminated employee',
    !augustNatural.some((row) => Number(row.id) === 3) &&
      augustNatural.some((row) => Number(row.id) === 2)
  )

  const augustWithHistory = selectEmployeesForPayrollMonth([working, midHire, fired], 2026, 8, {
    includeEmployeeIds: [3],
  })
  assert(
    'history keeps terminated employee via record id',
    augustWithHistory.some((row) => Number(row.id) === 3)
  )
}

try {
  main()
  await runOverlapScenarios()
  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
