#!/usr/bin/env node
/**
 * Stage 3A static verification: secure position structure management backend.
 *
 * Usage:
 *   npm run verify:position-structure-management-backend
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
  console.log('=== Position structure management backend (Stage 3A) verification ===\n')

  const migrationPath = 'supabase/migrations/20260801150000_secure_position_structure_management_backend.sql'
  const migration = read(migrationPath)
  const service = read('src/services/positionStructureAdminService.js')
  const catalogService = read('src/services/positionCatalogService.js')
  const permissionCatalog = read('src/config/permissionCatalog.js')
  const pkg = read('package.json')
  const modal = read('src/components/admin/employees/EmployeeEditModal.jsx')
  const appFiles = [
    'src/App.jsx',
    'src/pages/platform/SettingsPage.jsx',
    'src/components/admin/AdminSettings.jsx',
  ].filter((p) => exists(p))

  assert('positions.view in PERMISSION_CODES', permissionCatalog.includes("POSITIONS_VIEW: 'positions.view'"))
  assert('positions.manage in PERMISSION_CODES', permissionCatalog.includes("POSITIONS_MANAGE: 'positions.manage'"))
  assert('positions.view in catalog rows', permissionCatalog.includes('PERMISSION_CODES.POSITIONS_VIEW') && permissionCatalog.includes('Просмотр организационной структуры'))
  assert('positions.manage in catalog rows', permissionCatalog.includes('PERMISSION_CODES.POSITIONS_MANAGE') && permissionCatalog.includes('Управление организационной структурой'))
  assert('view name', permissionCatalog.includes('Просмотр организационной структуры'))
  assert('manage name', permissionCatalog.includes('Управление организационной структурой'))
  assert('view description', permissionCatalog.includes('Просмотр групп должностей, должностей и их порядка'))
  assert('manage description', permissionCatalog.includes('архивирование и изменение порядка'))
  assert('positions module label', permissionCatalog.includes("positions: 'Организационная структура'"))
  assert('positions in RBAC matrix', permissionCatalog.includes("'positions',"))
  assert('admin default is ALL_PERMISSION_CODES', permissionCatalog.includes('admin: ALL_PERMISSION_CODES'))
  assert('cashier default excludes positions.manage literal grant list', !permissionCatalog.match(/cashier:\s*\[[^\]]*positions\.manage/s))
  assert('seller default excludes positions.view literal grant list', !permissionCatalog.match(/seller:\s*\[[^\]]*positions\.view/s))

  assert('migration seeds positions.view', migration.includes("'positions.view'"))
  assert('migration seeds positions.manage', migration.includes("'positions.manage'"))
  assert('migration grants admin by code', migration.includes("r.code = 'admin'") && migration.includes('role_permissions'))
  assert('migration uses auth.uid', migration.includes('auth.uid()'))
  assert('migration checks positions.manage helper', migration.includes("current_user_has_permission('positions.manage')"))
  assert('migration sets empty search_path', migration.includes("set search_path = ''"))
  assert('migration security definer RPCs', migration.includes('security definer'))
  assert('migration revokes PUBLIC/anon', migration.includes('revoke all on function') && migration.includes('from anon'))
  assert('migration grants authenticated execute', migration.includes('grant execute on function') && migration.includes('to authenticated'))

  const rpcs = [
    'position_structure_create_group',
    'position_structure_update_group',
    'position_structure_set_group_active',
    'position_structure_reorder_groups',
    'position_structure_create_position',
    'position_structure_update_position',
    'position_structure_set_position_active',
    'position_structure_reorder_positions',
  ]
  for (const rpc of rpcs) {
    assert(`RPC defined: ${rpc}`, migration.includes(`function public.${rpc}`))
  }

  assert(
    'no hard-delete RPC implementation',
    !migration.includes('create or replace function public.position_structure_delete_')
      && !migration.includes('create function public.position_structure_delete_')
      && migration.includes('hard-delete RPC detected'),
  )
  assert('group archive checks active positions', migration.includes('position_group_has_active_positions'))
  assert('position archive checks active employees', migration.includes('position_has_active_employees'))
  assert('active employee status = active', migration.includes("au.status = 'active'"))
  assert('rename syncs legacy position', migration.includes('set position = v_name') && migration.includes('position_id = p_position_id'))
  assert('reorder step 10', migration.includes('v_idx * 10'))
  assert('FOR UPDATE locking', migration.includes('for update'))
  assert('unique violation mapped for groups', migration.includes('position_group_duplicate_name'))
  assert('unique violation mapped for positions', migration.includes('position_duplicate_name'))

  const errorCodes = [
    'position_structure_forbidden',
    'position_group_not_found',
    'position_group_inactive',
    'position_group_duplicate_name',
    'position_group_has_active_positions',
    'position_not_found',
    'position_inactive',
    'position_duplicate_name',
    'position_has_active_employees',
    'position_target_group_inactive',
    'position_parent_group_inactive',
    'invalid_position_group_id',
    'invalid_position_id',
    'invalid_position_name',
    'invalid_group_name',
    'invalid_sort_order',
    'invalid_reorder_payload',
    'duplicate_reorder_id',
    'reorder_items_missing',
    'reorder_foreign_item',
  ]
  for (const code of errorCodes) {
    assert(`error code in migration: ${code}`, migration.includes(code))
    assert(`error code in service: ${code}`, service.includes(code))
  }

  assert('admin service exists', exists('src/services/positionStructureAdminService.js'))
  assert('service uses rpc helper for writes', service.includes('client.rpc(fnName, args)') && service.includes("callRpc('position_structure_"))
  assert('service has no insert/update/delete writes', !service.includes('.insert(') && !service.includes('.update(') && !service.includes('.delete('))
  assert('service reloads catalog cache', service.includes('reloadPositionCatalog'))
  assert('catalog reload API exists', catalogService.includes('export async function reloadPositionCatalog'))
  assert('service has no JSX', !service.includes('jsx') && !service.includes('React'))
  assert('service has no toast calls', !service.includes('showError') && !service.includes('showSuccess') && !service.includes('toast('))

  const serviceExports = [
    'loadPositionStructure',
    'createPositionGroup',
    'updatePositionGroup',
    'archivePositionGroup',
    'restorePositionGroup',
    'reorderPositionGroups',
    'createPosition',
    'updatePosition',
    'archivePosition',
    'restorePosition',
    'reorderPositions',
    'refreshPositionStructure',
  ]
  for (const name of serviceExports) {
    assert(`service export: ${name}`, service.includes(`export async function ${name}`))
  }

  assert('no OrganizationStructurePage', !exists('src/pages/platform/OrganizationStructurePage.jsx'))
  assert('no PositionStructurePage', !exists('src/pages/platform/PositionStructurePage.jsx'))
  assert('EmployeeEditModal unchanged visually for selector', !modal.includes('positionStructureAdminService') && !modal.includes('positions.manage'))

  for (const file of appFiles) {
    const src = read(file)
    assert(`no admin service import in ${file}`, !src.includes('positionStructureAdminService'))
  }

  assert('verify script registered', pkg.includes('verify:position-structure-management-backend'))
  assert('SQL test script present', exists('scripts/verify-position-structure-management-sql.sql'))
  assert('no Stage 3B route markers in migration', !migration.includes('OrganizationStructure') && !migration.includes('EmployeeEditModal'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
