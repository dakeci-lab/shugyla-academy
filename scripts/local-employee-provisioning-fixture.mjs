#!/usr/bin/env node
/**
 * Local fixture for employee provisioning manual tests.
 *
 * Usage:
 *   node scripts/local-employee-provisioning-fixture.mjs --setup
 *   node scripts/local-employee-provisioning-fixture.mjs --cleanup
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { loginToTechnicalEmail } from '../src/utils/phoneUtils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROJECT_ID = 'shugyla-academy'
const FIXTURE_TAG = 'emp-prov-fixture'
const ADMIN_PASSWORD = 'ProvFixtureAdmin123!'
const STAFF_PASSWORD = 'ProvFixtureStaff123!'

const state = { container: null, apiUrl: null, anonKey: null, serviceRoleKey: null, authIds: [] }

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--setup')) {
    runSetup().catch((e) => {
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
  console.log(`Usage: node scripts/local-employee-provisioning-fixture.mjs --setup|--cleanup`)
}

function fail(msg) {
  console.error(`ERROR: ${msg}`)
  process.exit(1)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  })
  if (result.status !== 0 && !options.allowFailure) fail(`${command} failed`)
  return result
}

function loadStatus() {
  const statusResult = run('npx', ['supabase', 'status', '-o', 'json'], { capture: true })
  const jsonMatch = statusResult.stdout.match(/\{[\s\S]*\}/)
  if (!jsonMatch) fail('Could not parse supabase status')
  const status = JSON.parse(jsonMatch[0])
  state.apiUrl = status.API_URL
  state.anonKey = status.ANON_KEY
  state.serviceRoleKey = status.SERVICE_ROLE_KEY
  const name = `supabase_db_${PROJECT_ID}`
  const containerResult = run('docker', ['ps', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'], {
    capture: true,
  })
  state.container = containerResult.stdout.trim()
  if (!state.container) fail('DB container not found')
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

async function runSetup() {
  loadStatus()
  const admin = createClient(state.apiUrl, state.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const adminRoleId = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'admin' LIMIT 1;`)
  const cashierRoleId = psqlScalar(`SELECT id::text FROM public.roles WHERE code = 'cashier' LIMIT 1;`)

  const specs = [
    { key: 'admin', login: `${FIXTURE_TAG}-admin`, role: 'admin', roleId: adminRoleId, password: ADMIN_PASSWORD, status: 'active' },
    { key: 'staff', login: `${FIXTURE_TAG}-staff`, role: 'cashier', roleId: cashierRoleId, password: STAFF_PASSWORD, status: 'active' },
    { key: 'inactive', login: `${FIXTURE_TAG}-inactive`, role: 'admin', roleId: adminRoleId, password: ADMIN_PASSWORD, status: 'inactive' },
  ]

  for (const spec of specs) {
    const email = loginToTechnicalEmail(spec.login)
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: spec.password,
      email_confirm: true,
    })
    if (error) fail(`Create auth ${spec.key}: ${error.message}`)
    state.authIds.push(data.user.id)
    const id = Number(psqlScalar('SELECT COALESCE(MAX(id),0)+1 FROM public.academy_users;'))
    psql(`
      INSERT INTO public.academy_users (id, first_name, last_name, full_name, login, password, role, role_id, status, auth_user_id)
      VALUES (${id}, 'Fix', '${spec.key}', '[${FIXTURE_TAG}] ${spec.key}', '${spec.login}', '', '${spec.role}', '${spec.roleId}', '${spec.status}', '${data.user.id}');
    `)
  }

  console.log('Fixture callers ready for manual provisioning tests.')
  console.log(`Admin login: ${FIXTURE_TAG}-admin (password in script only, not persisted)`)
}

async function runCleanup() {
  loadStatus()
  psql(`DELETE FROM public.academy_users WHERE full_name LIKE '%[${FIXTURE_TAG}]%';`)
  const admin = createClient(state.apiUrl, state.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  for (const id of state.authIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
  const orphans = psqlScalar(
    `SELECT string_agg(id::text, ',') FROM auth.users WHERE email LIKE '${FIXTURE_TAG}%@shugyla.local' OR email LIKE '%${FIXTURE_TAG}%'`
  )
  if (orphans) {
    for (const id of orphans.split(',')) {
      await admin.auth.admin.deleteUser(id).catch(() => {})
    }
  }
  console.log('Cleanup done')
}

main()
