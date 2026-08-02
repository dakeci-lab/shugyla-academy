#!/usr/bin/env node
/**
 * Stage 4: separate employee position (job title) and system role (access) in UI.
 *
 * Usage:
 *   npm run verify:employee-position-role-separation
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
  console.log('=== Employee position / role separation (Stage 4) ===\n')

  const modal = read('src/components/admin/employees/EmployeeEditModal.jsx')
  const header = read('src/components/admin/employees/EmployeeProfileHeader.jsx')
  const profile = read('src/components/admin/sections/EmployeeProfileSection.jsx')
  const employeeData = read('src/utils/employeeData.js')
  const catalog = read('src/services/positionCatalogService.js')
  const platformSvc = read('src/services/platformDataService.js')
  const provisioning = read('src/services/employeeProvisioningService.js')
  const employeesSection = read('src/components/admin/sections/EmployeesSection.jsx')
  const pkg = read('package.json')

  // Catalog
  assert('catalog builder exists', catalog.includes('buildPositionSelectGroups'))
  assert('assignable helper exists', catalog.includes('isPositionAssignable'))
  assert('archived current supported', catalog.includes('includeArchivedCurrent'))
  assert('modal loads position catalog', modal.includes('ensurePositionCatalogLoaded'))
  assert('modal uses optgroup', modal.includes('<optgroup'))
  assert('modal does not import ROLE_IDS', !modal.includes('ROLE_IDS'))
  assert('modal builds groups from catalog', modal.includes('buildPositionSelectGroups'))

  // Form fields / draft state
  assert('position field label', modal.includes('Должность'))
  assert('system role field label', modal.includes('Роль в системе'))
  assert('work section note', modal.includes('Должность определяет работу сотрудника'))
  assert('EMPTY form has positionId', employeeData.includes("positionId: '',"))
  assert('employeeToForm maps positionId', employeeData.includes('positionId: employee.positionId'))
  assert('validate requires position on create', employeeData.includes("return 'Укажите должность'"))
  assert('validate requires roleId on create', employeeData.includes("return 'Укажите роль в системе'"))
  assert('form patch uses positionId', modal.includes('positionId: e.target.value') || modal.includes("positionId: e.target.value"))

  // Independence
  assert('diff documents role/position independence', employeeData.includes('Role changes never include position'))
  assert('diff explicit positionId only', employeeData.includes('Explicit positionId only'))
  assert('diff self omits position and role', /if \(!editingSelf\)[\s\S]*changes\.positionId[\s\S]*changes\.roleId/.test(employeeData))
  assert('create payload uses positionId', modal.includes('positionId: form.positionId'))
  assert('create UI does not map role name to position', !modal.includes('position: selectedRole'))
  assert('createEmployee forwards positionId', platformSvc.includes('positionId: data.positionId'))
  assert('provisioning sends position_id', provisioning.includes('position_id: payload.positionId'))
  assert('legacy position text omitted when positionId set', platformSvc.includes('data.positionId ? undefined : data.position'))

  // Permissions / self
  assert('position gated by employees.edit', modal.includes('EMPLOYEES_EDIT'))
  assert('role gated by manage_roles', modal.includes('EMPLOYEES_MANAGE_ROLES'))
  assert('self cannot edit position hint', modal.includes('Собственную должность нельзя изменить'))
  assert('self cannot edit role hint', modal.includes('Собственную роль нельзя изменить'))
  assert('role confirmation dialog', modal.includes('Изменение роли повлияет на доступ'))
  assert('ConfirmDialog used for role change', modal.includes('ConfirmDialog'))

  // Hire
  assert('hire prefill clears positionId', employeesSection.includes("positionId: ''"))
  assert('hire does not invent position from vacancy', !employeesSection.includes('position: getVacancy'))
  assert('hireCandidateAsUser requires positionId', platformSvc.includes('Укажите должность сотрудника'))
  assert('candidate hint asks for position and role', modal.includes('должность и роль'))

  // Profile
  assert('profile shows должность meta', header.includes('Должность'))
  assert('profile shows группа', header.includes('Группа должности'))
  assert('profile shows роль в системе', header.includes('Роль в системе'))
  assert('profile uses structured position label', header.includes('getEmployeePositionLabel'))
  assert('profile role label not from position', !profile.includes('nextEmployee.position || getRoleLabel'))
  assert('unlinked position helper', employeeData.includes('isEmployeePositionUnlinked'))
  assert('archived label in modal', modal.includes('(архивная)'))
  assert('inactive role label in modal', modal.includes('(неактивна)'))
  assert('catalog error retry', modal.includes('Повторить'))

  // Wave 2A: UI must not use access role as HR position label
  const schedule = read('src/components/admin/sections/WorkScheduleSection.jsx')
  const timeline = read('src/components/admin/ScheduleDayTimeline.jsx')
  const empSchedule = read('src/components/admin/sections/EmployeeScheduleSection.jsx')
  const rating = read('src/components/admin/sections/EmployeeRatingSection.jsx')
  const payroll = read('src/components/admin/payroll/PayrollSection.jsx')
  const payrollRecord = read('src/components/admin/payroll/PayrollRecordSection.jsx')
  const ownerDash = read('src/components/admin/OwnerDashboard.jsx')
  const rolesJs = read('src/data/roles.js')
  const permissionsJs = read('src/config/permissions.js')
  const authService = read('src/services/authService.js')

  assert('position display helper exported', employeeData.includes('export function getEmployeePositionDisplay'))
  assert('normalize position display ignores role label', !/role\?\.label/.test(employeeData.match(/function resolvePositionDisplay[\s\S]*?\n\}/)?.[0] || 'role?.label'))
  assert('missing position sentinel', employeeData.includes("'Должность не назначена'") || employeeData.includes('Должность не назначена'))
  assert('weekly schedule uses position display helper', schedule.includes('getEmployeePositionDisplay'))
  assert('weekly schedule no role-as-position fallback', !schedule.includes('position || getRoleLabel'))
  assert('daily timeline uses position display helper', timeline.includes('getEmployeePositionDisplay'))
  assert('daily timeline no role-as-position fallback', !timeline.includes('position || getRoleLabel'))
  assert('employee schedule uses position display helper', empSchedule.includes('getEmployeePositionDisplay'))
  assert('employee schedule no role-as-position fallback', !empSchedule.includes('position || getRoleLabel'))
  assert('rating uses position display helper', rating.includes('getEmployeePositionDisplay'))
  assert('rating no role-as-position fallback', !rating.includes('position || getRoleLabel'))
  assert('payroll uses position display helper', payroll.includes('getEmployeePositionDisplay'))
  assert('payroll no role-as-position fallback', !payroll.includes('position || getRoleLabel'))
  assert('payroll record uses position display helper', payrollRecord.includes('getEmployeePositionDisplay'))
  assert('payroll record no role-as-position fallback', !payrollRecord.includes('position || getRoleLabel'))
  assert('owner dashboard uses position display helper', ownerDash.includes('getEmployeePositionDisplay'))
  assert('list role column still uses getRoleLabel', employeesSection.includes('getRoleLabel(employee.role)'))
  assert('profile header still uses getRoleLabel for role', header.includes('getRoleLabel(employee.role)'))
  assert('EmployeeEditModal unchanged marker', modal.includes('Должность определяет работу сотрудника'))
  assert('roles.js purchaser aliases to buyer', rolesJs.includes('purchaser: ROLE_IDS.BUYER'))
  assert('ROUTE_ACCESS still present', permissionsJs.includes('const ROUTE_ACCESS'))
  assert('ROUTE_ACCESS uses ROLE_IDS.BUYER', permissionsJs.includes('ROLE_IDS.BUYER'))
  assert('authService roleName still uses role catalog', /roleName:\s*role\?\.label/.test(authService))
  assert('authService session position uses resolveSessionPosition', authService.includes('resolveSessionPosition'))
  assert(
    'authService no longer uses role as position fallback',
    !/position:\s*[^\n]*role\?\.label/.test(authService) &&
      !authService.includes('positionLabel'),
  )

  // Runtime mirror of getEmployeePositionDisplay (avoid importing employeeData → users.js)
  function getEmployeePositionLabelMirror(employee) {
    if (!employee) return ''
    if (employee.positionId && employee.positionName) return employee.positionName
    if (employee.positionName) return employee.positionName
    if (employee.positionId && employee.position) return employee.position
    if (employee.positionId) return ''
    return employee.position || ''
  }
  function getEmployeePositionDisplayMirror(employee) {
    const label = String(getEmployeePositionLabelMirror(employee) || '').trim()
    return label || 'Должность не назначена'
  }
  assert(
    'positionName wins over legacy',
    getEmployeePositionDisplayMirror({ positionName: 'Кассир', position: 'Legacy', role: 'admin' }) ===
      'Кассир',
  )
  assert(
    'legacy position used when name missing',
    getEmployeePositionDisplayMirror({ position: 'Приёмщик', role: 'cashier' }) === 'Приёмщик',
  )
  assert(
    'role not used as position',
    getEmployeePositionDisplayMirror({ role: 'cashier' }) === 'Должность не назначена',
  )
  assert(
    'role label fields ignored',
    getEmployeePositionDisplayMirror({
      role: 'cashier',
      roleLabel: 'Кассир',
      roleName: 'Кассир',
    }) === 'Должность не назначена',
  )
  const frozen = Object.freeze({ positionName: 'Продавец' })
  assert('helper does not require mutation', getEmployeePositionDisplayMirror(frozen) === 'Продавец')
  assert(
    'archived-style name still shown',
    getEmployeePositionDisplayMirror({
      positionName: 'Старая должность',
      positionIsActive: false,
    }) === 'Старая должность',
  )

  // Regression
  const migrationDir = path.join(ROOT, 'supabase/migrations')
  const stage4Migrations = fs.existsSync(migrationDir)
    ? fs.readdirSync(migrationDir).filter((name) => /position_role_ui|stage.?4/i.test(name))
    : []
  assert('no Stage 4 DB migration', stage4Migrations.length === 0)
  assert('script registered', pkg.includes('verify:employee-position-role-separation'))
  assert('positions settings link', modal.includes('tab=positions'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
