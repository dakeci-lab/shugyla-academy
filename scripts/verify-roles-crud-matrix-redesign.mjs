#!/usr/bin/env node
/**
 * Verification for the «Роли и доступы» CRUD-matrix redesign:
 *   - the old always-visible sidebar (RolesSidebar/RoleListItem/RoleFilters/
 *     RoleHeader) and the search/description toolbar
 *     (PermissionSearchToolbar/PermissionModuleCard/PermissionItem) are gone;
 *   - a single dropdown role picker (RolePickerRow) replaces the sidebar,
 *     with no role search box and no per-role description/employee-counter
 *     text next to the picker;
 *   - permissions render as page-level module tabs + one CRUD-matrix table
 *     per module (PermissionMatrixPanel), grouped by resource
 *     (groupModulePermissionsIntoRows / getPermissionResourceKey) with
 *     columns ordered CRUD-first (view/create/edit/delete/manage) and any
 *     other actions appended afterwards, not in raw encounter order;
 *   - dirty-tracking, save/cancel, the two confirm dialogs, and the
 *     admin-protected-permissions guard are unchanged behaviourally;
 *   - CSS classes shared with the (out-of-scope) Positions/Groups tabs
 *     — .team-role-filters__chip, .team-role-item__status — survive, since
 *     PositionsWorkspace/PositionGroupsWorkspace reuse them independently.
 *
 * Usage:
 *   npm run verify:roles-crud-matrix-redesign
 */

import fs from 'fs'
import path from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

const CATALOG = 'src/config/permissionCatalog.js'
const MATRIX_PANEL = 'src/components/admin/team/PermissionMatrixPanel.jsx'
const ROLE_PICKER = 'src/components/admin/team/RolePickerRow.jsx'
const ROLES_WORKSPACE = 'src/components/admin/team/RolesWorkspace.jsx'
const TEAM_UTILS = 'src/components/admin/team/teamManagementUtils.js'
const TEAM_CSS = 'src/components/admin/team/TeamManagementPage.css'
const POSITIONS_WORKSPACE = 'src/components/admin/team/PositionsWorkspace.jsx'
const POSITION_GROUPS_WORKSPACE = 'src/components/admin/team/PositionGroupsWorkspace.jsx'
const TEAM_PAGE = 'src/components/admin/team/TeamManagementPage.jsx'
const ROLE_EDITOR_MODAL = 'src/components/admin/roles/RoleEditorModal.jsx'

const REMOVED_FILES = [
  'src/components/admin/team/RolesSidebar.jsx',
  'src/components/admin/team/RoleListItem.jsx',
  'src/components/admin/team/RoleFilters.jsx',
  'src/components/admin/team/RoleHeader.jsx',
  'src/components/admin/team/PermissionSearchToolbar.jsx',
  'src/components/admin/team/PermissionModuleCard.jsx',
  'src/components/admin/team/PermissionItem.jsx',
]

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

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath))
}

async function load(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href)
}

async function stageOldUiRemoved() {
  console.log('Stage 1: old sidebar/toolbar UI removed')

  REMOVED_FILES.forEach((relPath) => {
    assert(`removed: ${relPath}`, !exists(relPath))
  })

  const workspace = read(ROLES_WORKSPACE)
  assert(
    'RolesWorkspace no longer imports the deleted sidebar/toolbar components',
    !/RolesSidebar|RoleListItem|RoleFilters|PermissionSearchToolbar|PermissionModuleCard|PermissionItem/.test(
      workspace,
    ),
  )
  assert(
    'RolesWorkspace renders RolePickerRow',
    workspace.includes('<RolePickerRow'),
  )
  assert(
    'RolesWorkspace renders PermissionMatrixPanel',
    workspace.includes('<PermissionMatrixPanel'),
  )

  const utils = read(TEAM_UTILS)
  assert(
    'dead search/filter helpers removed from teamManagementUtils (filterRoles, ROLE_FILTERS, employeesLabel)',
    !/export function filterRoles|export const ROLE_FILTERS|export function employeesLabel/.test(utils),
  )
}

async function stageRolePicker() {
  console.log('Stage 2: single dropdown role picker, no search/description chrome')

  const picker = read(ROLE_PICKER)
  assert(
    'RolePickerRow has no search input',
    !/type=["']search["']|placeholder=["'][^"']*[Пп]оиск/.test(picker),
  )
  assert(
    'RolePickerRow renders a dropdown control (team-role-select__control)',
    picker.includes('team-role-select__control'),
  )
  assert(
    'RolePickerRow renders a create-role button',
    /\+\s*Создать роль/.test(picker),
  )
  assert(
    'RolePickerRow does not render a role description line',
    !/role\.description/.test(picker),
  )

  const { sortRolesForSidebar, resolveInitialRoleId, idsEqual } = await load(TEAM_UTILS)
  const roles = [
    { id: 'r1', name: 'Кассир', isActive: true, isSystem: true },
    { id: 'r2', name: 'Закупщик, категорийный менеджер', isActive: true, isSystem: false },
    { id: 'r3', name: 'Уволенная роль', isActive: false, isSystem: false },
  ]
  const sorted = sortRolesForSidebar(roles)
  assert(
    'sortRolesForSidebar keeps inactive roles reachable (not filtered out)',
    sorted.some((r) => r.id === 'r3'),
  )
  assert(
    'resolveInitialRoleId falls back to first active role when nothing requested',
    resolveInitialRoleId(roles, '') === sorted.find((r) => r.isActive).id,
  )
  assert(
    'resolveInitialRoleId keeps an explicitly requested role id',
    resolveInitialRoleId(roles, 'r2') === 'r2',
  )
  assert('idsEqual: order-independent set equality', idsEqual(['a', 'b'], ['b', 'a']))
  assert('idsEqual: detects a real diff', !idsEqual(['a', 'b'], ['a']))
}

async function stageMatrixGrouping() {
  console.log('Stage 3: CRUD-matrix grouping and column ordering (real catalog data)')

  const {
    PERMISSION_CATALOG,
    groupPermissionsForMatrix,
    groupModulePermissionsIntoRows,
    getPermissionResourceKey,
    getPermissionActionLabel,
    parsePermissionAction,
  } = await load(CATALOG)

  assert(
    'getPermissionResourceKey extracts the middle segment of a 3-part code',
    getPermissionResourceKey('umag.reconciliations.resolve') === 'reconciliations',
  )
  assert(
    'getPermissionResourceKey returns empty for a plain 2-part code',
    getPermissionResourceKey('employees.view') === '',
  )

  const groups = groupPermissionsForMatrix(PERMISSION_CATALOG)
  const umagGroup = groups.find((g) => g.module === 'umag')
  assert('umag module group exists in the real catalog', Boolean(umagGroup))

  const umagRows = groupModulePermissionsIntoRows(umagGroup)
  assert(
    'umag module splits into 2 resource rows (settlements + reconciliations)',
    umagRows.length === 2,
  )
  const reconciliationsRow = umagRows.find((r) => r.resourceKey === 'reconciliations')
  assert(
    'reconciliations row picks up the Russian resource label',
    reconciliationsRow?.label === 'Акты сверки',
  )
  assert(
    'reconciliations row carries the resolve permission',
    reconciliationsRow.items.some((p) => p.code.endsWith('.resolve')),
  )

  assert(
    'getPermissionActionLabel translates the resolve action (no untranslated raw code)',
    getPermissionActionLabel('resolve') === 'Закрытие расхождений',
  )

  // Reproduce PermissionMatrixPanel's own column-ordering logic against the
  // real umag group, the module with the messiest action mix in the catalog.
  const panelSource = read(MATRIX_PANEL)
  assert(
    'PermissionMatrixPanel defines a canonical CRUD action order',
    /ACTION_ORDER_PRIORITY\s*=\s*\[\s*['"]view['"],\s*['"]create['"],\s*['"]edit['"],\s*['"]delete['"],\s*['"]manage['"]\s*\]/.test(
      panelSource,
    ),
  )

  const actionsEncountered = []
  umagRows.forEach((row) => {
    row.items.forEach((permission) => {
      const action = parsePermissionAction(permission.code)
      if (!actionsEncountered.includes(action)) actionsEncountered.push(action)
    })
  })
  const priority = ['view', 'create', 'edit', 'delete', 'manage']
  const sorted = [...actionsEncountered].sort((a, b) => {
    const ai = priority.indexOf(a)
    const bi = priority.indexOf(b)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
  assert(
    'umag columns sort CRUD-first with extra actions (sync, resolve) appended after',
    sorted.indexOf('view') < sorted.indexOf('sync') &&
      sorted.indexOf('view') < sorted.indexOf('resolve') &&
      sorted.indexOf('sync') < sorted.indexOf('resolve'),
    `got: ${sorted.join(', ')}`,
  )
}

async function stagePanelMarkup() {
  console.log('Stage 4: PermissionMatrixPanel markup — module tabs + CRUD table')

  const panel = read(MATRIX_PANEL)
  assert('renders module tabs (team-matrix-tabs)', panel.includes('team-matrix-tabs'))
  assert('renders the CRUD table (table.team-matrix)', panel.includes('team-matrix'))
  assert(
    'wraps the table for horizontal scroll on narrow screens (team-matrix-wrap)',
    panel.includes('team-matrix-wrap'),
  )
  assert(
    'renders a dash placeholder for resource/action combos that do not exist',
    panel.includes('team-matrix__dash-cell'),
  )
  assert(
    'each checkbox carries an accessible label (row + action)',
    panel.includes('aria-label={`${row.label} — ${getPermissionActionLabel(action)}`}'),
  )
}

async function stageWorkspaceBehaviourPreserved() {
  console.log('Stage 5: RolesWorkspace preserves dirty-tracking, save/cancel, confirm dialogs')

  const workspace = read(ROLES_WORKSPACE)
  assert('dirty-tracking via idsEqual is still present', workspace.includes('idsEqual('))
  assert(
    'beforeunload guard for unsaved changes is still present',
    workspace.includes("addEventListener('beforeunload'"),
  )
  assert(
    'admin-protected-permissions validation is still present',
    workspace.includes('validateAdmin') && workspace.includes('ADMIN_PROTECTED_PERMISSIONS'),
  )
  assert(
    'switch-role confirm dialog is still present',
    workspace.includes("type: 'switch-role'"),
  )
  assert(
    'deactivate confirm dialog is still present',
    workspace.includes("type: 'deactivate'"),
  )
  assert('save handler still calls upsertRole', workspace.includes('upsertRole('))
}

async function stageSharedCssSurvives() {
  console.log('Stage 6: CSS shared with Positions/Groups tabs survives the redesign')

  const css = read(TEAM_CSS)
  assert(
    '.team-role-filters__chip rule still defined (shared with PositionsWorkspace filters)',
    css.includes('.team-role-filters__chip {') || css.includes('.team-role-filters__chip,'),
  )
  assert(
    '.team-role-item__status rule still defined (shared with PositionsWorkspace/PositionGroupsWorkspace status badges)',
    css.includes('.team-role-item__status {') || css.includes('.team-role-item__status,'),
  )

  if (exists(POSITIONS_WORKSPACE)) {
    const positions = read(POSITIONS_WORKSPACE)
    assert(
      'PositionsWorkspace still references the shared filter-chip/status classes',
      /team-role-filters__chip|team-role-item__status/.test(positions),
    )
  }
  if (exists(POSITION_GROUPS_WORKSPACE)) {
    const groups = read(POSITION_GROUPS_WORKSPACE)
    assert(
      'PositionGroupsWorkspace still references the shared filter-chip/status classes',
      /team-role-filters__chip|team-role-item__status/.test(groups),
    )
  }

  assert(
    'new matrix/picker CSS classes are defined',
    css.includes('.team-role-picker-row') &&
      css.includes('.team-role-select') &&
      css.includes('.team-matrix-tab') &&
      css.includes('table.team-matrix'),
  )
}

async function stagePageChromeRemoved() {
  console.log('Stage 7: page title/description removed, tab switcher matches Закупки style')

  const page = read(TEAM_PAGE)
  assert(
    'TeamManagementPage no longer renders a page title ("Управление командой")',
    !/Управление командой/.test(page),
  )
  assert(
    'TeamManagementPage no longer renders the page subtitle',
    !/Настройка ролей, доступов и организационной структуры/.test(page),
  )
  assert(
    'team-mgmt__title / team-mgmt__subtitle classes are gone from the page',
    !/team-mgmt__title|team-mgmt__subtitle/.test(page),
  )

  const css = read(TEAM_CSS)
  assert(
    'tab bar uses an underline style (border-bottom), not the old rounded-pill style',
    css.includes('.team-mgmt__tab {') &&
      /\.team-mgmt__tab\s*\{[^}]*border-bottom:\s*2px solid transparent/.test(css) &&
      !/\.team-mgmt__tab\s*\{[^}]*border-radius:\s*999px/.test(css),
  )
  assert(
    'active tab is marked by border-bottom-color, not a filled background (matches Закупки)',
    /\.team-mgmt__tab--active\s*\{[^}]*border-bottom-color:\s*var\(--color-primary\)/.test(css) &&
      !/\.team-mgmt__tab--active\s*\{[^}]*background:\s*var\(--color-primary-light\)/.test(css),
  )
  assert(
    'tabs row sits on a bottom border, same structure as .procurement-page__tabs-row',
    css.includes('.team-mgmt__tabs-row'),
  )
}

async function stageNoCheckboxCountHints() {
  console.log('Stage 8: no "checked/total" checkbox-count hints anywhere in the roles UI')

  const panel = read(MATRIX_PANEL)
  assert(
    'PermissionMatrixPanel module tabs render no checked/total count',
    !/team-matrix-tab__count/.test(panel),
  )

  const editorModal = read(ROLE_EDITOR_MODAL)
  assert(
    'RoleEditorModal module checklist renders no checked/total count',
    !/roles-access__module-count/.test(editorModal),
  )

  const css = read(TEAM_CSS)
  assert(
    'team-matrix-tab__count CSS rule removed (dead after the count was dropped)',
    !css.includes('team-matrix-tab__count'),
  )
}

async function main() {
  console.log('Verifying: Roles & Permissions CRUD-matrix redesign\n')
  await stageOldUiRemoved()
  await stageRolePicker()
  await stageMatrixGrouping()
  await stagePanelMarkup()
  await stageWorkspaceBehaviourPreserved()
  await stageSharedCssSurvives()
  await stagePageChromeRemoved()
  await stageNoCheckboxCountHints()
  console.log(`\n✅ All ${checks} checks passed`)
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`)
  process.exit(1)
})
