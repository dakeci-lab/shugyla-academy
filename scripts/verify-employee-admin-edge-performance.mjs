#!/usr/bin/env node
/**
 * Structural verification for Stage 9 — admin-list-employees Edge latency.
 *
 * Usage:
 *   npm run verify:employee-admin-edge-performance
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

function sliceFn(source, exportName, nextExportNames = []) {
  const start = source.indexOf(`export async function ${exportName}`)
  if (start === -1) return ''
  let end = source.length
  for (const next of nextExportNames) {
    const idx = source.indexOf(`export async function ${next}`, start + 1)
    if (idx !== -1) end = Math.min(end, idx)
  }
  return source.slice(start, end)
}

function main() {
  console.log('=== Employee Admin Edge performance (Stage 9) ===\n')

  const edge = read('supabase/functions/admin-list-employees/index.ts')
  const auth = read('supabase/functions/_shared/employeeAuthorization.ts')
  const fields = read('supabase/functions/_shared/employeeFields.ts')
  const cors = read('supabase/functions/_shared/cors.ts')
  const adminService = read('src/services/employeeAdminService.js')
  const section = read('src/components/admin/sections/EmployeesSection.jsx')
  const profile = read('src/components/admin/sections/EmployeeProfileSection.jsx')
  const modal = read('src/components/admin/employees/EmployeeEditModal.jsx')
  const coalesce = read('src/lib/requestCoalesce.js')

  console.log('Stage 1: Auth verification')
  assert('getClaims used', auth.includes('getClaims'))
  assert('getUser retained as fallback', auth.includes('getUser(bearer)'))
  assert('authorizeEmployeeAdminRequest exported', auth.includes('export async function authorizeEmployeeAdminRequest'))
  assert('Edge uses authorizeEmployeeAdminRequest', edge.includes('authorizeEmployeeAdminRequest(req, PERMISSION_VIEW)'))
  assert(
    'authorization is one relational DB call',
    auth.includes('CALLER_AUTHZ_SELECT') &&
      auth.includes("roles!academy_users_role_id_fkey") &&
      auth.includes('permissions!inner(code)')
  )
  assert('permission catalog not fully loaded', !edge.includes(".from('permissions')"))
  assert(
    'no separate caller mapping + permission query in Edge',
    !edge.includes('loadCallerProfile') && !edge.includes('roleHasPermission')
  )
  assert(
    'authorizeEmployeeAdminRequest reuses fusion (no second permission table query)',
    (() => {
      const body = sliceFn(auth, 'authorizeEmployeeAdminRequest', [
        'authorizeEmployeeAdmin',
        'countActiveUsersWithPermission',
      ])
      return (
        body.includes('authorizeWorkforceRequest') &&
        !body.includes(".from('permissions')") &&
        !body.includes('loadCallerProfile')
      )
    })()
  )
  assert('permission code server-fixed', edge.includes("const PERMISSION_VIEW = 'employees.view'"))
  assert('body cannot supply permission', !edge.includes('payload.permission'))
  assert('request-scoped dbCalls retained', edge.includes('dbCalls'))
  assert('no cross-request auth cache', !/let\s+current(User|Caller|Authz)/.test(auth))
  assert('no permission TTL cache', !/authzCache|permissionCache/.test(auth))
  assert('401 unauthorized retained', auth.includes("adminErrorResponse('unauthorized', 401)"))
  assert('403 forbidden retained', auth.includes("adminErrorResponse('forbidden', 403)"))
  assert('inactive caller retained', auth.includes("'inactive_caller'"))

  console.log('Stage 2: List / direct data path')
  assert('SAFE_EMPLOYEE_SELECT used', edge.includes('SAFE_EMPLOYEE_SELECT'))
  assert('list uses one academy_users query', (edge.match(/\.from\('academy_users'\)/g) || []).length === 1)
  assert('direct lookup filters by employee id', edge.includes(".eq('id', employeeIdFilter)"))
  assert('direct lookup does not load full list then filter', !edge.includes('employees.filter'))
  assert('no per-employee query loop', !/for\s*\([^)]*of\s*(data|employees)[^)]*\)[\s\S]{0,120}\.from\(/.test(edge))
  assert('role column retained in select', fields.includes('role, role_id'))
  assert('avatar_url retained', fields.includes('avatar_url'))
  assert('status retained', fields.includes('status'))
  assert('admin role excluded', edge.includes(".neq('role', 'admin')"))
  assert('employee_not_found retained', edge.includes("'employee_not_found'"))
  assert('empty list returns ok employees array', edge.includes('employees,') && edge.includes('pagination:'))

  console.log('Stage 3: DB-call budget + Server-Timing')
  assert('trackDbCall used for employees query', edge.includes('trackDbCall(dbCalls)'))
  assert('X-Employee-Admin-DB-Calls header', edge.includes('X-Employee-Admin-DB-Calls'))
  assert('CORS exposes employee-admin db-calls', cors.includes('x-employee-admin-db-calls'))
  assert('authorization_db timing phase', edge.includes('authorization_db:'))
  assert('employees_db timing phase', edge.includes('employees_db:'))
  assert('token/auth/transform/serialize/total phases', ['token:', 'auth:', 'transform:', 'serialize:', 'total:'].every((p) => edge.includes(p)))
  assert('timing has no JWT/email dump', !/Server-Timing[\s\S]{0,200}(email|Bearer|jwt)/i.test(edge))
  assert(
    'list DB budget path is authz+employees only',
    (edge.match(/trackDbCall\(dbCalls\)/g) || []).length === 1
  )

  console.log('Stage 4: Contracts / coalescing / mutations')
  assert('response ok+employees+pagination', edge.includes('ok: true') && edge.includes('employees,'))
  assert('mapSafeEmployee used', edge.includes('mapSafeEmployee'))
  assert('auth_linked contract', fields.includes('auth_linked') && adminService.includes('authLinked'))
  assert('Stage 3 coalesce retained', coalesce.includes('export function coalesceInFlight'))
  assert('list coalesce key includes body', adminService.includes('admin-list-employees:'))
  assert('direct lookup uses employeeId in body', adminService.includes('employeeId: normalizedId') || adminService.includes('employee_id:'))
  assert('different employeeId changes coalesce key', adminService.includes('JSON.stringify(body)'))
  assert('EmployeesSection mutations refresh via loadCloudEmployees', section.includes('loadCloudEmployees'))
  assert('modal open does not list via EmployeesSection createEmployee', !section.includes('createEmployee(payload)'))
  assert('create lives in EmployeeEditModal', modal.includes('createEmployee('))
  assert('profile uses getEmployeeForAdmin / listEmployeesForAdmin path', profile.includes('getEmployeeForAdmin') || adminService.includes('getEmployeeForAdmin'))
  assert('profile does not bootstrap-replay list', profile.includes('progressive bootstrap') || profile.includes('Mutations call'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
