#!/usr/bin/env node
/**
 * Controlled production E2E for time-tracker Web Push (admin only).
 *
 * Requires:
 *   TIME_TRACKER_SCHEDULER_CONTROLLED_RUN_ENABLED=true
 *   deployed scheduler with controlled body support
 *
 * Usage:
 *   node scripts/run-production-tt-push-e2e.mjs
 *
 * Never logs secrets, endpoints, or push keys.
 */

import crypto from 'crypto'
import { spawnSync } from 'child_process'
import { unlinkSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { signSchedulerRequest } from './lib/scheduler-request-signing.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'
const FUNCTIONS_BASE = `https://${PRODUCTION_REF}.supabase.co/functions/v1`
const ADMIN_EMPLOYEE_ID = 1
const SHIFT_DATE = '2026-09-15'
const NIGHT_SHIFT_DATE = '2026-09-16'
const RUN_ID = `TT-PUSH-E2E-${Date.now()}`
const STATE = {
  shiftId: null,
  nightShiftId: null,
  snapshotBefore: null,
  notifications: [],
}

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exitCode = 1
  throw new Error(message)
}

function runSupabase(args, { capture = false, input = null } = {}) {
  const result = spawnSync(
    'npm',
    ['exec', '--yes', 'supabase@2.109.1', '--', ...args],
    {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: capture ? 'pipe' : 'inherit',
      input,
    }
  )
  if (result.status !== 0) {
    const detail = capture ? `${result.stdout || ''}\n${result.stderr || ''}`.trim() : ''
    fail(`supabase ${args.join(' ')} exited ${result.status}${detail ? `: ${detail.slice(0, 400)}` : ''}`)
  }
  return capture ? result.stdout : ''
}

function dbQuery(sql) {
  const tmp = path.join(os.tmpdir(), `shugyla-tt-e2e-${process.pid}-${Date.now()}.sql`)
  writeFileSync(tmp, sql, { mode: 0o600 })
  try {
    const out = runSupabase(['db', 'query', '--linked', '-f', tmp, '-o', 'json'], { capture: true })
    const match = out.match(/\{[\s\S]*\}/)
    if (!match) fail('db query returned no JSON')
    return JSON.parse(match[0]).rows ?? []
  } finally {
    try {
      unlinkSync(tmp)
    } catch {
      // ignore
    }
  }
}

function almatyIso(dateKey, hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const pad = (n) => String(n).padStart(2, '0')
  return `${dateKey}T${pad(h)}:${pad(m)}:00+05:00`
}

function getVaultSecret(name) {
  const rows = dbQuery(`
    select decrypted_secret
    from vault.decrypted_secrets
    where name = '${name.replace(/'/g, "''")}'
    limit 1;
  `)
  const value = rows[0]?.decrypted_secret
  if (!value) fail(`vault secret missing: ${name}`)
  return value
}

function getAnonKey() {
  const out = runSupabase(
    ['projects', 'api-keys', '--project-ref', PRODUCTION_REF, '-o', 'json'],
    { capture: true }
  )
  const keys = JSON.parse(out.match(/\[[\s\S]*\]/)[0])
  const anon = keys.find((k) => k.name === 'anon' || k.id === 'anon')
  if (!anon?.api_key) fail('anon API key unavailable')
  return anon.api_key
}

async function invokeControlledScheduler({ runAt, ruleCodes, secret, anonKey }) {
  if (!STATE.shiftId) fail('shiftId missing')
  const bodyObj = {
    controlled: true,
    shift_ids: [STATE.shiftId],
    employee_ids: [ADMIN_EMPLOYEE_ID],
    run_at: runAt,
    run_id: RUN_ID,
    rule_codes: ruleCodes,
  }
  const body = JSON.stringify(bodyObj)
  const signed = signSchedulerRequest({ secret, body })
  const response = await fetch(`${FUNCTIONS_BASE}/run-time-tracker-notification-scheduler`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'x-shugyla-scheduler-timestamp': signed.timestamp,
      'x-shugyla-scheduler-signature': signed.signature,
    },
    body,
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok || !json.ok) {
    fail(`controlled invoke failed HTTP ${response.status} code=${json.code || 'unknown'}`)
  }
  return json
}

function snapshotAdminShifts() {
  return dbQuery(`
    select id, shift_date::text, status,
      planned_start_time::text, planned_end_time::text,
      actual_start_time::text, actual_end_time::text
    from academy_employee_shifts
    where employee_id = ${ADMIN_EMPLOYEE_ID}
    order by shift_date, id;
  `)
}

function createTempShift() {
  const existing = dbQuery(`
    select id from academy_employee_shifts
    where employee_id = ${ADMIN_EMPLOYEE_ID}
      and shift_date = '${SHIFT_DATE}';
  `)
  if (existing.length) {
    fail(`admin already has shift on ${SHIFT_DATE}; aborting to avoid overwrite`)
  }

  const rows = dbQuery(`
    insert into academy_employee_shifts (
      employee_id, shift_date, status,
      planned_start_time, planned_end_time
    ) values (
      ${ADMIN_EMPLOYEE_ID},
      '${SHIFT_DATE}',
      'working',
      '10:00',
      '18:00'
    )
    returning id::text as id;
  `)
  const id = rows[0]?.id
  if (!id) fail('failed to create temp shift')
  STATE.shiftId = id
  console.log(`  temp_shift_id=${id}`)
  console.log(`  run_id=${RUN_ID}`)
}

function setActualStart() {
  dbQuery(`
    update academy_employee_shifts
    set actual_start_time = '${almatyIso(SHIFT_DATE, '10:05')}'::timestamptz,
        updated_at = now()
    where id = '${STATE.shiftId}'
      and employee_id = ${ADMIN_EMPLOYEE_ID};
  `)
}

function setActualEnd() {
  dbQuery(`
    update academy_employee_shifts
    set actual_end_time = '${almatyIso(SHIFT_DATE, '18:05')}'::timestamptz,
        updated_at = now()
    where id = '${STATE.shiftId}'
      and employee_id = ${ADMIN_EMPLOYEE_ID};
  `)
}

function loadRunNotifications() {
  return dbQuery(`
    select id::text as id, event_code, status,
      deduplication_key,
      action_url,
      metadata->>'web_push_outcome' as web_push_outcome,
      metadata->>'web_push_accepted_count' as accepted_count,
      metadata->>'web_push_failed_count' as failed_count,
      created_at::text as created_at
    from notifications
    where metadata->>'controlled_run_id' = '${RUN_ID}'
    order by created_at;
  `)
}

function loadDeliveries(notificationId) {
  return dbQuery(`
    select id::text as id, status, provider_status_code, error_code,
      left(coalesce(error_message,''), 80) as error_message,
      left(coalesce(provider_response::text,''), 120) as provider_response,
      left(subscription_id::text, 8) as sub_prefix
    from notification_deliveries
    where notification_id = '${notificationId}'
    order by created_at;
  `)
}

function assertNoOtherEmployeePush() {
  const rows = dbQuery(`
    select count(*)::int as cnt
    from notifications n
    where n.metadata->>'controlled_run_id' = '${RUN_ID}'
      and n.employee_id <> ${ADMIN_EMPLOYEE_ID};
  `)
  if ((rows[0]?.cnt ?? 0) > 0) fail('controlled run touched non-admin employees')
}

function summarizeEvent(eventCode) {
  const notes = loadRunNotifications().filter((n) => n.event_code === eventCode)
  if (!notes.length) {
    return { created: false, delivery: 'none', provider: 'n/a', duplicates: 0 }
  }
  const primary = notes[0]
  const deliveries = loadDeliveries(primary.id)
  const accepted = deliveries.filter((d) => d.status === 'accepted')
  const failed = deliveries.filter((d) => d.status === 'failed')
  return {
    created: true,
    notificationId: primary.id,
    notificationStatus: primary.status,
    webPushOutcome: primary.web_push_outcome,
    actionUrl: primary.action_url,
    dedupeKey: primary.deduplication_key,
    deliveryAccepted: accepted.length,
    deliveryFailed: failed.length,
    deliveries: deliveries.length,
    providerCodes: accepted.map((d) => d.provider_status_code),
    duplicates: Math.max(0, notes.length - 1),
  }
}

function createNightShift() {
  const existing = dbQuery(`
    select id from academy_employee_shifts
    where employee_id = ${ADMIN_EMPLOYEE_ID}
      and shift_date = '${NIGHT_SHIFT_DATE}';
  `)
  if (existing.length) fail(`admin already has shift on ${NIGHT_SHIFT_DATE}`)

  const rows = dbQuery(`
    insert into academy_employee_shifts (
      employee_id, shift_date, status,
      planned_start_time, planned_end_time,
      actual_start_time
    ) values (
      ${ADMIN_EMPLOYEE_ID},
      '${NIGHT_SHIFT_DATE}',
      'working',
      '22:00',
      '00:00',
      '${almatyIso(NIGHT_SHIFT_DATE, '22:05')}'::timestamptz
    )
    returning id::text as id;
  `)
  STATE.nightShiftId = rows[0]?.id
  if (!STATE.nightShiftId) fail('failed to create night temp shift')
  console.log(`  night_shift_id=${STATE.nightShiftId}`)
}

function cleanup() {
  console.log('\nCleanup')
  for (const [label, id, date] of [
    ['day', STATE.shiftId, SHIFT_DATE],
    ['night', STATE.nightShiftId, NIGHT_SHIFT_DATE],
  ]) {
    if (!id) continue
    dbQuery(`
      delete from academy_employee_shifts
      where id = '${id}'
        and employee_id = ${ADMIN_EMPLOYEE_ID}
        and shift_date = '${date}';
    `)
    const gone = dbQuery(`
      select count(*)::int as cnt
      from academy_employee_shifts
      where id = '${id}';
    `)
    if ((gone[0]?.cnt ?? 1) !== 0) fail(`cleanup failed for ${label} shift ${id}`)
    console.log(`  deleted_${label}_shift_id=${id}`)
  }

  const leftover = dbQuery(`
    select count(*)::int as cnt
    from academy_employee_shifts
    where employee_id = ${ADMIN_EMPLOYEE_ID}
      and shift_date in ('${SHIFT_DATE}', '${NIGHT_SHIFT_DATE}');
  `)
  if ((leftover[0]?.cnt ?? 0) !== 0) fail('leftover test shifts remain for e2e dates')
}

function compareSnapshots(before, after) {
  const beforeIds = new Set(before.map((r) => r.id))
  const afterIds = new Set(after.map((r) => r.id))
  for (const id of beforeIds) {
    if (!afterIds.has(id)) fail(`real shift missing after cleanup: ${id}`)
  }
  for (const id of afterIds) {
    if (!beforeIds.has(id) && id !== STATE.shiftId) {
      fail(`unexpected new shift after cleanup: ${id}`)
    }
  }
}

async function main() {
  console.log('=== Production TT push controlled E2E (admin only) ===\n')
  console.log(`run_id=${RUN_ID}`)
  console.log(`shift_date=${SHIFT_DATE}`)

  STATE.snapshotBefore = snapshotAdminShifts()
  console.log(`snapshot_admin_shifts=${STATE.snapshotBefore.length}`)

  const secret = getVaultSecret('time_tracker_scheduler_hmac_secret')
  const anonKey = getAnonKey()

  createTempShift()

  try {
    console.log('\n1) shift_start_soon')
    const startSoon = await invokeControlledScheduler({
      runAt: almatyIso(SHIFT_DATE, '09:55'),
      ruleCodes: ['time_tracker.rule.shift_start_soon'],
      secret,
      anonKey,
    })
    console.log(
      `  matched=${startSoon.result?.matchedEvents} created=${startSoon.result?.createdNotifications} accepted=${startSoon.result?.pushAccepted} failed=${startSoon.result?.pushFailed}`
    )
    console.log(
      `  vapid_pair_matches=${startSoon.vapid?.pair_matches} fp=${startSoon.vapid?.public_key_fingerprint} subject=${startSoon.vapid?.subject_kind}`
    )
    const startSummary = summarizeEvent('time_tracker.shift_start_soon')
    if (startSummary.created) {
      const sample = loadDeliveries(startSummary.notificationId).slice(0, 2)
      for (const d of sample) {
        console.log(
          `  delivery sub=${d.sub_prefix} status=${d.status} http=${d.provider_status_code} err=${d.error_code} reason=${d.error_message || d.provider_response || ''}`
        )
      }
    }

    console.log('\n1b) dedupe shift_start_soon')
    const startSoon2 = await invokeControlledScheduler({
      runAt: almatyIso(SHIFT_DATE, '09:56'),
      ruleCodes: ['time_tracker.rule.shift_start_soon'],
      secret,
      anonKey,
    })
    console.log(`  skippedDuplicates=${startSoon2.result?.skippedDuplicates} created=${startSoon2.result?.createdNotifications}`)

    console.log('\n2) clock_in_missing a1')
    const clockIn1 = await invokeControlledScheduler({
      runAt: almatyIso(SHIFT_DATE, '10:05'),
      ruleCodes: ['time_tracker.rule.clock_in_missing'],
      secret,
      anonKey,
    })
    console.log(`  matched=${clockIn1.result?.matchedEvents} created=${clockIn1.result?.createdNotifications} accepted=${clockIn1.result?.pushAccepted}`)

    console.log('\n2b) clock_in_missing a2 (backdate a1 created_at by 11m)')
    dbQuery(`
      update notifications
      set created_at = created_at - interval '11 minutes'
      where metadata->>'controlled_run_id' = '${RUN_ID}'
        and event_code = 'clock_in_missing'
        and deduplication_key ~ ':a1$'
        and employee_id = ${ADMIN_EMPLOYEE_ID};
    `)
    const clockIn2 = await invokeControlledScheduler({
      runAt: almatyIso(SHIFT_DATE, '10:16'),
      ruleCodes: ['time_tracker.rule.clock_in_missing'],
      secret,
      anonKey,
    })
    console.log(`  matched=${clockIn2.result?.matchedEvents} created=${clockIn2.result?.createdNotifications} accepted=${clockIn2.result?.pushAccepted}`)

    console.log('\n2c) cancel clock_in_missing after actual_start')
    setActualStart()
    const clockInAfter = await invokeControlledScheduler({
      runAt: almatyIso(SHIFT_DATE, '10:30'),
      ruleCodes: ['time_tracker.rule.clock_in_missing'],
      secret,
      anonKey,
    })
    console.log(`  matched_after_clock_in=${clockInAfter.result?.matchedEvents} created=${clockInAfter.result?.createdNotifications}`)

    console.log('\n3) shift_end_reached')
    const endReached = await invokeControlledScheduler({
      runAt: almatyIso(SHIFT_DATE, '18:00'),
      ruleCodes: ['time_tracker.rule.shift_end_reached'],
      secret,
      anonKey,
    })
    console.log(`  matched=${endReached.result?.matchedEvents} created=${endReached.result?.createdNotifications} accepted=${endReached.result?.pushAccepted}`)

    console.log('\n4) clock_out_missing a1')
    const clockOut1 = await invokeControlledScheduler({
      runAt: almatyIso(SHIFT_DATE, '18:10'),
      ruleCodes: ['time_tracker.rule.clock_out_missing'],
      secret,
      anonKey,
    })
    console.log(`  matched=${clockOut1.result?.matchedEvents} created=${clockOut1.result?.createdNotifications} accepted=${clockOut1.result?.pushAccepted}`)

    console.log('\n4b) cancel clock_out_missing after actual_end')
    setActualEnd()
    const clockOutAfter = await invokeControlledScheduler({
      runAt: almatyIso(SHIFT_DATE, '18:25'),
      ruleCodes: ['time_tracker.rule.clock_out_missing'],
      secret,
      anonKey,
    })
    console.log(`  matched_after_clock_out=${clockOutAfter.result?.matchedEvents} created=${clockOutAfter.result?.createdNotifications}`)

    console.log('\n5) overnight shift_end_reached (22:00→00:00)')
    createNightShift()
    const previousShiftId = STATE.shiftId
    STATE.shiftId = STATE.nightShiftId
    const nightEnd = await invokeControlledScheduler({
      runAt: almatyIso('2026-09-17', '00:00'),
      ruleCodes: ['time_tracker.rule.shift_end_reached'],
      secret,
      anonKey,
    })
    STATE.shiftId = previousShiftId
    console.log(`  night_matched=${nightEnd.result?.matchedEvents} created=${nightEnd.result?.createdNotifications} accepted=${nightEnd.result?.pushAccepted}`)

    assertNoOtherEmployeePush()

    console.log('\n=== Event summary ===')
    for (const event of [
      'shift_start_soon',
      'clock_in_missing',
      'shift_end_reached',
      'clock_out_missing',
    ]) {
      const summary = summarizeEvent(event)
      console.log(JSON.stringify({ event, ...summary }))
      STATE.notifications.push({ event, ...summary })
    }

    if (clockInAfter.result?.createdNotifications !== 0) {
      fail('clock_in_missing created after actual_start')
    }
    if (clockOutAfter.result?.createdNotifications !== 0) {
      fail('clock_out_missing created after actual_end')
    }
    if (startSoon2.result?.createdNotifications !== 0) {
      fail('shift_start_soon duplicate created')
    }
  } finally {
    cleanup()
    const after = snapshotAdminShifts()
    compareSnapshots(STATE.snapshotBefore, after)
    console.log('snapshot_match=true')
  }

  console.log('\nDONE')
  console.log(JSON.stringify({ runId: RUN_ID, shiftId: STATE.shiftId, events: STATE.notifications }, null, 2))
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
