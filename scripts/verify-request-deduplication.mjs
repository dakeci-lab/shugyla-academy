#!/usr/bin/env node
/**
 * Structural verification for Stage 3 Variant A — request dedupe / waterfall hygiene.
 *
 * Usage:
 *   npm run verify:request-deduplication
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
  console.log('=== Request deduplication verification (Stage 3 Variant A) ===\n')

  const coalesce = read('src/lib/requestCoalesce.js')
  const employeeAdmin = read('src/services/employeeAdminService.js')
  const workforce = read('src/services/workforceAdminService.js')
  const rbac = read('src/services/rbacService.js')
  const ownerDash = read('src/components/admin/OwnerDashboard.jsx')
  const employees = read('src/components/admin/sections/EmployeesSection.jsx')
  const profile = read('src/components/admin/sections/EmployeeProfileSection.jsx')
  const session = read('src/context/SessionContext.jsx')

  console.log('Stage 1: Coalesce utility')
  assert('coalesceInFlight exported', coalesce.includes('export function coalesceInFlight'))
  assert('clearInFlightRequests exported', coalesce.includes('export function clearInFlightRequests'))
  assert('in-flight Map used', coalesce.includes('new Map()'))

  console.log('Stage 2: Edge services coalesce')
  assert('listEmployeesForAdmin uses coalesce', employeeAdmin.includes('coalesceInFlight'))
  assert('list key includes session user', employeeAdmin.includes('admin-list-employees:'))
  assert('workforce uses coalesce', workforce.includes('coalesceInFlight'))
  assert('workforce key includes view/dates', workforce.includes('admin-team-workforce-data:'))

  console.log('Stage 3: Home feedback loop broken')
  assert('cloud uses localEmployeeIdsKey empty', ownerDash.includes("cloudMode ? '' : employeeIds.join(',')"))
  assert('loadData deps use localEmployeeIdsKey', ownerDash.includes('localEmployeeIdsKey'))
  assert('no employeeIdsKey in OwnerDashboard', !ownerDash.includes('employeeIdsKey'))

  console.log('Stage 4: version storms removed from network effects')
  assert(
    'Employees list effect omits version',
    /loadCloudEmployees\(\)[\s\S]*?\}, \[cloudMode, loadCloudEmployees\]/.test(employees)
  )
  assert(
    'Employees roles effect empty deps',
    /getRolesForEmployeeForm\('', ''\)[\s\S]*?\}, \[\]/.test(employees)
  )
  assert(
    'Profile load effect omits version',
    /loadEmployee\(\)[\s\S]*?\}, \[loadEmployee\]/.test(profile)
  )

  console.log('Stage 5: RBAC form roles use session cache')
  assert(
    'getRolesForEmployeeForm uses ensureRbacLoaded',
    /export async function getRolesForEmployeeForm[\s\S]*?ensureRbacLoaded\(\)/.test(rbac)
  )
  assert(
    'getRolesForEmployeeForm does not call adapter helper',
    !/export async function getRolesForEmployeeForm[\s\S]*?getAdapter\(\)\.getRolesForEmployeeForm/.test(
      rbac
    )
  )
  assert(
    'getActiveRolesForAssignment uses ensureRbacLoaded',
    /export async function getActiveRolesForAssignment[\s\S]*?ensureRbacLoaded\(\)/.test(rbac)
  )

  console.log('Stage 6: Logout / SIGNED_OUT clear session caches')
  assert('logout invalidates RBAC', session.includes('invalidateRbacCache'))
  assert('logout clears in-flight', session.includes('clearInFlightRequests'))
  assert(
    'SIGNED_OUT clears in-flight and RBAC',
    /event === 'SIGNED_OUT'[\s\S]*?invalidateRbacCache[\s\S]*?clearInFlightRequests/.test(session)
  )
  assert(
    'coalesce deletes entry after settle',
    coalesce.includes('inFlight.delete(key)') && coalesce.includes('.finally(')
  )
  assert(
    'profile uses direct getEmployeeForAdmin',
    profile.includes('getEmployeeForAdmin(employeeId') &&
      profile.includes('allowSearchFallback: false')
  )

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
