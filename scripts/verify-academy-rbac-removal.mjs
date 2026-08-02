#!/usr/bin/env node
/**
 * Stage 5 verification: Academy Learning feature flag + frontend RBAC removed.
 *
 * Usage:
 *   node scripts/verify-academy-rbac-removal.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  PERMISSION_CODES,
  PERMISSION_CATALOG,
  PERMISSION_MODULES,
  RBAC_MATRIX_MODULES,
  getRbacMatrixModules,
  isKnownPermissionCode,
  resolvePermissionCode,
} from '../src/config/permissionCatalog.js'
import { PERMISSIONS, ROLES } from '../src/data/roles.js'

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

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath))
}

function main() {
  console.log('=== Academy feature flags & permissions removal (Stage 5) ===\n')

  console.log('Feature flag')
  assert('featureFlags.js removed', !exists('src/config/featureFlags.js'))
  assert(
    'no ACADEMY_MODULE_ENABLED in src',
    !read('src/config/permissions.js').includes('ACADEMY_MODULE_ENABLED') &&
      !read('src/config/permissionCatalog.js').includes('isAcademyModuleEnabled'),
  )
  assert(
    'no isAcademyFeatureRouteKey in permissions',
    !read('src/config/permissions.js').includes('isAcademyFeatureRouteKey'),
  )
  assert(
    '.env.example has no VITE_ENABLE_ACADEMY',
    !read('.env.example').includes('VITE_ENABLE_ACADEMY'),
  )

  console.log('\nPermission catalog')
  assert('no academy.view code', !Object.values(PERMISSION_CODES).includes('academy.view'))
  assert(
    'no academy.manage_courses code',
    !Object.values(PERMISSION_CODES).includes('academy.manage_courses'),
  )
  assert(
    'no academy.assign_courses code',
    !Object.values(PERMISSION_CODES).includes('academy.assign_courses'),
  )
  assert(
    'catalog has no academy module entries',
    !PERMISSION_CATALOG.some((item) => item.module === 'academy' || String(item.code).startsWith('academy.')),
  )
  assert('standards.view present', PERMISSION_CODES.STANDARDS_VIEW === 'standards.view')
  assert('standards.manage present', PERMISSION_CODES.STANDARDS_MANAGE === 'standards.manage')
  assert('standards module label present', PERMISSION_MODULES.standards === 'База стандартов')
  assert('no academy module label', !Object.prototype.hasOwnProperty.call(PERMISSION_MODULES, 'academy'))
  assert('RBAC matrix has no academy', !RBAC_MATRIX_MODULES.includes('academy'))
  assert('getRbacMatrixModules has standards', getRbacMatrixModules().includes('standards'))
  assert('getRbacMatrixModules has no academy', !getRbacMatrixModules().includes('academy'))

  console.log('\nUnknown permission handling')
  assert('academy.view is unknown', !isKnownPermissionCode('academy.view'))
  assert('academy.manage is unknown', !isKnownPermissionCode('academy.manage'))
  assert('standards.view is known', isKnownPermissionCode('standards.view'))
  assert(
    'resolvePermissionCode does not revive academy.manage',
    resolvePermissionCode('academy.manage') === 'academy.manage',
  )
  const adapter = read('src/services/rbacSupabaseAdapter.js')
  assert(
    'supabase adapter filters unknown catalog codes',
    adapter.includes('catalogCodes.has(perm.code)') || adapter.includes('mergeCatalogPermissions'),
  )
  const sessionCtx = read('src/context/SessionContext.jsx')
  assert(
    'session filters unknown permission codes',
    sessionCtx.includes('isKnownPermissionCode'),
  )

  console.log('\nRoute keys')
  const permissionsSrc = read('src/config/permissions.js')
  assert('no ROUTE_KEYS.ACADEMY', !permissionsSrc.includes("ACADEMY: 'academy'"))
  assert('no ROUTE_KEYS.ACADEMY_GROUP', !permissionsSrc.includes("ACADEMY_GROUP: 'academy_group'"))
  assert('no ROUTE_KEYS.ACADEMY_MANAGE', !permissionsSrc.includes("ACADEMY_MANAGE: 'academy_manage'"))
  assert('STANDARDS route key present', permissionsSrc.includes("STANDARDS: 'standards'"))
  assert(
    'STANDARDS_MANAGE route key present',
    permissionsSrc.includes("STANDARDS_MANAGE: 'standards_manage'"),
  )
  assert('no academy-group filter', !permissionsSrc.includes('academy-group'))
  assert('no canManageAcademy helper', !permissionsSrc.includes('canManageAcademy'))
  assert(
    'PlatformRoute default is HOME',
    read('src/components/platform/PlatformRoute.jsx').includes('routeKey = ROUTE_KEYS.HOME'),
  )

  console.log('\nStatic roles')
  assert('no MANAGE_COURSES', !Object.prototype.hasOwnProperty.call(PERMISSIONS, 'MANAGE_COURSES'))
  assert('no VIEW_OWN_COURSES', !Object.prototype.hasOwnProperty.call(PERMISSIONS, 'VIEW_OWN_COURSES'))
  assert('no PASS_TESTS', !Object.prototype.hasOwnProperty.call(PERMISSIONS, 'PASS_TESTS'))
  assert('no VIEW_PROGRESS', !Object.prototype.hasOwnProperty.call(PERMISSIONS, 'VIEW_PROGRESS'))
  assert('no MANAGE_TESTS', !Object.prototype.hasOwnProperty.call(PERMISSIONS, 'MANAGE_TESTS'))
  assert('no VIEW_TEAM_CHECKLISTS', !Object.prototype.hasOwnProperty.call(PERMISSIONS, 'VIEW_TEAM_CHECKLISTS'))
  assert('MANAGE_USERS kept', PERMISSIONS.MANAGE_USERS === 'manage_users')
  const allStaticPerms = Object.values(ROLES).flatMap((role) => role.permissions)
  assert(
    'static roles have no learning permissions',
    !allStaticPerms.some((p) =>
      ['manage_courses', 'view_own_courses', 'pass_tests', 'view_progress', 'manage_tests', 'view_team_checklists'].includes(p),
    ),
  )

  console.log('\nRedirect routes preserved')
  const app = read('src/App.jsx')
  assert('platform academy redirect', app.includes('path="academy/*"') && app.includes('Navigate to="/platform"'))
  assert('platform courses redirect', app.includes('path="courses/:id"'))
  assert('/academy redirect', app.includes('path="/academy"'))
  assert('/courses/:id redirect', app.includes('path="/courses/:id"'))
  assert('/course/:id redirect', app.includes('path="/course/:id"'))
  assert('/admin/courses redirect', app.includes('path="/admin/courses"'))
  assert('/admin/tests redirect', app.includes('path="/admin/tests"'))
  assert('/admin/progress redirect', app.includes('path="/admin/progress"'))
  assert('/admin/attestation redirect', app.includes('path="/admin/attestation"'))
  assert('/admin/routes redirect', app.includes('path="/admin/routes"'))

  console.log('\nLegacy infrastructure names kept')
  assert('AcademyDataProvider kept', exists('src/context/AcademyDataContext.jsx'))
  assert(
    'AcademyDataProvider export present',
    read('src/context/AcademyDataContext.jsx').includes('AcademyDataProvider'),
  )
  assert('academyDataService kept', exists('src/services/academyDataService.js'))
  assert('useAcademyData kept', read('src/context/AcademyDataContext.jsx').includes('useAcademyData'))

  console.log('\nStandards surface kept')
  assert('PlatformStandards route file or import in App', app.includes('standards') && app.includes('ROUTE_KEYS.STANDARDS'))
  assert(
    'standards permissions in default buyer seed',
    read('src/config/permissionCatalog.js').includes('STANDARDS_VIEW'),
  )

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
