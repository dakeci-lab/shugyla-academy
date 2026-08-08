#!/usr/bin/env node
/**
 * Static verification for the shared Loading System.
 *
 * Checks:
 * - shared skeleton + delayed hook structure
 * - delay cleanup / default 180ms
 * - migrated PAGE/SECTION call sites
 * - absence of old text loaders on migrated screens
 * - procurement refresh keeps stable snapshot (no wipe-to-empty)
 *
 * Usage:
 *   npm run verify:loading-system
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

const ALLOWED_VARIANTS = ['list', 'table', 'cards', 'dashboard']

const MIGRATED = [
  ['src/components/admin/employees/EmployeeListTable.jsx', 'list'],
  ['src/components/admin/sections/WorkScheduleSection.jsx', 'table'],
  ['src/components/admin/sections/EmployeeRatingSection.jsx', 'list'],
  ['src/components/admin/OwnerDashboard.jsx', 'dashboard'],
  ['src/pages/platform/PlatformEmployeeDocuments.jsx', 'list'],
  ['src/components/admin/payroll/PayrollSection.jsx', 'table'],
  ['src/components/admin/payroll/PayrollRecordSection.jsx', 'cards'],
  ['src/components/admin/sections/EmployeeScheduleSection.jsx', 'cards'],
  ['src/components/admin/sections/EmployeeProfileSection.jsx', 'cards'],
  ['src/components/admin/RolesAccessSection.jsx', 'table'],
  ['src/components/suppliers/settlements/UmagSettlementsPanel.jsx', 'table'],
  ['src/components/suppliers/settlements/OperationDetailSheet.jsx', 'list'],
  ['src/components/suppliers/settlements/ReconciliationDetailView.jsx', 'cards'],
  ['src/components/suppliers/payments/SupplierPaymentsPanel.jsx', 'cards'],
  ['src/components/platform/notifications/NotificationPanel.jsx', 'list'],
  ['src/pages/platform/PlatformNotificationsInbox.jsx', 'list'],
  ['src/pages/platform/procurement/ProcurementPage.jsx', 'list'],
  ['src/pages/platform/procurement/AnalyticsProcurementPage.jsx', 'table'],
  ['src/components/procurement/SimpleReceivingWeekView.jsx', 'cards'],
  ['src/pages/platform/suppliers/SuppliersPage.jsx', 'table'],
  ['src/components/admin/sections/TimeTrackerSection.jsx', 'cards'],
  ['src/components/admin/sections/TimeTrackerHomeCard.jsx', 'cards'],
  ['src/components/admin/NotificationSettingsPanel.jsx', 'cards'],
  ['src/components/admin/AttendanceSettingsPanel.jsx', 'cards'],
  ['src/components/admin/TimeTrackerEscalationSettingsPanel.jsx', 'cards'],
  ['src/components/admin/TimeTrackerViolationsJournal.jsx', 'table'],
  ['src/components/admin/roles/RolesListTab.jsx', 'table'],
  ['src/components/admin/roles/RoleAccessMatrixTab.jsx', 'table'],
  ['src/components/admin/team/RolesSidebar.jsx', 'list'],
  ['src/components/admin/team/RolesWorkspace.jsx', 'cards'],
  ['src/components/admin/team/PositionsWorkspace.jsx', 'cards'],
  ['src/components/admin/team/PositionGroupsWorkspace.jsx', 'list'],
  ['src/components/admin/EmployeeRatingDetailModal.jsx', 'list'],
]

const FORBIDDEN_TEXT_BY_FILE = {
  'src/pages/platform/procurement/ProcurementPage.jsx': ['Загрузка закупов…'],
  'src/components/procurement/SimpleReceivingWeekView.jsx': ['Загрузка приёмки…'],
  'src/components/admin/NotificationSettingsPanel.jsx': ['Загрузка настроек…'],
  'src/components/admin/AttendanceSettingsPanel.jsx': ['Загрузка настроек…'],
  'src/components/admin/roles/RolesListTab.jsx': ['Загрузка ролей…'],
  'src/components/admin/roles/RoleAccessMatrixTab.jsx': [
    'Загрузка разрешений роли…',
    '>Загрузка…</p>',
  ],
  'src/components/admin/EmployeeRatingDetailModal.jsx': ['Загрузка…</p>'],
  'src/components/admin/TimeTrackerEscalationSettingsPanel.jsx': ['Загрузка…</p>'],
  'src/components/admin/TimeTrackerViolationsJournal.jsx': ['Загрузка…</p>'],
  'src/components/admin/sections/EmployeeRatingSection.jsx': ['Загрузка рейтинга…'],
  'src/components/admin/sections/WorkScheduleSection.jsx': ['Загрузка графика…'],
  'src/components/admin/OwnerDashboard.jsx': ['Загрузка дашборда…'],
}

function main() {
  console.log('=== Loading System verification ===\n')

  console.log('Stage 1: Shared structure')
  assert('LoadingSkeleton exists', exists('src/components/loading/LoadingSkeleton.jsx'))
  assert('useDelayedLoading exists', exists('src/components/loading/useDelayedLoading.js'))
  assert('loading.css exists', exists('src/components/loading/loading.css'))
  assert('useStableWhenReady exists', exists('src/hooks/useStableWhenReady.js'))

  const skeleton = read('src/components/loading/LoadingSkeleton.jsx')
  const delayed = read('src/components/loading/useDelayedLoading.js')
  const css = read('src/components/loading/loading.css')
  const stable = read('src/hooks/useStableWhenReady.js')

  assert('exports LoadingSkeleton default', /export default function LoadingSkeleton/.test(skeleton))
  assert('exports DelayedLoadingSkeleton', skeleton.includes('export function DelayedLoadingSkeleton'))
  assert('exports SkeletonPrimitive', skeleton.includes('export function SkeletonPrimitive'))
  assert('shared shimmer keyframes', css.includes('@keyframes shugyla-skeleton-shimmer'))
  assert('default delay 180ms', delayed.includes('DEFAULT_LOADING_DELAY_MS = 180'))
  assert('clears timeout on cleanup', delayed.includes('clearTimeout(timer)'))
  assert('stable hook updates only when ready', /if \(ready\)/.test(stable))

  for (const variant of ALLOWED_VARIANTS) {
    assert(`supports variant ${variant}`, skeleton.includes(`variant === '${variant}'`) || skeleton.includes(`'${variant}'`))
  }

  console.log('Stage 2: Migrated call sites')
  for (const [relPath, variant] of MIGRATED) {
    const source = read(relPath)
    const usesShared =
      source.includes('LoadingSkeleton') ||
      source.includes('DelayedLoadingSkeleton') ||
      source.includes('SkeletonPrimitive')
    assert(`${relPath} uses shared skeleton`, usesShared)
    assert(
      `${relPath} uses variant ${variant}`,
      source.includes(`variant="${variant}"`) || source.includes(`variant={'${variant}'}`),
    )
  }

  const periodSummary = read('src/components/admin/employees/EmployeePeriodSummary.jsx')
  assert('EmployeePeriodSummary uses SkeletonPrimitive', periodSummary.includes('SkeletonPrimitive'))

  console.log('Stage 3: Forbidden old text loaders')
  for (const [relPath, texts] of Object.entries(FORBIDDEN_TEXT_BY_FILE)) {
    const source = read(relPath)
    for (const text of texts) {
      assert(`${relPath} has no "${text}"`, !source.includes(text))
    }
  }

  console.log('Stage 4: Procurement / receiving refresh safety')
  const procurement = read('src/pages/platform/procurement/ProcurementPage.jsx')
  const receiving = read('src/components/procurement/SimpleReceivingWeekView.jsx')
  const analytics = read('src/pages/platform/procurement/AnalyticsProcurementPage.jsx')
  assert('Procurement uses useStableWhenReady', procurement.includes('useStableWhenReady'))
  assert('Procurement initial skeleton gated', procurement.includes('showInitialSkeleton'))
  assert('Receiving uses useStableWhenReady', receiving.includes('useStableWhenReady'))
  assert('Receiving initial skeleton gated', receiving.includes('showInitialSkeleton'))
  assert('Analytics uses useStableWhenReady', analytics.includes('useStableWhenReady'))
  assert(
    'Analytics does not wipe with purchasesLoading ? []',
    !analytics.includes('purchasesLoading ? []'),
  )

  console.log('Stage 5: No page-specific shimmer leftovers (migrated)')
  assert('no umag-settlements skeleton CSS', !read('src/components/suppliers/settlements/UmagSettlementsPanel.css').includes('umag-settlements__skeleton'))
  assert('no notification-panel skeleton CSS', !read('src/components/platform/notifications/notifications.css').includes('notification-panel__skeleton'))
  assert('no team-mgmt skeleton CSS', !read('src/components/admin/team/TeamManagementPage.css').includes('team-mgmt__skeleton'))
  assert('no tt-home-skeleton CSS', !read('src/components/admin/sections/TimeTrackerHome.css').includes('tt-home-skeleton'))
  assert('no time-tracker-card skeleton CSS', !read('src/components/admin/EmployeeRating.css').includes('time-tracker-card__skeleton'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed: ${error.message}\n`)
  process.exit(1)
}
