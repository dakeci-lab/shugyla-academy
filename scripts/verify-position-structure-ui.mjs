#!/usr/bin/env node
/**
 * Stage 3B.2 verification: position groups & positions management UI.
 *
 * Usage:
 *   npm run verify:position-structure-ui
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
  console.log('=== Position structure UI (Stage 3B.2) verification ===\n')

  const page = read('src/components/admin/team/TeamManagementPage.jsx')
  const tabs = read('src/components/admin/team/TeamManagementTabs.jsx')
  const groupsWs = read('src/components/admin/team/PositionGroupsWorkspace.jsx')
  const positionsWs = read('src/components/admin/team/PositionsWorkspace.jsx')
  const hook = read('src/components/admin/team/usePositionStructureWorkspace.js')
  const utils = read('src/components/admin/team/positionStructureUiUtils.js')
  const service = read('src/services/positionStructureAdminService.js')
  const css = read('src/components/admin/team/TeamManagementPage.css')
  const catalog = read('src/config/permissionCatalog.js')
  const pkg = read('package.json')
  const modal = read('src/components/admin/employees/EmployeeEditModal.jsx')
  const rolesPage = read('src/pages/platform/PlatformSettingsRoles.jsx')

  assert('placeholder groups removed from page', !page.includes('TeamComingSoonPanel'))
  assert(
    'TeamComingSoonPanel.jsx removed',
    !fs.existsSync(path.join(ROOT, 'src/components/admin/team/TeamComingSoonPanel.jsx')),
  )
  assert('groups workspace wired', page.includes('PositionGroupsWorkspace'))
  assert('positions workspace wired', page.includes('PositionsWorkspace'))
  assert('tab query param', page.includes("searchParams.get('tab')") || page.includes("get('tab')"))
  assert('teamTab fallback', page.includes('teamTab'))
  assert('unknown tab resolved', page.includes('resolveTab'))
  assert('permission denied empty state', page.includes('Недостаточно прав'))
  assert('disabled tabs supported', tabs.includes('disabled'))

  assert('positions.view gating', hook.includes('POSITIONS_VIEW'))
  assert('positions.manage gating', hook.includes('POSITIONS_MANAGE'))
  assert('read-only badge', groupsWs.includes('Только просмотр') && positionsWs.includes('Только просмотр'))
  assert('create group hidden without manage path', groupsWs.includes('canManage'))
  assert('create position hidden without manage path', positionsWs.includes('canManage'))

  assert('load via admin service', hook.includes('loadPositionStructure') || hook.includes('refreshPositionStructure'))
  assert(
    'service mutations go through rpc helper',
    service.includes('client.rpc(fnName') && service.includes("callRpc('position_structure_"),
  )
  assert('groups use createPositionGroup', groupsWs.includes('createPositionGroup'))
  assert('groups use updatePositionGroup', groupsWs.includes('updatePositionGroup'))
  assert('groups use archive/restore', groupsWs.includes('archivePositionGroup') && groupsWs.includes('restorePositionGroup'))
  assert('groups reorder service', groupsWs.includes('reorderPositionGroups'))
  assert('positions create/update/archive/restore', positionsWs.includes('createPosition') && positionsWs.includes('updatePosition') && positionsWs.includes('archivePosition') && positionsWs.includes('restorePosition'))
  assert('positions reorder service', positionsWs.includes('reorderPositions'))
  assert('no hard delete labels', !groupsWs.includes('Удалить навсегда') && !positionsWs.includes('Удалить навсегда'))
  assert(
    'workspaces do not call supabase write builders',
    !groupsWs.includes(".from('position") &&
      !positionsWs.includes(".from('position") &&
      !groupsWs.includes('.insert(') &&
      !positionsWs.includes('.insert('),
  )

  assert('group search', groupsWs.includes('Поиск групп'))
  assert('group status filters', utils.includes("'archived'"))
  assert('group position counts local', groupsWs.includes('countPositionsInGroup') || utils.includes('countPositionsInGroup'))
  assert('archive confirmation group', groupsWs.includes('Архивированная группа перестанет'))
  assert('active positions error formatting', utils.includes('position_group_has_active_positions'))
  assert('partial reorder blocked for groups', groupsWs.includes('canReorderGroups') || utils.includes('canReorderGroups'))
  assert('move up/down groups', groupsWs.includes('Поднять группу') && groupsWs.includes('Опустить группу'))

  assert('positions info note', positionsWs.includes('Должность определяет, кем работает сотрудник'))
  assert('grouped sections', positionsWs.includes('structure-section') || positionsWs.includes('groupPositionsByGroup'))
  assert('group filter', positionsWs.includes('Все группы'))
  assert('only active groups in create', read('src/components/admin/team/PositionFormModal.jsx').includes('isActive'))
  assert('restore blocked archived parent', read('src/components/admin/team/PositionActionsMenu.jsx').includes('Сначала восстановите группу'))
  assert('active employee error formatting', utils.includes('position_has_active_employees'))
  assert('cross-group drag absent', !positionsWs.includes('onDrag') && !positionsWs.includes('draggable'))
  assert('reorder bar safe-area', css.includes('structure-reorder-bar') && css.includes('safe-area-inset-bottom'))

  assert('aria-expanded sections', positionsWs.includes('aria-expanded'))
  assert('aria-label menus', read('src/components/admin/team/PositionGroupActionsMenu.jsx').includes('aria-label'))
  assert('focus-visible structure', css.includes('focus-visible'))

  assert('catalog still has positions permissions', catalog.includes('positions.view') && catalog.includes('positions.manage'))
  assert('roles page still uses TeamManagementPage', rolesPage.includes('TeamManagementPage'))
  assert('EmployeeEditModal unchanged by structure import', !modal.includes('positionStructureAdminService') && !modal.includes('PositionGroupsWorkspace'))
  assert('verify script registered', pkg.includes('verify:position-structure-ui'))

  const stagedMigrations = fs
    .readdirSync(path.join(ROOT, 'supabase/migrations'))
    .filter((name) => /^\d{14}_.+\.sql$/.test(name) && name.slice(0, 14) > '20260801150000')
  assert('no newer DB migration', stagedMigrations.length === 0, stagedMigrations.join(','))

  const rpcFile = read(
    'supabase/migrations/20260801150000_secure_position_structure_management_backend.sql',
  )
  assert('Stage 3A RPC migration still present', rpcFile.includes('position_structure_create_group'))

  const required = [
    'PositionGroupsWorkspace.jsx',
    'PositionsWorkspace.jsx',
    'PositionGroupFormModal.jsx',
    'PositionFormModal.jsx',
    'PositionGroupActionsMenu.jsx',
    'PositionActionsMenu.jsx',
    'StructureReorderBar.jsx',
    'StructureEmptyState.jsx',
    'StructureErrorState.jsx',
    'usePositionStructureWorkspace.js',
    'positionStructureUiUtils.js',
  ]
  for (const name of required) {
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
