#!/usr/bin/env node
/**
 * One-time Auth user provisioning for production Auth cutover (Phase B).
 *
 * Usage:
 *   node scripts/production-auth-users-migration.mjs --dry-run
 *   node scripts/production-auth-users-migration.mjs --status
 *   node scripts/production-auth-users-migration.mjs --apply   # local fixtures only on this step
 *
 * Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Never commit service role key. Never log passwords, full emails, or auth UUIDs.
 */

import { createClient } from '@supabase/supabase-js'
import { loginToTechnicalEmail } from '../src/utils/phoneUtils.js'

const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'

const args = new Set(process.argv.slice(2))
const modeDryRun = args.has('--dry-run')
const modeApply = args.has('--apply')
const modeStatus = args.has('--status')

if (!modeDryRun && !modeApply && !modeStatus) {
  console.error('Usage: --dry-run | --status | --apply')
  process.exit(1)
}

if ([modeDryRun, modeApply, modeStatus].filter(Boolean).length > 1) {
  console.error('Choose exactly one mode: --dry-run, --status, or --apply')
  process.exit(1)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function isLocalUrl(url) {
  return url.includes('127.0.0.1') || url.includes('localhost')
}

function isProductionUrl(url) {
  return url.includes(PRODUCTION_REF) || (url.includes('supabase.co') && !isLocalUrl(url))
}

function maskOutput(text) {
  if (!text) return text
  let out = text
  out = out.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[uuid-redacted]')
  out = out.replace(/\b7\d{10}@shugyla\.local\b/g, '[technical-email-redacted]')
  out = out.replace(/[\w.+-]+@shugyla\.local\b/gi, '[technical-email-redacted]')
  out = out.replace(/password[^\s]*/gi, '[password-redacted]')
  return out
}

function safeLog(message) {
  console.log(maskOutput(String(message)))
}

function loadConfig() {
  const url = process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !serviceRoleKey) {
    fail('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
  }

  if (modeApply && isProductionUrl(url)) {
    fail('Production --apply blocked on this preparation step. Use --dry-run or --status only.')
  }

  return { url, serviceRoleKey }
}

async function listAllAuthUsers(admin) {
  const byEmail = new Map()
  let page = 1
  const perPage = 200

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`listUsers failed: ${error.message}`)
    for (const user of data.users ?? []) {
      if (user.email) byEmail.set(user.email.toLowerCase(), user)
    }
    if ((data.users ?? []).length < perPage) break
    page += 1
  }

  return byEmail
}

async function fetchAcademyUsers(admin, includePassword = false) {
  const fields = includePassword
    ? 'id, login, status, auth_user_id, password'
    : 'id, login, status, auth_user_id'
  const { data, error } = await admin.from('academy_users').select(fields).order('id')
  if (error) throw new Error(`fetch academy_users failed: ${error.message}`)
  return data ?? []
}

function buildPlan(academyUsers, authByEmail) {
  const stats = {
    academyUsers: academyUsers.length,
    alreadyLinked: 0,
    existingAuthMatches: 0,
    wouldCreateAuthUsers: 0,
    conflicts: 0,
    inactiveUsers: 0,
    ready: true,
  }

  const actions = []

  for (const row of academyUsers) {
    if (row.status === 'inactive' || row.status === 'terminated') {
      stats.inactiveUsers += 1
    }

    if (row.auth_user_id) {
      stats.alreadyLinked += 1
      continue
    }

    const technicalEmail = loginToTechnicalEmail(row.login)
    if (!technicalEmail) {
      stats.conflicts += 1
      stats.ready = false
      actions.push({ employeeId: row.id, action: 'conflict', reason: 'invalid_login_mapping' })
      continue
    }

    const existing = authByEmail.get(technicalEmail.toLowerCase())
    if (existing) {
      stats.existingAuthMatches += 1
      actions.push({
        employeeId: row.id,
        action: 'link',
        authUserId: existing.id,
        technicalEmail,
      })
      continue
    }

    stats.wouldCreateAuthUsers += 1
    actions.push({
      employeeId: row.id,
      action: 'create',
      technicalEmail,
    })
  }

  const emailOwners = new Map()
  for (const item of actions) {
    if (item.action === 'conflict') continue
    const email = item.technicalEmail?.toLowerCase()
    if (!email) continue
    if (!emailOwners.has(email)) emailOwners.set(email, [])
    emailOwners.get(email).push(item.employeeId)
  }

  for (const [, ids] of emailOwners) {
    if (ids.length > 1) {
      stats.conflicts += ids.length
      stats.ready = false
    }
  }

  return { stats, actions }
}

async function applyActions(admin, academyUsers, actions) {
  const passwordById = new Map(academyUsers.map((r) => [r.id, r.password]))

  for (const item of actions) {
    if (item.action === 'conflict') {
      throw new Error(`Unresolved conflict for employee id ${item.employeeId}`)
    }

    let authUserId = item.authUserId

    if (item.action === 'create') {
      const legacyPassword = passwordById.get(item.employeeId)
      if (!legacyPassword) {
        throw new Error(`Missing legacy password for employee id ${item.employeeId}`)
      }

      const { data, error } = await admin.auth.admin.createUser({
        email: item.technicalEmail,
        password: legacyPassword,
        email_confirm: true,
      })
      if (error) throw new Error(`createUser failed: ${error.message}`)
      authUserId = data.user.id
    }

    const { error: updateError } = await admin
      .from('academy_users')
      .update({ auth_user_id: authUserId })
      .eq('id', item.employeeId)
      .is('auth_user_id', null)

    if (updateError) throw new Error(`link auth_user_id failed: ${updateError.message}`)
  }
}

async function main() {
  const { url, serviceRoleKey } = loadConfig()

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const academyUsers = await fetchAcademyUsers(admin, modeApply)

  if (modeStatus) {
    const linked = academyUsers.filter((r) => r.auth_user_id).length
    const activeUnlinked = academyUsers.filter(
      (r) => r.status === 'active' && !r.auth_user_id
    ).length
    safeLog(
      JSON.stringify(
        {
          academyUsers: academyUsers.length,
          linked,
          activeUnlinked,
          inactiveUsers: academyUsers.filter(
            (r) => r.status === 'inactive' || r.status === 'terminated'
          ).length,
        },
        null,
        2
      )
    )
    process.exit(activeUnlinked === 0 ? 0 : 1)
  }

  const authByEmail = await listAllAuthUsers(admin)
  const { stats, actions } = buildPlan(academyUsers, authByEmail)

  if (modeDryRun) {
    console.log(JSON.stringify(stats, null, 2))
    process.exit(stats.ready ? 0 : 1)
  }

  if (modeApply) {
    if (!isLocalUrl(url)) fail('Local --apply only on this preparation step.')
    const withPassword = await fetchAcademyUsers(admin, true)
    const plan = buildPlan(withPassword, authByEmail)
    await applyActions(admin, withPassword, plan.actions)
    const after = await fetchAcademyUsers(admin)
    const linked = after.filter((r) => r.auth_user_id).length
    safeLog(JSON.stringify({ applied: true, linked, total: after.length }, null, 2))
  }
}

main().catch((err) => {
  safeLog(`ERROR: ${err.message}`)
  process.exit(1)
})
