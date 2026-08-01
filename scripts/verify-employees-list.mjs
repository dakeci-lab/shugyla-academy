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
  const editModal = read('src/components/admin/employees/EmployeeEditModal.jsx')
  const filter = read('src/components/admin/employees/EmployeeFilterPopover.jsx')
  const table = read('src/components/admin/employees/EmployeeListTable.jsx')
  const tableCss = read('src/components/admin/employees/EmployeeListTable.css')
  const header = read('src/components/admin/employees/EmployeeProfileHeader.jsx')
  const employeeData = read('src/utils/employeeData.js')

  console.log('Stage 1: Toolbar')

  assert('status tabs removed', !section.includes('FILTER_TABS'))
  assert('admin-filter-tabs removed', !section.includes('admin-filter-tabs'))
  assert('large create button removed', !section.includes('+ Добавить сотрудника'))
  assert('toolbar search field', section.includes('PlatformSearchToolbar'))
  const searchToolbarCss = read('src/components/platform/PlatformSearchToolbar.css')
  assert('unified search toolbar styles', searchToolbarCss.includes('.platform-search-toolbar'))
  assert('filter icon button', section.includes('PlatformFilterButton'))
  assert('plus icon button', section.includes('PlusIcon'))
  assert('filter aria-label', section.includes('ariaLabel="Фильтр"') || section.includes("ariaLabel={'Фильтр'}"))
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

  const orgList = read('src/components/admin/employees/EmployeeOrganizationList.jsx')
  assert('mobile cards in organization list', orgList.includes('employee-org-card'))
  assert('desktop org table', orgList.includes('employee-org-table'))
  assert('card avatar', orgList.includes('EmployeeAvatar'))
  assert('card role and login', orgList.includes('Роль:') && orgList.includes('Логин:'))
  assert('card no trash icon', !orgList.includes('TrashIcon'))
  assert('card clickable opens profile', orgList.includes('employee-org-card--clickable'))
  assert('card profile aria label', orgList.includes('Открыть карточку сотрудника'))
  assert('pencil edit action present', orgList.includes('Редактировать сотрудника'))
  assert('no schedule navigation in table', !table.includes('openSchedule'))
  assert('no schedule route in section', !section.includes('/schedule'))

  console.log('Stage 4: Desktop table')

  assert('number column', orgList.includes('employee-org-table__num') || orgList.includes('employee-org-table__col-num'))
  assert('edit action only', orgList.includes('PencilIcon') && !orgList.includes('TrashIcon'))
  assert('name link present', orgList.includes('employee-name-link'))
  assert('row opens profile', orgList.includes('employee-org-table__row--clickable'))
  assert('shared edit modal used by list', section.includes('EmployeeEditModal'))
  assert('organization list wired', section.includes('EmployeeOrganizationList'))
  assert('organization grouping helper used', section.includes('groupEmployeesByPositionStructure'))
  assert('safe multi-page search loader', section.includes('loadAllEmployeesForClientSearch'))
  assert('no pageSize 200', !section.includes('pageSize: 200') && !section.includes('CLOUD_SEARCH_PAGE_SIZE'))

  console.log('Stage 5: Status actions in modal')

  assert('dismiss in edit modal', editModal.includes('Уволить сотрудника'))
  assert('restore in edit modal', editModal.includes('Восстановить сотрудника'))
  assert('dismiss uses ConfirmDialog', section.includes('ConfirmDialog'))
  assert('dismiss uses deactivateEmployee', section.includes('deactivateEmployee'))
  assert('restore uses restoreEmployee', section.includes('restoreEmployee'))
  assert('no hard delete', !section.includes('deleteEmployee'))
  assert('dismiss toast', section.includes("showSuccess('Сотрудник уволен')"))
  assert('restore toast', section.includes("showSuccess('Сотрудник восстановлен')"))
  assert('status labels working/fired', employeeData.includes("active: 'Работает'") && employeeData.includes("terminated: 'Уволен'"))
  assert('no deactivated UI label', !employeeData.includes('Деактивирован'))
  assert('hire date helpers', employeeData.includes('formatEmployeeDateRu') && employeeData.includes('todayEmployeeDateKey'))
  assert('hire date in profile', header.includes('Принят на работу') && header.includes('formatEmployeeDateRu'))
  assert('termination date only when fired', header.includes('isTerminatedEmployeeStatus'))
  assert('editable hire date in form', editModal.includes('Дата приёма на работу') && editModal.includes('type="date"'))
  assert('loading uses organization list skeleton', section.includes('loading={Boolean(cloudMode && listLoading)}'))
  assert('inline AdminModal form removed from list', !section.includes('<AdminModal'))
  assert(
    'hotfix 5A.1: no undeclared hasLoadedOnceRef',
    !section.includes('hasLoadedOnceRef') ||
      /const\s+hasLoadedOnceRef\s*=\s*useRef\s*\(/.test(section),
  )

  console.log('Stage 6: Layout')

  assert('toolbar icon size 44px', sectionCss.includes('width: 44px'))
  assert('search min-width zero', sectionCss.includes('min-width: 0'))
  const orgCss = read('src/components/admin/employees/EmployeeOrganizationList.css')
  assert('mobile cards breakpoint', orgCss.includes('max-width: 900px'))
  assert('cloud list preserved', section.includes('listEmployeesForAdmin'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
