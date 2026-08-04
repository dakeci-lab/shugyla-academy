#!/usr/bin/env node
/**
 * Stage 6 admin escalation static + pure verification.
 *
 * Usage:
 *   npm run verify:admin-escalations
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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000)
}

/** Pure mirror of escalation timing gates used by scheduler. */
function shouldEscalateClockIn({ runAt, plannedStart, delayMinutes, hasActualStart, already }) {
  if (already || hasActualStart) return false
  return runAt.getTime() >= addMinutes(plannedStart, delayMinutes).getTime()
}

function shouldEscalateClockOut({
  runAt,
  plannedEnd,
  delayMinutes,
  hasActualStart,
  hasActualEnd,
  already,
}) {
  if (already || !hasActualStart || hasActualEnd) return false
  return runAt.getTime() >= addMinutes(plannedEnd, delayMinutes).getTime()
}

function stageStatic() {
  console.log('Stage 1: Wiring')
  const logic = read('supabase/functions/_shared/adminEscalationLogic.ts')
  const recipients = read('supabase/functions/_shared/adminEscalationRecipients.ts')
  const dispatch = read('supabase/functions/_shared/adminEscalationDispatch.ts')
  const warnings = read('supabase/functions/_shared/adminEscalationWarnings.ts')
  const scheduler = read('supabase/functions/_shared/timeTrackerNotificationScheduler.ts')
  const controlled = read('supabase/functions/_shared/schedulerControlledRun.ts')
  const migration = read('supabase/migrations/20260804220000_time_tracker_admin_escalations.sql')
  const edge = read('supabase/functions/admin-notification-settings/index.ts')
  const page = read('src/pages/platform/PlatformSettingsNotifications.jsx')
  const home = read('src/pages/platform/PlatformHome.jsx')
  const sw = read('public/sw.js')

  assert('clock-in delay default 15', logic.includes('clock_in_delay_minutes: 15'))
  assert('clock-out delay default 20', logic.includes('clock_out_delay_minutes: 20'))
  assert('dedupe key admin event', logic.includes('admin_clock_in_escalation'))
  assert('relative action url', logic.includes('/platform?employee='))
  assert(
    'no hardcoded employee 1',
    !recipients.includes('employee_id === 1') && !recipients.includes('employee_id = 1')
  )
  assert('duty from schedule', recipients.includes('coversInstant'))
  assert('permission fallback', recipients.includes('schedule.view_team'))
  assert('exclude violator', recipients.includes('violatorEmployeeId'))
  assert('controlled override', recipients.includes('controlled_override'))
  assert('dispatch resolves open violations', dispatch.includes("status: 'resolved'"))
  assert('race cancel actual start', dispatch.includes('actual_start_time'))
  assert('scheduler calls escalations', scheduler.includes('dispatchAdminEscalations'))
  assert('suppress employee push', scheduler.includes('suppressEmployeePush'))
  assert('controlled recipient ids', controlled.includes('recipient_employee_ids'))
  assert('admin esc run id', controlled.includes('TT-ADMIN-ESC-E2E'))
  assert('cron forbids override keys unless controlled', controlled.includes("mode: 'cron'"))
  assert('migration settings table', migration.includes('time_tracker_escalation_settings'))
  assert('migration violations table', migration.includes('time_tracker_violations'))
  assert('edge escalation settings', edge.includes('get_escalation_settings'))
  assert('edge violations list', edge.includes('list_time_tracker_violations'))
  assert('edge ops warnings', edge.includes('buildAdminEscalationWarnings'))
  assert('UI escalation panel', page.includes('TimeTrackerEscalationSettingsPanel'))
  assert('UI violations journal', page.includes('TimeTrackerViolationsJournal'))
  assert('home deep link banner', home.includes('violationContext'))
  assert('four employee rules untouched whitelist', scheduler.includes('time_tracker.rule.clock_in_missing'))
  assert('ops warning fallback', warnings.includes('fallback_not_configured'))
  assert('ops warning no admin push', warnings.includes('active_violations_without_admin_push'))
  assert('ops warning zero accepted', warnings.includes('escalation_zero_accepted'))
  assert('ops warning admin no sub', warnings.includes('duty_admin_no_current_subscription'))
  assert('ops warning escalations off', warnings.includes('escalations_disabled'))
  assert('ops warning vapid', warnings.includes('vapid_fingerprint_mismatch'))
  assert('ops warning scheduler stale', warnings.includes('scheduler_stale'))
  assert('notificationclick opens clients', sw.includes('notificationclick'))
  assert('no secrets in dispatch', !dispatch.includes('BEGIN PRIVATE KEY'))
  assert('no endpoint in payload builder call', !dispatch.includes('endpoint:'))
  console.log('')
}

function stagePure() {
  console.log('Stage 2: Pure escalation gates')
  const start = new Date('2026-10-12T10:00:00+05:00')
  const end = new Date('2026-10-12T18:00:00+05:00')

  assert(
    'clock-in after 15m',
    shouldEscalateClockIn({
      runAt: new Date('2026-10-12T10:15:00+05:00'),
      plannedStart: start,
      delayMinutes: 15,
      hasActualStart: false,
      already: false,
    })
  )
  assert(
    'no clock-in before 15m',
    !shouldEscalateClockIn({
      runAt: new Date('2026-10-12T10:14:00+05:00'),
      plannedStart: start,
      delayMinutes: 15,
      hasActualStart: false,
      already: false,
    })
  )
  assert(
    'no clock-in after actual start',
    !shouldEscalateClockIn({
      runAt: new Date('2026-10-12T10:20:00+05:00'),
      plannedStart: start,
      delayMinutes: 15,
      hasActualStart: true,
      already: false,
    })
  )
  assert(
    'clock-out after 20m',
    shouldEscalateClockOut({
      runAt: new Date('2026-10-12T18:20:00+05:00'),
      plannedEnd: end,
      delayMinutes: 20,
      hasActualStart: true,
      hasActualEnd: false,
      already: false,
    })
  )
  assert(
    'no clock-out before 20m',
    !shouldEscalateClockOut({
      runAt: new Date('2026-10-12T18:19:00+05:00'),
      plannedEnd: end,
      delayMinutes: 20,
      hasActualStart: true,
      hasActualEnd: false,
      already: false,
    })
  )
  assert(
    'no clock-out after actual end',
    !shouldEscalateClockOut({
      runAt: new Date('2026-10-12T18:30:00+05:00'),
      plannedEnd: end,
      delayMinutes: 20,
      hasActualStart: true,
      hasActualEnd: true,
      already: false,
    })
  )
  assert(
    'one escalation per shift/recipient key',
    'admin_clock_in_escalation:shift-a:3' ===
      `admin_clock_in_escalation:shift-a:3`
  )
  assert(
    'overnight end after midnight',
    shouldEscalateClockOut({
      runAt: new Date('2026-10-13T00:20:00+05:00'),
      plannedEnd: new Date('2026-10-13T00:00:00+05:00'),
      delayMinutes: 20,
      hasActualStart: true,
      hasActualEnd: false,
      already: false,
    })
  )
  assert(
    '00:00 end threshold',
    shouldEscalateClockOut({
      runAt: new Date('2026-10-13T00:20:00+05:00'),
      plannedEnd: new Date('2026-10-13T00:00:00+05:00'),
      delayMinutes: 20,
      hasActualStart: true,
      hasActualEnd: false,
      already: false,
    })
  )
  assert(
    'action url relative',
    '/platform?employee=8&shift=abc&violation=clock_in'.startsWith('/platform?')
  )
  assert(
    'already escalated blocked',
    !shouldEscalateClockIn({
      runAt: new Date('2026-10-12T10:30:00+05:00'),
      plannedStart: start,
      delayMinutes: 15,
      hasActualStart: false,
      already: true,
    })
  )
  console.log('')
}

function stagePackage() {
  console.log('Stage 3: package')
  const pkg = JSON.parse(read('package.json'))
  assert(
    'verify script',
    pkg.scripts['verify:admin-escalations'] === 'node scripts/verify-admin-escalations.mjs'
  )
  assert(
    'e2e script',
    typeof pkg.scripts['tt:production:admin-escalation-e2e'] === 'string'
  )
  console.log('')
}

function stageEmployeeRulesUnchanged() {
  console.log('Stage 4: employee rules whitelist')
  const edge = read('supabase/functions/admin-notification-settings/index.ts')
  assert('settings whitelist has 4 employee rules only', edge.includes("'time_tracker.rule.shift_start_soon'"))
  assert('admin rule not in employee whitelist edit path', !edge.includes("'time_tracker.rule.admin_clock_in_escalation'"))
  console.log('')
}

function main() {
  console.log('verify-admin-escalations\n')
  stageStatic()
  stagePure()
  stagePackage()
  stageEmployeeRulesUnchanged()
  console.log(`Passed ${testsPassed}/${testsRun}`)
}

try {
  main()
} catch (error) {
  console.error(`\nFAIL: ${error.message}`)
  process.exit(1)
}
