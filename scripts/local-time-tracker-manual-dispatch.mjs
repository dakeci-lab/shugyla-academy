#!/usr/bin/env node
/**
 * Local manual real dispatch for web-push-manual-staff (one shift_start_soon push).
 *
 * Usage:
 *   node scripts/local-time-tracker-manual-dispatch.mjs --setup
 *   node scripts/local-time-tracker-manual-dispatch.mjs --send
 *   node scripts/local-time-tracker-manual-dispatch.mjs --status
 *   node scripts/local-time-tracker-manual-dispatch.mjs --cleanup
 */

import { spawnSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { loginToTechnicalEmail } from '../src/utils/phoneUtils.js'
import { getLocalSupabaseStatus } from './lib/localSupabaseCli.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROJECT_ID = 'shugyla-academy'
const FIXTURE_TAG = 'time-tracker-manual-dispatch'
const MANUAL_LOGIN = 'web-push-manual-staff'
const ADMIN_LOGIN = `${FIXTURE_TAG}-admin`
const ADMIN_PASSWORD = 'ManualDispatchAdmin123!'
const RULE_CODE = 'time_tracker.rule.shift_start_soon'
const STATE_FILE = path.join(ROOT, '.local-secrets/time-tracker-manual-dispatch-state.json')
const APP_TIMEZONE = 'Asia/Almaty'

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

function getDateKeyInAlmaty(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function addDaysToDateKey(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function almatyISO(dateKey, hours, minutes) {
  const pad = (n) => String(n).padStart(2, '0')
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(`${y}-${pad(m)}-${pad(d)}T${pad(hours)}:${pad(minutes)}:00+05:00`).toISOString()
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
  if (!fs.existsSync(STATE_FILE)) return null
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 })
}

function assertLocalEnvironment(apiUrl) {
  if (!apiUrl.includes('127.0.0.1') && !apiUrl.includes('localhost')) {
    fail('Refusing to run outside local Supabase')
  }
  if (apiUrl.includes('supabase.co')) {
    fail('Refusing production Supabase URL')
  }
}

async function setup() {
  const status = getLocalSupabaseStatus()
  assertLocalEnvironment(status.API_URL)

  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: manualUser, error: manualError } = await admin
    .from('academy_users')
    .select('id, status, auth_user_id, login')
    .eq('login', MANUAL_LOGIN)
    .maybeSingle()

  if (manualError || !manualUser?.id) fail('web-push-manual-staff not found')
  if (manualUser.status !== 'active') fail('manual user is not active')
  if (!manualUser.auth_user_id) fail('manual user has no auth_user_id')

  const { count: subCount, error: subError } = await admin
    .from('notification_push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', manualUser.id)
    .eq('is_active', true)
    .eq('permission_status', 'granted')

  if (subError || !subCount) fail('manual user has no active granted browser subscription')

  const adminRoleId = runPsql(`SELECT id::text FROM public.roles WHERE code = 'admin' LIMIT 1;`)
  if (!adminRoleId) fail('Missing admin role')

  let shiftDate = addDaysToDateKey(getDateKeyInAlmaty(), 21)
  for (let i = 0; i < 30; i += 1) {
    const exists = runPsql(`
      SELECT COUNT(*)::text FROM public.academy_employee_shifts
      WHERE employee_id = ${manualUser.id} AND shift_date = '${shiftDate}';
    `)
    if (exists === '0') break
    shiftDate = addDaysToDateKey(shiftDate, 1)
  }

  const runAtISO = almatyISO(shiftDate, 8, 50)

  const shiftId = crypto.randomUUID()
  runPsql(`
    INSERT INTO public.academy_employee_shifts (
      id, employee_id, shift_date, status,
      planned_start_time, planned_end_time,
      actual_start_time, actual_end_time, comment
    ) VALUES (
      '${shiftId}', ${manualUser.id}, '${shiftDate}', 'working',
      '09:00', '18:00', null, null, '${FIXTURE_TAG}'
    );
  `)

  runPsql(`DELETE FROM public.academy_users WHERE login = '${ADMIN_LOGIN}';`)

  const adminEmail = loginToTechnicalEmail(ADMIN_LOGIN)
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  })
  if (authError) fail(`Create admin auth: ${authError.message}`)

  const adminEmployeeId = Number(runPsql('SELECT COALESCE(MAX(id), 0) + 1 FROM public.academy_users;'))
  runPsql(`
    INSERT INTO public.academy_users (
      id, first_name, last_name, full_name, login, password, role, role_id, status, auth_user_id
    ) VALUES (
      ${adminEmployeeId}, 'Dispatch', 'Admin', '[${FIXTURE_TAG}] admin', '${ADMIN_LOGIN}',
      '', 'admin', '${adminRoleId}', 'active', '${authData.user.id}'
    );
  `)

  const dedupeKey = `time_tracker:shift_start_soon:${manualUser.id}:${shiftId}`

  saveState({
    tag: FIXTURE_TAG,
    shiftId,
    shiftDate,
    runAt: runAtISO,
    manualEmployeeId: manualUser.id,
    manualLogin: MANUAL_LOGIN,
    adminEmployeeId,
    adminAuthUserId: authData.user.id,
    adminLogin: ADMIN_LOGIN,
    dedupeKey,
    ruleCode: RULE_CODE,
  })

  console.log('Manual dispatch setup complete')
  console.log(`Shift date (Asia/Almaty): ${shiftDate}`)
  console.log(`Run at (ISO): ${runAtISO}`)
  console.log(`Manual employee: ${MANUAL_LOGIN}`)
  console.log('Temporary admin caller created (credentials not logged)')
}

async function invokeDispatch(token, runAt, dryRun) {
  const status = getLocalSupabaseStatus()
  const url = `${status.API_URL}/functions/v1/dispatch-time-tracker-notifications`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: status.ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      run_at: runAt,
      dry_run: dryRun,
      rule_codes: [RULE_CODE],
    }),
  })

  let json = null
  try {
    json = await response.json()
  } catch {
    json = null
  }
  return { status: response.status, json }
}

async function send() {
  const state = loadState()
  if (!state?.shiftId) fail('Run --setup first')

  const status = getLocalSupabaseStatus()
  assertLocalEnvironment(status.API_URL)

  const anon = createClient(status.API_URL, status.ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const email = loginToTechnicalEmail(state.adminLogin)
  const signIn = await anon.auth.signInWithPassword({ email, password: ADMIN_PASSWORD })
  if (signIn.error) fail(`Admin sign-in failed: ${signIn.error.message}`)
  const token = signIn.data.session.access_token

  const beforeNotifications = Number(
    runPsql(`SELECT COUNT(*)::text FROM public.notifications WHERE deduplication_key = '${state.dedupeKey}';`)
  )
  const beforeDeliveries = Number(
    runPsql(`
      SELECT COUNT(*)::text FROM public.notification_deliveries d
      INNER JOIN public.notifications n ON n.id = d.notification_id
      WHERE n.deduplication_key = '${state.dedupeKey}';
    `)
  )

  const first = await invokeDispatch(token, state.runAt, false)
  if (first.status !== 200 || !first.json?.ok) {
    fail(`Dispatch failed: HTTP ${first.status} code=${first.json?.code ?? 'unknown'}`)
  }
  if (first.json.result?.createdNotifications !== 1) {
    fail(`Expected 1 notification, got ${first.json.result?.createdNotifications}`)
  }
  if (first.json.result?.pushAccepted !== 1) {
    fail(`Expected 1 push accepted, got ${first.json.result?.pushAccepted}`)
  }

  const notificationTitle = runPsql(`
    SELECT title FROM public.notifications WHERE deduplication_key = '${state.dedupeKey}' LIMIT 1;
  `)
  if (notificationTitle !== 'Смена скоро начнётся') {
    fail(`Unexpected notification title: ${notificationTitle}`)
  }

  const deliveryStatus = runPsql(`
    SELECT d.status FROM public.notification_deliveries d
    INNER JOIN public.notifications n ON n.id = d.notification_id
    WHERE n.deduplication_key = '${state.dedupeKey}'
    ORDER BY d.created_at DESC LIMIT 1;
  `)
  if (deliveryStatus !== 'accepted') {
    fail(`Expected delivery status accepted, got ${deliveryStatus}`)
  }

  const subActive = runPsql(`
    SELECT s.is_active::text FROM public.notification_push_subscriptions s
    INNER JOIN public.academy_users u ON u.id = s.employee_id
    WHERE u.login = '${MANUAL_LOGIN}' AND s.is_active = true AND s.permission_status = 'granted'
    LIMIT 1;
  `)
  if (subActive !== 'true') fail('Manual subscription is not active')

  const failureCount = runPsql(`
    SELECT s.failure_count::text FROM public.notification_push_subscriptions s
    INNER JOIN public.academy_users u ON u.id = s.employee_id
    WHERE u.login = '${MANUAL_LOGIN}' AND s.is_active = true
    LIMIT 1;
  `)
  if (failureCount !== '0') fail(`Expected failure_count=0, got ${failureCount}`)

  const second = await invokeDispatch(token, state.runAt, false)
  if (second.status !== 200 || !second.json?.ok) {
    fail(`Dedupe dispatch failed: HTTP ${second.status}`)
  }
  if ((second.json.result?.skippedDuplicates ?? 0) < 1) {
    fail('Expected skippedDuplicates >= 1 on repeat dispatch')
  }

  const afterNotifications = Number(
    runPsql(`SELECT COUNT(*)::text FROM public.notifications WHERE deduplication_key = '${state.dedupeKey}';`)
  )
  const afterDeliveries = Number(
    runPsql(`
      SELECT COUNT(*)::text FROM public.notification_deliveries d
      INNER JOIN public.notifications n ON n.id = d.notification_id
      WHERE n.deduplication_key = '${state.dedupeKey}';
    `)
  )

  if (afterNotifications !== beforeNotifications + 1) {
    fail(`Notification count changed unexpectedly: before=${beforeNotifications} after=${afterNotifications}`)
  }
  if (afterDeliveries !== beforeDeliveries + 1) {
    fail(`Delivery count changed unexpectedly: before=${beforeDeliveries} after=${afterDeliveries}`)
  }

  saveState({ ...state, duplicatePrevented: true, deliveryStatus: 'accepted' })

  console.log('Manual dispatch send complete')
  console.log('Real Web Push sent once; dedupe confirmed on second call')
  console.log('Notification title: Смена скоро начнётся')
  console.log('Delivery status: accepted')
}

function status() {
  const state = loadState()
  if (!state?.shiftId) fail('Run --setup first')

  const shiftExists =
    runPsql(`
      SELECT COUNT(*)::text FROM public.academy_employee_shifts
      WHERE id = '${state.shiftId}' AND comment = '${FIXTURE_TAG}';
    `) === '1'

  const notificationCount = Number(
    runPsql(`SELECT COUNT(*)::text FROM public.notifications WHERE deduplication_key = '${state.dedupeKey}';`)
  )
  const deliveryCount = Number(
    runPsql(`
      SELECT COUNT(*)::text FROM public.notification_deliveries d
      INNER JOIN public.notifications n ON n.id = d.notification_id
      WHERE n.deduplication_key = '${state.dedupeKey}';
    `)
  )
  const deliveryStatus =
    deliveryCount > 0
      ? runPsql(`
          SELECT d.status FROM public.notification_deliveries d
          INNER JOIN public.notifications n ON n.id = d.notification_id
          WHERE n.deduplication_key = '${state.dedupeKey}'
          ORDER BY d.created_at DESC LIMIT 1;
        `)
      : 'none'

  const subscriptionActive =
    runPsql(`
      SELECT COUNT(*)::text FROM public.notification_push_subscriptions s
      INNER JOIN public.academy_users u ON u.id = s.employee_id
      WHERE u.login = '${MANUAL_LOGIN}' AND s.is_active = true AND s.permission_status = 'granted';
    `) === '1'

  console.log(
    JSON.stringify(
      {
        shiftExists,
        notificationCount,
        deliveryCount,
        deliveryStatus,
        subscriptionActive,
        duplicatePrevented: Boolean(state.duplicatePrevented),
      },
      null,
      2
    )
  )
}

async function cleanup() {
  const state = loadState()
  if (!state?.shiftId) {
    console.log('Manual dispatch cleanup: already clean (no state file)')
    return
  }

  const status = getLocalSupabaseStatus()
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  runPsql(`
    DELETE FROM public.notification_deliveries
    WHERE notification_id IN (
      SELECT id FROM public.notifications WHERE deduplication_key = '${state.dedupeKey}'
    );
    DELETE FROM public.notifications WHERE deduplication_key = '${state.dedupeKey}';
    DELETE FROM public.academy_employee_shifts WHERE id = '${state.shiftId}';
    DELETE FROM public.academy_users WHERE id = ${state.adminEmployeeId};
  `)

  if (state.adminAuthUserId) {
    await admin.auth.admin.deleteUser(state.adminAuthUserId)
  }

  fs.unlinkSync(STATE_FILE)

  console.log('Manual dispatch cleanup complete')
  console.log(`${MANUAL_LOGIN} and browser subscription preserved`)
}

const mode = process.argv.find((arg) => arg.startsWith('--'))
if (mode === '--setup') {
  await setup()
} else if (mode === '--send') {
  await send()
} else if (mode === '--status') {
  status()
} else if (mode === '--cleanup') {
  await cleanup()
} else {
  fail('Usage: --setup | --send | --status | --cleanup')
}
