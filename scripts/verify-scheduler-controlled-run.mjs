#!/usr/bin/env node
/**
 * Static + pure verification for controlled time-tracker scheduler runs.
 *
 * Usage:
 *   npm run verify:scheduler-controlled-run
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

function stageStatic() {
  console.log('Stage 1: Controlled scheduler wiring')
  const edge = read('supabase/functions/run-time-tracker-notification-scheduler/index.ts')
  const shared = read('supabase/functions/_shared/schedulerControlledRun.ts')
  const dispatch = read('supabase/functions/_shared/timeTrackerNotificationDispatch.ts')
  const scheduler = read('supabase/functions/_shared/timeTrackerNotificationScheduler.ts')

  assert('shared parser exists', shared.includes('export function parseSchedulerRequestBody'))
  assert('controlled flag gate', shared.includes('TIME_TRACKER_SCHEDULER_CONTROLLED_RUN_ENABLED'))
  assert('run_id pattern TT-PUSH-E2E', shared.includes('TT-PUSH-E2E'))
  assert('admin escalation feature fully removed (run_id pattern gone)', !shared.includes('TT-ADMIN-ESC-E2E'))
  assert('suppress employee push key', shared.includes('suppress_employee_push'))
  assert('cron empty body still supported', shared.includes("mode: 'cron'"))
  assert('edge uses parser', edge.includes('parseSchedulerRequestBody'))
  assert('edge controlled mode response', edge.includes("mode: 'controlled'"))
  assert('edge cron mode unchanged for empty body', edge.includes("mode: 'cron'"))
  assert('TEST_MODE stays local-only for header', edge.includes('isLocalTestMode'))
  assert('scheduler passes shiftIds', scheduler.includes('shiftIds: params.shiftIds'))
  assert('scheduler passes employeeIds', scheduler.includes('employeeIds: params.employeeIds'))
  assert('scheduler passes controlledRunId', scheduler.includes('controlledRunId: params.controlledRunId'))
  assert('admin escalation dispatch removed from scheduler', !scheduler.includes('dispatchAdminEscalations'))
  assert('dispatch filters employeeIds', dispatch.includes('allowedEmployees'))
  assert('web_push_outcome metadata', dispatch.includes("web_push_outcome: 'no_current_subscription'"))
  assert('partial outcome', dispatch.includes("web_push_outcome: webPushOutcome"))
  assert('relative action url templates used', dispatch.includes('template.default_action_url'))
  console.log('')
}

function stageTimezonePure() {
  console.log('Stage 2: Night-shift window helpers (import dispatch via deno-free copy checks)')
  const dispatch = read('supabase/functions/_shared/timeTrackerNotificationDispatch.ts')

  assert('APP_TIMEZONE Asia/Almaty', dispatch.includes("export const APP_TIMEZONE = 'Asia/Almaty'"))
  assert('midnight end crosses day', dispatch.includes("end === '00:00'"))
  assert('end <= start crosses day', dispatch.includes('endMinutes <= startMinutes'))
  assert('zoned offset +05:00', dispatch.includes('+05:00'))
  assert('dedupe key builder', dispatch.includes('time_tracker:${eventCode}:${employeeId}:${shiftId}'))
  assert('repeat attempt suffix', dispatch.includes(':a${attempt}'))
  assert('shift_start_soon cancels on actual start', dispatch.includes('if (hasActualStart(shift)) return null'))
  assert('clock_out cancels on actual end', dispatch.includes('if (hasActualEnd(shift)) return null'))
  assert('only working status', dispatch.includes("shift.status !== 'working'"))
  assert('active employee gate', dispatch.includes("ACTIVE_EMPLOYEE_STATUS = 'active'"))
  console.log('')
}

function stagePushSafety() {
  console.log('Stage 3: Push payload + VAPID verify safety')
  const payload = read('supabase/functions/_shared/webPushPayload.ts')
  const vapid = read('supabase/functions/_shared/vapidFingerprint.ts')
  const sender = read('supabase/functions/_shared/webPushSender.ts')
  const delivery = read('supabase/functions/_shared/notificationDelivery.ts')

  assert('TT tag stays short', payload.includes('tag: `tt-${shortId}`'))
  assert('TT url is Service Worker scope-relative', payload.includes("DEFAULT_PLATFORM_URL = '/platform'"))
  assert('VAPID verify uses Web Crypto', vapid.includes("crypto.subtle.importKey"))
  assert('no Deno createECDH import', !vapid.includes("from 'node:crypto'"))
  assert('Apple long topic omitted', sender.includes("provider === 'apple' && trimmed.length > 24"))
  assert('provider reason persisted', delivery.includes('providerResponseJson'))
  console.log('')
}

function stagePackage() {
  console.log('Stage 4: npm script')
  const pkg = JSON.parse(read('package.json'))
  assert(
    'verify script registered',
    pkg.scripts['verify:scheduler-controlled-run'] ===
      'node scripts/verify-scheduler-controlled-run.mjs'
  )
  assert(
    'e2e helper registered',
    typeof pkg.scripts['tt:production:controlled-e2e'] === 'string'
  )
  console.log('')
}

function main() {
  console.log('verify-scheduler-controlled-run\n')
  stageStatic()
  stageTimezonePure()
  stagePushSafety()
  stagePackage()
  console.log(`Passed ${testsPassed}/${testsRun}`)
}

try {
  main()
} catch (error) {
  console.error(`\nFAIL: ${error.message}`)
  process.exit(1)
}
