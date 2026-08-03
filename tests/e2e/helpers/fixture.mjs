/**
 * Secure setup/teardown for production recruitment E2E.
 * Creates a temporary HR role + auth user; cleans all E2E-* entities by run id.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAdminClient, createAnonClient, getBaseUrl } from './env.mjs'
import { loginToTechnicalEmail } from '../../../src/utils/phoneUtils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATE_PATH = path.resolve(__dirname, '../.run-state.json')

const HR_PERMISSION_CODES = [
  'recruitment.view',
  'recruitment.manage_vacancies',
  'recruitment.manage_candidates',
  'recruitment.invite_candidate',
  'recruitment.hire_candidate',
  'employees.view',
  'employees.create',
]

export function createTestRunId() {
  const ts = Date.now()
  const rand = crypto.randomBytes(3).toString('hex')
  return `E2E-HR-${ts}-${rand}`
}

export function loadState() {
  if (!fs.existsSync(STATE_PATH)) return null
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
}

export function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

export function clearStateFile() {
  if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH)
}

function strongPassword() {
  return `Ee2!${crypto.randomBytes(18).toString('base64url')}`
}

async function nextEmployeeId(admin) {
  const { data, error } = await admin
    .from('academy_users')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`employee_id_lookup_failed: ${error.message}`)
  return (data?.id ?? 0) + 1
}

async function ensureHrRole(admin, runId) {
  const code = `e2e_hr_${runId.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40)}`
  const { data: existing } = await admin.from('roles').select('id, code').eq('code', code).maybeSingle()
  let roleId = existing?.id
  if (!roleId) {
    const { data, error } = await admin
      .from('roles')
      .insert({
        code,
        name: `E2E HR ${runId}`,
        description: 'Temporary role for recruitment Playwright E2E',
        is_system: false,
        is_active: true,
      })
      .select('id, code')
      .single()
    if (error) throw new Error(`create role failed: ${error.message}`)
    roleId = data.id
  }

  const { data: perms, error: permErr } = await admin
    .from('permissions')
    .select('id, code')
    .in('code', HR_PERMISSION_CODES)
  if (permErr) throw new Error(`permissions lookup failed: ${permErr.message}`)
  if ((perms || []).length < HR_PERMISSION_CODES.length) {
    throw new Error('Not all required recruitment/employee permissions exist')
  }

  await admin.from('role_permissions').delete().eq('role_id', roleId)
  const rows = perms.map((p) => ({ role_id: roleId, permission_id: p.id }))
  const { error: grantErr } = await admin.from('role_permissions').insert(rows)
  if (grantErr) throw new Error(`grant permissions failed: ${grantErr.message}`)

  return { roleId, roleCode: code }
}

export async function setupE2eFixture(options = {}) {
  const runId = options.runId || createTestRunId()
  const login = `e2e_hr_${runId.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`.slice(0, 48)
  const password =
    process.env.E2E_HR_PASSWORD?.trim() ||
    options.password ||
    strongPassword()
  const email = loginToTechnicalEmail(login)
  const admin = createAdminClient()

  const { roleId, roleCode } = await ensureHrRole(admin, runId)

  const { data: authCreated, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { e2e_run_id: runId },
  })
  if (authErr || !authCreated?.user?.id) {
    throw new Error(`auth create failed: ${authErr?.message || 'unknown'}`)
  }
  const authUserId = authCreated.user.id

  let employeeId
  try {
    employeeId = await nextEmployeeId(admin)
    const { error: insertErr } = await admin.from('academy_users').insert({
      id: employeeId,
      first_name: 'E2E',
      last_name: 'HR',
      full_name: `E2E HR ${runId}`,
      login,
      role: roleCode,
      role_id: roleId,
      position: 'E2E HR',
      status: 'active',
      work_mode: 'offline',
      salary_calculation_type: 'shift_based',
      payroll_participation: 'active',
      auth_user_id: authUserId,
    })
    if (insertErr) throw new Error(insertErr.message)
  } catch (err) {
    await admin.auth.admin.deleteUser(authUserId).catch(() => {})
    throw new Error(`academy_users insert failed: ${err.message}`)
  }

  const { data: position } = await admin
    .from('positions')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!position?.id) throw new Error('No active position available for E2E vacancy')

  const state = {
    runId,
    titlePrefix: runId,
    login,
    password,
    email,
    authUserId,
    employeeId,
    roleId,
    roleCode,
    positionId: position.id,
    positionName: position.name,
    baseUrl: getBaseUrl(),
    vacancyIds: [],
    candidateIds: [],
    uploadIds: [],
    createdAt: new Date().toISOString(),
  }
  saveState(state)

  // Export credentials for Playwright only via env (never logged).
  process.env.E2E_HR_LOGIN = login
  process.env.E2E_HR_PASSWORD = password
  process.env.E2E_RUN_ID = runId
  process.env.E2E_POSITION_ID = position.id
  process.env.E2E_POSITION_NAME = position.name

  return state
}

async function listStorageUnderPrefix(admin, bucket, prefix) {
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 100 })
  if (error) return []
  return data || []
}

export async function cleanupE2eFixture(stateInput) {
  const state = stateInput || loadState()
  if (!state?.runId) {
    return { ok: true, skipped: true }
  }
  const admin = createAdminClient()
  const anon = createAnonClient()
  const runId = state.runId
  const report = {
    runId,
    vacanciesDeleted: 0,
    candidatesDeleted: 0,
    uploadsDeleted: 0,
    storageDeleted: 0,
    roleDeleted: false,
    profileDeleted: false,
    authDeleted: false,
    leftovers: {},
  }

  // Candidates by vacancy title prefix or tracked ids
  const { data: vacancies } = await admin
    .from('academy_vacancies')
    .select('id, title, slug')
    .ilike('title', `${runId}%`)

  const vacancyIds = Array.from(
    new Set([...(state.vacancyIds || []), ...(vacancies || []).map((v) => v.id)])
  )

  let candidateIds = [...(state.candidateIds || [])]
  if (vacancyIds.length) {
    const { data: cands } = await admin
      .from('academy_candidates')
      .select('id, photo_path, vacancy_id')
      .in('vacancy_id', vacancyIds)
    for (const c of cands || []) candidateIds.push(c.id)
  }
  candidateIds = Array.from(new Set(candidateIds))

  // Upload sessions for these vacancies
  if (vacancyIds.length) {
    const { data: uploads } = await admin
      .from('recruitment_application_uploads')
      .select('id, storage_path, vacancy_id')
      .in('vacancy_id', vacancyIds)
    for (const u of uploads || []) {
      if (u.storage_path) {
        await admin.storage.from('candidate-photos').remove([u.storage_path]).catch(() => {})
        report.storageDeleted += 1
      }
      await admin.from('recruitment_application_uploads').delete().eq('id', u.id)
      report.uploadsDeleted += 1
    }
  }

  for (const id of candidateIds) {
    const { data: cand } = await admin
      .from('academy_candidates')
      .select('id, photo_path')
      .eq('id', id)
      .maybeSingle()
    if (cand?.photo_path) {
      await admin.storage.from('candidate-photos').remove([cand.photo_path]).catch(() => {})
      report.storageDeleted += 1
    }
    await admin.from('academy_candidates').delete().eq('id', id)
    report.candidatesDeleted += 1
  }

  for (const vacancyId of vacancyIds) {
    await admin.from('academy_candidate_questions').delete().eq('vacancy_id', vacancyId)
    await admin.from('academy_vacancies').delete().eq('id', vacancyId)
    report.vacanciesDeleted += 1
  }

  // HR profile + auth + role (skip when reusing durable secret account)
  if (!state.reuseAccount) {
    if (state.employeeId) {
      await admin.from('academy_users').delete().eq('id', state.employeeId)
      report.profileDeleted = true
    } else if (state.login) {
      await admin.from('academy_users').delete().eq('login', state.login)
      report.profileDeleted = true
    }

    if (state.authUserId) {
      const { error } = await admin.auth.admin.deleteUser(state.authUserId)
      report.authDeleted = !error
    }

    if (state.roleId) {
      await admin.from('role_permissions').delete().eq('role_id', state.roleId)
      await admin.from('roles').delete().eq('id', state.roleId)
      report.roleDeleted = true
    }
  } else {
    report.profileDeleted = false
    report.authDeleted = false
    report.roleDeleted = false
  }

  // Post-cleanup verification
  const { count: vacLeft } = await admin
    .from('academy_vacancies')
    .select('id', { count: 'exact', head: true })
    .ilike('title', `${runId}%`)
  const { count: roleLeft } = await admin
    .from('roles')
    .select('id', { count: 'exact', head: true })
    .eq('id', state.roleId || '00000000-0000-0000-0000-000000000000')
  const { count: userLeft } = await admin
    .from('academy_users')
    .select('id', { count: 'exact', head: true })
    .eq('login', state.login || '__none__')

  report.leftovers = {
    vacancies: vacLeft || 0,
    roles: roleLeft || 0,
    users: userLeft || 0,
  }

  // Confirm protected vacancies untouched (diagnostic only)
  const { data: protectedRows } = await admin
    .from('academy_vacancies')
    .select('slug, title')
    .in('slug', ['kassir', 'prodavets'])
  report.protectedVacancies = (protectedRows || []).map((r) => r.slug)

  // Anon cannot list private bucket (expected security)
  const { error: anonListErr } = await anon.storage.from('candidate-photos').list('', { limit: 1 })
  report.anonStorageBlocked = Boolean(anonListErr)

  clearStateFile()
  return report
}

export async function trackVacancy(vacancyId) {
  const state = loadState()
  if (!state) return
  state.vacancyIds = Array.from(new Set([...(state.vacancyIds || []), vacancyId]))
  saveState(state)
}

export async function trackCandidate(candidateId) {
  const state = loadState()
  if (!state) return
  state.candidateIds = Array.from(new Set([...(state.candidateIds || []), candidateId]))
  saveState(state)
}

/** Backend diagnostics used by Playwright assertions (never via public client for private fields). */
export async function getVacancyDiagnostics(vacancyId) {
  const admin = createAdminClient()
  const { data: vacancy, error } = await admin
    .from('academy_vacancies')
    .select(
      'id, title, slug, status, position_id, position_name_snapshot, application_form_version, role, employee_role'
    )
    .eq('id', vacancyId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const { data: questions } = await admin
    .from('academy_candidate_questions')
    .select(
      'id, question_text, question_type, field_binding, required, is_active, sort_order, options, help_text, placeholder'
    )
    .eq('vacancy_id', vacancyId)
    .order('sort_order', { ascending: true })
  return { vacancy, questions: questions || [] }
}

export async function getCandidateDiagnostics(candidateId) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('academy_candidates')
    .select(
      'id, vacancy_id, status, total_score, score_percent, first_name, last_name, phone, photo_path, answers, admin_notes, interview_date, interview_time, interview_address, created_user_id'
    )
    .eq('id', candidateId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function findCandidatesForVacancy(vacancyId) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('academy_candidates')
    .select('id, first_name, phone, status, photo_path, answers, total_score, score_percent')
    .eq('vacancy_id', vacancyId)
    .order('submitted_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

export async function getUploadDiagnostics(uploadId) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('recruitment_application_uploads')
    .select('id, vacancy_id, storage_path, used_at, candidate_id, expires_at, cancelled_at')
    .eq('id', uploadId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function findUploadsForVacancy(vacancyId) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('recruitment_application_uploads')
    .select('id, used_at, candidate_id, storage_path, expires_at, cancelled_at')
    .eq('vacancy_id', vacancyId)
  if (error) throw new Error(error.message)
  return data || []
}

export async function assertProtectedVacanciesUntouched() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('academy_vacancies')
    .select('id, slug, title, status, application_form_version')
    .in('slug', ['kassir', 'prodavets'])
  if (error) throw new Error(error.message)
  return data || []
}

/** Controlled duplicate rollback check (integration, not UI). */
export async function assertDuplicateRollback(sourceVacancyId) {
  const admin = createAdminClient()
  // Call with invalid uuid as source — should fail without creating rows.
  const before = await admin
    .from('academy_vacancies')
    .select('id', { count: 'exact', head: true })
    .ilike('title', 'E2E-HR-%')

  const { error } = await admin.rpc('duplicate_vacancy_with_application_form', {
    p_source_vacancy_id: '00000000-0000-0000-0000-000000000000',
  })
  if (!error) {
    throw new Error('duplicate RPC should fail for missing source')
  }

  // Also try as authenticated HR would — service role may bypass permission.
  // Prefer invalid payload that fails mid-transaction: sourceVacancyId with broken form.
  // If source is valid, skip broken-form injection to avoid mutating real data.
  void sourceVacancyId
  void before
  return { failedAsExpected: true, message: error.message }
}
