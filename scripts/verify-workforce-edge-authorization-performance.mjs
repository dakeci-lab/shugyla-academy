#!/usr/bin/env node
/**
 * Structural verification for Stage 6 — workforce Edge Auth/authorization latency hygiene.
 *
 * Usage:
 *   npm run verify:workforce-edge-authorization-performance
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

function countOccurrences(source, needle) {
  let count = 0
  let idx = 0
  while (true) {
    const next = source.indexOf(needle, idx)
    if (next === -1) return count
    count += 1
    idx = next + needle.length
  }
}

function main() {
  console.log('=== Workforce Edge authorization performance (Stage 6) ===\n')

  const edge = read('supabase/functions/admin-team-workforce-data/index.ts')
  const auth = read('supabase/functions/_shared/employeeAuthorization.ts')
  const cors = read('supabase/functions/_shared/cors.ts')
  const fields = read('supabase/functions/_shared/workforceFields.ts')
  const coalesce = read('src/lib/requestCoalesce.js')
  const owner = read('src/components/admin/OwnerDashboard.jsx')
  const service = read('src/services/workforceAdminService.js')
  const schedule = read('src/components/admin/sections/WorkScheduleSection.jsx')
  const profile = read('src/components/admin/sections/EmployeeProfileSection.jsx')
  const tracker = read('supabase/functions/employee-time-tracker-action/index.ts')

  console.log('Stage 1: Token / Auth once')
  assert('getBearerToken exported', auth.includes('export function getBearerToken'))
  assert('verifyBearerAuthUserId exported', auth.includes('export async function verifyBearerAuthUserId'))
  assert('uses official getClaims', auth.includes('authApi.getClaims(bearer)') || auth.includes('.getClaims(bearer)'))
  assert('getUser fallback present', auth.includes('getUser(bearer)'))
  assert('no manual JWT decode path', !auth.includes('atob(') && !auth.includes('JSON.parse(atob'))
  assert('authorizeWorkforceRequest exported', auth.includes('export async function authorizeWorkforceRequest'))
  assert('Edge uses authorizeWorkforceRequest', edge.includes('authorizeWorkforceRequest(req,'))
  assert(
    'Edge does not call authorizeAuthenticatedEmployee',
    !edge.includes('authorizeAuthenticatedEmployee(')
  )
  assert(
    'createClient appears once per helper path (shared factory)',
    auth.includes('function createEdgeClients')
  )
  assert(
    'authorizeWorkforceRequest creates clients once',
    /export async function authorizeWorkforceRequest[\s\S]*?createEdgeClients\(bearer\)/.test(auth) &&
      !/export async function authorizeWorkforceRequest[\s\S]*?createClient[\s\S]*?createClient[\s\S]*?createClient/.test(
        auth
      )
  )

  console.log('Stage 2: Employee mapping once')
  assert('loadCallerProfile exported', auth.includes('export async function loadCallerProfile'))
  assert('caller select is narrow', auth.includes("const CALLER_SELECT = 'id, status, role, role_id, auth_user_id'"))
  assert('no select * in auth helper', !auth.includes(".select('*')"))
  assert('inactive caller rejected', auth.includes("'inactive_caller'"))
  assert(
    'authorizeWorkforceRequest loads caller once',
    (() => {
      const start = auth.indexOf('export async function authorizeWorkforceRequest')
      const end = auth.indexOf('export async function authorizeAuthenticatedEmployee', start)
      const body = auth.slice(start, end === -1 ? undefined : end)
      return countOccurrences(body, 'loadCallerProfile(') === 1
    })()
  )

  console.log('Stage 3: Minimal permission lookup')
  assert('roleHasPermissionCodes exported', auth.includes('export async function roleHasPermissionCodes'))
  assert(
    'relational permission select preferred',
    auth.includes("role_permissions!inner(role_id)") && auth.includes(".in('code', uniqueCodes)")
  )
  assert('permission codes filtered with .in', auth.includes(".in('code', uniqueCodes)"))
  assert('fallback 2-query path retained', auth.includes(".from('role_permissions')"))
  assert('permissionCodesForView server-fixed', edge.includes('function permissionCodesForView'))
  assert(
    'home-summary only team permission',
    /case 'dashboard':\s*case 'home-summary':\s*return \[PERMISSION_SCHEDULE_TEAM\]/.test(edge)
  )
  assert('schedule uses team+own', edge.includes('PERMISSION_SCHEDULE_TEAM, PERMISSION_SCHEDULE_OWN'))
  assert('no body-driven permission codes', !edge.includes('payload.permission') && !edge.includes('body.permission'))

  console.log('Stage 4: Request-scoped context')
  assert('RequestAuthzContext type', auth.includes('export type RequestAuthzContext'))
  assert('no module-level current user', !/let\s+current(User|Caller|Authz)/.test(auth))
  assert('no global permissions cache', !/Map\(\).*permission|permissionCache|authzCache/.test(auth))
  assert('context includes timings', auth.includes('permissionsMs') && auth.includes('authorizationMs'))

  console.log('Stage 5: Server-Timing phases')
  assert('token phase emitted', edge.includes('token: timings.tokenMs') || edge.includes('token:'))
  assert('auth phase emitted', edge.includes('auth: timings.authMs') || edge.includes('...authzTimingPhases'))
  assert('employee phase emitted', edge.includes('employee: timings.employeeMs') || edge.includes('authzTimingPhases'))
  assert('permissions phase emitted', edge.includes('permissions: timings.permissionsMs') || edge.includes('authzTimingPhases'))
  assert('authorization aggregate emitted', edge.includes('authorization: timings.authorizationMs') || edge.includes('authzTimingPhases'))
  assert('CORS exposes server-timing', cors.includes('Access-Control-Expose-Headers'))
  assert('buildServerTimingHeader has no PII fields', !/buildServerTimingHeader[\s\S]{0,200}email/.test(cors))

  console.log('Stage 6: Security status codes')
  assert('missing bearer → 401', /getBearerToken[\s\S]*?unauthorized',\s*401/.test(auth) || auth.includes("adminErrorResponse('unauthorized', 401)"))
  assert('inactive → 403', auth.includes("adminErrorResponse('inactive_caller', 403)"))
  assert('forbidden path → 403', auth.includes("adminErrorResponse('forbidden', 403)"))
  assert('own scope cannot request other', edge.includes('requestedEmployeeId !== caller.id'))
  assert('home-summary requires team', /case 'home-summary':[\s\S]*?hasTeam/.test(edge) || /case 'dashboard':\s*\n\s*case 'home-summary':/.test(edge))
  assert('unknown view rejected', edge.includes("'invalid_view'"))
  assert('authz error is not empty success', !/if \(authzResult instanceof Response\)[\s\S]{0,80}employees:\s*\[\]/.test(edge))

  console.log('Stage 7: Contracts preserved')
  assert('home-summary contract', edge.includes("'home-summary'") && edge.includes('HOME_SUMMARY_SHIFT_SELECT'))
  assert('response still employees+shifts', edge.includes('employees,') && edge.includes('shifts,'))
  assert('OwnerDashboard uses home summary', owner.includes('fetchHomeWorkforceSummary'))
  assert('Schedule uses schedule view', schedule.includes("view: 'schedule'"))
  assert('Profile bundle retained', profile.includes('fetchEmployeeWorkforceBundle'))
  assert('Stage 3 coalesce retained', coalesce.includes('export function coalesceInFlight'))
  assert('service coalesce key retained', service.includes('admin-team-workforce-data:${sessionUserId}:'))
  assert('time tracker uses separate authorize', tracker.includes('authorizeAuthenticatedEmployee'))
  assert('no select * on workforce employees', !edge.includes(".select('*')"))
  assert('HOME_SUMMARY selects lean', fields.includes('HOME_SUMMARY_EMPLOYEE_SELECT'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
