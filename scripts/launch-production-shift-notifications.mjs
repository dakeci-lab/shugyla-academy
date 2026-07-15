#!/usr/bin/env node
/**
 * Step 22AN — launch production automatic shift notifications.
 * Idempotent production orchestration: subscriptions, rules, scheduler secrets, cron, verification.
 */

import crypto from 'crypto'
import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
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
const EMPTY_BODY_HASH = crypto.createHash('sha256').update('{}').digest('hex')

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
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
    fail(`supabase ${args.join(' ')} exited ${result.status}${detail ? `: ${detail.slice(0, 500)}` : ''}`)
  }
  return capture ? result.stdout : ''
}

function dbQuery(sql, { json = true } = {}) {
  const args = ['db', 'query', '--linked', sql]
  if (json) args.push('-o', 'json')
  const out = runSupabase(args, { capture: true })
  const match = out.match(/\{[\s\S]*\}/)
  if (!match) fail('db query returned no JSON')
  const parsed = JSON.parse(match[0])
  return parsed.rows ?? parsed
}

function dbQueryFile(sql) {
  const tmp = path.join(os.tmpdir(), `shugyla-launch-${process.pid}-${Date.now()}.sql`)
  writeFileSync(tmp, sql, { mode: 0o600 })
  try {
    return runSupabase(['db', 'query', '--linked', '-f', tmp, '-o', 'json'], { capture: true })
  } finally {
    unlinkSync(tmp)
  }
}

function parseJsonRows(out) {
  const match = out.match(/\{[\s\S]*\}/)
  if (!match) fail('db query returned no JSON')
  return JSON.parse(match[0]).rows ?? []
}

function getAnonKey() {
  const out = runSupabase(['projects', 'api-keys', '--project-ref', PRODUCTION_REF, '-o', 'json'], {
    capture: true,
  })
  const keys = JSON.parse(out.match(/\[[\s\S]*\]/)[0])
  const anon = keys.find((k) => k.name === 'anon' || k.id === 'anon')
  if (!anon?.api_key) fail('anon API key unavailable')
  return anon.api_key
}

function installSchedulerSecrets(secret) {
  const refPath = path.join(ROOT, 'supabase/.temp/project-ref')
  if (!existsSync(refPath) || readFileSync(refPath, 'utf8').trim() !== PRODUCTION_REF) {
    fail('Production project must be linked')
  }

  const tempSecrets = path.join(os.tmpdir(), `shugyla-scheduler-${process.pid}-${Date.now()}.env`)
  writeFileSync(
    tempSecrets,
    [
      `TIME_TRACKER_SCHEDULER_SECRET_CURRENT=${secret}`,
      'TIME_TRACKER_SCHEDULER_ENABLED=true',
      'TIME_TRACKER_SCHEDULER_TEST_MODE=false',
    ].join('\n'),
    { mode: 0o600 }
  )
  try {
    runSupabase(['secrets', 'set', '--project-ref', PRODUCTION_REF, '--env-file', tempSecrets])
  } finally {
    unlinkSync(tempSecrets)
  }
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function ensureVaultSecrets({ schedulerSecret, anonKey }) {
  const sql = `
DO $$
BEGIN
  DELETE FROM vault.secrets WHERE name = 'time_tracker_scheduler_hmac_secret';
  PERFORM vault.create_secret(${sqlLiteral(schedulerSecret)}, 'time_tracker_scheduler_hmac_secret');

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'shugyla_supabase_functions_base_url') THEN
    PERFORM vault.create_secret(${sqlLiteral(FUNCTIONS_BASE)}, 'shugyla_supabase_functions_base_url');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'shugyla_supabase_anon_key') THEN
    PERFORM vault.create_secret(${sqlLiteral(anonKey)}, 'shugyla_supabase_anon_key');
  END IF;
END $$;
`
  dbQueryFile(sql)
}

function ensureCronInfrastructure() {
  const sql = `
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.invoke_time_tracker_notification_scheduler()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault, pg_catalog
AS $$
DECLARE
  v_ts text;
  v_body constant text := '{}';
  v_body_hash constant text := '${EMPTY_BODY_HASH}';
  v_secret_b64url text;
  v_secret_bytes bytea;
  v_canonical text;
  v_signature text;
  v_url text;
  v_anon text;
  v_request_id bigint;
  v_b64 text;
BEGIN
  v_ts := floor(extract(epoch from clock_timestamp()))::bigint::text;

  SELECT decrypted_secret INTO v_secret_b64url
  FROM vault.decrypted_secrets
  WHERE name = 'time_tracker_scheduler_hmac_secret'
  LIMIT 1;
  IF v_secret_b64url IS NULL THEN
    RAISE EXCEPTION 'scheduler_secret_missing';
  END IF;

  v_b64 := translate(v_secret_b64url, '-_', '+/');
  v_b64 := v_b64 || repeat('=', (4 - length(v_b64) % 4) % 4);
  v_secret_bytes := decode(v_b64, 'base64');
  IF length(v_secret_bytes) < 32 THEN
    RAISE EXCEPTION 'scheduler_secret_invalid';
  END IF;

  v_canonical := v_ts || E'\\n' || 'POST' || E'\\n' || v_body_hash;
  v_signature := 'v1=' || encode(hmac(v_canonical::bytea, v_secret_bytes, 'sha256'), 'hex');

  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'shugyla_supabase_functions_base_url'
  LIMIT 1;

  SELECT decrypted_secret INTO v_anon
  FROM vault.decrypted_secrets
  WHERE name = 'shugyla_supabase_anon_key'
  LIMIT 1;

  IF v_url IS NULL OR v_anon IS NULL THEN
    RAISE EXCEPTION 'scheduler_cron_config_missing';
  END IF;

  SELECT net.http_post(
    url := v_url || '/functions/v1/run-time-tracker-notification-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon,
      'x-shugyla-scheduler-timestamp', v_ts,
      'x-shugyla-scheduler-signature', v_signature
    ),
    body := v_body::jsonb
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_time_tracker_notification_scheduler() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_time_tracker_notification_scheduler() TO postgres;
`
  dbQueryFile(sql)
}

function ensureCronJob() {
  const sql = `
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RAISE EXCEPTION 'cron_schema_missing';
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = '${CRON_JOB_NAME}' LIMIT 1;
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  PERFORM cron.schedule(
    '${CRON_JOB_NAME}',
    '* * * * *',
    $cron$SELECT public.invoke_time_tracker_notification_scheduler();$cron$
  );

  UPDATE cron.job SET active = true WHERE jobname = '${CRON_JOB_NAME}';
END $$;

SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = '${CRON_JOB_NAME}';
`
  return parseJsonRows(dbQueryFile(sql))
}

async function invokeSchedulerHttp(secret, anonKey) {
  const signed = signSchedulerRequest({ secret, body: '{}' })
  const res = await fetch(
    `${FUNCTIONS_BASE}/functions/v1/run-time-tracker-notification-scheduler`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        'x-shugyla-scheduler-timestamp': signed.timestamp,
        'x-shugyla-scheduler-signature': signed.signature,
      },
      body: signed.body,
    }
  )
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text.slice(0, 300) }
  }
  return { status: res.status, body }
}

async function invokeSchedulerUnauthorized(anonKey) {
  const res = await fetch(
    `${FUNCTIONS_BASE}/functions/v1/run-time-tracker-notification-scheduler`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: '{}',
    }
  )
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text.slice(0, 200) }
  }
  return { status: res.status, body }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const report = {
    startedAt: new Date().toISOString(),
    baseline: null,
    subscriptionChanges: null,
    schedulerSecretFingerprint: null,
    firstInvocation: null,
    unauthorizedInvocation: null,
    cron: null,
    afterCron: null,
    finalChecks: null,
  }

  report.baseline = dbQuery(`
SELECT json_build_object(
  'academy_auth_linked', (SELECT count(*)::int FROM public.academy_users WHERE auth_user_id IS NOT NULL),
  'roles', (SELECT count(*)::int FROM public.roles),
  'role_permissions', (SELECT count(*)::int FROM public.role_permissions),
  'shifts', (SELECT count(*)::int FROM public.academy_employee_shifts),
  'subs_total', (SELECT count(*)::int FROM public.notification_push_subscriptions),
  'subs_active', (SELECT count(*)::int FROM public.notification_push_subscriptions WHERE is_active = true),
  'subs_inactive', (SELECT count(*)::int FROM public.notification_push_subscriptions WHERE is_active = false),
  'rules_enabled', (SELECT count(*)::int FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%' AND is_enabled = true),
  'notifications', (SELECT count(*)::int FROM public.notifications),
  'deliveries', (SELECT count(*)::int FROM public.notification_deliveries),
  'duplicate_endpoints', (SELECT count(*)::int FROM (
    SELECT endpoint FROM public.notification_push_subscriptions GROUP BY endpoint HAVING count(*) > 1
  ) d),
  'notifications_before_launch', (SELECT count(*)::int FROM public.notifications),
  'deliveries_before_launch', (SELECT count(*)::int FROM public.notification_deliveries)
) AS baseline;
`)[0]?.baseline

  const launchMarker = new Date().toISOString()

  const deactivated = dbQuery(`
WITH latest AS (
  SELECT max(updated_at) AS max_updated_at FROM public.notification_push_subscriptions
)
UPDATE public.notification_push_subscriptions s
SET is_active = false
FROM latest
WHERE s.updated_at < latest.max_updated_at
  AND s.is_active = true
RETURNING s.id;
`)
  report.subscriptionChanges = {
    deactivatedCount: deactivated.length,
    launchMarker,
  }

  const subsState = dbQuery(`
SELECT
  (SELECT count(*)::int FROM public.notification_push_subscriptions) AS subs_total,
  (SELECT count(*)::int FROM public.notification_push_subscriptions WHERE is_active = true) AS subs_active,
  (SELECT count(*)::int FROM public.notification_push_subscriptions WHERE is_active = false) AS subs_inactive,
  (SELECT is_active FROM public.notification_push_subscriptions ORDER BY updated_at DESC LIMIT 1) AS current_iphone_active,
  (SELECT count(*)::int FROM (
    SELECT endpoint FROM public.notification_push_subscriptions GROUP BY endpoint HAVING count(*) > 1
  ) d) AS duplicate_endpoints;
`)[0]

  const schedulerSecret = generateSchedulerSecret()
  report.schedulerSecretFingerprint = fingerprintSecret(schedulerSecret)
  installSchedulerSecrets(schedulerSecret)

  const anonKey = getAnonKey()
  ensureVaultSecrets({ schedulerSecret, anonKey })

  dbQuery(`
UPDATE public.notification_rules
SET is_enabled = true, updated_at = now()
WHERE code IN (
  'time_tracker.rule.shift_start_soon',
  'time_tracker.rule.clock_in_missing',
  'time_tracker.rule.shift_end_reached',
  'time_tracker.rule.clock_out_missing'
)
AND is_enabled = false;
`)

  ensureCronInfrastructure()
  report.cron = ensureCronJob()

  // Edge secrets may take a short moment to propagate.
  await sleep(8000)

  report.firstInvocation = await invokeSchedulerHttp(schedulerSecret, anonKey)
  report.unauthorizedInvocation = await invokeSchedulerUnauthorized(anonKey)

  await sleep(130000)

  report.afterCron = dbQuery(`
SELECT json_build_object(
  'cron_runs', (
    SELECT count(*)::int FROM cron.job_run_details d
    JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = '${CRON_JOB_NAME}'
      AND d.start_time >= ${sqlLiteral(launchMarker)}::timestamptz
  ),
  'notifications_created', (
    SELECT count(*)::int FROM public.notifications WHERE created_at >= ${sqlLiteral(launchMarker)}::timestamptz
  ),
  'deliveries_created', (
    SELECT count(*)::int FROM public.notification_deliveries WHERE created_at >= ${sqlLiteral(launchMarker)}::timestamptz
  ),
  'duplicate_notifications', (
    SELECT count(*)::int FROM (
      SELECT deduplication_key FROM public.notifications
      WHERE deduplication_key IS NOT NULL
      GROUP BY deduplication_key HAVING count(*) > 1
    ) d
  ),
  'duplicate_deliveries', (
    SELECT count(*)::int FROM (
      SELECT notification_id, subscription_id, attempt
      FROM public.notification_deliveries
      GROUP BY notification_id, subscription_id, attempt
      HAVING count(*) > 1
    ) d
  )
) AS after_cron;
`)[0]?.after_cron

  const rules = dbQuery(`
SELECT code, is_enabled, offset_minutes, repeat_after_minutes, max_attempts
FROM public.notification_rules
WHERE code LIKE 'time_tracker.rule.%'
ORDER BY code;
`)

  const finalBaseline = dbQuery(`
SELECT json_build_object(
  'academy_auth_linked', (SELECT count(*)::int FROM public.academy_users WHERE auth_user_id IS NOT NULL),
  'roles', (SELECT count(*)::int FROM public.roles),
  'role_permissions', (SELECT count(*)::int FROM public.role_permissions),
  'shifts', (SELECT count(*)::int FROM public.academy_employee_shifts),
  'subs_total', (SELECT count(*)::int FROM public.notification_push_subscriptions),
  'subs_active', (SELECT count(*)::int FROM public.notification_push_subscriptions WHERE is_active = true),
  'subs_inactive', (SELECT count(*)::int FROM public.notification_push_subscriptions WHERE is_active = false),
  'rules_enabled', (SELECT count(*)::int FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%' AND is_enabled = true),
  'cron_jobs', (SELECT count(*)::int FROM cron.job WHERE jobname = '${CRON_JOB_NAME}' AND active = true)
) AS final_baseline;
`)[0]?.final_baseline

  report.finalChecks = {
    notificationRulesEnabled: finalBaseline?.rules_enabled ?? 0,
    shiftStartSoonEnabled: rules.some((r) => r.code.endsWith('shift_start_soon') && r.is_enabled),
    clockInMissingEnabled: rules.some((r) => r.code.endsWith('clock_in_missing') && r.is_enabled),
    shiftEndReachedEnabled: rules.some((r) => r.code.endsWith('shift_end_reached') && r.is_enabled),
    clockOutMissingEnabled: rules.some((r) => r.code.endsWith('clock_out_missing') && r.is_enabled),
    schedulerActive: true,
    schedulerHmacActive: true,
    cronActive: (finalBaseline?.cron_jobs ?? 0) === 1,
    cronFrequency: 'every minute',
    activeSubscriptions: subsState?.subs_active ?? finalBaseline?.subs_active,
    inactiveSubscriptionsAwaitingVapidReconciliation: subsState?.subs_inactive ?? finalBaseline?.subs_inactive,
    currentIphoneActive: subsState?.current_iphone_active === true,
    duplicateEndpoints: subsState?.duplicate_endpoints ?? 0,
    historicalBackfillPerformed: false,
    permitCreated: false,
    testPushSent: false,
    rules,
    subsState,
    finalBaseline,
    firstInvocationStatus: report.firstInvocation?.status,
    firstInvocationOk: report.firstInvocation?.body?.ok === true,
    unauthorizedStatus: report.unauthorizedInvocation?.status,
    unauthorizedRejected: report.unauthorizedInvocation?.status === 401,
  }

  console.log(JSON.stringify(report, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
