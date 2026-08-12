#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  generateTemporaryPassword,
  TEMP_PASSWORD_ALPHABET,
} from '../supabase/functions/_shared/tempPasswordGenerator.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(root, path), 'utf8')

const edge = read('supabase/functions/admin-reset-employee-password/index.ts')
const config = read('supabase/config.toml')
const service = read('src/services/employeeAdminService.js')
const modal = read('src/components/admin/employees/EmployeeEditModal.jsx')
const pkg = read('package.json')

function check(label, condition) {
  assert.ok(condition, label)
  console.log(`✓ ${label}`)
}

check(
  'Edge Function is registered with JWT verification',
  /\[functions\.admin-reset-employee-password\][\s\S]*?verify_jwt\s*=\s*true/.test(config)
)
check(
  'server requires the role-management permission',
  edge.includes("const PERMISSION_RESET_PASSWORD = 'employees.manage_roles'")
)
check(
  'authorization runs before target lookup',
  edge.indexOf('authorizeEmployeeAdmin(req, PERMISSION_RESET_PASSWORD)') <
    edge.indexOf(".from('academy_users')")
)
check(
  'authorization runs before request validation',
  edge.indexOf('authorizeEmployeeAdmin(req, PERMISSION_RESET_PASSWORD)') <
    edge.indexOf('await req.json()')
)
check('server rejects unknown request fields', edge.includes('ALLOWED_BODY_KEYS'))
check('server blocks self-reset', edge.includes('self_reset_forbidden'))
check('server checks active/login-capable target', edge.includes('canEmployeeLogin(target.status)'))
check('server checks linked Auth identity', edge.includes('auth_not_linked'))
check('password is changed only through Supabase Auth admin', edge.includes('auth.admin.updateUserById'))
check(
  'server never reads or writes the legacy password column',
  !edge.includes('academy_users.password') &&
    !/\.select\([^)]*password/i.test(edge) &&
    !/\.update\([^)]*password/i.test(edge)
)
check(
  'temporary password is not logged',
  !/console\.(?:log|error|warn)\([^)]*temporaryPassword/s.test(edge)
)
check('credential response disables caching', edge.includes("'Cache-Control': 'no-store, private'"))

const generated = Array.from({ length: 256 }, () => generateTemporaryPassword())
check('generator returns four readable groups', generated.every((value) => /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/.test(value)))
check(
  'generator excludes ambiguous characters',
  generated.every((value) => [...value.replaceAll('-', '')].every((char) => TEMP_PASSWORD_ALPHABET.includes(char)))
)
check('generator produces non-repeating samples', new Set(generated).size > 250)

check(
  'client invokes the reset function exactly once and does not coalesce it',
  (service.match(/functions\.invoke\('admin-reset-employee-password'/g) || []).length === 1 &&
    !service.slice(service.indexOf('resetEmployeePasswordAsAdmin')).includes('coalesceInFlight')
)
check('client maps stable reset errors', ['employee_inactive', 'auth_not_linked', 'self_reset_forbidden'].every((code) => service.includes(code)))
check('UI requires manage-roles permission', modal.includes('PERMISSION_CODES.EMPLOYEES_MANAGE_ROLES'))
check('UI hides reset for self, inactive, or unlinked employees', modal.includes('!editingSelf') && modal.includes('isActiveStaffEmployee(employee)') && modal.includes('employee.authLinked === true'))
check('UI confirms that the old password stops working', modal.includes('Текущий пароль сразу перестанет работать'))
check('UI presents a one-time copy action', modal.includes('Скопировать пароль') && modal.includes('показан только один раз'))
check('UI clears the temporary password on close or employee change', (modal.match(/setTemporaryPassword\(''\)/g) || []).length >= 3)
check(
  'temporary password is never stored in browser persistence',
  !/localStorage|sessionStorage/.test(service.slice(service.indexOf('resetEmployeePasswordAsAdmin'))) &&
    !/localStorage|sessionStorage/.test(modal.slice(modal.indexOf('handlePasswordResetConfirm')))
)
check('verification command is registered', pkg.includes('verify:admin-password-reset'))

console.log('\nAdmin temporary-password reset verification passed.')
