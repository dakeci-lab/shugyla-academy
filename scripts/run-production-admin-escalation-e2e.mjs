#!/usr/bin/env node
/**
 * Controlled production E2E for admin escalations (no employee push).
 *
 * Usage:
 *   node scripts/run-production-admin-escalation-e2e.mjs
 */

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
const SHIFT_DATE = '2026-10-12'
const RUN_ID = `TT-ADMIN-ESC-E2E-${Date.now()}`
const STATE = {
  violatorId: null,
  adminId: null,
  shiftId: null,
  snapshotBefore: null,
}

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exitCode = 1
  throw new Error(message)
}

function runSupabase(args, { capture = false, input = null } = {}) {
  const result = spawnSync('npm', ['exec', '--yes', 'supabase@2.109.1', '--', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    input,
  })
  if (result.status !== 0) {
    const detail = capture ? `${result.stdout || ''}\n${result.stderr || ''}`.trim() : ''
    fail(`supabase ${args.join(' ')} exited ${result.status}${detail ? `: ${detail.slice(0, 400)}` : ''}`)
  }
  return capture ? result.stdout : ''
}

function dbQuery(sql) {
  const tmp = path.join(os.tmpdir(), `shugyla-admin-esc-${process.pid}-${Date.now()}.sql`)
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

async function invokeControlled({ runAt, escalationEvents, secret, anonKey }) {
  const bodyObj = {
    controlled: true,
    shift_ids: [STATE.shiftId],
    employee_ids: [STATE.violatorId],
    run_at: runAt,
    run_id: RUN_ID,
    suppress_employee_push: true,
    escalation_only: true,
    escalation_events: escalationEvents,
    recipient_employee_ids: [STATE.adminId],
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

function pickActors() {
  const admins = dbQuery(`
    select u.id
    from academy_users u
    join roles r on r.id = u.role_id
    where u.status = 'active'
      and r.code in ('admin', 'administrator')
      and exists (
        select 1 from notification_push_subscriptions s
        where s.employee_id = u.id
          and s.is_active
          and s.permission_status = 'granted'
          and s.vapid_key_fingerprint = '71653018b9bcdd1b'
          and s.last_success_at is not null
      )
    order by u.id
    limit 1;
  `)
  STATE.adminId = admins[0]?.id
  if (!STATE.adminId) fail('no confirmed admin recipient available')

  const violators = dbQuery(`
    select u.id, u.full_name
    from academy_users u
    left join roles r on r.id = u.role_id
    where u.status = 'active'
      and u.id <> ${STATE.adminId}
      and coalesce(r.code, '') not in ('admin', 'administrator')
      and not exists (
        select 1 from academy_employee_shifts s
        where s.employee_id = u.id and s.shift_date = '${SHIFT_DATE}'
      )
    order by u.id
    limit 1;
  `)
  STATE.violatorId = violators[0]?.id
  if (!STATE.violatorId) fail('no eligible non-admin violator without shift on test date')
  console.log(`  admin_id=${STATE.adminId}`)
  console.log(`  violator_id=${STATE.violatorId} name=${violators[0].full_name}`)
}

function snapshotViolatorShifts() {
  return dbQuery(`
    select id::text as id, shift_date::text, status
    from academy_employee_shifts
    where employee_id = ${STATE.violatorId}
    order by shift_date, id;
  `)
}

function createTempShift() {
  const rows = dbQuery(`
    insert into academy_employee_shifts (
      employee_id, shift_date, status, planned_start_time, planned_end_time
    ) values (
      ${STATE.violatorId}, '${SHIFT_DATE}', 'working', '10:00', '18:00'
    )
    returning id::text as id;
  `)
  STATE.shiftId = rows[0]?.id
  if (!STATE.shiftId) fail('failed to create temp shift')
  console.log(`  temp_shift_id=${STATE.shiftId}`)
}

function setActualStart() {
  dbQuery(`
    update academy_employee_shifts
    set actual_start_time = '${almatyIso(SHIFT_DATE, '10:05')}'::timestamptz
    where id = '${STATE.shiftId}' and employee_id = ${STATE.violatorId};
  `)
}

function cleanup() {
  console.log('\nCleanup')
  if (!STATE.shiftId) return
  dbQuery(`
    delete from time_tracker_violations where shift_id = '${STATE.shiftId}';
    delete from academy_employee_shifts
    where id = '${STATE.shiftId}' and employee_id = ${STATE.violatorId} and shift_date = '${SHIFT_DATE}';
  `)
  const left = dbQuery(`select count(*)::int as cnt from academy_employee_shifts where id = '${STATE.shiftId}';`)
  if ((left[0]?.cnt ?? 1) !== 0) fail(`cleanup failed for shift ${STATE.shiftId}`)
  console.log(`  deleted_shift_id=${STATE.shiftId}`)
}

function summarize(eventCode) {
  const notes = dbQuery(`
    select id::text as id, status, metadata->>'web_push_outcome' as outcome
    from notifications
    where metadata->>'controlled_run_id' = '${RUN_ID}'
      and event_code = '${eventCode}'
      and employee_id = ${STATE.adminId}
    order by created_at;
  `)
  if (!notes.length) return { created: false }
  const deliveries = dbQuery(`
    select status, provider_status_code
    from notification_deliveries
    where notification_id = '${notes[0].id}'
    order by created_at;
  `)
  const accepted = deliveries.filter((d) => d.status === 'accepted')
  return {
    created: true,
    duplicates: Math.max(0, notes.length - 1),
    outcome: notes[0].outcome,
    accepted: accepted.length,
    providerCodes: accepted.map((d) => d.provider_status_code),
  }
}

async function main() {
  console.log('=== Production admin escalation E2E ===\n')
  console.log(`run_id=${RUN_ID}`)
  pickActors()
  STATE.snapshotBefore = snapshotViolatorShifts()
  const secret = getVaultSecret('time_tracker_scheduler_hmac_secret')
  const anonKey = getAnonKey()
  createTempShift()

  try {
    console.log('\n1) admin_clock_in_escalation')
    const clockIn = await invokeControlled({
      runAt: almatyIso(SHIFT_DATE, '10:15'),
      escalationEvents: ['admin_clock_in_escalation'],
      secret,
      anonKey,
    })
    console.log(`  matched=${clockIn.escalation?.matchedEscalations} created=${clockIn.escalation?.createdNotifications} accepted=${clockIn.escalation?.pushAccepted}`)

    console.log('\n1b) dedupe clock_in')
    const clockIn2 = await invokeControlled({
      runAt: almatyIso(SHIFT_DATE, '10:16'),
      escalationEvents: ['admin_clock_in_escalation'],
      secret,
      anonKey,
    })
    console.log(`  skipped=${clockIn2.escalation?.skippedDuplicates} created=${clockIn2.escalation?.createdViolations}`)

    setActualStart()

    console.log('\n2) admin_clock_out_escalation')
    const clockOut = await invokeControlled({
      runAt: almatyIso(SHIFT_DATE, '18:20'),
      escalationEvents: ['admin_clock_out_escalation'],
      secret,
      anonKey,
    })
    console.log(`  matched=${clockOut.escalation?.matchedEscalations} created=${clockOut.escalation?.createdNotifications} accepted=${clockOut.escalation?.pushAccepted}`)

    console.log('\n2b) dedupe clock_out')
    const clockOut2 = await invokeControlled({
      runAt: almatyIso(SHIFT_DATE, '18:21'),
      escalationEvents: ['admin_clock_out_escalation'],
      secret,
      anonKey,
    })
    console.log(`  skipped=${clockOut2.escalation?.skippedDuplicates}`)

    const summary = {
      runId: RUN_ID,
      shiftId: STATE.shiftId,
      admin_clock_in_escalation: summarize('admin_clock_in_escalation'),
      admin_clock_out_escalation: summarize('admin_clock_out_escalation'),
    }
    console.log('\n=== Summary ===')
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    cleanup()
    const after = snapshotViolatorShifts()
    const beforeIds = new Set(STATE.snapshotBefore.map((r) => r.id))
    const afterIds = new Set(after.map((r) => r.id))
    for (const id of beforeIds) {
      if (!afterIds.has(id)) fail(`real shift missing after cleanup: ${id}`)
    }
    console.log('snapshot_match=true')
  }

  console.log('\nDONE')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
