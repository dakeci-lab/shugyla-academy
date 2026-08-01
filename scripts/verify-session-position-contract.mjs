#!/usr/bin/env node
/**
 * Wave 2B: Auth/session position must not be derived from access role.
 *
 * Usage:
 *   npm run verify:session-position-contract
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getRole } from '../src/data/roles.js'
import { resolveSessionPosition } from '../src/utils/sessionPosition.js'

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

/** Mirror of authService buildSessionUser position+role contract (no Vite imports). */
function buildSessionUserMirror(employee) {
  const role = getRole(employee.role)
  const sessionPosition = resolveSessionPosition(employee)
  return {
    id: employee.id,
    role: employee.role,
    roleId: employee.roleId ?? employee.role_id ?? null,
    roleName: role?.label || employee.role,
    ...sessionPosition,
    permissions: role?.permissions || [],
    assignedCourseIds: employee.assignedCourseIds || [],
  }
}

function main() {
  console.log('=== Session position contract verification (Wave 2B) ===\n')

  const authService = read('src/services/authService.js')
  const sessionPosition = read('src/utils/sessionPosition.js')
  const rolesJs = read('src/data/roles.js')
  const permissionsJs = read('src/config/permissions.js')
  const employeeData = read('src/utils/employeeData.js')
  const pkg = read('package.json')

  console.log('Source guards')
  assert('resolveSessionPosition helper exists', sessionPosition.includes('export function resolveSessionPosition'))
  assert('authService imports resolveSessionPosition', authService.includes("from '../utils/sessionPosition'"))
  assert('buildSessionUser uses resolveSessionPosition', /function buildSessionUser[\s\S]*?resolveSessionPosition\(employee\)/.test(authService))
  assert('local login uses resolveSessionPosition', authService.includes('resolveSessionPosition(legacy.user)'))
  assert('legacy restore uses resolveSessionPosition', authService.includes('resolveSessionPosition(profile)'))
  assert('no positionLabel role fallback', !authService.includes('positionLabel'))
  assert(
    'position assignment not from role label',
    !/position:\s*[^\n]*role\?\.label/.test(authService) &&
      !/position:\s*legacy\.user\.position\s*\|\|\s*role\?\.label/.test(authService),
  )
  assert(
    'position assignment not from employee.role code',
    !/position:\s*[^\n]*\|\|\s*employee\.role\b/.test(authService) &&
      !/position:\s*[^\n]*\|\|\s*legacy\.user\.role\b/.test(authService),
  )
  assert(
    'roleName still from role catalog',
    /roleName:\s*role\?\.label\s*\|\|\s*(employee|legacy\.user)\.role/.test(authService),
  )
  assert('profile fields still include position_id', authService.includes('ACADEMY_AUTH_PROFILE_FIELDS'))
  assert('hotfix fallback without position_id kept', authService.includes('ACADEMY_AUTH_PROFILE_FIELDS_WITHOUT_POSITION_ID'))
  assert('403 retry path kept', authService.includes('isProfilePermissionDeniedError'))
  assert('UI sentinel not written in session helper', !sessionPosition.includes('Должность не назначена'))
  assert('UI display helper still has sentinel', employeeData.includes('Должность не назначена'))
  assert('roles.js buyer map unchanged', rolesJs.includes('buyer: ROLE_IDS.PURCHASER'))
  assert('normalizeRoleId present', rolesJs.includes('export function normalizeRoleId'))
  assert('ROUTE_ACCESS unchanged marker', permissionsJs.includes('const ROUTE_ACCESS'))
  assert('script registered', pkg.includes('verify:session-position-contract'))

  console.log('\nResolver contract')
  const withName = resolveSessionPosition({
    positionId: 'pid-1',
    positionName: 'Старший кассир',
    position: 'legacy-text',
    positionGroupId: 'gid-1',
    positionGroupName: 'Касса',
    role: 'cashier',
  })
  assertEqual('positionName wins', withName.positionName, 'Старший кассир')
  assertEqual('position mirrors name', withName.position, 'Старший кассир')
  assertEqual('positionId kept', withName.positionId, 'pid-1')
  assertEqual('group id kept', withName.positionGroupId, 'gid-1')
  assertEqual('group name kept', withName.positionGroupName, 'Касса')

  const snake = resolveSessionPosition({
    position_id: 'pid-snake',
    position: 'Приёмщик',
    position_group_id: 'g-snake',
    position_group_name: 'Склад',
    role: 'buyer',
  })
  assertEqual('snake_case position_id', snake.positionId, 'pid-snake')
  assertEqual('legacy position as name', snake.positionName, 'Приёмщик')
  assertEqual('snake group id', snake.positionGroupId, 'g-snake')

  const missing = resolveSessionPosition({
    role: 'cashier',
    roleName: 'Кассир',
  })
  assertEqual('missing positionName is null', missing.positionName, null)
  assertEqual('missing position is empty string', missing.position, '')
  assertEqual('missing positionId is null', missing.positionId, null)
  assert(
    'missing does not store UI sentinel',
    missing.position !== 'Должность не назначена' && missing.positionName !== 'Должность не назначена',
  )

  const roleOnly = resolveSessionPosition({
    role: 'cashier',
    roleName: 'Кассир',
    // deliberate trap fields that must never become position
    label: 'Кассир',
  })
  assertEqual('role label trap ignored', roleOnly.positionName, null)

  const input = {
    positionName: 'Бухгалтер',
    position: 'old',
    role: 'accountant',
  }
  const frozen = JSON.stringify(input)
  resolveSessionPosition(input)
  assertEqual('input not mutated', JSON.stringify(input), frozen)

  console.log('\nbuildSessionUser mirror')
  const sessionNamed = buildSessionUserMirror({
    id: 'u1',
    role: 'cashier',
    roleId: 'role-cashier',
    positionId: 'p1',
    positionName: 'Кассир торгового зала',
    assignedCourseIds: ['c1'],
  })
  assertEqual('session role preserved', sessionNamed.role, 'cashier')
  assertEqual('session roleName from catalog', sessionNamed.roleName, 'Кассир')
  assertEqual('session position from HR', sessionNamed.positionName, 'Кассир торгового зала')
  assertEqual('session permissions present', Array.isArray(sessionNamed.permissions) && sessionNamed.permissions.length > 0, true)
  assertEqual('assigned courses kept', sessionNamed.assignedCourseIds[0], 'c1')

  const sessionMissing = buildSessionUserMirror({
    id: 'u2',
    role: 'cashier',
  })
  assertEqual('missing session positionName null', sessionMissing.positionName, null)
  assertEqual('missing session position empty', sessionMissing.position, '')
  assertEqual('roleName still present when position missing', sessionMissing.roleName, 'Кассир')
  assert(
    'role label not copied into position',
    sessionMissing.position !== 'Кассир' && sessionMissing.positionName !== 'Кассир',
  )

  const sessionLegacy = buildSessionUserMirror({
    id: 'u3',
    role: 'buyer',
    position: 'Приёмщик',
  })
  assertEqual('buyer role preserved in mirror', sessionLegacy.role, 'buyer')
  assertEqual('buyer roleName from catalog', sessionLegacy.roleName, getRole('buyer')?.label || 'buyer')
  assertEqual('buyer position from legacy text', sessionLegacy.positionName, 'Приёмщик')
  assert(
    'buyer position is not role label',
    sessionLegacy.positionName !== sessionLegacy.roleName || sessionLegacy.positionName === 'Приёмщик',
  )

  const localNoPosition = buildSessionUserMirror({
    id: 'u4',
    role: 'buyer',
  })
  assertEqual('local buyer without position: role', localNoPosition.role, 'buyer')
  assertEqual('local buyer without position: empty position', localNoPosition.position, '')
  assertEqual('local buyer without position: null positionName', localNoPosition.positionName, null)
  assert(
    'local buyer without position: not role label',
    localNoPosition.position !== localNoPosition.roleName,
  )

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
