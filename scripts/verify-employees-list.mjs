#!/usr/bin/env node
/**
 * Verification for simplified employee list toolbar and flat table.
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
  assert('filter has show-terminated checkbox', filter.includes('Показать уволенных сотрудников'))
  assert('filter checkbox is boolean, not a status radiogroup', !filter.includes('role="radiogroup"'))
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

  console.log('Stage 3: Flat list + position group column')

  assert('EmployeeListTable is primary render', section.includes('<EmployeeListTable'))
  assert('OrganizationList not primary render', !section.includes('<EmployeeOrganizationList'))
  assert(
    'OrganizationList.jsx removed',
    !fs.existsSync(path.join(ROOT, 'src/components/admin/employees/EmployeeOrganizationList.jsx')),
  )
  assert(
    'OrganizationList.css removed',
    !fs.existsSync(path.join(ROOT, 'src/components/admin/employees/EmployeeOrganizationList.css')),
  )
  assert('uses flatten after group sort', section.includes('flattenEmployeeOrganization'))
  assert('uses group helper for order', section.includes('groupEmployeesByPositionStructure'))
  assert(
    'position group column header',
    table.includes('Группа должностей</th>') || table.includes('>Группа должностей<') || table.includes('>Группа<')
  )
  assert('role column header', table.includes('>Роль<') || table.includes('Роль</th>'))
  assert(
    'group column before role',
    (table.includes('Группа должностей') ? table.indexOf('Группа должностей') : table.indexOf('Группа')) <
      table.indexOf('Роль')
  )
  assert('group value from positionGroupName', table.includes('positionGroupName'))
  assert('role via getRoleLabelForEmployee', table.includes('getRoleLabelForEmployee'))
  assert('missing group fallback', table.includes('Не назначена'))
  assert('position name not a list column header', !table.includes('Должность</th>') && !table.includes('>Должность<'))
  assert('archived badge', table.includes('Архивная'))
  assert('no group headers in table', !table.includes('employee-org__group') && !table.includes('Архивная группа'))
  assert('no position separator rows', !table.includes('position-row') && !table.includes('employee-org-table__position'))
  assert('no global shown summary', !section.includes('Показано:') && !table.includes('Показано:'))
  assert('colgroup present', table.includes('<colgroup>'))
  assert('fixed table layout', tableCss.includes('table-layout: fixed'))
  assert('action column fixed width', tableCss.includes('employee-list-table__col-actions'))
  assert('group column width', tableCss.includes('employee-list-table__col-group'))
  assert('compact row height', tableCss.includes('height: 58px') || tableCss.includes('height: 56px'))

  console.log('Stage 4: Mobile cards')

  assert('mobile cards component', table.includes('employee-cards'))
  assert('desktop table preserved', table.includes('employee-list-table-desktop'))
  assert('card shows position group', table.includes('Группа должностей:') || table.includes('Группа:'))
  assert('card does not show position as list field', !table.includes('Должность:'))
  assert('card shows role', table.includes('Роль:'))
  assert('card avatar', table.includes('EmployeeAvatar'))
  assert('card no trash icon', !table.includes('TrashIcon'))
  assert('card clickable opens profile', table.includes('employee-card-item--clickable'))
  assert('card profile aria label', table.includes('Открыть карточку сотрудника'))
  assert('pencil edit action present', table.includes('Редактировать сотрудника'))
  assert('no schedule navigation in table', !table.includes('openSchedule'))
  assert('no schedule route in section', !section.includes('/schedule'))
  assert('shared edit modal used by list', section.includes('EmployeeEditModal'))
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
  assert('loading uses list skeleton', table.includes('employee-list__skeleton') || section.includes('loading={Boolean(cloudMode && listLoading)}'))
  assert('inline AdminModal form removed from list', !section.includes('<AdminModal'))
  assert(
    'hotfix 5A.1: no undeclared hasLoadedOnceRef',
    !section.includes('hasLoadedOnceRef') ||
      /const\s+hasLoadedOnceRef\s*=\s*useRef\s*\(/.test(section),
  )
  assert('empty clear search', table.includes('Очистить поиск'))
  assert('empty title', table.includes('Сотрудники не найдены'))

  console.log('Stage 6: Layout')

  assert('toolbar icon size 44px', sectionCss.includes('width: 44px'))
  assert('search min-width zero', sectionCss.includes('min-width: 0'))
  assert('mobile cards breakpoint', tableCss.includes('max-width: 900px') || tableCss.includes('max-width: 768px'))
  assert('cloud list preserved', section.includes('listEmployeesForAdmin'))
  assert('neutral hover accent', tableCss.includes('#f4faf6') || tableCss.includes('#F4FAF6'))

  console.log('Stage 7: Status badge next to name, no status column in list')

  assert('name and status badge share one row', header.includes('employee-profile-header__name-row'))
  assert('no standalone status block in header', !header.includes('employee-profile-header__status'))
  assert('no status column header in table', !table.includes('<th scope="col">Статус</th>'))
  assert('no status column width rule', !tableCss.includes('employee-list-table__col-status'))
  assert('no StatusBadge import left in table', !table.includes("from '../StatusBadge'"))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
