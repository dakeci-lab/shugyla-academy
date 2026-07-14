#!/usr/bin/env node
/**
 * Local fixture for manual Web Push browser testing.
 *
 * Usage:
 *   node scripts/local-web-push-fixture.mjs --setup
 *   node scripts/local-web-push-fixture.mjs --cleanup
 */

import { spawnSync } from 'child_process'
import crypto from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { loginToTechnicalEmail } from '../src/utils/phoneUtils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const FIXTURE_TAG = 'web-push-manual'
const FIXTURE_PASSWORD = 'WebPushManual123!'

function runNode(args) {
  const result = spawnSync('node', args, { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' })
  process.exit(result.status ?? 1)
}

function getStatusJson() {
  const result = spawnSync('npx', ['supabase', 'status', '-o', 'json'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  const match = result.stdout.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Could not parse supabase status JSON')
  return JSON.parse(match[0])
}

async function setup() {
  const status = getStatusJson()
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const roleId = (
    await admin.from('roles').select('id').eq('code', 'cashier').maybeSingle()
  ).data?.id
  if (!roleId) throw new Error('Missing cashier role')

  const login = `${FIXTURE_TAG}-staff`
  const email = loginToTechnicalEmail(login)

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: FIXTURE_PASSWORD,
    email_confirm: true,
  })
  if (authError) throw new Error(authError.message)

  const { data: maxRow } = await admin
    .from('academy_users')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  const employeeId = (maxRow?.id ?? 0) + 1

  const { error: insertError } = await admin.from('academy_users').insert({
    id: employeeId,
    first_name: 'WebPush',
    last_name: 'Manual',
    full_name: `[${FIXTURE_TAG}] manual tester`,
    login,
    password: '',
    role: 'cashier',
    role_id: roleId,
    status: 'active',
    auth_user_id: authData.user.id,
  })
  if (insertError) throw new Error(insertError.message)

  const anon = createClient(status.API_URL, status.ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = await anon.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (signIn.error) throw new Error(signIn.error.message)

  console.log('\nManual Web Push fixture ready')
  console.log(`Login: ${login}`)
  console.log(`Password: ${FIXTURE_PASSWORD}`)
  console.log('Open /platform/profile after Auth-first login to enable notifications.\n')
}

async function cleanup() {
  const status = getStatusJson()
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: employees } = await admin
    .from('academy_users')
    .select('id, auth_user_id')
    .like('login', `${FIXTURE_TAG}-%`)

  for (const employee of employees ?? []) {
    await admin.from('notification_push_subscriptions').delete().eq('employee_id', employee.id)
  }

  await admin.from('academy_users').delete().like('login', `${FIXTURE_TAG}-%`)

  for (const row of employees ?? []) {
    if (row.auth_user_id) await admin.auth.admin.deleteUser(row.auth_user_id).catch(() => {})
  }

  console.log('Manual Web Push fixture cleaned up')
}

const mode = process.argv.find((arg) => arg === '--setup' || arg === '--cleanup')
if (mode === '--setup') {
  setup().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
} else if (mode === '--cleanup') {
  cleanup().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
} else {
  console.error('Usage: node scripts/local-web-push-fixture.mjs --setup|--cleanup')
  process.exit(1)
}
