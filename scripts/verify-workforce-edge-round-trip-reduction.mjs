#!/usr/bin/env node
/**
 * Structural verification for Stage 8 — PostgREST round-trip reduction.
 *
 * Usage:
 *   npm run verify:workforce-edge-round-trip-reduction
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
  console.log('=== Workforce Edge round-trip reduction (Stage 8) ===\n')

  const edge = read('supabase/functions/admin-team-workforce-data/index.ts')
  const auth = read('supabase/functions/_shared/employeeAuthorization.ts')
  const fields = read('supabase/functions/_shared/workforceFields.ts')
  const cors = read('supabase/functions/_shared/cors.ts')
  const coalesce = read('src/lib/requestCoalesce.js')
  const owner = read('src/components/admin/OwnerDashboard.jsx')
  const schedule = read('src/components/admin/sections/WorkScheduleSection.jsx')
  const profile = read('src/components/admin/sections/EmployeeProfileSection.jsx')
  const tracker = read('supabase/functions/employee-time-tracker-action/index.ts')

  console.log('Stage 1: Authorization fusion')
  assert('CALLER_AUTHZ_SELECT / roles FK present', auth.includes('roles!academy_users_role_id_fkey'))
  assert('nested permissions!inner(code)', auth.includes('permissions!inner(code)'))
  assert('filters permission codes server-side', auth.includes(".in('roles.role_permissions.permissions.code'"))
  assert('authorizeWorkforceRequest single fused select', auth.includes('CALLER_AUTHZ_SELECT'))
  assert('no silent 2-query fallback in authorizeWorkforceRequest', (() => {
    const start = auth.indexOf('export async function authorizeWorkforceRequest')
    const end = auth.indexOf('export async function authorizeAuthenticatedEmployee', start)
    const body = auth.slice(start, end === -1 ? undefined : end)
    return !body.includes(".from('permissions')") && !body.includes('loadCallerProfile')
  })())
  assert('getClaims preserved', auth.includes('getClaims'))
  assert('getUser fallback preserved', auth.includes('getUser(bearer)'))
  assert('empty nested permissions do not grant access', auth.includes('permissionsFromFusedCaller'))
  assert('no module-level caller cache', !/let\s+current(User|Caller|Authz)/.test(auth))
  assert('no cross-request permission TTL cache', !/authzCache|permissionCache|Map\(\)/.test(auth))

  console.log('Stage 2: Home workforce fusion')
  assert('HOME_SUMMARY_SHIFT_WITH_EMPLOYEE_SELECT', fields.includes('HOME_SUMMARY_SHIFT_WITH_EMPLOYEE_SELECT'))
  assert('employee FK disambiguated', fields.includes('academy_employee_shifts_employee_id_fkey'))
  assert('Home uses nested shift→employee select', edge.includes('HOME_SUMMARY_SHIFT_WITH_EMPLOYEE_SELECT'))
  assert('Home does not second-query .in(shiftIds)', !edge.includes(".in('id', [...shiftIds])"))
  assert('Home uses !inner employee nest', fields.includes('!inner('))
  assert('Home filters nested status/role', edge.includes("'academy_users.status'") || edge.includes(".eq('academy_users.status'"))

  console.log('Stage 3: Profile / Schedule outer nest')
  assert('WORKFORCE_EMPLOYEE_WITH_SHIFTS_SELECT', fields.includes('WORKFORCE_EMPLOYEE_WITH_SHIFTS_SELECT'))
  assert('Edge uses employee→shifts nest', edge.includes('WORKFORCE_EMPLOYEE_WITH_SHIFTS_SELECT'))
  assert('nested shifts not !inner (keep empty)', !/academy_employee_shifts![^)]*!inner/.test(fields))
  assert('date filters on nested shifts', edge.includes("'academy_employee_shifts.shift_date'"))
  assert('referencedTable order for nested shifts', edge.includes("referencedTable: 'academy_employee_shifts'"))

  console.log('Stage 4: DB-call counter + Server-Timing')
  assert('createDbCallCounter exported', auth.includes('export function createDbCallCounter'))
  assert('trackDbCall used', edge.includes('trackDbCall(dbCalls)'))
  assert('X-Workforce-DB-Calls header', edge.includes('X-Workforce-DB-Calls'))
  assert('CORS exposes db-calls header', cors.includes('x-workforce-db-calls'))
  assert('authorization_db timing phase', edge.includes('authorization_db:'))
  assert('workforce_db timing phase', edge.includes('workforce_db:'))
  assert('timing has no email', !/admin_team_workforce_timing[\s\S]{0,500}email/.test(edge))

  console.log('Stage 5: Security / contracts')
  assert('permissionCodesForView server-fixed', edge.includes('function permissionCodesForView'))
  assert('body cannot supply permission', !edge.includes('payload.permission'))
  assert('own scope check retained', edge.includes('requestedEmployeeId !== caller.id'))
  assert('home-summary team required', /case 'home-summary':[\s\S]*?hasTeam/.test(edge) || /case 'dashboard':\s*\n\s*case 'home-summary':/.test(edge))
  assert('inactive_caller retained', auth.includes("'inactive_caller'"))
  assert('401 unauthorized retained', auth.includes("adminErrorResponse('unauthorized', 401)"))
  assert('Home OwnerDashboard still summary', owner.includes('fetchHomeWorkforceSummary'))
  assert('Schedule still schedule view', schedule.includes("view: 'schedule'"))
  assert('Profile bundle retained', profile.includes('fetchEmployeeWorkforceBundle'))
  assert('Stage 3 coalesce retained', coalesce.includes('export function coalesceInFlight'))
  assert('time tracker separate auth', tracker.includes('authorizeAuthenticatedEmployee'))
  assert('response employees+shifts', edge.includes('employees,') && edge.includes('shifts,'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
