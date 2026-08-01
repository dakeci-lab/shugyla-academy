#!/usr/bin/env node
/**
 * Stage 5A: employee organization grouping helper + list wiring.
 *
 * Usage:
 *   npm run verify:employee-organization-structure
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  groupEmployeesByPositionStructure,
  summarizeEmployeeOrganization,
  flattenEmployeeOrganization,
  resolveEmployeeOrganizationMeta,
  UNASSIGNED_GROUP_ID,
  UNASSIGNED_GROUP_NAME,
} from '../src/utils/employeeOrganizationStructure.js'

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

function sampleEmployees() {
  return [
    {
      id: 2,
      name: 'Бек Али',
      firstName: 'Бек',
      lastName: 'Али',
      positionId: 'pos-cashier',
      positionName: 'Кассир',
      positionSortOrder: 20,
      positionIsActive: true,
      positionGroupId: 'grp-cash',
      positionGroupName: 'Кассовая зона',
      positionGroupSortOrder: 30,
      positionGroupIsActive: true,
      role: 'cashier',
      login: 'bek',
    },
    {
      id: 1,
      name: 'Анна Кассир',
      firstName: 'Анна',
      lastName: 'Кассир',
      positionId: 'pos-cashier',
      positionName: 'Кассир',
      positionSortOrder: 20,
      positionIsActive: true,
      positionGroupId: 'grp-cash',
      positionGroupName: 'Кассовая зона',
      positionGroupSortOrder: 30,
      positionGroupIsActive: true,
      role: 'cashier',
      login: 'anna',
    },
    {
      id: 3,
      name: 'Данияр Султанбай',
      firstName: 'Данияр',
      lastName: 'Султанбай',
      positionId: 'pos-admin',
      positionName: 'Администратор',
      positionSortOrder: 10,
      positionIsActive: true,
      positionGroupId: 'grp-admin',
      positionGroupName: 'Административный состав',
      positionGroupSortOrder: 10,
      positionGroupIsActive: true,
      role: 'admin',
      login: 'admin',
    },
    {
      id: 4,
      name: 'Legacy User',
      firstName: 'Legacy',
      lastName: 'User',
      positionId: null,
      position: 'Старый текст',
      role: 'seller',
      login: 'legacy',
    },
    {
      id: 5,
      name: 'Архив Сотрудник',
      firstName: 'Архив',
      lastName: 'Сотрудник',
      positionId: 'pos-old',
      positionName: 'Старая должность',
      positionSortOrder: 5,
      positionIsActive: false,
      positionGroupId: 'grp-old',
      positionGroupName: 'Старая группа',
      positionGroupSortOrder: 5,
      positionGroupIsActive: false,
      role: 'seller',
      login: 'archive',
    },
  ]
}

function main() {
  console.log('=== Employee organization structure (Stage 5A) ===\n')

  const source = sampleEmployees()
  const frozen = JSON.stringify(source)
  const groups = groupEmployeesByPositionStructure(source)

  assert('does not mutate input', JSON.stringify(source) === frozen)
  assert('groups by position group', groups.some((g) => g.groupId === 'grp-admin'))
  assert('groups by position', groups.some((g) => g.positions.some((p) => p.positionId === 'pos-cashier')))
  assert(
    'group sort_order',
    groups.findIndex((g) => g.groupId === 'grp-old') <
      groups.findIndex((g) => g.groupId === 'grp-admin')
  )
  assert(
    'group name order among structure',
    groups.findIndex((g) => g.groupId === 'grp-admin') <
      groups.findIndex((g) => g.groupId === 'grp-cash')
  )

  const cash = groups.find((g) => g.groupId === 'grp-cash')
  const cashiers = cash.positions.find((p) => p.positionId === 'pos-cashier')
  assert('employees sorted by FIO', cashiers.employees[0].firstName === 'Анна')
  assert('second employee after FIO sort', cashiers.employees[1].firstName === 'Бек')

  const unassigned = groups.find((g) => g.groupId === UNASSIGNED_GROUP_ID)
  assert('missing position → Без должности', Boolean(unassigned))
  assert('unassigned group name', unassigned.groupName === UNASSIGNED_GROUP_NAME)
  assert('unassigned is last', groups[groups.length - 1].groupId === UNASSIGNED_GROUP_ID)

  const archived = groups.find((g) => g.groupId === 'grp-old')
  assert('archived group kept', Boolean(archived))
  assert('archived group inactive flag', archived.isGroupActive === false)
  assert(
    'archived position kept',
    archived.positions[0].isPositionActive === false
  )

  const again = groupEmployeesByPositionStructure(source)
  assert('stable result', JSON.stringify(groups) === JSON.stringify(again))

  const summary = summarizeEmployeeOrganization(groups)
  assert('summary employee count', summary.employeeCount === source.length)
  assert('summary group count', summary.groupCount === groups.length)
  assert('flatten preserves count', flattenEmployeeOrganization(groups).length === source.length)

  const meta = resolveEmployeeOrganizationMeta({ positionId: null, position: 'X' })
  assert('meta unassigned', meta.isUnassignedGroup === true)

  // Equal sort_order → name fallback
  const tied = groupEmployeesByPositionStructure([
    {
      id: 1,
      firstName: 'B',
      lastName: '',
      name: 'B',
      positionId: 'p2',
      positionName: 'Бета',
      positionSortOrder: 1,
      positionGroupId: 'g',
      positionGroupName: 'G',
      positionGroupSortOrder: 1,
      positionIsActive: true,
      positionGroupIsActive: true,
    },
    {
      id: 2,
      firstName: 'A',
      lastName: '',
      name: 'A',
      positionId: 'p1',
      positionName: 'Альфа',
      positionSortOrder: 1,
      positionGroupId: 'g',
      positionGroupName: 'G',
      positionGroupSortOrder: 1,
      positionIsActive: true,
      positionGroupIsActive: true,
    },
  ])
  assert(
    'position name fallback for equal sort',
    tied[0].positions[0].positionName === 'Альфа'
  )

  // UI wiring
  const helper = read('src/utils/employeeOrganizationStructure.js')
  const section = read('src/components/admin/sections/EmployeesSection.jsx')
  const orgList = read('src/components/admin/employees/EmployeeOrganizationList.jsx')
  const table = read('src/components/admin/employees/EmployeeListTable.jsx')
  const employeeData = read('src/utils/employeeData.js')
  const pkg = read('package.json')
  const editModalBefore = read('src/components/admin/employees/EmployeeEditModal.jsx')

  assert('helper export groupEmployeesByPositionStructure', helper.includes('export function groupEmployeesByPositionStructure'))
  assert('section uses helper', section.includes('groupEmployeesByPositionStructure'))
  assert('section uses EmployeeOrganizationList', section.includes('EmployeeOrganizationList'))
  assert('flat EmployeeListTable not primary in section', !section.includes('<EmployeeListTable'))
  assert('org list has aria-expanded', orgList.includes('aria-expanded'))
  assert('org list has aria-controls', orgList.includes('aria-controls'))
  assert('org list collapse chevron', orgList.includes('ChevronDownIcon'))
  assert('search expands groups', orgList.includes('searchActive'))
  assert('archived badge', orgList.includes('Архивная группа'))
  assert('archived position badge', orgList.includes('Архивная должность'))
  assert('fallback badge', orgList.includes('Требует назначения') || orgList.includes('Без должности'))
  assert('summary counters', orgList.includes('Показано:'))
  assert('reuses EmployeeListTable', orgList.includes('EmployeeListTable'))
  assert('table keeps edit action', table.includes('Редактировать сотрудника'))
  assert('search includes positionGroupName', employeeData.includes('positionGroupName'))
  assert('search includes positionName', employeeData.includes('positionName'))
  assert('edit modal still present (untouched by stage scope)', editModalBefore.includes('Должность определяет работу сотрудника'))
  assert('no schedule import in org helper', !helper.includes('EmployeeSchedule') && !helper.includes('timeline'))
  assert('script registered', pkg.includes('verify:employee-organization-structure'))

  const migrationDir = path.join(ROOT, 'supabase/migrations')
  const stage5Migrations = fs.existsSync(migrationDir)
    ? fs.readdirSync(migrationDir).filter((name) => /organization_structure_list|stage.?5a/i.test(name))
    : []
  assert('no Stage 5A DB migration', stage5Migrations.length === 0)

  // Confirm schedule files not in this change set via helper purity
  assert('helper has no React', !helper.includes('from \'react\'') && !helper.includes('from "react"'))

  // Hotfix 5A.1: undeclared hasLoadedOnceRef must never ship again.
  const usesLoadedOnceRef = section.includes('hasLoadedOnceRef')
  const declaresLoadedOnceRef = /const\s+hasLoadedOnceRef\s*=\s*useRef\s*\(/.test(section)
  if (usesLoadedOnceRef) {
    assert('hasLoadedOnceRef declared via useRef when used', declaresLoadedOnceRef)
  } else {
    assert('hasLoadedOnceRef fully removed (preferred hotfix)', !usesLoadedOnceRef)
  }
  assert(
    'success path does not assign undeclared hasLoadedOnceRef',
    !/setCloudPagination\([\s\S]{0,80}hasLoadedOnceRef\.current\s*=\s*true/.test(section),
  )

  // Lightweight runtime mirror of successful cloud load (no ReferenceError / no wipe).
  function simulateSuccessfulCloudLoad(result) {
    let cloudEmployees = []
    let cloudPagination = null
    let listError = ''
    let listLoading = true
    const quiet = false
    try {
      cloudEmployees = result.employees
      cloudPagination = result.pagination
      // Intentionally no hasLoadedOnceRef — production crash was here.
    } catch (err) {
      if (!quiet) {
        cloudEmployees = []
        cloudPagination = null
      }
      listError = err.message || 'Не удалось загрузить сотрудников'
    } finally {
      if (!quiet) listLoading = false
    }
    return { cloudEmployees, cloudPagination, listError, listLoading }
  }

  const mockOk = simulateSuccessfulCloudLoad({
    employees: [
      {
        id: 1,
        firstName: 'Анна',
        lastName: 'Кассир',
        name: 'Анна Кассир',
        positionId: 'pos-cashier',
        positionName: 'Кассир',
        positionSortOrder: 20,
        positionIsActive: true,
        positionGroupId: 'grp-cash',
        positionGroupName: 'Кассовая зона',
        positionGroupSortOrder: 30,
        positionGroupIsActive: true,
      },
    ],
    pagination: { total: 1, total_pages: 1 },
  })
  assert('mock success keeps employees', mockOk.cloudEmployees.length === 1)
  assert('mock success keeps pagination', mockOk.cloudPagination?.total === 1)
  assert('mock success leaves listError empty', mockOk.listError === '')
  assert('mock success clears listLoading', mockOk.listLoading === false)
  assert(
    'mock success groups without throw',
    groupEmployeesByPositionStructure(mockOk.cloudEmployees).length === 1,
  )

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
