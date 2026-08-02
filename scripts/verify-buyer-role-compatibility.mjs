#!/usr/bin/env node
/**
 * Buyer Compatibility Stage — align frontend with production role `buyer`.
 *
 * Usage:
 *   npm run verify:buyer-role-compatibility
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  BUYER,
  ROLE_IDS,
  ROLES,
  ALL_EMPLOYEE_ROLES,
  EMPLOYEE_FORM_ROLES,
  normalizeRoleId,
  getRole,
  getRoleLabel,
  roleListIncludes,
  roleIdsMatch,
} from '../src/data/roles.js'

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

function assertEqual(name, actual, expected) {
  testsRun += 1
  if (actual !== expected) {
    fail(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
  testsPassed += 1
  console.log(`  ✓ ${name}`)
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function main() {
  console.log('=== Buyer role compatibility verification ===\n')

  console.log('Normalizer / constants (runtime)')
  assertEqual('buyer → buyer', normalizeRoleId('buyer'), 'buyer')
  assertEqual('purchaser → buyer', normalizeRoleId('purchaser'), 'buyer')
  assertEqual('BUYER export is buyer', BUYER, 'buyer')
  assertEqual('ROLE_IDS.BUYER exists', ROLE_IDS.BUYER, 'buyer')
  assertEqual('ROLE_IDS.PURCHASER remains', ROLE_IDS.PURCHASER, 'purchaser')
  assertEqual('unknown preserved', normalizeRoleId('warehouse'), 'warehouse')
  assertEqual('empty → null', normalizeRoleId(''), null)
  assertEqual('null → null', normalizeRoleId(null), null)
  const frozen = { role: 'purchaser' }
  const before = JSON.stringify(frozen)
  normalizeRoleId(frozen.role)
  assertEqual('input object not mutated', JSON.stringify(frozen), before)
  assertEqual('getRole(buyer) label', getRole('buyer')?.label, 'Закупщик')
  assertEqual('getRole(purchaser) canonical fallback', getRole('purchaser')?.id, 'buyer')
  assertEqual('getRoleLabel(buyer)', getRoleLabel('buyer'), 'Закупщик')
  assertEqual('getRoleLabel(purchaser)', getRoleLabel('purchaser'), 'Закупщик')
  assert('static ROLES has buyer entry', Boolean(ROLES[ROLE_IDS.BUYER]))
  assert('static ROLES has no purchaser entry', !ROLES.purchaser && !ROLES[ROLE_IDS.PURCHASER])
  assert('ALL_EMPLOYEE_ROLES uses buyer', ALL_EMPLOYEE_ROLES.includes(ROLE_IDS.BUYER))
  assert('ALL_EMPLOYEE_ROLES has no purchaser', !ALL_EMPLOYEE_ROLES.includes(ROLE_IDS.PURCHASER))
  assert('EMPLOYEE_FORM_ROLES uses buyer', EMPLOYEE_FORM_ROLES.includes(ROLE_IDS.BUYER))
  assert('roleIdsMatch buyer/purchaser', roleIdsMatch('buyer', 'purchaser'))

  console.log('\nAudience comparison helpers (runtime)')
  const allowedBuyer = ['buyer', 'admin']
  const allowedPurchaser = ['purchaser', 'admin']
  const allowedMixed = ['buyer', 'purchaser', 'cashier']
  assert('buyer matches buyer list', roleListIncludes(allowedBuyer, 'buyer'))
  assert('buyer matches purchaser list via alias', roleListIncludes(allowedPurchaser, 'buyer'))
  assert('purchaser matches buyer list via alias', roleListIncludes(allowedBuyer, 'purchaser'))
  assert(
    'mixed list matches both codes',
    roleListIncludes(allowedMixed, 'buyer') && roleListIncludes(allowedMixed, 'purchaser'),
  )
  const frozenAllowed = ['purchaser']
  const allowedSnapshot = JSON.stringify(frozenAllowed)
  roleListIncludes(frozenAllowed, 'buyer')
  assertEqual('allowedRoles not mutated', JSON.stringify(frozenAllowed), allowedSnapshot)
  assert(
    'payroll-style match buyer vs purchaser',
    normalizeRoleId('buyer') === normalizeRoleId('purchaser'),
  )

  console.log('\nSource guards')
  const rolesJs = read('src/data/roles.js')
  const permissionsJs = read('src/config/permissions.js')
  const catalogJs = read('src/config/permissionCatalog.js')
  const payroll = read('src/components/admin/payroll/PayrollSection.jsx')
  const standardsData = read('src/utils/standardsData.js')
  const recruitment = read('src/utils/recruitmentData.js')
  const modal = read('src/components/admin/employees/EmployeeEditModal.jsx')
  const pkg = read('package.json')

  assert('alias purchaser→buyer', rolesJs.includes('purchaser: ROLE_IDS.BUYER'))
  assert('no buyer→purchaser alias', !rolesJs.includes('buyer: ROLE_IDS.PURCHASER'))
  assert('BUYER export equals ROLE_IDS.BUYER', rolesJs.includes('export const BUYER = ROLE_IDS.BUYER'))
  assert('ACADEMY_COURSE_ROLES removed', !rolesJs.includes('ACADEMY_COURSE_ROLES'))
  assert('ROUTE_ACCESS present', permissionsJs.includes('const ROUTE_ACCESS'))
  assert('ROUTE_ACCESS uses BUYER', permissionsJs.includes('ROLE_IDS.BUYER'))
  assert(
    'procurement fallback uses BUYER',
    /PROCUREMENT\]:\s*\[[^\]]*ROLE_IDS\.BUYER/.test(permissionsJs),
  )
  assert(
    'suppliers fallback uses BUYER',
    /SUPPLIERS\]:\s*\[[^\]]*ROLE_IDS\.BUYER/.test(permissionsJs),
  )
  assert(
    'receiving fallback uses BUYER',
    /RECEIVING\]:\s*\[[^\]]*ROLE_IDS\.BUYER/.test(permissionsJs),
  )
  assert('canEditSimplePurchase uses BUYER', permissionsJs.includes('role !== ROLE_IDS.BUYER'))
  assert("default permissions key 'buyer:'", catalogJs.includes('buyer: ['))
  assert("no default permissions key 'purchaser:'", !catalogJs.includes('purchaser: ['))
  assert("system role seed code 'buyer'", catalogJs.includes("code: 'buyer'"))
  assert("system role seed no code 'purchaser'", !catalogJs.includes("code: 'purchaser'"))
  assert('payroll filter normalizes roles', payroll.includes('normalizeRoleId(emp.role)'))
  assert('standards visibility uses roleListIncludes', standardsData.includes('roleListIncludes'))
  assert('roles.js keeps roleListIncludes for audience checks', rolesJs.includes('export function roleListIncludes'))
  assert('vacancy roles prefer buyer', recruitment.includes("'buyer'") && recruitment.includes('VACANCY_ROLES'))
  assert('vacancy keeps purchaser label for read', recruitment.includes('purchaser: \'Закупщик\''))
  assert('EmployeeEditModal still uses DB rbacService', modal.includes('getRolesForEmployeeForm'))
  assert('PWA schema version not bumped in employeeData', !read('src/utils/employeeData.js').includes('EMPLOYEE_LOCAL_SCHEMA_VERSION = 3'))
  assert('script registered', pkg.includes('verify:buyer-role-compatibility'))
  assert('ROLE_IDS.PURCHASER kept for compatibility', rolesJs.includes("PURCHASER: 'purchaser'"))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
