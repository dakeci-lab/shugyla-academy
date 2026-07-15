#!/usr/bin/env node
/**
 * Verification for simplified employee list toolbar and cards.
 *
 * Usage:
 *   npm run verify:employees-list
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
  console.log('=== Employees list verification ===\n')

  const section = read('src/components/admin/sections/EmployeesSection.jsx')
  const sectionCss = read('src/components/admin/sections/EmployeesSection.css')
  const filter = read('src/components/admin/employees/EmployeeFilterPopover.jsx')
  const table = read('src/components/admin/employees/EmployeeListTable.jsx')
  const tableCss = read('src/components/admin/employees/EmployeeListTable.css')
  const employeeData = read('src/utils/employeeData.js')

  console.log('Stage 1: Toolbar')

  assert('status tabs removed', !section.includes('FILTER_TABS'))
  assert('admin-filter-tabs removed', !section.includes('admin-filter-tabs'))
  assert('large create button removed', !section.includes('+ Добавить сотрудника'))
  assert('toolbar search field', section.includes('employees-section__search'))
  assert('toolbar grid layout', sectionCss.includes('grid-template-columns: minmax(0, 1fr) auto auto'))
  assert('filter icon button', section.includes('FilterIcon'))
  assert('plus icon button', section.includes('PlusIcon'))
  assert('filter aria-label', section.includes('aria-label="Фильтр сотрудников"'))
  assert('create aria-label', section.includes('aria-label="Добавить сотрудника"'))

  console.log('Stage 2: Filter')

  assert('filter popover component', section.includes('EmployeeFilterPopover'))
  assert('filter contains status', filter.includes('Статус'))
  assert('filter contains role select', filter.includes('Все роли'))
  assert('default active status', section.includes('EMPLOYEE_LIST_DEFAULT_STATUS'))
  assert('default status is active', employeeData.includes("EMPLOYEE_LIST_DEFAULT_STATUS = 'active'"))
  assert('draft and applied status', section.includes('appliedStatus') && section.includes('draftStatus'))
  assert('draft and applied role', section.includes('appliedRoleId') && section.includes('draftRoleId'))
  assert('roles from rbac service', section.includes("getRolesForEmployeeForm('', '')"))
  assert('filterEmployees helper', employeeData.includes('export function filterEmployees'))
  assert('combined filtering', section.includes('filterEmployees(getStaffEmployees'))
  assert('mobile filter modal', filter.includes('AdminModal'))
  assert('desktop filter popover', filter.includes('employee-filter-popover'))
  assert('focus return ref', filter.includes('returnFocusRef={anchorRef}'))

  console.log('Stage 3: Mobile cards')

  assert('mobile cards component', table.includes('employee-cards'))
  assert('desktop table preserved', table.includes('employee-list-table-desktop'))
  assert('card number', table.includes('employee-card-item__num'))
  assert('card avatar', table.includes('EmployeeAvatar'))
  assert('card role and login', table.includes('Роль:') && table.includes('Логин:'))
  assert('card no trash icon', !table.includes('TrashIcon'))
  assert('card clickable edit', table.includes('employee-card-item--clickable'))
  assert('card edit aria label', table.includes('Редактировать сотрудника'))
  assert('no schedule navigation in table', !table.includes('openSchedule'))
  assert('no schedule route in section', !section.includes('/schedule'))

  console.log('Stage 4: Desktop table')

  assert('number column', table.includes('employee-list-table__num-col'))
  assert('edit action only', table.includes('PencilIcon') && !table.includes('TrashIcon'))
  assert('name opens edit', table.includes('employee-name-link'))

  console.log('Stage 5: Status actions in modal')

  assert('deactivate in edit modal', section.includes('Деактивировать сотрудника'))
  assert('activate in edit modal', section.includes('Активировать сотрудника'))
  assert('deactivate uses ConfirmDialog', section.includes('ConfirmDialog'))
  assert('deactivate uses deactivateEmployee', section.includes('deactivateEmployee'))
  assert('activate uses restoreEmployee', section.includes('restoreEmployee'))
  assert('no hard delete', !section.includes('deleteEmployee'))
  assert('deactivate toast', section.includes("showSuccess('Сотрудник деактивирован')"))
  assert('activate toast', section.includes("showSuccess('Сотрудник активирован')"))
  assert('loading not over ready list', section.includes('showInitialLoading'))

  console.log('Stage 6: Layout')

  assert('toolbar icon size 44px', sectionCss.includes('width: 44px'))
  assert('search min-width zero', sectionCss.includes('min-width: 0'))
  assert('mobile cards breakpoint', tableCss.includes('max-width: 768px'))
  assert('cloud list preserved', section.includes('listEmployeesForAdmin'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
