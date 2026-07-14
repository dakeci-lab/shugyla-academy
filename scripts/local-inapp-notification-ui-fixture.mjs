#!/usr/bin/env node
/**
 * Local-only fixture for in-app notification center UI/API testing.
 *
 * Usage:
 *   node scripts/local-inapp-notification-ui-fixture.mjs --setup --manual
 *   node scripts/local-inapp-notification-ui-fixture.mjs --preflight
 *   node scripts/local-inapp-notification-ui-fixture.mjs --verify
 *   node scripts/local-inapp-notification-ui-fixture.mjs --cleanup
 */

import { spawnSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import {
  addDaysToDateKey,
  toDateKeyInAppTimezone,
} from '../src/utils/timezone.js'
import { loginToTechnicalEmail } from '../src/utils/phoneUtils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROJECT_ID = 'shugyla-academy'
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'
const FIXTURE_TAG = 'inapp-ui-fixture'
const FIXTURE_LOGIN = 'inapp-ui-fixture-user'
const FIXTURE_EMAIL = 'inapp-ui-fixture-user@shugyla.local'
const MANUAL_PASSWORD = 'ShugylaLocal123!'

const state = {
  runId: `inapp-${Date.now()}`,
  container: null,
  apiUrl: null,
  anonKey: null,
  serviceRoleKey: null,
  password: null,
  authUserId: null,
  employeeId: null,
  notificationIds: [],
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--setup')) {
    runSetup({ manual: args.includes('--manual') }).catch((error) => {
      console.error(error)
      process.exit(1)
    })
    return
  }
  if (args.includes('--sync-manual-password')) {
    runSyncManualPassword().catch((error) => {
      console.error(error)
      process.exit(1)
    })
    return
  }
  if (args.includes('--preflight') || args.includes('--verify')) {
    runPreflight().catch((error) => {
      console.error(error)
      process.exit(1)
    })
    return
  }
  if (args.includes('--cleanup')) {
    runCleanup().catch((error) => {
      console.error(error)
      process.exit(1)
    })
    return
  }
  printHelp()
  process.exit(1)
}

function printHelp() {
  console.log(`Local in-app notification UI fixture

Usage:
  node scripts/local-inapp-notification-ui-fixture.mjs --setup --manual
  node scripts/local-inapp-notification-ui-fixture.mjs --sync-manual-password
  node scripts/local-inapp-notification-ui-fixture.mjs --preflight
  node scripts/local-inapp-notification-ui-fixture.mjs --cleanup`)
}

function fail(message, code = 1) {
  console.error(`ERROR: ${message}`)
  process.exit(code)
}

function run(command, args, options = {}) {
  const capture = options.capture ?? false
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    input: options.input,
  })
  if (result.error) fail(`${command} failed: ${result.error.message}`)
  if (result.status !== 0 && !options.allowFailure) {
    const details = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
    fail(`${command} exited with code ${result.status}${details ? `\n${details}` : ''}`)
  }
  return result
}

function loadLocalStatus() {
  run('docker', ['info'], { capture: true })
  const statusResult = run('npx', ['supabase', 'status', '-o', 'json'], { capture: true })
  const jsonMatch = statusResult.stdout.match(/\{[\s\S]*\}/)
  if (!jsonMatch) fail('Could not parse supabase status JSON')

  const status = JSON.parse(jsonMatch[0])
  state.apiUrl = status.API_URL
  state.anonKey = status.ANON_KEY
  state.serviceRoleKey = status.SERVICE_ROLE_KEY

  for (const [label, value] of [
    ['API_URL', state.apiUrl],
    ['DB_URL', status.DB_URL],
    ['STUDIO_URL', status.STUDIO_URL],
  ]) {
    if (!value || !isLocalUrl(value)) fail(`${label} is not local: ${value ?? '(missing)'}`)
  }

  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
  if (config.includes(PRODUCTION_REF)) fail('Production ref found in config.toml')
  if (/[a-z0-9-]+\.supabase\.co\b/i.test(config)) fail('Remote supabase.co URL in config.toml')

  state.container = findDbContainer()
}

function isLocalUrl(value) {
  try {
    const host = new URL(value).hostname
    return host === '127.0.0.1' || host === 'localhost'
  } catch {
    return false
  }
}

function findDbContainer() {
  const result = run(
    'docker',
    ['ps', '--format', '{{.Names}}', '--filter', `name=supabase_db_${PROJECT_ID}`],
    { capture: true }
  )
  const name = result.stdout.trim().split('\n').find(Boolean)
  if (!name) fail(`Docker container supabase_db_${PROJECT_ID} not found`)
  return name
}

function psqlExec(sql) {
  const result = run(
    'docker',
    ['exec', '-i', state.container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-q'],
    { capture: true, input: sql, allowFailure: true }
  )
  if (result.status !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
    fail(`SQL failed${details ? `: ${details}` : ''}`)
  }
  return result.stdout.trim()
}

function psqlMutate(sql) {
  const output = psqlExec(sql)
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^INSERT\s+\d+/i.test(line))
  if (!lines.length) fail('SQL mutation returned no output')
  return lines[0]
}

function adminClient() {
  return createClient(state.apiUrl, state.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function anonClient() {
  return createClient(state.apiUrl, state.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** ISO timestamp для календарного дня в Asia/Almaty (UTC+5, без DST) */
function createdAtInAlmaty({ daysAgo = 0, hour = 10, minute = 0 }) {
  const dateKey = addDaysToDateKey(toDateKeyInAppTimezone(), -daysAgo)
  const [year, month, day] = dateKey.split('-').map(Number)
  const utcMs = Date.UTC(year, month - 1, day, hour - 5, minute, 0)
  return new Date(utcMs).toISOString()
}

function buildManualFixtureRows() {
  const todayReadAt = createdAtInAlmaty({ daysAgo: 0, hour: 11, minute: 15 })
  const yesterdayReadAt = createdAtInAlmaty({ daysAgo: 1, hour: 14, minute: 0 })

  return [
    {
      group: 'today',
      title: 'Смена скоро начнётся',
      body: 'Ваша смена начинается через 15 минут.',
      action_url: '/platform/time-tracker',
      priority: 'normal',
      read_at: null,
      created_at: createdAtInAlmaty({ daysAgo: 0, hour: 9, minute: 30 }),
    },
    {
      group: 'today',
      title: 'Не забудьте отметиться',
      body: 'Пожалуйста, отметьте начало смены в тайм-трекере.',
      action_url: '/platform/time-tracker',
      priority: 'high',
      read_at: null,
      created_at: createdAtInAlmaty({ daysAgo: 0, hour: 10, minute: 5 }),
    },
    {
      group: 'today',
      title:
        'Очень длинный заголовок уведомления для проверки переноса строк и ограничения количества видимых строк в списке уведомлений платформы Shugyla',
      body: 'Короткое тело для проверки line-clamp заголовка.',
      action_url: '/platform/time-tracker',
      priority: 'normal',
      read_at: null,
      created_at: createdAtInAlmaty({ daysAgo: 0, hour: 11, minute: 0 }),
    },
    {
      group: 'today',
      title: 'Прочитанное сегодня',
      body: 'Это уведомление уже отмечено прочитанным.',
      action_url: '/platform/time-tracker',
      priority: 'normal',
      read_at: todayReadAt,
      created_at: createdAtInAlmaty({ daysAgo: 0, hour: 8, minute: 45 }),
    },
    {
      group: 'yesterday',
      title: 'Напоминание за вчера',
      body: 'Уведомление из группы «Вчера».',
      action_url: '/platform/time-tracker',
      priority: 'normal',
      read_at: null,
      created_at: createdAtInAlmaty({ daysAgo: 1, hour: 16, minute: 20 }),
    },
    {
      group: 'yesterday',
      title: 'Прочитанное вчера',
      body: 'Прочитанное уведомление без action_url.',
      action_url: null,
      priority: 'normal',
      read_at: yesterdayReadAt,
      created_at: createdAtInAlmaty({ daysAgo: 1, hour: 9, minute: 10 }),
    },
    {
      group: 'earlier',
      title: 'Важное напоминание',
      body: 'Уведомление из группы «Ранее» с высоким приоритетом.',
      action_url: '/platform/time-tracker',
      priority: 'high',
      read_at: null,
      created_at: createdAtInAlmaty({ daysAgo: 3, hour: 12, minute: 0 }),
    },
    {
      group: 'earlier',
      title: 'Напоминание без ссылки',
      body: 'Уведомление без action_url — только отметка прочитанным.',
      action_url: null,
      priority: 'normal',
      read_at: null,
      created_at: createdAtInAlmaty({ daysAgo: 5, hour: 13, minute: 30 }),
    },
  ]
}

function sqlEscape(value) {
  return String(value).replace(/'/g, "''")
}

function ensureLocalLoginPrivileges() {
  psqlExec(`
    REVOKE SELECT ON public.academy_users FROM authenticated;
    REVOKE SELECT ON public.academy_course_assignments FROM authenticated;
    GRANT SELECT ON public.academy_users TO anon;
    GRANT SELECT ON public.academy_course_assignments TO anon;
  `)
}

async function assertNoExistingFixtureUser() {
  const admin = adminClient()
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) fail(`listUsers: ${error.message}`)
  const existing = data.users.filter((user) => user.email === FIXTURE_EMAIL)
  if (existing.length > 0) {
    fail(
      `Fixture auth user already exists (${existing.length}). Run --cleanup first.`
    )
  }

  const academyCount = psqlExec(
    `SELECT COUNT(*) FROM public.academy_users WHERE login = '${FIXTURE_LOGIN}';`
  ).split('\n').pop()
  if (academyCount !== '0') {
    fail(`Fixture academy_user already exists. Run --cleanup first.`)
  }
}

async function verifyLoginPath() {
  const mappedEmail = loginToTechnicalEmail(FIXTURE_LOGIN)
  if (mappedEmail !== FIXTURE_EMAIL) {
    fail(
      `loginToTechnicalEmail mismatch: expected ${FIXTURE_EMAIL}, got ${mappedEmail ?? '(null)'}`
    )
  }

  const anon = anonClient()

  const profileRes = await anon
    .from('academy_users')
    .select('id, login, password, status, auth_user_id')
    .eq('login', FIXTURE_LOGIN)
    .maybeSingle()

  if (profileRes.error) {
    fail(`academy_users lookup failed: ${profileRes.error.code} ${profileRes.error.message}`)
  }
  if (!profileRes.data) fail('academy_users row missing after setup')
  if (profileRes.data.password !== state.password) {
    fail('academy_users.password does not match fixture auth password')
  }
  if (profileRes.data.status !== 'active') {
    fail(`academy_users.status is ${profileRes.data.status}, expected active`)
  }
  if (profileRes.data.auth_user_id !== state.authUserId) {
    fail('academy_users.auth_user_id does not match auth user id')
  }

  const assignmentsRes = await anon
    .from('academy_course_assignments')
    .select('course_id')
    .eq('user_id', profileRes.data.id)

  if (assignmentsRes.error) {
    fail(
      `academy_course_assignments lookup failed: ${assignmentsRes.error.code} ${assignmentsRes.error.message}`
    )
  }

  const directSignIn = await anon.auth.signInWithPassword({
    email: FIXTURE_EMAIL,
    password: state.password,
  })
  if (directSignIn.error) {
    fail(
      `direct signInWithPassword failed: ${directSignIn.error.code || 'unknown'} ${directSignIn.error.message}`
    )
  }
  if (!directSignIn.data.session?.user?.id) {
    fail('direct signInWithPassword returned no session user')
  }
  await anon.auth.signOut()

  const mappedSignIn = await anon.auth.signInWithPassword({
    email: mappedEmail,
    password: state.password,
  })
  if (mappedSignIn.error) {
    fail(
      `mapped signInWithPassword failed: ${mappedSignIn.error.code || 'unknown'} ${mappedSignIn.error.message}`
    )
  }
  await anon.auth.signOut()
}

/** Полная симуляция authenticateUser() из supabaseDataAdapter */
async function verifyAuthenticateUserFlow() {
  const loginValue = FIXTURE_LOGIN
  const password = state.password

  const anon = anonClient()
  const result = await anon
    .from('academy_users')
    .select('*')
    .eq('login', loginValue.trim())
    .maybeSingle()

  if (result.error) {
    fail(`authenticateUser academy lookup: ${result.error.code} ${result.error.message}`)
  }
  if (!result.data) {
    fail('authenticateUser academy lookup: row not found')
  }
  if (result.data.password !== password) {
    fail('authenticateUser password comparison: mismatch')
  }
  if (result.data.status !== 'active') {
    fail(`authenticateUser status check: ${result.data.status}`)
  }

  const assignmentsRes = await anon
    .from('academy_course_assignments')
    .select('course_id')
    .eq('user_id', result.data.id)

  if (assignmentsRes.error) {
    fail(
      `authenticateUser assignments lookup: ${assignmentsRes.error.code} ${assignmentsRes.error.message}`
    )
  }

  const signIn = await anon.auth.signInWithPassword({
    email: FIXTURE_EMAIL,
    password,
  })
  if (signIn.error) {
    fail(
      `authenticateUser Supabase Auth: ${signIn.error.code || 'unknown'} ${signIn.error.message}`
    )
  }
  if (!signIn.data.session?.access_token) {
    fail('authenticateUser Supabase Auth: no session')
  }

  await anon.auth.signOut()
}

async function runSyncManualPassword() {
  loadLocalStatus()
  ensureLocalLoginPrivileges()
  state.password = MANUAL_PASSWORD

  const authUserId = await resolveFixtureAuthUserId()
  state.authUserId = authUserId

  const admin = adminClient()
  const { error: updateAuthError } = await admin.auth.admin.updateUserById(authUserId, {
    password: MANUAL_PASSWORD,
  })
  if (updateAuthError) fail(`updateUser password: ${updateAuthError.message}`)

  const updatedRows = psqlExec(`
    UPDATE public.academy_users
    SET password = '${sqlEscape(MANUAL_PASSWORD)}'
    WHERE login = '${FIXTURE_LOGIN}'
    RETURNING id;
  `)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (updatedRows.length !== 1) {
    fail(`Expected 1 academy_users row updated, got ${updatedRows.length}`)
  }

  await verifyLoginPath()
  await verifyAuthenticateUserFlow()
  await runPreflight({ password: MANUAL_PASSWORD, quiet: true })

  console.log('\n=== Manual password sync (local only) ===\n')
  console.log(`Auth password updated: yes`)
  console.log(`academy_users.password updated: yes (${updatedRows.length} row)`)
  console.log(`auth_user_id mapping: ok`)
  console.log(`loginToTechnicalEmail: ${loginToTechnicalEmail(FIXTURE_LOGIN)}`)
  console.log(`authenticateUser flow: passed`)
  console.log(`Notifications: 8 total, 6 unread, 2 read (unchanged)`)
  console.log(`\nLogin: ${FIXTURE_LOGIN}`)
  console.log(`Temporary password: ${MANUAL_PASSWORD}`)
}

async function runSetup({ manual = false } = {}) {
  loadLocalStatus()
  await runCleanup({ quiet: true })
  await assertNoExistingFixtureUser()
  ensureLocalLoginPrivileges()

  state.runId = `inapp-${Date.now()}`
  state.password = manual ? MANUAL_PASSWORD : crypto.randomBytes(18).toString('base64url')
  const escapedPassword = sqlEscape(state.password)

  let createdFixture = false

  try {
    const admin = adminClient()
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: FIXTURE_EMAIL,
      password: state.password,
      email_confirm: true,
    })
    if (createError) fail(`createUser: ${createError.message}`)
    if (!created?.user?.id) fail('createUser returned no user id')

    state.authUserId = created.user.id
    createdFixture = true

    state.employeeId = Number(
      psqlMutate(`
      INSERT INTO public.academy_users (
        id, first_name, last_name, full_name, login, password, role, status, auth_user_id
      )
      VALUES (
        (SELECT COALESCE(MAX(id), 0) + 1 FROM public.academy_users),
        'InApp',
        'Fixture',
        'InApp UI Fixture',
        '${FIXTURE_LOGIN}',
        '${escapedPassword}',
        'cashier',
        'active',
        '${state.authUserId}'::uuid
      )
      RETURNING id;
    `)
    )

    const rows = buildManualFixtureRows()

    for (const [index, row] of rows.entries()) {
      const readAtSql = row.read_at ? `'${row.read_at}'::timestamptz` : 'null'
      const actionUrlSql = row.action_url ? `'${row.action_url}'` : 'null'
      const dedup = `${FIXTURE_TAG}-${state.runId}-${index}`

      const id = psqlMutate(`
      INSERT INTO public.notifications (
        employee_id, auth_user_id, module_code, event_code,
        title, body, action_url, priority, status,
        deduplication_key, created_at, read_at
      ) VALUES (
        ${state.employeeId},
        '${state.authUserId}'::uuid,
        'time_tracker',
        'fixture.manual_${index}',
        '${row.title.replace(/'/g, "''")}',
        '${row.body.replace(/'/g, "''")}',
        ${actionUrlSql},
        '${row.priority}',
        'dispatched',
        '${dedup}',
        '${row.created_at}'::timestamptz,
        ${readAtSql}
      )
      RETURNING id;
    `)
      state.notificationIds.push(id)
    }

    await verifyLoginPath()
    await verifyAuthenticateUserFlow()
    await runPreflight({ password: state.password, quiet: true })

    const unreadExpected = rows.filter((row) => !row.read_at).length

    if (manual) {
      console.log('\n=== Manual UI acceptance fixture (local only) ===\n')
      console.log(`Test run id: ${state.runId}`)
      console.log(`Login: ${FIXTURE_LOGIN}`)
      console.log(`Temporary password: ${state.password}`)
      console.log(`Notifications created: ${rows.length}`)
      console.log(`Unread: ${unreadExpected}`)
      console.log(`Read: ${rows.length - unreadExpected}`)
      console.log('Groups: Сегодня (4), Вчера (2), Ранее (2)')
      console.log('Login path verification: passed')
      console.log('\nFixture kept for manual testing. Cleanup later:')
      console.log('  node scripts/local-inapp-notification-ui-fixture.mjs --cleanup')
      return
    }

    console.log('\nFixture created (local only).')
    console.log(`Login: ${FIXTURE_LOGIN}`)
    console.log(`Temporary password: ${state.password}`)
    console.log(`Unread expected: ${unreadExpected}`)
  } catch (error) {
    if (createdFixture) {
      await runCleanup({ quiet: true })
    }
    throw error
  }
}

async function resolveFixtureAuthUserId() {
  const admin = adminClient()
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) fail(`listUsers: ${error.message}`)
  const user = data.users.find((item) => item.email === FIXTURE_EMAIL)
  if (!user) fail('Fixture auth user not found — run --setup --manual first')
  return user.id
}

async function ensureFixturePassword(authUserId, providedPassword) {
  if (providedPassword) {
    state.password = providedPassword
    return state.password
  }
  if (process.env.INAPP_FIXTURE_PASSWORD) {
    state.password = process.env.INAPP_FIXTURE_PASSWORD
    return state.password
  }
  if (state.password) return state.password

  fail(
    'Fixture password unavailable. Use password printed by --setup --manual, or set INAPP_FIXTURE_PASSWORD for --preflight only.'
  )
}

async function signInFixtureUser() {
  const client = anonClient()
  const { error: signInError } = await client.auth.signInWithPassword({
    email: FIXTURE_EMAIL,
    password: state.password,
  })
  if (signInError) fail(`signIn: ${signInError.message}`)
  return client
}

function validateNotificationActionUrl(actionUrl) {
  if (typeof actionUrl !== 'string') return null
  const trimmed = actionUrl.trim()
  if (!trimmed.startsWith('/')) return null
  if (trimmed.startsWith('//')) return null
  if (/^(https?:|javascript:|data:)/i.test(trimmed)) return null
  return trimmed
}

function assertActionUrlValidation() {
  const cases = [
    ['/platform/time-tracker', '/platform/time-tracker'],
    ['//example.com', null],
    ['https://example.com', null],
    ['javascript:alert(1)', null],
    ['', null],
    [null, null],
  ]
  for (const [input, expected] of cases) {
    const got = validateNotificationActionUrl(input)
    if (got !== expected) {
      fail(`validateNotificationActionUrl(${JSON.stringify(input)}) expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`)
    }
  }
}

async function runPreflight(options = {}) {
  loadLocalStatus()
  const authUserId = await resolveFixtureAuthUserId()
  await ensureFixturePassword(authUserId, options.password)

  const client = await signInFixtureUser()

  const { count: total, error: totalError } = await client
    .from('notifications')
    .select('*', { count: 'exact', head: true })
  if (totalError) fail(`total count: ${totalError.message}`)
  if (total !== 8) fail(`Expected 8 notifications, got ${total}`)

  const { count: unread, error: unreadError } = await client
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .is('read_at', null)
  if (unreadError) fail(`unread count: ${unreadError.message}`)
  if (unread !== 6) fail(`Expected 6 unread, got ${unread}`)

  const { count: readCount, error: readError } = await client
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .not('read_at', 'is', null)
  if (readError) fail(`read count: ${readError.message}`)
  if (readCount !== 2) fail(`Expected 2 read, got ${readCount}`)

  const anon = anonClient()
  const anonResult = await anon
    .from('notifications')
    .select('*', { count: 'exact', head: true })

  if (anonResult.error || anonResult.status === 401) {
    const denied =
      anonResult.status === 401 ||
      anonResult.error?.code === '42501' ||
      /permission denied|not authorized|JWT/i.test(anonResult.error?.message || '')
    if (!denied) {
      fail(
        `anon access check failed: ${anonResult.error?.message || anonResult.statusText || anonResult.status}`
      )
    }
  } else if (anonResult.count !== 0) {
    fail(`Anon must see 0 notifications, got ${anonResult.count}`)
  }

  assertActionUrlValidation()

  const tempId = psqlMutate(`
    INSERT INTO public.notifications (
      employee_id, auth_user_id, module_code, event_code,
      title, body, priority, status, deduplication_key
    ) VALUES (
      ${psqlExec(`SELECT id FROM public.academy_users WHERE login = '${FIXTURE_LOGIN}' LIMIT 1;`)},
      '${authUserId}'::uuid,
      'time_tracker',
      'fixture.rpc_probe',
      'RPC probe',
      'Temporary row for RPC preflight',
      'normal',
      'dispatched',
      '${FIXTURE_TAG}-rpc-probe-${Date.now()}'
    )
    RETURNING id;
  `)

  const { data: rpcOk, error: rpcError } = await client.rpc('mark_notification_read', {
    p_notification_id: tempId,
  })
  if (rpcError) fail(`rpc: ${rpcError.message}`)
  if (rpcOk !== true) fail('RPC expected true')

  psqlExec(`DELETE FROM public.notifications WHERE id = '${tempId}'::uuid;`)

  const { count: unreadAfter, error: unreadAfterError } = await client
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .is('read_at', null)
  if (unreadAfterError) fail(`unread after rpc probe: ${unreadAfterError.message}`)
  if (unreadAfter !== 6) fail(`Fixture unread must remain 6 after RPC probe, got ${unreadAfter}`)

  await client.auth.signOut()

  if (!options.quiet) {
    console.log('Preflight passed')
    console.log(`  total notifications: ${total}`)
    console.log(`  unread: ${unread}`)
    console.log(`  read: ${readCount}`)
    console.log(`  anon visible: ${anonResult.error || anonResult.status === 401 ? 'denied (ok)' : anonResult.count}`)
    console.log('  validateNotificationActionUrl: ok')
    console.log('  RPC mark_notification_read: ok (temp row removed)')
  }
}

async function runCleanup(options = {}) {
  loadLocalStatus()
  const admin = adminClient()

  psqlExec(`
    DELETE FROM public.notifications
    WHERE deduplication_key LIKE '${FIXTURE_TAG}-%';
  `)

  psqlExec(`
    DELETE FROM public.academy_users
    WHERE login = '${FIXTURE_LOGIN}';
  `)

  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const fixtureUsers = users.users.filter((user) => user.email === FIXTURE_EMAIL)
  for (const user of fixtureUsers) {
    await admin.auth.admin.deleteUser(user.id)
  }

  const templates = psqlExec(
    "SELECT COUNT(*) FROM public.notification_templates WHERE code LIKE 'time_tracker.%';"
  ).split('\n').pop()
  const rules = psqlExec(
    "SELECT COUNT(*) FROM public.notification_rules WHERE code LIKE 'time_tracker.rule.%';"
  ).split('\n').pop()
  const enabled = psqlExec(
    "SELECT COUNT(*) FROM public.notification_rules WHERE is_enabled = true;"
  ).split('\n').pop()

  if (!options.quiet) {
    console.log('Cleanup complete')
    console.log(`Seed templates: ${templates}`)
    console.log(`Seed rules: ${rules}`)
    console.log(`Enabled rules: ${enabled}`)
  }
}

main()
