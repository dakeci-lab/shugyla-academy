#!/usr/bin/env node
/**
 * Static/local verification for manual real dispatch guards (no real push).
 *
 * Usage:
 *   npm run supabase:local:verify-time-tracker-manual-dispatch
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getLocalSupabaseStatus } from './lib/localSupabaseCli.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROJECT_ID = 'shugyla-academy'
const MANUAL_LOGIN = 'web-push-manual-staff'
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'

const state = { testsRun: 0, testsPassed: 0, container: null }

function fail(message) {
  throw new Error(message)
}

function pass(name) {
  state.testsRun += 1
  state.testsPassed += 1
  console.log(`  ✓ ${name}`)
}

function assert(name, condition, detail = '') {
  state.testsRun += 1
  if (!condition) fail(`${name}${detail ? `: ${detail}` : ''}`)
  state.testsPassed += 1
  console.log(`  ✓ ${name}`)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  })
  if (result.error) fail(`${command} failed: ${result.error.message}`)
  if (result.status !== 0 && !options.allowFailure) {
    fail(`${command} exited with code ${result.status}`)
  }
  return result
}

function psqlScalar(sql) {
  const result = run(
    'docker',
    ['exec', state.container, 'psql', '-U', 'postgres', '-t', '-A', '-c', sql],
    { capture: true }
  )
  return result.stdout.trim()
}

function main() {
  try {
    console.log('=== Time tracker manual dispatch verification ===\n')

    const fnPath = path.join(ROOT, 'supabase/functions/dispatch-time-tracker-notifications/index.ts')
    const fnSource = fs.readFileSync(fnPath, 'utf8')
    const prepareScript = fs.readFileSync(
      path.join(ROOT, 'scripts/prepare-local-web-push-edge-env.mjs'),
      'utf8'
    )
    const manualScript = fs.readFileSync(
      path.join(ROOT, 'scripts/local-time-tracker-manual-dispatch.mjs'),
      'utf8'
    )
    const coreSource = fs.readFileSync(
      path.join(ROOT, 'supabase/functions/_shared/timeTrackerNotificationDispatch.ts'),
      'utf8'
    )

    console.log('Stage 1: Static guards')
    assert('real dispatch requires REAL_TEST flag', fnSource.includes('TIME_TRACKER_DISPATCH_REAL_TEST_ENABLED'))
    assert('real_dispatch_disabled response', fnSource.includes("'real_dispatch_disabled'"))
    assert('hosted environment blocked', fnSource.includes('supabase.co') && fnSource.includes(PRODUCTION_REF))
    assert('JWT via authorizeEmployeeAdmin', fnSource.includes('authorizeEmployeeAdmin'))
    assert('schedule.edit permission', fnSource.includes("'schedule.edit'"))
    assert('forbidden employee_id in body', fnSource.includes("'employee_id'"))
    assert('whitelist rule codes only', fnSource.includes('time_tracker.rule.shift_start_soon'))
    assert('dry-run guard sender preserved', fnSource.includes('dryRunGuardSender'))
    assert('core dispatch reused', fnSource.includes('dispatchTimeTrackerNotifications'))
    assert('real flow uses default sender', fnSource.includes('sender: validated.dryRun ? dryRunGuardSender : undefined'))
    assert('prepare script merges REAL_TEST flag', prepareScript.includes('TIME_TRACKER_DISPATCH_REAL_TEST_ENABLED'))
    assert('manual script exists', fs.existsSync(path.join(ROOT, 'scripts/local-time-tracker-manual-dispatch.mjs')))
    assert('manual script avoids secret output', !/console\.log\([^)]*(endpoint|p256dh|auth_key|JWT|service_role)/i.test(manualScript))
    assert('dedupe key pattern in manual script', manualScript.includes('shift_start_soon'))
    assert('core dedupe support', coreSource.includes('skippedDuplicates'))
    console.log('')

    console.log('Stage 2: Environment + fixtures')
    const status = getLocalSupabaseStatus()
    assert('local API URL only', status.API_URL.includes('127.0.0.1'))
    assert('no production ref in API URL', !status.API_URL.includes(PRODUCTION_REF))

    const containerName = `supabase_db_${PROJECT_ID}`
    const containers = run('docker', ['ps', '--filter', `name=^/${containerName}$`, '--format', '{{.Names}}'], {
      capture: true,
    })
      .stdout.trim()
      .split('\n')
      .filter(Boolean)
    if (containers.length !== 1) fail(`Expected one DB container, found ${containers.length}`)
    state.container = containers[0]

    const manualExists = psqlScalar(`SELECT COUNT(*)::text FROM public.academy_users WHERE login = '${MANUAL_LOGIN}';`)
    assert('manual user exists', manualExists === '1')

    const manualSub = psqlScalar(`
      SELECT COUNT(*)::text FROM public.notification_push_subscriptions s
      INNER JOIN public.academy_users u ON u.id = s.employee_id
      WHERE u.login = '${MANUAL_LOGIN}' AND s.is_active = true AND s.permission_status = 'granted';
    `)
    assert('manual subscription active', manualSub === '1')

    const rulesEnabled = psqlScalar(
      "SELECT COUNT(*)::text FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%' AND is_enabled = true;"
    )
    assert('seed rules remain disabled', rulesEnabled === '0')
    console.log('')

    console.log('Stage 3: Secrets not in repo')
    const srcServiceRole = run('grep', ['-r', '-l', 'SUPABASE_SERVICE_ROLE', 'src'], {
      capture: true,
      allowFailure: true,
    })
    assert('service_role absent in src', !srcServiceRole.stdout.trim())

    const edgeEnvPath = path.join(ROOT, 'supabase/functions/.env')
    if (fs.existsSync(edgeEnvPath)) {
      const edgeEnv = fs.readFileSync(edgeEnvPath, 'utf8')
      assert('edge env not tracked', !run('git', ['ls-files', edgeEnvPath], { capture: true }).stdout.trim())
      assert('REAL_TEST in edge env when prepared', edgeEnv.includes('TIME_TRACKER_DISPATCH_REAL_TEST_ENABLED=true'))
    } else {
      pass('edge env file optional before prepare')
    }
    console.log('')

    console.log(
      `\nTime tracker manual dispatch verification completed (${state.testsPassed}/${state.testsRun} tests, exit 0)\n`
    )
  } catch (err) {
    console.error(`\nFAILED: ${err.message}\n`)
    process.exitCode = 1
  }
}

main()
