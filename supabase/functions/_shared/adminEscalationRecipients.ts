import type { SupabaseClient } from '@supabase/supabase-js'
import { isActiveEmployeeStatus } from './testBroadcastPush.ts'
import {
  buildPlannedShiftWindow,
  addDaysToDateKey,
  getDateKeyInTimezone,
  type ShiftRow,
} from './timeTrackerNotificationDispatch.ts'
import type { EscalationSettings } from './adminEscalationLogic.ts'

export type AdminRecipient = {
  employee_id: number
  auth_user_id: string | null
  full_name: string
  source: 'duty' | 'fallback' | 'permission_fallback' | 'controlled_override'
}

const ADMIN_ROLE_CODES = new Set(['admin', 'administrator', 'floor_admin'])
const DUTY_PERMISSIONS = ['schedule.view_team', 'schedule.edit', 'notifications.manage']

type EmployeeCandidate = {
  id: number
  status: string | null
  auth_user_id: string | null
  full_name: string | null
  first_name: string | null
  last_name: string | null
  role_id: string | null
  role_code: string | null
}

function displayName(row: EmployeeCandidate): string {
  const full = row.full_name?.trim()
  if (full) return full
  const parts = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
  return parts || `Сотрудник #${row.id}`
}

function coversInstant(shift: ShiftRow, instant: Date): boolean {
  if (shift.status !== 'working') return false
  const window = buildPlannedShiftWindow(shift)
  if (!window) return false
  return (
    instant.getTime() >= window.plannedStartAt.getTime() &&
    instant.getTime() < window.plannedEndAt.getTime()
  )
}

async function loadPermissionRoleIds(serviceClient: SupabaseClient): Promise<Set<string>> {
  const { data: permissions } = await serviceClient
    .from('permissions')
    .select('id, code')
    .in('code', DUTY_PERMISSIONS)

  const permissionIds = (permissions ?? []).map((row) => row.id)
  if (!permissionIds.length) return new Set()

  const { data: rolePermissions } = await serviceClient
    .from('role_permissions')
    .select('role_id')
    .in('permission_id', permissionIds)

  return new Set((rolePermissions ?? []).map((row) => String(row.role_id)))
}

async function loadAdminCandidates(serviceClient: SupabaseClient): Promise<EmployeeCandidate[]> {
  const { data: employees, error } = await serviceClient
    .from('academy_users')
    .select('id, status, auth_user_id, full_name, first_name, last_name, role_id')

  if (error) throw new Error('admin_candidate_load_error')

  const roleIds = [
    ...new Set(
      (employees ?? [])
        .map((row) => row.role_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ]

  const roleCodeById = new Map<string, string>()
  if (roleIds.length) {
    const { data: roles } = await serviceClient.from('roles').select('id, code').in('id', roleIds)
    for (const role of roles ?? []) {
      roleCodeById.set(String(role.id), String(role.code ?? ''))
    }
  }

  return ((employees ?? []) as Omit<EmployeeCandidate, 'role_code'>[]).map((row) => ({
    ...row,
    role_code: row.role_id ? roleCodeById.get(String(row.role_id)) ?? null : null,
  }))
}

function isAdminCandidate(
  employee: EmployeeCandidate,
  permissionRoleIds: Set<string>
): boolean {
  if (!isActiveEmployeeStatus(employee.status)) return false
  if (!employee.auth_user_id) return false
  if (employee.role_code && ADMIN_ROLE_CODES.has(employee.role_code)) return true
  if (employee.role_id && permissionRoleIds.has(String(employee.role_id))) return true
  return false
}

export async function resolveAdminEscalationRecipients(params: {
  serviceClient: SupabaseClient
  violatorEmployeeId: number
  violationAt: Date
  settings: EscalationSettings
  controlledRecipientIds?: number[] | null
}): Promise<AdminRecipient[]> {
  if (params.controlledRecipientIds?.length) {
    const { data } = await params.serviceClient
      .from('academy_users')
      .select('id, status, auth_user_id, full_name, first_name, last_name, role_id')
      .in('id', params.controlledRecipientIds)

    return ((data ?? []) as EmployeeCandidate[])
      .filter(
        (row) =>
          isActiveEmployeeStatus(row.status) &&
          row.auth_user_id &&
          row.id !== params.violatorEmployeeId
      )
      .map((row) => ({
        employee_id: row.id,
        auth_user_id: row.auth_user_id,
        full_name: displayName({ ...row, role_code: null }),
        source: 'controlled_override' as const,
      }))
  }

  const [candidates, permissionRoleIds] = await Promise.all([
    loadAdminCandidates(params.serviceClient),
    loadPermissionRoleIds(params.serviceClient),
  ])

  const adminPool = candidates.filter((row) => isAdminCandidate(row, permissionRoleIds))
  const adminById = new Map(adminPool.map((row) => [row.id, row]))

  const todayKey = getDateKeyInTimezone(params.violationAt)
  const startDate = addDaysToDateKey(todayKey, -1)
  const endDate = addDaysToDateKey(todayKey, 1)

  const adminIds = adminPool.map((row) => row.id)
  let duty: AdminRecipient[] = []

  if (adminIds.length) {
    const { data: shifts } = await params.serviceClient
      .from('academy_employee_shifts')
      .select(
        'id, employee_id, shift_date, status, planned_start_time, planned_end_time, actual_start_time, actual_end_time'
      )
      .in('employee_id', adminIds)
      .gte('shift_date', startDate)
      .lte('shift_date', endDate)

    const dutyIds = new Set<number>()
    for (const shift of (shifts ?? []) as ShiftRow[]) {
      if (shift.employee_id === params.violatorEmployeeId) continue
      if (!coversInstant(shift, params.violationAt)) continue
      if (!adminById.has(shift.employee_id)) continue
      dutyIds.add(shift.employee_id)
    }

    duty = [...dutyIds].map((id) => {
      const row = adminById.get(id)!
      return {
        employee_id: id,
        auth_user_id: row.auth_user_id,
        full_name: displayName(row),
        source: 'duty' as const,
      }
    })
  }

  if (duty.length > 0) return duty

  if (params.settings.recipient_mode === 'duty') {
    return []
  }

  const fallbackIds = [...new Set(params.settings.fallback_employee_ids)].filter(
    (id) => id !== params.violatorEmployeeId
  )

  if (fallbackIds.length) {
    const fromFallback = fallbackIds
      .map((id) => adminById.get(id) ?? candidates.find((row) => row.id === id))
      .filter((row): row is EmployeeCandidate => Boolean(row))
      .filter((row) => isActiveEmployeeStatus(row.status) && Boolean(row.auth_user_id))
      .map((row) => ({
        employee_id: row.id,
        auth_user_id: row.auth_user_id,
        full_name: displayName(row),
        source: 'fallback' as const,
      }))
    if (fromFallback.length) return fromFallback
  }

  return adminPool
    .filter((row) => row.id !== params.violatorEmployeeId)
    .map((row) => ({
      employee_id: row.id,
      auth_user_id: row.auth_user_id,
      full_name: displayName(row),
      source: 'permission_fallback' as const,
    }))
}
