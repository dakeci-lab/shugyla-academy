#!/usr/bin/env node
/**
 * Stage 2 static + contract verification: position_id in employee data layer.
 *
 * Usage:
 *   npm run verify:position-structure-data-layer
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
  console.log('=== Position structure data-layer verification ===\n')

  const employeeFields = read('supabase/functions/_shared/employeeFields.ts')
  const employeePositions = read('supabase/functions/_shared/employeePositions.ts')
  const workforceFields = read('supabase/functions/_shared/workforceFields.ts')
  const createFn = read('supabase/functions/admin-create-employee/index.ts')
  const updateFn = read('supabase/functions/admin-update-employee/index.ts')
  const listFn = read('supabase/functions/admin-list-employees/index.ts')
  const workforceFn = read('supabase/functions/admin-team-workforce-data/index.ts')
  const employeeData = read('src/utils/employeeData.js')
  const adminService = read('src/services/employeeAdminService.js')
  const catalogService = read('src/services/positionCatalogService.js')
  const authService = read('src/services/authService.js')
  const adapter = read('src/services/supabaseDataAdapter.js')
  const modal = read('src/components/admin/employees/EmployeeEditModal.jsx')
  const pkg = read('package.json')

  assert('shared position helper exists', employeePositions.includes('resolveActivePositionForAssignment'))
  assert('role-name mapping helper', employeePositions.includes('resolvePositionByRoleName'))
  assert('ambiguous mapping code', employeePositions.includes('position_mapping_ambiguous'))
  assert('SAFE select includes position_id', employeeFields.includes('position_id'))
  assert('mapSafeEmployee accepts catalog', employeeFields.includes('catalogById'))
  assert('workforce select includes position_id', workforceFields.includes('position_id'))
  assert('list loads catalog batch', listFn.includes('loadPositionCatalogByIds'))
  assert('workforce loads catalog batch', workforceFn.includes('loadPositionCatalogByIds'))
  assert('create supports position_id', createFn.includes('resolveActivePositionForAssignment'))
  assert('create role-name fallback', createFn.includes('resolvePositionByRoleName'))
  assert('create unresolved diagnostic', createFn.includes('position_unresolved'))
  assert('update allows position_id', updateFn.includes("'position_id'"))
  assert('update ignores legacy position text', updateFn.includes('legacy_position_text_ignored'))
  assert('self cannot change position_id', updateFn.includes('Self-edit must not change position'))
  assert('diff helper does not mirror role name', !employeeData.includes("position: selectedRole?.name"))
  assert('diff helper documents independence', employeeData.includes('Role changes never include position'))
  assert('explicit positionId only in diff', employeeData.includes('Explicit positionId only'))
  assert('merge prefers cloud positionId', employeeData.includes('Cloud positionId always wins'))
  assert('local schema migration exists', employeeData.includes('migrateEmployeeLocalSchema'))
  assert('admin service maps position_id', adminService.includes('position_id'))
  assert('admin service writes position_id not bare text', adminService.includes('payloadChanges.position_id') && !adminService.includes('payloadChanges.position = changes.position'))
  assert('catalog service API', catalogService.includes('getFlatPositions') && catalogService.includes('getPositionById'))
  assert('auth profile selects position_id', authService.includes('position_id'))
  assert('auth session includes positionId', authService.includes('positionId: employee.positionId'))
  assert('adapter loads catalog once', adapter.includes('ensurePositionCatalogLoaded'))
  assert('adapter migrates local schema', adapter.includes('migrateEmployeeLocalSchema'))
  assert('local modal update does not set position from role', !modal.includes("position: selectedRole?.name || getRoleLabel(roleCode),\n            employmentStatus: form.employmentStatus,\n            hiredAt"))
  assert('verify script registered', pkg.includes('verify:position-structure-data-layer'))
  assert('no Stage 3 org-structure UI', !fs.existsSync(path.join(ROOT, 'src/pages/platform/PositionStructurePage.jsx')))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
