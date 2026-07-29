#!/usr/bin/env node
/**
 * Static verification: self-edit allows safe HR fields, protects role/status by value.
 *
 * Usage:
 *   npm run verify:employee-self-edit
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
  console.log('=== Employee self-edit protection verification ===\n')

  const edge = read('supabase/functions/admin-update-employee/index.ts')
  const modal = read('src/components/admin/employees/EmployeeEditModal.jsx')
  const data = read('src/utils/employeeData.js')
  const service = read('src/services/employeeAdminService.js')
  const pkg = read('package.json')

  assert('edge value-based self role check', edge.includes('requestedRoleId') && edge.includes('self_role_change_forbidden'))
  assert('edge value-based self status check', edge.includes('requestedStatus') && edge.includes('self_status_change_forbidden'))
  assert('edge strips unchanged protected keys', edge.includes('delete changes.role_id') && edge.includes('delete changes.status'))
  assert('payroll_participation is allowed change key', edge.includes("'payroll_participation'"))
  assert('salary_calculation_type is allowed change key', edge.includes("'salary_calculation_type'"))
  assert('work_mode is allowed change key', edge.includes("'work_mode'"))
  assert('hired_at is allowed change key', edge.includes("'hired_at'"))
  assert('diff helper exists', data.includes('buildEmployeeCloudUpdateChanges'))
  assert('diff omits self role/status', data.includes('if (!editingSelf)') && data.includes('changes.roleId') && data.includes('changes.employmentStatus'))
  assert('modal uses diff helper', modal.includes('buildEmployeeCloudUpdateChanges'))
  assert('modal skips empty diff', modal.includes("Object.keys(changes).length === 0"))
  assert('error mentions основной статус', service.includes('основной статус'))
  assert('role hint for self', modal.includes('Собственную роль нельзя изменить'))
  assert('status hint for self', modal.includes('Собственный статус сотрудника нельзя изменить'))
  assert('verify script registered', pkg.includes('verify:employee-self-edit'))

  // Lightweight behavioral mirror of the diff helper contract
  assert(
    'diff helper documents self-edit omission',
    data.includes('For self-edit never includes roleId / employmentStatus'),
  )

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
