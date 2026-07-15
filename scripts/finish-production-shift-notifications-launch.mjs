#!/usr/bin/env node
import { spawnSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  fingerprintSecret,
  generateSchedulerSecret,
  signSchedulerRequest,
} from './lib/scheduler-request-signing.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const REF = 'cxadzerxndlscwvdaymk'
const BASE = `https://${REF}.supabase.co`
const launchMarker = process.argv[2] || new Date(Date.now() - 20 * 60_000).toISOString()

function run(args) {
  const result = spawnSync('npm', ['exec', '--yes', 'supabase@2.109.1', '--', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').slice(0, 800))
  }
  return result.stdout
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

async function main() {
  const secret = generateSchedulerSecret()
  const fingerprint = fingerprintSecret(secret)
  const tmp = path.join(os.tmpdir(), `shugyla-sched-${process.pid}.env`)
  writeFileSync(
    tmp,
    [
      `TIME_TRACKER_SCHEDULER_SECRET_CURRENT=${secret}`,
      'TIME_TRACKER_SCHEDULER_ENABLED=true',
      'TIME_TRACKER_SCHEDULER_TEST_MODE=false',
    ].join('\n'),
    { mode: 0o600 }
  )
  try {
    run(['secrets', 'set', '--project-ref', REF, '--env-file', tmp])
  } finally {
    unlinkSync(tmp)
  }

  run([
    'db',
    'query',
    '--linked',
    `DO $$ BEGIN DELETE FROM vault.secrets WHERE name = 'time_tracker_scheduler_hmac_secret'; PERFORM vault.create_secret(${sqlLiteral(secret)}, 'time_tracker_scheduler_hmac_secret'); END $$; SELECT public.invoke_time_tracker_notification_scheduler() AS sql_request_id;`,
    '-o',
    'json',
  ])

  const anon = JSON.parse(run(['projects', 'api-keys', '--project-ref', REF, '-o', 'json']).match(/\[[\s\S]*\]/)[0]).find(
    (k) => k.name === 'anon'
  ).api_key

  await new Promise((r) => setTimeout(r, 8000))

  const signed = signSchedulerRequest({ secret, body: '{}' })
  const res = await fetch(`${BASE}/functions/v1/run-time-tracker-notification-scheduler`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anon,
      'x-shugyla-scheduler-timestamp': signed.timestamp,
      'x-shugyla-scheduler-signature': signed.signature,
    },
    body: signed.body,
  })
  const body = await res.json().catch(() => ({}))

  const bad = await fetch(`${BASE}/functions/v1/run-time-tracker-notification-scheduler`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon },
    body: '{}',
  })
  const badBody = await bad.json().catch(() => ({}))

  await new Promise((r) => setTimeout(r, 130000))

  const verifyOut = run([
    'db',
    'query',
    '--linked',
    `SELECT json_build_object(
      'cron_runs', (SELECT count(*)::int FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid WHERE j.jobname = 'time-tracker-notification-scheduler-every-minute' AND d.start_time >= ${sqlLiteral(launchMarker)}::timestamptz),
      'notifications_created', (SELECT count(*)::int FROM public.notifications WHERE created_at >= ${sqlLiteral(launchMarker)}::timestamptz),
      'deliveries_created', (SELECT count(*)::int FROM public.notification_deliveries WHERE created_at >= ${sqlLiteral(launchMarker)}::timestamptz),
      'duplicate_notifications', (SELECT count(*)::int FROM (SELECT deduplication_key FROM public.notifications WHERE deduplication_key IS NOT NULL GROUP BY deduplication_key HAVING count(*) > 1) d),
      'duplicate_deliveries', (SELECT count(*)::int FROM (SELECT notification_id, subscription_id, attempt FROM public.notification_deliveries GROUP BY notification_id, subscription_id, attempt HAVING count(*) > 1) d),
      'rules_enabled', (SELECT count(*)::int FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%' AND is_enabled = true),
      'subs_total', (SELECT count(*)::int FROM public.notification_push_subscriptions),
      'subs_active', (SELECT count(*)::int FROM public.notification_push_subscriptions WHERE is_active = true),
      'subs_inactive', (SELECT count(*)::int FROM public.notification_push_subscriptions WHERE is_active = false),
      'current_iphone_active', (SELECT is_active FROM public.notification_push_subscriptions ORDER BY updated_at DESC LIMIT 1),
      'duplicate_endpoints', (SELECT count(*)::int FROM (SELECT endpoint FROM public.notification_push_subscriptions GROUP BY endpoint HAVING count(*) > 1) d),
      'notifications_total', (SELECT count(*)::int FROM public.notifications),
      'deliveries_total', (SELECT count(*)::int FROM public.notification_deliveries),
      'academy_auth_linked', (SELECT count(*)::int FROM public.academy_users WHERE auth_user_id IS NOT NULL),
      'roles', (SELECT count(*)::int FROM public.roles),
      'role_permissions', (SELECT count(*)::int FROM public.role_permissions),
      'shifts', (SELECT count(*)::int FROM public.academy_employee_shifts),
      'cron_active', (SELECT count(*)::int FROM cron.job WHERE jobname = 'time-tracker-notification-scheduler-every-minute' AND active = true)
    ) AS result;`,
    '-o',
    'json',
  ])

  const result = JSON.parse(verifyOut.match(/\{[\s\S]*\}/)[0]).rows?.[0]?.result

  console.log(
    JSON.stringify(
      {
        schedulerSecretFingerprint: fingerprint,
        firstHttpInvocation: { status: res.status, ok: body.ok, schedulerStatus: body.status, enabledRules: body.enabledRules },
        unauthorizedInvocation: { status: bad.status, rejected: bad.status === 401 },
        launchMarker,
        afterCron: result,
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
