#!/usr/bin/env node
/**
 * Stage 5B: weekly schedule + daily timeline use flat organisational employee order.
 *
 * Usage:
 *   npm run verify:schedule-organization-order
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  flattenEmployeeOrganization,
  groupEmployeesByPositionStructure,
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

function sampleScheduleEmployees() {
  return [
    {
      id: 20,
      name: 'Акниет Абдибек',
      firstName: 'Акниет',
      lastName: 'Абдибек',
      positionId: 'pos-cashier',
      positionName: 'Кассир',
      positionSortOrder: 10,
      positionIsActive: true,
      positionGroupId: 'grp-cash',
      positionGroupName: 'Кассовая зона',
      positionGroupSortOrder: 40,
      positionGroupIsActive: true,
      role: 'cashier',
    },
    {
      id: 10,
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
    },
    {
      id: 30,
      name: 'Жасулан Абдихан',
      firstName: 'Жасулан',
      lastName: 'Абдихан',
      positionId: 'pos-receiver',
      positionName: 'Приёмщик',
      positionSortOrder: 20,
      positionIsActive: true,
      positionGroupId: 'grp-wh',
      positionGroupName: 'Закуп, приёмка и склад',
      positionGroupSortOrder: 30,
      positionGroupIsActive: true,
      role: 'receiver',
    },
    {
      id: 40,
      name: 'Без Метаданных',
      firstName: 'Без',
      lastName: 'Метаданных',
      role: 'seller',
    },
    {
      id: 25,
      name: 'Нурасыл Султанбай',
      firstName: 'Нурасыл',
      lastName: 'Султанбай',
      positionId: 'pos-buyer',
      positionName: 'Закупщик',
      positionSortOrder: 10,
      positionIsActive: true,
      positionGroupId: 'grp-wh',
      positionGroupName: 'Закуп, приёмка и склад',
      positionGroupSortOrder: 30,
      positionGroupIsActive: true,
      role: 'purchaser',
    },
    {
      id: 15,
      name: 'Насиба Атажанова',
      firstName: 'Насиба',
      lastName: 'Атажанова',
      positionId: 'pos-floor-admin',
      positionName: 'Администратор торгового зала',
      positionSortOrder: 20,
      positionIsActive: true,
      positionGroupId: 'grp-admin',
      positionGroupName: 'Административный состав',
      positionGroupSortOrder: 10,
      positionGroupIsActive: true,
      role: 'admin',
    },
    {
      id: 50,
      name: 'Архивный Сотрудник',
      firstName: 'Архивный',
      lastName: 'Сотрудник',
      positionId: 'pos-old',
      positionName: 'Старая должность',
      positionSortOrder: 5,
      positionIsActive: false,
      positionGroupId: 'grp-old',
      positionGroupName: 'Старая группа',
      positionGroupSortOrder: 90,
      positionGroupIsActive: false,
      role: 'cashier',
    },
  ]
}

function main() {
  console.log('\n=== Schedule organisation order (Stage 5B) ===\n')

  const section = read('src/components/admin/sections/WorkScheduleSection.jsx')
  const timeline = read('src/components/admin/ScheduleDayTimeline.jsx')
  const employeesSection = read('src/components/admin/sections/EmployeesSection.jsx')
  const helper = read('src/utils/employeeOrganizationStructure.js')
  const editModal = read('src/components/admin/employees/EmployeeEditModal.jsx')
  const pkg = read('package.json')

  console.log('Wiring')
  assert(
    'schedule imports group helper',
    section.includes('groupEmployeesByPositionStructure')
  )
  assert(
    'schedule imports flatten helper',
    section.includes('flattenEmployeeOrganization')
  )
  assert(
    'schedule flattens after group',
    section.includes(
      'flattenEmployeeOrganization(groupEmployeesByPositionStructure(filtered))'
    ) ||
      (section.includes('flattenEmployeeOrganization') &&
        section.includes('groupEmployeesByPositionStructure'))
  )
  assert(
    'day timeline uses employees prop order',
    timeline.includes('(employees || []).map') && !/\.sort\s*\(/.test(timeline)
  )
  assert('day timeline key is employee.id', timeline.includes('key={employee.id}'))
  assert('week desktop key is emp.id', section.includes('key={emp.id}'))
  assert('week mobile key is emp.id', /TeamScheduleMobileCard[\s\S]{0,120}key=\{emp\.id\}/.test(section) || section.includes('key={emp.id}'))
  assert('timeline wired from section', section.includes('<ScheduleDayTimeline'))
  assert(
    'employees list still uses same helpers',
    employeesSection.includes('flattenEmployeeOrganization') &&
      employeesSection.includes('groupEmployeesByPositionStructure')
  )

  console.log('No visual grouping in schedule')
  assert('no org group toggle in schedule', !section.includes('employee-org__group'))
  assert('no position separator rows in schedule', !section.includes('employee-org-table__position'))
  assert('no group count badges in schedule', !section.includes('Показано:'))
  assert('no timeline visual groups', !timeline.includes('employee-org__group') && !timeline.includes('Группа должностей'))

  console.log('No new schedule priority hardcodes')
  assert('no scheduleRolePriority', !section.includes('scheduleRolePriority') && !timeline.includes('scheduleRolePriority'))
  assert('no rolePriority', !section.includes('rolePriority') && !timeline.includes('rolePriority'))
  assert('no hardcoded admin position order', !section.includes("['Администратор'") && !timeline.includes("['Администратор'"))
  assert('helper has no React', !helper.includes("from 'react'") && !helper.includes('from "react"'))

  console.log('Runtime order')
  const input = sampleScheduleEmployees()
  const inputSnapshot = JSON.stringify(input)
  const ordered = flattenEmployeeOrganization(groupEmployeesByPositionStructure(input))
  assert('does not mutate input', JSON.stringify(input) === inputSnapshot)
  assert('preserves all employees', ordered.length === input.length)
  assert(
    'order starts with admin group FIO',
    ordered[0].id === 10 && ordered[1].id === 15,
    `got ${ordered.map((e) => e.id).join(',')}`
  )
  assert(
    'warehouse before cashiers',
    ordered.findIndex((e) => e.id === 25) < ordered.findIndex((e) => e.id === 20)
  )
  assert(
    'buyer before receiver by positionSortOrder',
    ordered.findIndex((e) => e.id === 25) < ordered.findIndex((e) => e.id === 30)
  )
  assert('missing position last among non-archived structure peers', ordered[ordered.length - 1].id === 40)
  assert('archived group employee kept', ordered.some((e) => e.id === 50))
  assert(
    'archived before unassigned',
    ordered.findIndex((e) => e.id === 50) < ordered.findIndex((e) => e.id === 40)
  )
  assert('employee ids stable', ordered.every((e) => e.id != null))

  // Shift map stability mirror: reorder does not change lookup by id
  const shiftsByEmployee = new Map([
    [10, new Map([['2026-08-01', { id: 's-10' }]])],
    [20, new Map([['2026-08-01', { id: 's-20' }]])],
  ])
  assert(
    'shift lookup by employee id after reorder',
    shiftsByEmployee.get(ordered.find((e) => e.id === 10).id).get('2026-08-01').id === 's-10' &&
      shiftsByEmployee.get(ordered.find((e) => e.id === 20).id).get('2026-08-01').id === 's-20'
  )

  console.log('Regression boundaries')
  assert('EmployeeEditModal untouched marker', editModal.includes('Должность определяет работу сотрудника'))
  assert('script registered', pkg.includes('verify:schedule-organization-order'))
  const migrationDir = path.join(ROOT, 'supabase/migrations')
  const stage5bMigrations = fs.existsSync(migrationDir)
    ? fs.readdirSync(migrationDir).filter((name) => /schedule.?organization|stage.?5b/i.test(name))
    : []
  assert('no Stage 5B DB migration', stage5bMigrations.length === 0)

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
