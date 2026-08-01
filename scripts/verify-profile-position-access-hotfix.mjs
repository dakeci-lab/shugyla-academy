#!/usr/bin/env node
/**
 * Hotfix 2.1 verification: authenticated profile access after position_id.
 *
 * Usage:
 *   npm run verify:profile-position-access-hotfix
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
  console.log('=== Profile position_id access hotfix verification ===\n')

  const migration = read(
    'supabase/migrations/20260801133000_restore_authenticated_profile_position_access.sql',
  )
  const phase2 = read('supabase/migrations/20260714210000_production_auth_security_cutover_phase2.sql')
  const stage1 = read('supabase/migrations/20260801124500_position_structure_foundation.sql')
  const authService = read('src/services/authService.js')
  const authUtils = read('src/utils/auth.js')
  const session = read('src/context/SessionContext.jsx')
  const rbacAdapter = read('src/services/rbacSupabaseAdapter.js')
  const loginPage = read('src/pages/Login.jsx')
  const pkg = read('package.json')

  assert('phase2 used column-level grant', phase2.includes('grant select ('))
  assert('phase2 grant lacked position_id', !phase2.includes('position_id'))
  assert('stage1 added position_id without grant', stage1.includes('add column position_id') && !stage1.includes('grant select (position_id)'))
  assert('hotfix grants position_id to authenticated', migration.includes('grant select (position_id)'))
  assert('hotfix forbids anon assertion', migration.includes("anon must not SELECT"))
  assert('hotfix keeps password locked', migration.includes('password'))
  assert('auth has without-position_id fallback', authService.includes('ACADEMY_AUTH_PROFILE_FIELDS_WITHOUT_POSITION_ID'))
  assert('auth classifies profile_forbidden', authService.includes("PROFILE_LOAD_ERROR.FORBIDDEN") || authService.includes("profile_forbidden"))
  assert('login codes include profile_forbidden', authUtils.includes("PROFILE_FORBIDDEN: 'profile_forbidden'"))
  assert('login codes include rbac_load_failed', authUtils.includes("RBAC_LOAD_FAILED: 'rbac_load_failed'"))
  assert('Login page maps profile errors safely', loginPage.includes('PROFILE_FORBIDDEN'))
  assert('SessionContext waits for Auth before RBAC', session.includes('restored?.supabaseAuthenticated'))
  assert('RBAC skips academy_users counts without session', rbacAdapter.includes('getSession()'))
  assert('verify script registered', pkg.includes('verify:profile-position-access-hotfix'))
  assert('no Stage 3A UI', !fs.existsSync(path.join(ROOT, 'src/pages/platform/OrganizationStructurePage.jsx')))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
