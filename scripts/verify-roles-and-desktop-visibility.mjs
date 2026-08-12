#!/usr/bin/env node
/**
 * Verification for two fixes:
 *   1. desktop-only modules are gated by viewport width only (launch mode
 *      no longer hides «Закупки» / «Товары» on a full-size screen);
 *   2. roles cannot share a display name any more, and the four employee-less
 *      duplicates are removed by migration.
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
const PRICE_CHECKER = 'src/pages/platform/products/PriceCheckerPage.jsx'
const ROLE_EDITOR = 'src/components/admin/roles/useRoleEditor.jsx'
const MIGRATION = 'supabase/migrations/20260812052000_roles_dedupe_and_unique_name.sql'

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

  const sources = [read(GATE), read(TOP_NAV), read(DASHBOARD), read(PRICE_CHECKER)]
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
  assert('preflight refuses when an employee is attached', /raise exception[\s\S]{0,120}still has/.test(sql))
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
  assert('no employee row is modified', !/update public\.academy_users/i.test(sql))

  console.log('')
}

async function main() {
  console.log('=== Roles and desktop visibility verification ===\n')
  await stageVisibilityRule()
  await stageRoleNames()
  stageMigration()
  console.log(`=== All ${checks} checks passed ===\n`)
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}\n`)
  process.exit(1)
})
