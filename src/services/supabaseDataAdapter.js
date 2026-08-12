import { supabase } from '../lib/supabaseClient'
import {
  ACADEMY_AUTH_PROFILE_FIELDS,
  ACADEMY_PROFILE_SAFE_FIELDS,
} from './authService'
import {
  normalizeEmployee,
  canEmployeeLogin,
  todayEmployeeDateKey,
  migrateEmployeeLocalSchema,
} from '../utils/employeeData'
import { normalizeRoleId } from '../data/roles'
import { resolveRoleIdByCode } from './rbacService'
import {
  buildPositionFieldsFromCatalog,
  ensurePositionCatalogLoaded,
} from './positionCatalogService'

function mapAcademyUserRow(row) {
  const positionFields = buildPositionFieldsFromCatalog(
    row.position_id,
    row.position || '',
  )
  return normalizeEmployee({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: row.full_name,
    login: row.login,
    role: row.role,
    roleId: row.role_id,
    ...positionFields,
    employmentStatus: row.status,
    hiredAt: row.hired_at,
    terminatedAt: row.terminated_at,
    workMode: row.work_mode,
    salaryCalculationType: row.salary_calculation_type,
    payrollParticipation: row.payroll_participation,
    createdAt: row.created_at,
    avatarUrl: row.avatar_url,
    contactEmail: row.contact_email || '',
    workLocationId: row.work_location_id,
  })
}

async function resolveRoleIdForSlug(roleSlug) {
  try {
    return await resolveRoleIdByCode(normalizeRoleId(roleSlug))
  } catch {
    return null
  }
}

async function throwIfError(result, context) {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`)
  }
  return result.data
}

function settleTableResult(result, context, fallback = []) {
  if (result?.error) {
    console.error(`[${context}]`, result.error)
    if (import.meta.env.DEV) {
      console.error('[DataLoad]', {
        context,
        code: result.error.code,
        message: result.error.message,
        details: result.error.details,
        hint: result.error.hint,
      })
    }
    return fallback
  }
  return result?.data ?? fallback
}

/** Platform employee core — never touches Academy Learning tables. */
export async function fetchCoreEmployeeData() {
  migrateEmployeeLocalSchema()
  let usersRes = await supabase
    .from('academy_users')
    .select(ACADEMY_PROFILE_SAFE_FIELDS)
    .order('id')
  if (usersRes.error) {
    usersRes = await supabase
      .from('academy_users')
      .select(ACADEMY_AUTH_PROFILE_FIELDS)
      .order('id')
  }

  // Batch catalog load (not per employee). Failures leave legacy position text intact.
  await ensurePositionCatalogLoaded().catch(() => null)

  const users = settleTableResult(usersRes, 'Загрузка сотрудников', [])
  const employees = users.map((row) => mapAcademyUserRow(row))

  return { employees }
}

export async function fetchRecruitmentModuleData() {
  const { fetchRecruitmentData } = await import('./recruitmentSupabaseAdapter')
  const data = await fetchRecruitmentData()
  return {
    vacancies: data.vacancies,
    candidateQuestions: data.questions,
    candidates: data.candidates,
  }
}

export async function fetchSuppliersModuleData() {
  const { fetchSuppliersData } = await import('./suppliersSupabaseAdapter')
  const data = await fetchSuppliersData()
  return { suppliers: data.suppliers }
}

export async function fetchPurchasesModuleData() {
  const { fetchPurchasesDataCloud } = await import('./purchaseSupabaseAdapter')
  const data = await fetchPurchasesDataCloud()
  return { purchases: data.orders }
}

export async function fetchReceivingModuleData() {
  const { fetchReceivingDataCloud } = await import('./receivingSupabaseAdapter')
  const data = await fetchReceivingDataCloud()
  return { receivingDocuments: data.documents }
}

/**
 * Full dump for legacy callers. Soft-isolates optional modules (including procurement).
 * Prefer progressive bootstrap via platformDataService.ensureModuleLoaded.
 */
export async function fetchAllData() {
  const { employees } = await fetchCoreEmployeeData()

  const [
    recruitmentResult,
    suppliersResult,
    purchasesResult,
    receivingResult,
  ] = await Promise.allSettled([
    fetchRecruitmentModuleData(),
    fetchSuppliersModuleData(),
    fetchPurchasesModuleData(),
    fetchReceivingModuleData(),
  ])

  const recruitment =
    recruitmentResult.status === 'fulfilled'
      ? recruitmentResult.value
      : { vacancies: [], candidateQuestions: [], candidates: [] }
  const suppliers =
    suppliersResult.status === 'fulfilled' ? suppliersResult.value : { suppliers: [] }

  if (purchasesResult.status === 'rejected') {
    console.error('[Загрузка закупов]', purchasesResult.reason)
  }
  if (receivingResult.status === 'rejected') {
    console.error('[Загрузка приёмки]', receivingResult.reason)
  }

  const purchases =
    purchasesResult.status === 'fulfilled' ? purchasesResult.value : { purchases: [] }
  const receiving =
    receivingResult.status === 'fulfilled'
      ? receivingResult.value
      : { receivingDocuments: [] }

  return {
    employees,
    ...recruitment,
    ...suppliers,
    ...purchases,
    ...receiving,
    _moduleFailures: {
      recruitment: recruitmentResult.status === 'rejected' ? recruitmentResult.reason : null,
      suppliers: suppliersResult.status === 'rejected' ? suppliersResult.reason : null,
      procurement: purchasesResult.status === 'rejected' ? purchasesResult.reason : null,
      receiving: receivingResult.status === 'rejected' ? receivingResult.reason : null,
    },
  }
}

async function createUser(data) {
  const employee = normalizeEmployee({
    ...data,
    id: data.id,
    employmentStatus: data.employmentStatus || data.status || 'active',
  })

  const row = {
    id: employee.id,
    first_name: employee.firstName,
    last_name: employee.lastName,
    full_name: employee.name,
    login: employee.login,
    password: employee.password || '',
    role: employee.role,
    role_id: employee.roleId || null,
    position_id: employee.positionId || null,
    position: employee.position || '',
    status: employee.employmentStatus,
    hired_at: employee.hiredAt || null,
    terminated_at: employee.terminatedAt || null,
    work_mode: employee.workMode || 'offline',
    salary_calculation_type: employee.salaryCalculationType || 'shift_based',
    payroll_participation: employee.payrollParticipation || 'active',
    avatar_url: employee.avatarUrl || null,
    work_location_id: employee.workLocationId || null,
  }

  if (!row.role_id && employee.role) {
    row.role_id = await resolveRoleIdForSlug(employee.role)
  }

  await throwIfError(
    await supabase.from('academy_users').insert(row),
    'Создание сотрудника'
  )

  return employee.id
}

export async function createEmployee(data) {
  return createUser(data)
}

export async function updateEmployee(id, updates) {
  return updateUser(id, updates)
}

async function updateUser(id, updates) {
  const patch = {}
  if (updates.firstName != null) patch.first_name = updates.firstName
  if (updates.lastName != null) patch.last_name = updates.lastName
  if (updates.firstName != null || updates.lastName != null) {
    const first = updates.firstName ?? ''
    const last = updates.lastName ?? ''
    patch.full_name = `${first} ${last}`.trim()
  }
  if (updates.name != null) patch.full_name = updates.name
  if (updates.login != null) patch.login = updates.login
  if (updates.password != null && updates.password !== '') patch.password = updates.password
  if (updates.role != null) {
    patch.role = updates.role
    patch.role_id = await resolveRoleIdForSlug(updates.role)
  }
  if (updates.roleId != null) patch.role_id = updates.roleId
  if (updates.positionId != null) {
    patch.position_id = updates.positionId
    if (updates.position != null) patch.position = updates.position
  }
  // Legacy position text without positionId is not applied (cloud Edge path is canonical).
  if (updates.employmentStatus != null) patch.status = updates.employmentStatus
  if (updates.status != null) patch.status = updates.status
  if (updates.hiredAt !== undefined) patch.hired_at = updates.hiredAt
  if (updates.terminatedAt !== undefined) patch.terminated_at = updates.terminatedAt
  if (updates.workMode !== undefined) patch.work_mode = updates.workMode
  if (updates.salaryCalculationType !== undefined) {
    patch.salary_calculation_type = updates.salaryCalculationType
  }
  if (updates.payrollParticipation !== undefined) {
    patch.payroll_participation = updates.payrollParticipation
  }
  if (updates.avatarUrl != null) patch.avatar_url = updates.avatarUrl
  if (updates.workLocationId != null) patch.work_location_id = updates.workLocationId

  if (Object.keys(patch).length > 0) {
    await throwIfError(
      await supabase.from('academy_users').update(patch).eq('id', id),
      'Обновление сотрудника'
    )
  }
}

export async function deactivateEmployee(id) {
  await updateUser(id, {
    employmentStatus: 'terminated',
    terminatedAt: todayEmployeeDateKey(),
  })
}

export async function restoreEmployee(id) {
  await updateUser(id, {
    employmentStatus: 'active',
    terminatedAt: null,
  })
}

export async function permanentlyDeleteEmployee(id) {
  await throwIfError(
    await supabase.from('academy_users').delete().eq('id', id),
    'Удаление сотрудника'
  )
}

export async function updateProfileName(userId, fullName) {
  const trimmed = fullName.trim()
  const parts = trimmed.split(/\s+/).filter(Boolean)
  const firstName = parts[0] || trimmed
  const lastName = parts.slice(1).join(' ')

  await throwIfError(
    await supabase
      .from('academy_users')
      .update({
        full_name: trimmed,
        first_name: firstName,
        last_name: lastName,
      })
      .eq('id', userId),
    'Обновление профиля'
  )
}

export async function updateProfile(userId, { firstName, lastName, contactEmail }) {
  const trimmedFirst = firstName.trim()
  const trimmedLast = lastName.trim()
  const fullName = `${trimmedFirst} ${trimmedLast}`.trim()

  await throwIfError(
    await supabase
      .from('academy_users')
      .update({
        first_name: trimmedFirst,
        last_name: trimmedLast,
        full_name: fullName,
        contact_email: contactEmail?.trim() ? contactEmail.trim().toLowerCase() : null,
      })
      .eq('id', userId),
    'Обновление профиля'
  )
}

/** @deprecated Pre-Auth password compare — not used in Auth-first cloud login. */
export async function authenticateUser(loginValue, password) {
  if (!loginValue?.trim()) return { ok: false, reason: 'invalid' }

  const result = await supabase
    .from('academy_users')
    .select('*')
    .eq('login', loginValue.trim())
    .maybeSingle()

  const row = await throwIfError(result, 'Аутентификация')
  if (!row || row.password !== password) {
    return { ok: false, reason: 'invalid' }
  }

  if (!canEmployeeLogin(row.status)) {
    return { ok: false, reason: 'deactivated' }
  }

  await ensurePositionCatalogLoaded().catch(() => null)
  return {
    ok: true,
    user: mapAcademyUserRow(row),
  }
}

/** Users-only migration upsert (learning tables removed from this adapter). */
export async function upsertMigrationBatch(payload) {
  const { users } = payload

  if (users?.length) {
    await throwIfError(
      await supabase.from('academy_users').upsert(users, { onConflict: 'id' }),
      'Миграция сотрудников'
    )
  }
}
