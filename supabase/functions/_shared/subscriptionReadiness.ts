import type { SupabaseClient } from '@supabase/supabase-js'
import { buildStructuredPosition, loadPositionCatalogByIds } from './employeePositions.ts'
import { getCurrentServerVapidFingerprint } from './vapidFingerprint.ts'
import { isActiveEmployeeStatus } from './testBroadcastPush.ts'

export type ReadinessEmployeeRow = {
  employee_id: number
  full_name: string
  position_name: string | null
  connection_state: 'current' | 'outdated' | 'missing' | 'denied'
  device_count: number
  last_success_at: string | null
}

export type SubscriptionReadinessResult = {
  summary: {
    active_employees: number
    employees_with_current: number
    employees_without_subscriptions: number
    employees_only_outdated: number
    employees_with_denied: number
    current_devices: number
    outdated_devices: number
    devices_with_last_success: number
    last_accepted_delivery_at: string | null
  }
  employees_needing_setup: ReadinessEmployeeRow[]
}

type SubRow = {
  employee_id: number
  device_id: string | null
  is_active: boolean
  permission_status: string | null
  vapid_key_fingerprint: string | null
  last_success_at: string | null
}

type EmployeeRow = {
  id: number
  full_name: string | null
  first_name: string | null
  last_name: string | null
  status: string | null
  position: string | null
  position_id: string | null
}

function displayName(row: EmployeeRow): string {
  const full = typeof row.full_name === 'string' ? row.full_name.trim() : ''
  if (full) return full
  const parts = [row.first_name, row.last_name]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim())
  return parts.join(' ') || `Сотрудник #${row.id}`
}

export async function getSubscriptionReadiness(
  serviceClient: SupabaseClient
): Promise<SubscriptionReadinessResult> {
  const currentFingerprint = await getCurrentServerVapidFingerprint()

  const [{ data: employees, error: employeesError }, { data: subscriptions, error: subsError }, deliveryResult] =
    await Promise.all([
      serviceClient
        .from('academy_users')
        .select('id, full_name, first_name, last_name, status, position, position_id'),
      serviceClient
        .from('notification_push_subscriptions')
        .select(
          'employee_id, device_id, is_active, permission_status, vapid_key_fingerprint, last_success_at'
        ),
      serviceClient
        .from('notification_deliveries')
        .select('created_at')
        .eq('status', 'accepted')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  if (employeesError) throw new Error('employee_load_error')
  if (subsError) throw new Error('subscription_load_error')

  const activeEmployees = ((employees ?? []) as EmployeeRow[]).filter((row) =>
    isActiveEmployeeStatus(row.status)
  )

  const positionIds = activeEmployees
    .map((row) => row.position_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  const positionCatalog = await loadPositionCatalogByIds(serviceClient, positionIds)

  const byEmployee = new Map<
    number,
    {
      employee_id: number
      full_name: string
      position_name: string | null
      device_count: number
      current_device_count: number
      outdated_device_count: number
      denied_device_count: number
      last_success_at: string | null
    }
  >()

  for (const employee of activeEmployees) {
    const catalog =
      typeof employee.position_id === 'string'
        ? positionCatalog.get(employee.position_id) ?? null
        : null
    const positionFields = buildStructuredPosition(employee.position, catalog)
    byEmployee.set(employee.id, {
      employee_id: employee.id,
      full_name: displayName(employee),
      position_name: positionFields.position_name,
      device_count: 0,
      current_device_count: 0,
      outdated_device_count: 0,
      denied_device_count: 0,
      last_success_at: null,
    })
  }

  let currentDevices = 0
  let outdatedDevices = 0
  let devicesWithSuccess = 0

  for (const sub of (subscriptions ?? []) as SubRow[]) {
    const employee = byEmployee.get(sub.employee_id)
    if (!employee) continue

    if (sub.permission_status === 'denied') {
      employee.denied_device_count += 1
    }

    if (!(sub.is_active && sub.permission_status === 'granted')) continue

    employee.device_count += 1
    const isCurrent =
      Boolean(currentFingerprint) && sub.vapid_key_fingerprint === currentFingerprint

    if (isCurrent) {
      employee.current_device_count += 1
      currentDevices += 1
    } else {
      employee.outdated_device_count += 1
      outdatedDevices += 1
    }

    if (sub.last_success_at) {
      devicesWithSuccess += 1
      if (
        !employee.last_success_at ||
        new Date(sub.last_success_at) > new Date(employee.last_success_at)
      ) {
        employee.last_success_at = sub.last_success_at
      }
    }
  }

  const rows = [...byEmployee.values()].map((row) => {
    let connection_state: ReadinessEmployeeRow['connection_state'] = 'missing'
    if (row.current_device_count > 0) connection_state = 'current'
    else if (row.outdated_device_count > 0) connection_state = 'outdated'
    else if (row.denied_device_count > 0 && row.device_count === 0) connection_state = 'denied'
    return {
      employee_id: row.employee_id,
      full_name: row.full_name,
      position_name: row.position_name,
      connection_state,
      device_count: row.device_count,
      last_success_at: row.last_success_at,
    }
  })

  const withCurrent = rows.filter((row) => row.connection_state === 'current').length
  const withOnlyOutdated = rows.filter((row) => row.connection_state === 'outdated').length
  const withMissing = rows.filter((row) => row.connection_state === 'missing').length
  const withDenied = rows.filter((row) => row.connection_state === 'denied').length

  const lastAccepted =
    deliveryResult.error || !deliveryResult.data?.created_at
      ? null
      : String(deliveryResult.data.created_at)

  return {
    summary: {
      active_employees: activeEmployees.length,
      employees_with_current: withCurrent,
      employees_without_subscriptions: withMissing,
      employees_only_outdated: withOnlyOutdated,
      employees_with_denied: withDenied,
      current_devices: currentDevices,
      outdated_devices: outdatedDevices,
      devices_with_last_success: devicesWithSuccess,
      last_accepted_delivery_at: lastAccepted,
    },
    employees_needing_setup: rows
      .filter((row) => row.connection_state !== 'current')
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru')),
  }
}
