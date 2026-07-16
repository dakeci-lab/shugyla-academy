#!/usr/bin/env node
/**
 * Static verification for employee create form stability, password policy, and error UX.
 *
 * Usage:
 *   npm run verify:employee-create-fix
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
  console.log('=== Employee create fix verification ===\n')

  const section = read('src/components/admin/sections/EmployeesSection.jsx')
  const createFn = read('supabase/functions/admin-create-employee/index.ts')
  const provisioning = read('src/services/employeeProvisioningService.js')
  const adminList = read('src/services/employeeAdminService.js')
  const workforce = read('src/services/workforceAdminService.js')
  const edgeErrors = read('src/utils/edgeFunctionErrors.js')
  const passwordValidation = read('src/utils/employeePasswordValidation.js')

  console.log('Stage 1: Form stability')
  assert('candidate init tracks active candidate ref', section.includes('activeCandidateIdRef'))
  assert('form touched ref present', section.includes('formTouchedRef'))
  assert('patchForm marks touched', section.includes('formTouchedRef.current = true'))
  assert('candidate changed guard', section.includes('candidateChanged'))
  assert('no unconditional setForm on version only', !section.match(/setForm\(\{\s*\.\.\.EMPTY_EMPLOYEE_FORM[\s\S]*?\}\)\s*\n\s*setFormError\(''\)\s*\n\s*setShowForm\(true\)\s*\n\s*\}, \[searchParams, version\]\)/))

  console.log('Stage 2: Password policy')
  assert('frontend min password constant is 6', edgeErrors.includes('MIN_EMPLOYEE_TEMP_PASSWORD_LENGTH = 6'))
  assert('frontend rejects short password message', passwordValidation.includes('минимум 6 символов'))
  assert('edge function min password is 6', createFn.includes('MIN_PASSWORD_LENGTH = 6'))
  assert('no 12-char password requirement in section', !section.includes('12 символ'))
  assert('html minLength uses shared constant', section.includes('minLength={MIN_EMPLOYEE_TEMP_PASSWORD_LENGTH}'))

  console.log('Stage 3: Error handling')
  assert('shared invoke context parser', edgeErrors.includes('parseFunctionInvokeContext'))
  assert('provisioning maps generic invoke error', provisioning.includes('isGenericInvokeErrorMessage'))
  assert('admin list maps generic invoke error', adminList.includes('isGenericInvokeErrorMessage'))
  assert('workforce maps generic invoke error', workforce.includes('isGenericInvokeErrorMessage'))
  assert('no raw invoke error shown in provisioning fallback', provisioning.includes('Не удалось создать сотрудника'))

  console.log('Stage 4: Create hardening')
  assert('role validated before create in UI', section.includes('Выбранная роль недоступна'))
  assert('success after candidate link', section.includes("setSuccessMessage('Сотрудник успешно создан')"))
  assert('source candidate id sent to provisioning', provisioning.includes('source_candidate_id'))
  assert('edge function idempotent login path', createFn.includes('idempotent: true'))
  assert('edge function role validated before auth', createFn.match(/targetRole[\s\S]*createUser/))
  assert('safe list mapping', adminList.includes('listDefault'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
