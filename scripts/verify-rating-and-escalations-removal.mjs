#!/usr/bin/env node
/**
 * Verification for the removal of the Рейтинг (employee rating) feature and
 * the admin-facing time-tracker violations/escalation layer, while keeping
 * core check-in/check-out attendance (payroll depends on it) and employee
 * personal shift reminders untouched.
 *
 * Usage:
 *   npm run verify:rating-and-escalations-removal
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

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath))
}

function read(relPath) {
  if (!exists(relPath)) fail(`file not found: ${relPath}`)
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

const REMOVED_FILES = [
  'src/pages/platform/PlatformEmployeeRating.jsx',
  'src/components/admin/sections/EmployeeRatingSection.jsx',
  'src/components/admin/EmployeeRatingDetailModal.jsx',
  'src/components/admin/RatingScoreBar.jsx',
  'src/utils/ratingEligibility.js',
  'scripts/verify-rating-eligibility.mjs',
  'src/components/admin/EmployeeRating.css',
  'src/components/admin/TimeTrackerViolationsJournal.jsx',
  'src/components/admin/TimeTrackerEscalationSettingsPanel.jsx',
  'scripts/verify-admin-escalations.mjs',
  'scripts/run-production-admin-escalation-e2e.mjs',
  'supabase/functions/_shared/adminEscalationLogic.ts',
  'supabase/functions/_shared/adminEscalationDispatch.ts',
  'supabase/functions/_shared/adminEscalationRecipients.ts',
  'supabase/functions/_shared/adminEscalationWarnings.ts',
]

const REMOVED_IDENTIFIERS = [
  'RATING_STATUS',
  'buildEmployeeRatingResult',
  'calculateEmployeeRatingFromShifts',
  'calculateRatingsByEmployee',
  'RATING_BASE_SCORE',
  'aggregateEmployeeRating',
  'debugLogShiftRating',
  'debugLogEmployeeMonthRating',
  'isRatingDebugEnabled',
  'setRatingDebugEnabled',
  'getRatingScoreGradient',
  'getRatingScoreColor',
  'isShiftCompletedForRating',
  'calculateShiftRatingEntries',
  'buildAutoScoreEvents',
  'SCORE_EVENT_TYPE',
  'SCORE_EVENT_LABELS',
  'canViewEmployeeRating',
  'RATING_UPDATED_EVENT',
  'notifyRatingUpdated',
  'MIN_ELIGIBLE_COMPLETED_SHIFTS',
  'computeEmployeeRatingsForMonth',
  'PERMISSION_RATING_VIEW',
  'dispatchAdminEscalations',
  'buildAdminEscalationWarnings',
  'DEFAULT_ESCALATION_SETTINGS',
  'listTimeTrackerViolations',
  'fetchEscalationSettings',
  'updateEscalationSettings',
]

function walk(dir, exts, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue
    if (entry.name === '.claude') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, exts, out)
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(full)
    }
  }
  return out
}

function stageFilesRemoved() {
  console.log('Stage 1: Dead/removed files actually gone')
  for (const relPath of REMOVED_FILES) {
    assert(`removed: ${relPath}`, !exists(relPath))
  }
}

function stageNoStrayIdentifiers() {
  console.log('\nStage 2: No stray references to removed identifiers (src/ + supabase/functions/)')
  const files = [
    ...walk(path.join(ROOT, 'src'), ['.js', '.jsx']),
    ...walk(path.join(ROOT, 'supabase', 'functions'), ['.ts']),
  ]
  const hits = new Map()
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    for (const id of REMOVED_IDENTIFIERS) {
      if (content.includes(id)) {
        const rel = path.relative(ROOT, file)
        if (!hits.has(id)) hits.set(id, [])
        hits.get(id).push(rel)
      }
    }
  }
  assert(
    'zero stray references to removed rating/escalation identifiers',
    hits.size === 0,
    hits.size ? JSON.stringify([...hits.entries()]) : '',
  )
}

function stageCoreAttendanceUntouched() {
  console.log('\nStage 3: Core check-in/check-out attendance untouched (payroll depends on it)')
  const edge = read('supabase/functions/employee-time-tracker-action/index.ts')
  assert('core edge function has no rating/escalation code', !/rating|escalation/i.test(edge))
  assert('core edge function still handles clock_in', edge.includes("'clock_in'"))
  assert('core edge function still handles clock_out', edge.includes("'clock_out'"))

  const attendanceData = read('src/utils/attendanceData.js')
  assert('DEFAULT_ATTENDANCE_SETTINGS keeps only time-tolerance fields', /lateGraceMinutes[\s\S]*earlyLeaveGraceMinutes[\s\S]*checkoutWaitMinutes/.test(attendanceData))
  assert('no point-value fields left in DEFAULT_ATTENDANCE_SETTINGS', !attendanceData.includes('onTimePoints'))
  assert('clampPercentScore kept (used by Company Health)', attendanceData.includes('export function clampPercentScore'))
  assert('renamed attendance-updated event present', attendanceData.includes("ATTENDANCE_UPDATED_EVENT = 'shugyla:attendance-updated'"))
}

function stagePayrollShiftCompletionUntouched() {
  console.log('\nStage 4: Payroll shift-completion logic untouched (separate module, never touched rating)')
  const summary = read('src/utils/employeeMonthlyWorkSummary.js')
  assert('payroll completion helper has no rating dependency', !/from '\.\/attendanceData'/.test(summary) || !/Rating/.test(summary))
}

function stagePersonalRemindersUntouched() {
  console.log('\nStage 5: Employee personal shift reminders kept (only admin escalations removed)')
  const dispatch = read('supabase/functions/_shared/timeTrackerNotificationDispatch.ts')
  assert('personal reminder dispatch file still exists and untouched name', dispatch.includes('dispatchTimeTrackerNotifications'))

  const scheduler = read('supabase/functions/_shared/timeTrackerNotificationScheduler.ts')
  assert('scheduler still dispatches personal reminders', scheduler.includes('dispatchTimeTrackerNotifications'))
  assert('scheduler no longer imports admin escalation dispatch', !scheduler.includes('adminEscalationDispatch'))
  assert('scheduler result type has no escalation field', !scheduler.includes('EscalationDispatchResult'))

  const dispatchFn = read('supabase/functions/dispatch-time-tracker-notifications/index.ts')
  assert('manual personal-reminder test dispatcher untouched', dispatchFn.includes('dispatchTimeTrackerNotifications') || dispatchFn.includes('runTimeTrackerNotificationScheduler'))
}

function stageRbacCatalogClean() {
  console.log('\nStage 6: RBAC catalog has no rating traces')
  const catalog = read('src/config/permissionCatalog.js')
  assert('no RATING_VIEW code', !catalog.includes('RATING_VIEW'))
  assert('no rating module label', !catalog.includes("rating: 'Рейтинг'"))
  assert('no rating in RBAC_MATRIX_MODULES', !/RBAC_MATRIX_MODULES\s*=\s*\[[^\]]*'rating'/.test(catalog))
  assert('no legacy employees.rating.view alias', !catalog.includes('employees.rating.view'))
  assert('role descriptions no longer mention Рейтинг', !/description:\s*'[^']*Рейтинг[^']*'/.test(catalog))

  const permissions = read('src/config/permissions.js')
  assert('no EMPLOYEES_RATING route key', !permissions.includes('EMPLOYEES_RATING'))
  assert('no canViewEmployeeRating export', !permissions.includes('canViewEmployeeRating'))

  const nav = read('src/platform/platformNav.js')
  assert('no rating nav entry', !nav.includes("id: 'employees-rating'"))

  const app = read('src/App.jsx')
  assert('no rating route', !app.includes('employees/rating'))
  assert(
    'legacy /time-tracker route repointed off the removed permission',
    app.includes('path="time-tracker"') && !app.includes('ROUTE_KEYS.EMPLOYEES_RATING'),
  )
}

function stageWorkforceEdgeFunctionClean() {
  console.log('\nStage 7: admin-team-workforce-data has no "rating" view')
  const edge = read('supabase/functions/admin-team-workforce-data/index.ts')
  assert('no rating in ALLOWED_VIEWS', !/ALLOWED_VIEWS[\s\S]{0,80}'rating'/.test(edge))
  assert('no rating.view permission constant', !edge.includes("'rating.view'"))
  assert('WorkforceView type has no rating', !/type WorkforceView[\s\S]{0,80}'rating'/.test(edge))
}

function stageMigrationPresent() {
  console.log('\nStage 8: Removal migration exists and covers the confirmed live-DB state')
  const files = fs.readdirSync(path.join(ROOT, 'supabase', 'migrations'))
  const migrationFile = files.find((f) => f.includes('remove_rating_and_admin_escalations'))
  assert('migration file present', Boolean(migrationFile))
  const migration = read(path.join('supabase', 'migrations', migrationFile))
  assert('deletes rating.view permission', migration.includes("delete from public.permissions where code = 'rating.view'"))
  assert('deletes escalation notification rules', migration.includes('time_tracker.rule.admin_clock_in_escalation'))
  assert('deletes escalation notification templates', migration.includes('time_tracker.admin_clock_in_escalation'))
  assert('drops time_tracker_violations table', migration.includes('drop table if exists public.time_tracker_violations'))
  assert('drops time_tracker_escalation_settings table', migration.includes('drop table if exists public.time_tracker_escalation_settings'))
  assert('drops rating point-value columns from platform_attendance_settings', migration.includes('drop column if exists on_time_points'))
  assert('keeps grace-period columns (comment explains why)', migration.includes('late_grace_minutes') && migration.includes('checkout_wait_minutes'))
}

function stagePackageJsonClean() {
  console.log('\nStage 9: package.json has no dangling script entries')
  const pkg = read('package.json')
  assert('no verify:rating-eligibility script', !pkg.includes('verify:rating-eligibility'))
  assert('no verify:admin-escalations script', !pkg.includes('verify:admin-escalations'))
  assert('no tt:production:admin-escalation-e2e script', !pkg.includes('admin-escalation-e2e'))
  assert('new verify script registered', pkg.includes('verify:rating-and-escalations-removal'))
}

try {
  console.log('=== Rating + admin-escalations removal verification ===\n')
  stageFilesRemoved()
  stageNoStrayIdentifiers()
  stageCoreAttendanceUntouched()
  stagePayrollShiftCompletionUntouched()
  stagePersonalRemindersUntouched()
  stageRbacCatalogClean()
  stageWorkforceEdgeFunctionClean()
  stageMigrationPresent()
  stagePackageJsonClean()
  console.log(`\n✅ All ${testsPassed}/${testsRun} checks passed`)
} catch (error) {
  console.error(`\n❌ Verification failed (${testsPassed}/${testsRun} tests): ${error.message}`)
  process.exit(1)
}
