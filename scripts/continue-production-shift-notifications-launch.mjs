#!/usr/bin/env node
/** Continue Step 22AN after partial launch: cron, invoke, verify. */

import crypto from 'crypto'
import { spawnSync } from 'child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  fingerprintSecret,
  generateSchedulerSecret,
  signSchedulerRequest,
} from './lib/scheduler-request-signing.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'
const FUNCTIONS_BASE = `https://${PRODUCTION_REF}.supabase.co`
const CRON_JOB_NAME = 'time-tracker-notification-scheduler-every-minute'
const launchMarker = process.argv[2] || new Date(Date.now() - 10 * 60_000).toISOString()

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

function runSupabase(args, { capture = false } = {}) {
  const result = spawnSync('npm', ['exec', '--yes', 'supabase@2.109.1', '--', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  })
  if (result.status !== 0) {
    fail(`supabase ${args.join(' ')} exited ${result.status}`)
  }
  return capture ? result.stdout : ''
}

function dbQueryFile(sql) {
  const tmp = path.join(os.tmpdir(), `shugyla-launch-cont-${process.pid}-${Date.now()}.sql`)
  writeFileSync(tmp, sql, { mode: 0o600 })
  try {
    return runSupabase(['db', 'query', '--linked', '-f', tmp, '-o', 'json'], { capture: true })
  } finally {
    unlinkSync(tmp)
  }
}

function parseJsonRows(out) {
  const match = out.match(/\{[\s\S]*\}/)
  if (!match) fail('no JSON')
  return JSON.parse(match[0]).rows ?? []
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function getAnonKey() {
  const out = runSupabase(['projects', 'api-keys', '--project-ref', PRODUCTION_REF, '-o', 'json'], {
    capture: true,
  })
  const keys = JSON.parse(out.match(/\[[\s\S]*\]/)[0])
  const anon = keys.find((k) => k.name === 'anon' || k.id === 'anon')
  if (!anon?.api_key) fail('anon key missing')
  return anon.api_key
}

function installSchedulerSecrets(secret) {
  const temp = path.join(os.tmpdir(), `shugyla-scheduler-${process.pid}.env`)
  writeFileSync(
    temp,
    [
      `TIME_TRACKER_SCHEDULER_SECRET_CURRENT=${secret}`,
      'TIME_TRACKER_SCHEDULER_ENABLED=true',
      'TIME_TRACKER_SCHEDULER_TEST_MODE=false',
    ].join('\n'),
    { mode: 0o600 }
  )
  try {
    runSupabase(['secrets', 'set', '--project-ref', PRODUCTION_REF, '--env-file', temp])
  } finally {
    unlinkSync(temp)
  }
}

function ensureVaultSecret(schedulerSecret) {
  dbQueryFile(`
DO $$
BEGIN
  DELETE FROM vault.secrets WHERE name = 'time_tracker_scheduler_hmac_secret';
  PERFORM vault.create_secret(${sqlLiteral(schedulerSecret)}, 'time_tracker_scheduler_hmac_secret');
END $$;
`)
}

function ensureCronJob() {
  return parseJsonRows(dbQueryFile(`
DO $$
DECLARE v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = '${CRON_JOB_NAME}' LIMIT 1;
  IF v_jobid IS NOT NULL THEN PERFORM cron.unschedule(v_jobid); END IF;
  PERFORM cron.schedule('${CRON_JOB_NAME}', '* * * * *', $cron$SELECT public.invoke_time_tracker_notification_scheduler();$cron$);
  UPDATE cron.job SET active = true WHERE jobname = '${CRON_JOB_NAME}';
END $$;
SELECT jobname, schedule, active FROM cron.job WHERE jobname = '${CRON_JOB_NAME}';
`))
}

async function invokeSchedulerHttp(secret, anonKey) {
  const signed = signSchedulerRequest({ secret, body: '{}' })
  const res = await fetch(`${FUNCTIONS_BASE}/functions/v1/run-time-tracker-notification-scheduler`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      'x-shugyla-scheduler-timestamp': signed.timestamp,
      'x-shugyla-scheduler-signature': signed.signature,
    },
    body: signed.body,
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function invokeUnauthorized(anonKey) {
  const res = await fetch(`${FUNCTIONS_BASE}/functions/v1/run-time-tracker-notification-scheduler`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey },
    body: '{}',
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const secret = generateSchedulerSecret()
  const fingerprint = fingerprintSecret(secret)
  installSchedulerSecrets(secret)
  ensureVaultSecret(secret)
  const cron = ensureCronJob()
  const anonKey = getAnonKey()

  await sleep(8000)
  const firstInvocation = await invokeSchedulerHttp(secret, anonKey)
  const unauthorized = await invokeUnauthorized(anonKey)

  await sleep(130000)

  const out = dbQueryFile(`
SELECT json_build_object(
  'cron_runs', (SELECT count(*)::int FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid WHERE j.jobname = '${CRON_JOB_NAME}' AND d.start_time >= ${sqlLiteral(launchMarker)}::timestamptz),
  'notifications_created', (SELECT count(*)::int FROM public.notifications WHERE created_at >= ${sqlLiteral(launchMarker)}::timestamptz),
  'deliveries_created', (SELECT count(*)::int FROM public.notification_deliveries WHERE created_at >= ${sqlLiteral(launchMarker)}::timestamptz),
  'duplicate_notifications', (SELECT count(*)::int FROM (SELECT deduplication_key FROM public.notifications WHERE deduplication_key IS NOT NULL GROUP BY deduplication_key HAVING count(*) > 1) d),
  'duplicate_deliveries', (SELECT count(*)::int FROM (SELECT notification_id, subscription_id, attempt FROM public.notification_deliveries GROUP BY notification_id, subscription_id, attempt HAVING count(*) > 1) d),
  'rules_enabled', (SELECT count(*)::int FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%' AND is_enabled = true),
  'subs_active', (SELECT count(*)::int FROM public.notification_push_subscriptions WHERE is_active = true),
  'subs_inactive', (SELECT count(*)::int FROM public.notification_push_subscriptions WHERE is_active = false),
  'cron_active', (SELECT count(*)::int FROM cron.job WHERE jobname = '${CRON_JOB_NAME}' AND active = true)
) AS result;
`)

  console.log(
    JSON.stringify(
      {
        schedulerSecretFingerprint: fingerprint,
        cron,
        firstInvocation,
        unauthorized,
        launchMarker,
        afterCron: parseJsonRows(out)[0]?.result,
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
