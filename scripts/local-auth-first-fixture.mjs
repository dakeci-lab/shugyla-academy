#!/usr/bin/env node
/**
 * Local-only fixture for Auth-first login testing.
 *
 * Usage:
 *   node scripts/local-auth-first-fixture.mjs --setup
 *   node scripts/local-auth-first-fixture.mjs --verify
 *   node scripts/local-auth-first-fixture.mjs --cleanup
 */

import { spawnSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { loginToTechnicalEmail } from '../src/utils/phoneUtils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROJECT_ID = 'shugyla-academy'
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'
const FIXTURE_TAG = 'auth-first-fixture'
const AUTH_PASSWORD = 'AuthFirstLocal123!'
const MISMATCH_ACADEMY_PASSWORD = 'WrongAcademyPlaintext99'

const USERS = {
  admin: {
    login: 'auth-first-admin',
    role: 'administrator',
    status: 'active',
  },
  staff: {
    login: 'auth-first-staff',
    role: 'cashier',
    status: 'active',
  },
  deactivated: {
    login: 'auth-first-deactivated',
    role: 'cashier',
    status: 'inactive',
  },
  orphanAuth: {
    email: 'auth-first-orphan@shugyla.local',
    password: AUTH_PASSWORD,
  },
}

const state = {
  container: null,
  apiUrl: null,
  anonKey: null,
  serviceRoleKey: null,
  authUserIds: {},
  employeeIds: {},
  assignmentIds: [],
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--setup')) {
    runSetup().catch((e) => {
      console.error(e)
      process.exit(1)
    })
    return
  }
  if (args.includes('--verify')) {
    runVerify().catch((e) => {
      console.error(e)
      process.exit(1)
    })
    return
  }
  if (args.includes('--cleanup')) {
    runCleanup().catch((e) => {
      console.error(e)
      process.exit(1)
    })
    return
  }
  printHelp()
  process.exit(1)
}

function printHelp() {
  console.log(`Local Auth-first login fixture

Usage:
  node scripts/local-auth-first-fixture.mjs --setup
  node scripts/local-auth-first-fixture.mjs --verify
  node scripts/local-auth-first-fixture.mjs --cleanup`)
}

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    input: options.input,
  })
  if (result.error) fail(`${command} failed: ${result.error.message}`)
  if (result.status !== 0 && !options.allowFailure) {
    fail(`${command} exited with code ${result.status}`)
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
  if (!state.apiUrl?.includes('127.0.0.1') && !state.apiUrl?.includes('localhost')) {
    fail('API URL is not local')
  }
  if (fs.existsSync('supabase/.temp/project-ref')) {
    const ref = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim()
    if (ref.includes(PRODUCTION_REF)) fail('Production remote link detected')
  }
  state.container = findDbContainer()
}

function findDbContainer() {
  const name = `supabase_db_${PROJECT_ID}`
  const result = run('docker', ['ps', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'], {
    capture: true,
  })
  const names = result.stdout.trim().split('\n').filter(Boolean)
  if (names.length !== 1) fail(`Expected one DB container, found ${names.length}`)
  return names[0]
}

function psql(sql) {
  run('docker', ['exec', state.container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    capture: true,
  })
}

function psqlScalar(sql) {
  const result = run(
    'docker',
    ['exec', state.container, 'psql', '-U', 'postgres', '-t', '-A', '-c', sql],
    { capture: true }
  )
  return result.stdout.trim()
}

function nextEmployeeId() {
  return Number(psqlScalar('SELECT COALESCE(MAX(id), 0) + 1 FROM public.academy_users;'))
}

function adminClient() {
  return createClient(state.apiUrl, state.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function runSetup() {
  console.log('=== Auth-first fixture setup ===\n')
  loadLocalStatus()

  const admin = adminClient()

  for (const key of ['admin', 'staff', 'deactivated']) {
    const spec = USERS[key]
    const email = loginToTechnicalEmail(spec.login)
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: AUTH_PASSWORD,
      email_confirm: true,
    })
    if (error) fail(`Create auth user ${key}: ${error.message}`)
    state.authUserIds[key] = data.user.id
  }

  const orphan = await admin.auth.admin.createUser({
    email: USERS.orphanAuth.email,
    password: USERS.orphanAuth.password,
    email_confirm: true,
  })
  if (orphan.error) fail(`Create orphan auth user: ${orphan.error.message}`)
  state.authUserIds.orphan = orphan.data.user.id

  for (const key of ['admin', 'staff', 'deactivated']) {
    const spec = USERS[key]
    const id = nextEmployeeId()
    state.employeeIds[key] = id
    const roleId = psqlScalar(
      `SELECT id::text FROM public.roles WHERE code = '${spec.role === 'administrator' ? 'admin' : spec.role}' LIMIT 1;`
    )
    psql(`
      INSERT INTO public.academy_users (
        id, first_name, last_name, full_name, login, password, role, role_id, status, auth_user_id
      ) VALUES (
        ${id}, 'Auth', '${key}', '[${FIXTURE_TAG}] ${key}', '${spec.login}',
        '${MISMATCH_ACADEMY_PASSWORD}', '${spec.role === 'administrator' ? 'admin' : spec.role}',
        ${roleId ? `'${roleId}'` : 'NULL'}, '${spec.status}', '${state.authUserIds[key]}'
      );
    `)
  }

  const staffCourseId = psqlScalar(
    "SELECT id FROM public.academy_courses ORDER BY id LIMIT 1;"
  )
  if (staffCourseId) {
    psql(`
      INSERT INTO public.academy_course_assignments (user_id, course_id)
      VALUES (${state.employeeIds.staff}, ${staffCourseId})
      ON CONFLICT DO NOTHING;
    `)
  }

  console.log('Fixture users created (academy_users.password intentionally mismatched with Auth).')
  console.log('\nLocal-only credentials (for manual browser testing):')
  console.log(`  Admin login: ${USERS.admin.login}`)
  console.log(`  Staff login: ${USERS.staff.login}`)
  console.log(`  Password (Auth): ${AUTH_PASSWORD}`)
  console.log(`  Deactivated login: ${USERS.deactivated.login}`)
  console.log(`  Orphan Auth email: ${USERS.orphanAuth.email}`)
}

async function runVerify() {
  loadLocalStatus()
  const anon = createClient(state.apiUrl, state.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const staffSignIn = await anon.auth.signInWithPassword({
    email: loginToTechnicalEmail(USERS.staff.login),
    password: AUTH_PASSWORD,
  })
  if (staffSignIn.error) fail(`Staff Auth sign-in failed: ${staffSignIn.error.message}`)

  const { data: profile, error: profileErr } = await anon
    .from('academy_users')
    .select('id, login, status, auth_user_id')
    .eq('auth_user_id', staffSignIn.data.user.id)
    .maybeSingle()

  if (profileErr) fail(`Staff profile query failed: ${profileErr.message}`)
  if (!profile) fail('Staff profile not found by auth_user_id after Auth')

  await anon.auth.signOut()
  console.log('Fixture verify: passed')
}

async function runCleanup() {
  console.log('=== Auth-first fixture cleanup ===\n')
  loadLocalStatus()

  psql(`
    DELETE FROM public.academy_course_assignments
    WHERE user_id IN (SELECT id FROM public.academy_users WHERE full_name LIKE '%[${FIXTURE_TAG}]%');
  `)
  psql(`
    DELETE FROM public.academy_users WHERE full_name LIKE '%[${FIXTURE_TAG}]%';
  `)

  const admin = adminClient()
  for (const id of Object.values(state.authUserIds)) {
    if (id) await admin.auth.admin.deleteUser(id).catch(() => {})
  }

  const orphans = psqlScalar(`
    SELECT string_agg(id::text, ',')
    FROM auth.users
    WHERE email LIKE 'auth-first-%@shugyla.local';
  `)
  if (orphans) {
    for (const id of orphans.split(',')) {
      await admin.auth.admin.deleteUser(id).catch(() => {})
    }
  }

  console.log('Cleanup: done')
}

main()
