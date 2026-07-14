#!/usr/bin/env node
/**
 * Local one-shot time tracker notification scheduler.
 *
 * Usage:
 *   node scripts/local-time-tracker-scheduler.mjs            # default: --dry-run
 *   node scripts/local-time-tracker-scheduler.mjs --dry-run
 *   node scripts/local-time-tracker-scheduler.mjs --once
 *   node scripts/local-time-tracker-scheduler.mjs --status
 */

import { spawnSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { getLocalSupabaseStatus } from './lib/localSupabaseCli.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROJECT_ID = 'shugyla-academy'
const MANUAL_LOGIN = 'web-push-manual-staff'
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'
const STATE_FILE = path.join(ROOT, '.local-secrets/time-tracker-scheduler-state.json')

function fail(message, code) {
  console.error(`ERROR: ${message}`)
  if (code) process.exitCode = code === 'local_real_scheduler_disabled' ? 1 : 1
  process.exit(1)
}

function assertLocalEnvironment(apiUrl) {
  const lower = apiUrl.toLowerCase()
  if (!lower.includes('127.0.0.1') && !lower.includes('localhost')) {
    fail('Scheduler requires local Supabase URL')
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

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return {}
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
}

function saveState(patch) {
  const current = loadState()
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...current, ...patch }, null, 2), { mode: 0o600 })
}

function invokeScheduler(payload) {
  const inputPath = path.join(os.tmpdir(), `tt-scheduler-${crypto.randomUUID()}.json`)
  const outputPath = path.join(os.tmpdir(), `tt-scheduler-out-${crypto.randomUUID()}.json`)
  fs.writeFileSync(inputPath, JSON.stringify(payload))
  try {
    const result = spawnSync(
      'npm',
      [
        'exec',
        '--yes',
        'deno',
        '--',
        'run',
        '--allow-env',
        '--allow-net',
        '--allow-read',
        '--allow-write',
        '--config',
        'supabase/functions/send-test-web-push/deno.json',
        'scripts/lib/time-tracker-scheduler-runner.ts',
        inputPath,
        outputPath,
      ],
      { cwd: ROOT, encoding: 'utf8' }
    )
    if (result.status !== 0) {
      fail(`scheduler runner failed: ${result.stderr?.trim() || result.stdout?.trim()}`)
    }
    return JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  } finally {
    fs.unlinkSync(inputPath)
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
  }
}

function showStatus() {
  const status = getLocalSupabaseStatus()
  assertLocalEnvironment(status.API_URL)

  const enabledRuleCount = Number(
    runPsql(
      "SELECT COUNT(*)::text FROM public.notification_rules WHERE module_code = 'time_tracker' AND is_enabled = true AND trigger_type = 'scheduled';"
    )
  )

  const manualSubscriptionActive =
    runPsql(`
      SELECT COUNT(*)::text FROM public.notification_push_subscriptions s
      INNER JOIN public.academy_users u ON u.id = s.employee_id
      WHERE u.login = '${MANUAL_LOGIN}' AND s.is_active = true AND s.permission_status = 'granted';
    `) === '1'

  const state = loadState()

  console.log(
    JSON.stringify(
      {
        localEnvironment: true,
        enabledRuleCount,
        manualSubscriptionActive,
        lastRunMode: state.lastRunMode ?? 'none',
        productionConnected: false,
      },
      null,
      2
    )
  )
}

function runScheduler(mode) {
  const status = getLocalSupabaseStatus()
  assertLocalEnvironment(status.API_URL)

  const dryRun = mode === 'dry-run'

  if (mode === 'once') {
    const realEnabled = process.env.LOCAL_TIME_TRACKER_SCHEDULER_REAL_ENABLED === 'true'
    const dispatchReal = process.env.TIME_TRACKER_DISPATCH_REAL_TEST_ENABLED === 'true'
    if (!realEnabled || !dispatchReal) {
      console.error('ERROR: local real scheduler disabled')
      process.exitCode = 1
      return
    }
  }

  const runAt = new Date().toISOString()
  const result = invokeScheduler({
    action: 'scheduler',
    supabaseUrl: status.API_URL,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
    runAt,
    dryRun,
  })

  saveState({ lastRunMode: mode, lastRunAt: runAt, lastStatus: result.status })

  const safe = {
    ok: result.ok,
    status: result.status,
    runAt: result.runAt,
    dryRun: result.dryRun,
    enabledRules: result.enabledRules,
    result: result.result,
  }
  console.log(JSON.stringify(safe, null, 2))
}

const arg = process.argv[2] ?? '--dry-run'

if (arg === '--status') {
  showStatus()
} else if (arg === '--dry-run') {
  runScheduler('dry-run')
} else if (arg === '--once') {
  runScheduler('once')
} else {
  fail(`Unknown mode: ${arg}. Use --dry-run, --once, or --status`)
}
