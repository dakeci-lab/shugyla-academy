#!/usr/bin/env node
/**
 * Invoke local run-time-tracker-notification-scheduler Edge Function with HMAC auth.
 *
 * Usage:
 *   node scripts/invoke-local-time-tracker-scheduler.mjs --status
 *   node scripts/invoke-local-time-tracker-scheduler.mjs --invoke
 *   node scripts/invoke-local-time-tracker-scheduler.mjs --invoke --run-at=2026-08-10T03:50:00.000Z
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getLocalSupabaseStatus } from './lib/localSupabaseCli.mjs'
import { parseEdgeEnv, signSchedulerRequest } from './lib/scheduler-request-signing.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROJECT_ID = 'shugyla-academy'
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'
const EDGE_ENV = path.join(ROOT, 'supabase/functions/.env')
const FUNCTION_NAME = 'run-time-tracker-notification-scheduler'

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

function assertLocalEnvironment(apiUrl) {
  const lower = apiUrl.toLowerCase()
  if (!lower.includes('127.0.0.1') && !lower.includes('localhost')) {
    fail('Invoker requires local Supabase URL')
  }
  if (lower.includes('supabase.co') || lower.includes(PRODUCTION_REF)) {
    fail('Production Supabase URL is blocked')
  }
}

function runPsql(sql) {
  const container = `supabase_db_${PROJECT_ID}`
  const result = spawnSync(
    'docker',
    ['exec', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql],
    { encoding: 'utf8' }
  )
  if (result.status !== 0) {
    fail(`psql failed: ${result.stderr?.trim() || result.stdout?.trim()}`)
  }
  return result.stdout.trim()
}

function readSchedulerSecret() {
  if (!fs.existsSync(EDGE_ENV)) {
    fail('Missing supabase/functions/.env — run npm run webpush:local:prepare-edge-env')
  }
  const env = parseEdgeEnv(fs.readFileSync(EDGE_ENV, 'utf8'))
  const secret = env.TIME_TRACKER_SCHEDULER_SECRET_CURRENT
  if (!secret) {
    fail('TIME_TRACKER_SCHEDULER_SECRET_CURRENT missing in edge env')
  }
  return { env, secret }
}

function showStatus() {
  const status = getLocalSupabaseStatus()
  assertLocalEnvironment(status.API_URL)
  const { env } = readSchedulerSecret()

  const enabledRuleCount = Number(
    runPsql(
      "SELECT COUNT(*)::text FROM public.notification_rules WHERE module_code = 'time_tracker' AND is_enabled = true AND trigger_type = 'scheduled';"
    )
  )

  const schedulerReady = Boolean(env.TIME_TRACKER_SCHEDULER_SECRET_CURRENT)

  console.log(
    JSON.stringify(
      {
        localEnvironment: true,
        schedulerEnabled: env.TIME_TRACKER_SCHEDULER_ENABLED === 'true',
        testMode: env.TIME_TRACKER_SCHEDULER_TEST_MODE === 'true',
        schedulerSecretReady: schedulerReady,
        enabledRuleCount,
        productionConnected: false,
      },
      null,
      2
    )
  )
}

async function invokeScheduler(runAtIso) {
  const status = getLocalSupabaseStatus()
  assertLocalEnvironment(status.API_URL)
  const { secret } = readSchedulerSecret()

  const body = '{}'
  const signed = signSchedulerRequest({ secret, body })

  const headers = {
    'Content-Type': 'application/json',
    apikey: status.ANON_KEY,
    'x-shugyla-scheduler-timestamp': signed.timestamp,
    'x-shugyla-scheduler-signature': signed.signature,
  }

  if (runAtIso) {
    headers['x-shugyla-scheduler-test-run-at'] = runAtIso
  }

  const functionUrl = `${status.API_URL}/functions/v1/${FUNCTION_NAME}`
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers,
    body,
  })

  let json = null
  try {
    json = await response.json()
  } catch {
    json = null
  }

  if (!json) {
    fail(`Unexpected response status ${response.status}`)
  }

  console.log(JSON.stringify(json, null, 2))

  if (!response.ok) {
    process.exitCode = 1
  }
}

const args = process.argv.slice(2)
const mode = args[0] ?? '--status'
const runAtArg = args.find((arg) => arg.startsWith('--run-at='))
const runAtIso = runAtArg ? runAtArg.slice('--run-at='.length) : undefined

if (mode === '--status') {
  showStatus()
} else if (mode === '--invoke') {
  await invokeScheduler(runAtIso)
} else {
  fail(`Unknown mode: ${mode}. Use --invoke or --status`)
}
