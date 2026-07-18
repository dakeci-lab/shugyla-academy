#!/usr/bin/env node
/**
 * Structural verification for Stage 4 — admin-team-workforce-data latency hygiene.
 *
 * Usage:
 *   npm run verify:workforce-edge-performance
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
  console.log('=== Workforce Edge performance verification (Stage 4) ===\n')

  const edge = read('supabase/functions/admin-team-workforce-data/index.ts')
  const auth = read('supabase/functions/_shared/employeeAuthorization.ts')
  const fields = read('supabase/functions/_shared/workforceFields.ts')
  const service = read('src/services/workforceAdminService.js')
  const owner = read('src/components/admin/OwnerDashboard.jsx')
  const coalesce = read('src/lib/requestCoalesce.js')

  console.log('Stage 1: Auth / RBAC batching')
  assert(
    'authorizeWorkforceRequest used once path',
    edge.includes('authorizeWorkforceRequest(req,') || edge.includes('authorizeAuthenticatedEmployee(req)')
  )
  assert('batch roleHasPermissionCodes exported', auth.includes('export async function roleHasPermissionCodes'))
  assert(
    'Edge resolves permissions via authorizeWorkforceRequest or roleHasPermissionCodes',
    edge.includes('authorizeWorkforceRequest') || edge.includes('roleHasPermissionCodes')
  )
  assert(
    'no triple sequential roleHasPermissionCode awaits',
    !/await roleHasPermissionCode[\s\S]*await roleHasPermissionCode[\s\S]*await roleHasPermissionCode/.test(
      edge
    )
  )

  console.log('Stage 2: Parallel / scoped queries')
  assert('employee_id allowed in body', edge.includes("'employee_id'"))
  assert(
    'scoped workforce fused or parallel',
    edge.includes('WORKFORCE_EMPLOYEE_WITH_SHIFTS_SELECT') ||
      edge.includes('Promise.all([employeeQuery, shiftQuery])')
  )
  assert(
    'team path avoids N+1 employee loops',
    !/for \(const .+ of employees\)[\s\S]{0,120}await /.test(edge)
  )
  assert('no employee loop query pattern', !/for \(const .+ of employees\)[\s\S]{0,120}await /.test(edge))

  console.log('Stage 3: Query narrowing + date filters')
  assert(
    'employees use WORKFORCE_EMPLOYEE_SELECT or fused nest',
    edge.includes('WORKFORCE_EMPLOYEE_WITH_SHIFTS_SELECT') || edge.includes('WORKFORCE_EMPLOYEE_SELECT')
  )
  assert(
    'shifts use WORKFORCE_SHIFT_SELECT fields',
    fields.includes('WORKFORCE_SHIFT_SELECT') &&
      (edge.includes('WORKFORCE_EMPLOYEE_WITH_SHIFTS_SELECT') || edge.includes('WORKFORCE_SHIFT_SELECT'))
  )
  assert('no select * on employees', !edge.includes(".select('*')"))
  assert(
    'shifts filtered by date range',
    edge.includes(".gte('academy_employee_shifts.shift_date', dateFrom)") ||
      edge.includes(".gte('shift_date', dateFrom)")
  )
  assert(
    'shifts filtered by date upper bound',
    edge.includes(".lte('academy_employee_shifts.shift_date', dateTo)") ||
      edge.includes(".lte('shift_date', dateTo)")
  )
  assert(
    'break columns omitted from SELECT',
    !/WORKFORCE_SHIFT_SELECT\s*=\s*'[^']*planned_break/.test(fields)
  )
  assert(
    'shift mapper keeps break keys',
    fields.includes('planned_break_start:') && fields.includes('actual_break_end:')
  )

  console.log('Stage 4: Frontend Home + profile scoping')
  assert(
    'Home dashboard uses day summary or selected day range',
    owner.includes('fetchHomeWorkforceSummary(selectedDateKey)') ||
      (owner.includes('dateFrom: selectedDateKey') && owner.includes('dateTo: selectedDateKey'))
  )
  assert('service accepts employeeId', service.includes('employeeId = null'))
  assert('service sends employee_id', service.includes('body.employee_id = normalizedEmployeeId'))
  assert(
    'bundle passes employeeId to month fetch',
    /fetchTeamWorkforceForMonth\(year, month, view, normalizedId\)/.test(service)
  )
  assert(
    'coalesce key includes employee scope',
    service.includes("${normalizedEmployeeId ?? 'team'}")
  )
  assert('coalesce util still present', coalesce.includes('export function coalesceInFlight'))

  console.log('Stage 5: Contract + security markers')
  assert('response still returns employees and shifts', edge.includes('employees,') && edge.includes('shifts,'))
  assert('team_scope preserved', edge.includes('team_scope: scopeResult.teamScope'))
  assert('own-scope cannot request other employee', edge.includes('requestedEmployeeId !== caller.id'))
  assert(
    '401 unauthorized path via authorize',
    edge.includes('authorizeWorkforceRequest') || edge.includes('authorizeAuthenticatedEmployee')
  )
  assert('timing log has no email field', !/admin_team_workforce_timing[\s\S]{0,400}email/.test(edge))
  assert('MAX_RANGE_DAYS retained', edge.includes('MAX_RANGE_DAYS'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
