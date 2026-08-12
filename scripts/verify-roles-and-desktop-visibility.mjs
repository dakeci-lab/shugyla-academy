#!/usr/bin/env node
/**
 * Verification for two fixes:
 *   1. desktop-only modules are gated by viewport width only (launch mode
 *      no longer hides «Закупки» / «Товары» on a full-size screen);
 *   2. roles cannot share a display name any more, and the four leftover
 *      duplicate/junk roles are removed by migration — including the two
 *      terminated demo assignments that had to be detached first.
 *
 * Usage:
 *   npm run verify:roles-and-desktop-visibility
 */

import fs from 'fs'
import path from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

const GATE = 'src/platform/desktopWebOnly.js'
const ROUTE = 'src/components/platform/DesktopWebOnlyRoute.jsx'
const TOP_NAV = 'src/components/platform/PlatformDesktopNav.jsx'
const DASHBOARD = 'src/pages/platform/PlatformDashboard.jsx'
const ROLE_EDITOR = 'src/components/admin/roles/useRoleEditor.jsx'
const MIGRATION = 'supabase/migrations/20260812085658_roles_dedupe_and_unique_name.sql'
const ACCESS_MIGRATION =
  'supabase/migrations/20260812085722_finance_cleanup_trainee_and_accountant_access.sql'

let checks = 0

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  if (!condition) fail(`${name}${detail ? ` — ${detail}` : ''}`)
  checks += 1
  console.log(`  ✓ ${name}`)
}

function read(relPath) {
  const full = path.join(ROOT, relPath)
  if (!fs.existsSync(full)) fail(`file not found: ${relPath}`)
  return fs.readFileSync(full, 'utf8')
}

async function load(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href)
}

async function stageVisibilityRule() {
  console.log('Stage 1: Desktop-only gate')

  const gate = await load(GATE)
  const { isDesktopWebOnlyBlocked, shouldHideDesktopWebOnlyLink, DESKTOP_WEB_ONLY_MESSAGE } = gate

  assert('wide screen is never blocked', !isDesktopWebOnlyBlocked({ isDesktopViewport: true }))
  assert('narrow screen is blocked', isDesktopWebOnlyBlocked({ isDesktopViewport: false }))
  assert(
    'launch mode no longer matters',
    !isDesktopWebOnlyBlocked({ isDesktopViewport: true, pwaStandalone: true }),
    'an installed app on a computer is a desktop surface'
  )
  assert('explanation text is Russian', /[А-Яа-яЁё]/.test(DESKTOP_WEB_ONLY_MESSAGE))

  const prefixes = ['/platform/procurement']
  assert(
    'dashboard tiles stay on a wide screen',
    !shouldHideDesktopWebOnlyLink('/platform/procurement', { isDesktopViewport: true }, prefixes)
  )
  assert(
    'dashboard tiles hide on a narrow screen',
    shouldHideDesktopWebOnlyLink('/platform/procurement', { isDesktopViewport: false }, prefixes)
  )

  const sources = [read(GATE), read(TOP_NAV), read(DASHBOARD)]
  assert(
    'no surface decides visibility by standalone mode',
    sources.every((src) => !src.includes('isPwaStandalone')),
    'that check is what hid the section on a full-size screen'
  )

  const route = read(ROUTE)
  assert('the blocked route explains itself', route.includes('DESKTOP_WEB_ONLY_MESSAGE'))
  assert(
    'the blocked route no longer redirects silently',
    !route.includes('<Navigate'),
    'a silent redirect is indistinguishable from a bug'
  )
  assert('the blocked route offers a way out', route.includes('to="/platform"'))

  console.log('')
}

async function stageRoleNames() {
  console.log('Stage 2: Duplicate role names')

  const { findRoleByName, describeRoleNameConflict, normalizeRoleName, isRoleNameUniqueViolation } =
    await load('src/utils/roleNameConflict.js')

  const roles = [
    { id: 'r1', name: 'Финансист', isActive: true },
    { id: 'r2', name: 'Закупщик', isActive: false },
  ]

  assert('exact name collides', findRoleByName(roles, 'Финансист')?.id === 'r1')
  assert('case is not a difference', findRoleByName(roles, 'финансист')?.id === 'r1')
  assert('padding is not a difference', findRoleByName(roles, '  Финансист  ')?.id === 'r1')
  assert('inner spacing is normalized', normalizeRoleName('Категорийный   менеджер') === 'категорийный менеджер')
  assert('a free name does not collide', findRoleByName(roles, 'Кладовщик') === null)
  assert('empty name never collides', findRoleByName(roles, '   ') === null)
  assert(
    'renaming a role does not collide with itself',
    findRoleByName(roles, 'Финансист', { exceptRoleId: 'r1' }) === null
  )
  assert(
    'a disabled twin suggests enabling it',
    /отключена/i.test(describeRoleNameConflict(roles[1]))
  )
  assert(
    'an active twin asks for another name',
    /другое название/i.test(describeRoleNameConflict(roles[0]))
  )
  assert(
    'the database violation is recognized',
    isRoleNameUniqueViolation({ message: 'duplicate key value violates unique constraint "roles_name_norm_uidx"' })
  )
  assert(
    'an unrelated error is not mistaken for it',
    !isRoleNameUniqueViolation({ message: 'network timeout' })
  )

  const editor = read(ROLE_EDITOR)
  assert('the editor blocks a duplicate before saving', /findRoleByName\(roles, form\.name/.test(editor))
  assert(
    'the editor maps the database violation too',
    /isRoleNameUniqueViolation\(err\)/.test(editor),
    'two admins can create the same name at once'
  )

  console.log('')
}

function stageMigration() {
  console.log('Stage 3: Cleanup migration')

  const sql = read(MIGRATION)

  for (const code of ['finansist', 'kategoriynyy_menedzher', 'testovaya_rol_rbac', 'purchaser']) {
    assert(`${code} is scheduled for deletion`, sql.includes(`'${code}'`))
  }

  assert(
    'preflight counts employees of every status',
    /from public\.academy_users u[\s\S]{0,200}where r\.code = v_code/.test(sql) &&
      !/u\.status = 'active'/.test(sql),
    'the audit query only counted active employees'
  )
  assert(
    'preflight refuses when any other employee is attached',
    /still has % employee\(s\) of any status/.test(sql)
  )
  assert('the unique index is created', /create unique index if not exists roles_name_norm_uidx/.test(sql))
  assert(
    'the index normalizes the name',
    /roles \(lower\(btrim\(name\)\)\)/.test(sql)
  )
  assert(
    'remaining duplicates abort the migration',
    /duplicate role name\(s\) remain/.test(sql),
    'creating the index would fail anyway — better to say why'
  )

  // One terminated demo record blocked the cleanup. Detaching it is allowed;
  // reaching any other employee is not.
  assert(
    'the demo assignment is detached by id, name, status and current role together',
    /update public\.academy_users[\s\S]{0,400}u\.id = 17[\s\S]{0,300}'Тест RBAC'[\s\S]{0,300}'terminated'[\s\S]{0,300}'testovaya_rol_rbac'/.test(sql),
    'a partial match could hit somebody else'
  )
  assert(
    'the detach only clears role_id',
    /update public\.academy_users[\s\S]{0,120}set role_id = null/.test(sql)
  )
  assert(
    'no employee row is ever deleted',
    !/delete\s+from\s+public\.academy_users/i.test(sql),
    'history stays even when the role goes'
  )
  assert(
    'the only employee write targets that one id',
    (sql.match(/update public\.academy_users/gi) || []).length === 1
  )

  console.log('')
}

async function stageFinanceAndAccountant() {
  console.log('Stage 4: Finance removal, trainee, accountant access')

  const catalog = await load('src/config/permissionCatalog.js')
  const { PERMISSION_CODES, PERMISSION_CATALOG, PERMISSION_MODULES, RBAC_MATRIX_MODULES } = catalog

  assert('finance codes are gone', !('FINANCE_VIEW' in PERMISSION_CODES) && !('FINANCE_MANAGE' in PERMISSION_CODES))
  assert(
    'no catalog entry belongs to the finance module',
    PERMISSION_CATALOG.every((entry) => entry.module !== 'finance')
  )
  assert('the finance module label is gone', !('finance' in PERMISSION_MODULES))
  assert(
    'no finance code survives anywhere in the catalog',
    !PERMISSION_CATALOG.some((entry) => String(entry.code).startsWith('finance.'))
  )

  // Payroll rights were ungrantable through the UI: the module was missing from
  // the matrix, which is why the accountant had to be fixed by migration.
  assert('payroll is now part of the access matrix', RBAC_MATRIX_MODULES.includes('payroll'))
  assert('finance is not in the matrix', !RBAC_MATRIX_MODULES.includes('finance'))
  assert(
    'every matrix module has at least one permission',
    RBAC_MATRIX_MODULES.every((module) =>
      PERMISSION_CATALOG.some((entry) => entry.module === module)
    )
  )

  const permissionsSrc = read('src/config/permissions.js')
  assert(
    'payroll route no longer accepts finance.view',
    /EMPLOYEES_PAYROLL\]: \[P\.PAYROLL_VIEW\]/.test(permissionsSrc)
  )
  assert('no finance code left in access rules', !/FINANCE_/.test(permissionsSrc))

  const sql = read(ACCESS_MIGRATION)
  assert('migration drops both finance permissions', /'finance\.view', 'finance\.manage'/.test(sql))
  assert('migration deletes the trainee role', /delete from public\.roles where code = 'trainee'/.test(sql))
  assert(
    'trainee deletion is guarded by an employee count',
    /role trainee still has % employee\(s\) of any status/.test(sql)
  )
  for (const code of [
    'payroll.view',
    'payroll.calculate',
    'umag.settlements.view',
    'umag.reconciliations.view',
    'supplier_payments.view',
    'supplier_payments.manage',
  ]) {
    assert(`accountant receives ${code}`, sql.includes(`'${code}'`))
  }
  assert(
    'unknown permission codes abort the migration',
    /unknown permission code\(s\)/.test(sql),
    'a typo must not silently grant less'
  )
  assert('accountant grant is verified afterwards', /Postcheck failed: accountant has/.test(sql))

  assert(
    'the trainee demo assignment is detached by id, name, status and current role together',
    /update public\.academy_users[\s\S]{0,400}u\.id = 6[\s\S]{0,300}'Алина Жумабаева'[\s\S]{0,300}'terminated'[\s\S]{0,300}'trainee'/.test(sql),
    'a partial match could hit somebody else'
  )
  assert(
    'the trainee detach only clears role_id',
    /update public\.academy_users[\s\S]{0,120}set role_id = null/.test(sql)
  )
  assert(
    'no employee row is ever deleted',
    !/delete\s+from\s+public\.academy_users/i.test(sql),
    'a terminated employee keeps their record'
  )
  assert(
    'the only employee write targets that one id',
    (sql.match(/update public\.academy_users/gi) || []).length === 1
  )
  assert(
    'any other trainee assignment still stops the migration',
    /role trainee still has % employee\(s\) of any status/.test(sql)
  )

  // Every code the accountant gets must exist in the catalog, or the migration
  // would fail on production instead of here.
  const catalogCodes = new Set(PERMISSION_CATALOG.map((entry) => entry.code))
  const granted = [...sql.matchAll(/'([a-z_]+(?:\.[a-z_]+)+)'/g)]
    .map((match) => match[1])
    .filter((code) => !code.startsWith('finance.') && code.includes('.'))
  assert(
    'granted codes all exist in the catalog',
    granted.every((code) => catalogCodes.has(code)),
    granted.filter((code) => !catalogCodes.has(code)).join(', ')
  )

  console.log('')
}

async function main() {
  console.log('=== Roles and desktop visibility verification ===\n')
  await stageVisibilityRule()
  await stageRoleNames()
  stageMigration()
  await stageFinanceAndAccountant()
  console.log(`=== All ${checks} checks passed ===\n`)
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}\n`)
  process.exit(1)
})
