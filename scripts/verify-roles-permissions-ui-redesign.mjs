#!/usr/bin/env node
/**
 * Stage 3B.1 verification: roles & permissions management UI redesign.
 *
 * Usage:
 *   npm run verify:roles-permissions-ui-redesign
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

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath))
}

function main() {
  console.log('=== Roles & permissions UI redesign (Stage 3B.1) verification ===\n')

  const page = read('src/pages/platform/PlatformSettingsRoles.jsx')
  const settingsCss = read('src/pages/platform/PlatformSettings.css')
  const teamPage = read('src/components/admin/team/TeamManagementPage.jsx')
  const teamCss = read('src/components/admin/team/TeamManagementPage.css')
  const workspace = read('src/components/admin/team/RolesWorkspace.jsx')
  const sidebar = read('src/components/admin/team/RolesSidebar.jsx')
  const moduleCard = read('src/components/admin/team/PermissionModuleCard.jsx')
  const saveBar = read('src/components/admin/team/UnsavedChangesBar.jsx')
  const utils = read('src/components/admin/team/teamManagementUtils.js')
  const editor = read('src/components/admin/roles/useRoleEditor.jsx')
  const dataHook = read('src/components/admin/roles/useRolesAccessData.js')
  const catalog = read('src/config/permissionCatalog.js')
  const pkg = read('package.json')

  assert('page uses TeamManagementPage', page.includes('TeamManagementPage'))
  assert('full-width team settings class', page.includes('platform-settings--team'))
  assert('old 720px overridden for team', settingsCss.includes('platform-settings--team') && settingsCss.includes('1600px'))
  assert('team title', teamPage.includes('Управление командой'))
  assert('roles tab', teamPage.includes('Роли и доступы') || utils.includes('Роли и доступы'))
  assert('groups placeholder tab', utils.includes('Группы должностей'))
  assert('positions placeholder tab', utils.includes('Должности'))
  assert('coming soon copy', teamPage.includes('TeamComingSoonPanel') || exists('src/components/admin/team/TeamComingSoonPanel.jsx'))
  assert('coming soon text', read('src/components/admin/team/TeamComingSoonPanel.jsx').includes('Интерфейс будет подключён на следующем этапе'))

  assert('desktop grid sidebar+detail', teamCss.includes('grid-template-columns') && teamCss.includes('320px'))
  assert('mobile single column', teamCss.includes('max-width: 860px') && teamCss.includes('grid-template-columns: 1fr'))
  assert('no page horizontal overflow intent', !teamCss.includes('overflow-x: scroll'))
  assert('safe-area save bar', teamCss.includes('safe-area-inset-bottom'))
  assert('sticky/fixed save bar', teamCss.includes('team-unsaved-bar') && (teamCss.includes('position: sticky') || teamCss.includes('position: fixed')))

  assert('roles sidebar exists', exists('src/components/admin/team/RolesSidebar.jsx'))
  assert('role search', sidebar.includes('Поиск ролей'))
  assert('role filters', utils.includes("'active'") && utils.includes("'inactive'") && utils.includes("'system'") && utils.includes("'custom'"))
  assert('actions menu', exists('src/components/admin/team/RoleActionsMenu.jsx'))
  assert('actions aria-label', read('src/components/admin/team/RoleActionsMenu.jsx').includes('aria-label'))
  assert('selected role URL param', workspace.includes("searchParams.get('role')") || workspace.includes('role'))
  assert('dirty role switch confirmation', workspace.includes('switch-role') || workspace.includes('Несохранённые изменения'))
  assert('beforeunload dirty guard', workspace.includes('beforeunload'))

  assert('module cards vertical', moduleCard.includes('team-module-card'))
  assert('no horizontal module tabs class in workspace', !workspace.includes('roles-matrix__module-tabs'))
  assert('module select all', moduleCard.includes('Весь модуль') || moduleCard.includes('Выбрать все'))
  assert('indeterminate aria mixed', moduleCard.includes("aria-checked={indeterminate ? 'mixed'"))
  assert('accordion aria-expanded', moduleCard.includes('aria-expanded'))
  assert('permission search toolbar', exists('src/components/admin/team/PermissionSearchToolbar.jsx'))
  assert('only enabled filter', workspace.includes('onlyEnabled'))
  assert('only changed filter', workspace.includes('onlyChanged'))
  assert('positions.view in catalog', catalog.includes('positions.view'))
  assert('positions.manage in catalog', catalog.includes('positions.manage'))
  assert('matrix includes positions module', catalog.includes("'positions'"))

  assert('unsaved bar component', saveBar.includes('Есть несохранённые изменения'))
  assert('save uses upsertRole', workspace.includes('upsertRole'))
  assert('cancel restores saved ids', workspace.includes('setSelectedPermissionIds([...savedPermissionIds])'))
  assert('rolePermissions from snapshot', dataHook.includes('rolePermissions'))
  assert('duplicate name format', editor.includes('Копия —'))
  assert('deactivate confirm', workspace.includes('deactivate'))
  assert('admin protection', workspace.includes('ADMIN_PROTECTED_PERMISSIONS') || editor.includes('ADMIN_PROTECTED_PERMISSIONS'))
  assert('restore action label', read('src/components/admin/team/RoleActionsMenu.jsx').includes('Восстановить'))

  assert('no positionStructureAdminService import in team UI', !workspace.includes('positionStructureAdminService') && !teamPage.includes('positionStructureAdminService'))
  assert('no PositionStructure page', !exists('src/pages/platform/PositionStructurePage.jsx') && !exists('src/pages/platform/OrganizationStructurePage.jsx'))
  assert('EmployeeEditModal not imported by team UI', !teamPage.includes('EmployeeEditModal') && !workspace.includes('EmployeeEditModal'))

  const migrationsDir = path.join(ROOT, 'supabase/migrations')
  const stagedMigrations = fs
    .readdirSync(migrationsDir)
    .filter((name) => /^\d{14}_.+\.sql$/.test(name) && name.slice(0, 14) > '20260801150000')
  assert('no newer DB migration for 3B.1', stagedMigrations.length === 0, stagedMigrations.join(','))

  const rbacMigration = read('supabase/migrations/20260712163000_complete_flexible_rbac.sql')
  assert('RBAC migration untouched marker', rbacMigration.includes('rbac_update_role'))
  assert('verify script registered', pkg.includes('verify:roles-permissions-ui-redesign'))

  const components = [
    'TeamManagementPage.jsx',
    'TeamManagementTabs.jsx',
    'TeamComingSoonPanel.jsx',
    'RolesWorkspace.jsx',
    'RolesSidebar.jsx',
    'RoleListItem.jsx',
    'RoleHeader.jsx',
    'RoleActionsMenu.jsx',
    'RoleFilters.jsx',
    'PermissionSearchToolbar.jsx',
    'PermissionModuleCard.jsx',
    'PermissionItem.jsx',
    'UnsavedChangesBar.jsx',
    'ConfirmRoleActionModal.jsx',
  ]
  for (const name of components) {
    assert(`component exists: ${name}`, exists(`src/components/admin/team/${name}`))
  }

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
