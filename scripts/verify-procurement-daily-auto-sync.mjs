#!/usr/bin/env node
/**
 * Verification: daily 07:00 (Aqtobe) automatic UMAG procurement sync,
 * independent of the manual «Синхронизировать» button.
 *
 * Static checks only — the live cron job / vault secret / Edge Function
 * secrets are applied out-of-band against the linked Supabase project
 * (see docs/procurement/planning-daily-auto-sync.md).
 *
 * Usage:
 *   npm run verify:procurement-daily-auto-sync
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

function main() {
  console.log('=== Procurement planning: daily auto-sync (07:00 Aqtobe) ===\n')

  const fn = read('supabase/functions/umag-procurement/index.ts')
  const migrationPath = 'supabase/migrations/20260902090000_procurement_planning_daily_auto_sync.sql'
  const migration = read(migrationPath)
  const configToml = read('supabase/config.toml')

  console.log('Stage 1: Edge Function — HMAC scheduler branch')

  assert('imports scheduler HMAC verifier', fn.includes('verifySchedulerRequest'))
  assert('imports scheduler secret check', fn.includes('isSchedulerSecretConfigured'))
  assert('imports createClient for service-role client', fn.includes("import { createClient } from '@supabase/supabase-js'"))
  assert('has its own enabled-flag env var', fn.includes('PROCUREMENT_SYNC_SCHEDULER_ENABLED'))
  assert('has its own HMAC secret env vars (current+previous)', fn.includes('PROCUREMENT_SYNC_SCHEDULER_SECRET_CURRENT') && fn.includes('PROCUREMENT_SYNC_SCHEDULER_SECRET_PREVIOUS'))
  assert(
    'scheduler branch checked before the JSON body parse',
    fn.indexOf("req.headers.get('x-shugyla-scheduler-signature')") <
      fn.indexOf('JSON.parse(new TextDecoder().decode(rawBody))'),
  )
  assert('reads raw body once for HMAC + JSON reuse', fn.includes('new Uint8Array(await req.arrayBuffer())'))
  assert('disabled scheduler returns 503', fn.includes("adminErrorResponse('scheduler_disabled', 503)"))
  assert('bad signature returns 401', fn.includes("if (!authorized) return adminErrorResponse('unauthorized', 401)"))
  assert('scheduler path reuses handleSync (no duplicated sync logic)', fn.includes('return handleSync({'))
  assert('scheduler caller uses a sentinel id, not a real employee', fn.includes('SCHEDULER_CALLER_ID'))
  assert(
    'interactive path (real JWT) untouched — still calls authorizeWorkforceRequest',
    fn.includes('const authz = await authorizeWorkforceRequest(req, needed)'),
  )

  console.log('\nStage 2: Sentinel audit trail (no crash on fetchCallerDisplayName for a fake id)')

  assert('scheduled run is tagged system, not a numeric employee id', fn.includes("isScheduledRun ? 'system' : String(authz.caller.id)"))
  assert('scheduled run gets a readable created_by_name', fn.includes("'Автосинхронизация (07:00)'"))

  console.log('\nStage 3: pg_cron wiring (migration)')

  assert('wrapper function is SECURITY DEFINER with locked search_path', /security definer\s*\nset search_path to 'public', 'extensions', 'vault', 'pg_catalog'/.test(migration))
  assert('reads its own HMAC secret from vault (not reusing the time-tracker one)', migration.includes("name = 'procurement_sync_scheduler_hmac_secret'"))
  assert('reuses existing base-url vault secret', migration.includes("name = 'shugyla_supabase_functions_base_url'"))
  assert('reuses existing anon-key vault secret', migration.includes("name = 'shugyla_supabase_anon_key'"))
  assert('posts to umag-procurement, not a separate function', migration.includes("/functions/v1/umag-procurement"))
  assert('sends Authorization bearer so verify_jwt on umag-procurement still passes', migration.includes("'Authorization', 'Bearer ' || v_anon"))
  assert('sends the HMAC signature + timestamp headers', migration.includes('x-shugyla-scheduler-timestamp') && migration.includes('x-shugyla-scheduler-signature'))
  assert(
    'cron schedule is 02:00 UTC == 07:00 Aqtobe (UTC+5, no DST)',
    migration.includes("'0 2 * * *'"),
  )
  assert('cron job has a distinct, descriptive name', migration.includes("'procurement-sync-scheduler-daily-0700-aqtobe'"))
  assert('migration does not embed any secret value (names only)', !/decrypted_secret\s*:=\s*'/.test(migration))

  console.log('\nStage 4: umag-procurement stays registered with verify_jwt (no interactive security downgrade)')

  const fnConfigMatch = configToml.match(/\[functions\.umag-procurement\][\s\S]*?(?=\n\[functions\.|\n*$)/)
  assert('umag-procurement config block found', Boolean(fnConfigMatch))
  assert('verify_jwt still true for the interactive path', /verify_jwt = true/.test(fnConfigMatch?.[0] || ''))
  assert('no separate scheduler Edge Function registered (reuses umag-procurement)', !configToml.includes('[functions.run-procurement-sync-scheduler]'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
