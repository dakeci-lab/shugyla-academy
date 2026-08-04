import type { SupabaseClient } from '@supabase/supabase-js'
import { buildStructuredPosition, loadPositionCatalogByIds } from './employeePositions.ts'
import { getCurrentServerVapidFingerprint } from './vapidFingerprint.ts'
import { isActiveEmployeeStatus } from './testBroadcastPush.ts'
import {
  buildReadinessWarnings,
  resolveEmployeeReadiness,
  type AcceptedDeliveryInput,
  type EmployeeReadinessRow,
  type ReadinessState,
  type SubscriptionInput,
} from './subscriptionReadinessLogic.ts'

export type { EmployeeReadinessRow, ReadinessState }

export type SubscriptionReadinessResult = {
  summary: {
    active_employees: number
    eligible_employees: number
    confirmed: number
    connected_unconfirmed: number
    missing: number
    outdated_only: number
    delivery_failed: number
    denied: number
    current_devices: number
    confirmed_devices: number
    outdated_devices: number
    employees_with_multiple_current: number
    last_accepted_delivery_at: string | null
    /** Backward-compatible aliases used by older UI/tests */
    employees_with_current: number
    employees_without_subscriptions: number
    employees_only_outdated: number
    employees_with_denied: number
    devices_with_last_success: number
  }
  employees: EmployeeReadinessRow[]
  employees_needing_setup: EmployeeReadinessRow[]
  warnings: Array<{ code: string; severity: 'info' | 'warning'; message: string }>
  canonical_fingerprint: string | null
}

type EmployeeRow = {
  id: number
  full_name: string | null
  first_name: string | null
  last_name: string | null
  status: string | null
  position: string | null
  position_id: string | null
  auth_user_id: string | null
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
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: employees, error: employeesError },
    { data: subscriptions, error: subsError },
    deliveryResult,
    acceptedRowsResult,
    autoNotificationsResult,
    accepted24hResult,
  ] = await Promise.all([
    serviceClient
      .from('academy_users')
      .select('id, full_name, first_name, last_name, status, position, position_id, auth_user_id'),
    serviceClient
      .from('notification_push_subscriptions')
      .select(
        'id, employee_id, device_id, is_active, revoked_at, permission_status, vapid_key_fingerprint, created_at, updated_at, last_success_at, failure_count'
      ),
    serviceClient
      .from('notification_deliveries')
      .select('created_at')
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    serviceClient
      .from('notification_deliveries')
      .select('subscription_id, created_at')
      .eq('status', 'accepted')
      .not('subscription_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5000),
    serviceClient
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .contains('metadata', { source: 'time_tracker_dispatcher' })
      .gte('created_at', since24h),
    serviceClient
      .from('notification_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .gte('created_at', since24h),
  ])

  if (employeesError) throw new Error('employee_load_error')
  if (subsError) throw new Error('subscription_load_error')

  const acceptedBySubscription = new Map<string, string>()
  for (const row of (acceptedRowsResult.data ?? []) as AcceptedDeliveryInput[]) {
    if (!row.subscription_id || !row.created_at) continue
    if (!acceptedBySubscription.has(row.subscription_id)) {
      acceptedBySubscription.set(row.subscription_id, row.created_at)
    }
  }

  const allEmployees = (employees ?? []) as EmployeeRow[]
  const activeEmployees = allEmployees.filter((row) => isActiveEmployeeStatus(row.status))

  const positionIds = activeEmployees
    .map((row) => row.position_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  const positionCatalog = await loadPositionCatalogByIds(serviceClient, positionIds)

  const subs = (subscriptions ?? []) as SubscriptionInput[]

  const rows: EmployeeReadinessRow[] = activeEmployees.map((employee) => {
    const catalog =
      typeof employee.position_id === 'string'
        ? positionCatalog.get(employee.position_id) ?? null
        : null
    const positionFields = buildStructuredPosition(employee.position, catalog)
    return resolveEmployeeReadiness({
      employee: {
        id: employee.id,
        status: employee.status,
        auth_user_id: employee.auth_user_id,
        full_name: displayName(employee),
        position_name: positionFields.position_name,
      },
      subscriptions: subs,
      currentFingerprint,
      acceptedBySubscription,
    })
  })

  const eligible = rows.filter((row) => row.readiness_state !== 'not_eligible')
  const confirmed = eligible.filter((row) => row.readiness_state === 'confirmed')
  const connectedUnconfirmed = eligible.filter(
    (row) => row.readiness_state === 'connected_unconfirmed'
  )
  const missing = eligible.filter((row) => row.readiness_state === 'missing')
  const outdatedOnly = eligible.filter((row) => row.readiness_state === 'outdated')
  const deliveryFailed = eligible.filter((row) => row.readiness_state === 'delivery_failed')
  const denied = eligible.filter((row) => row.readiness_state === 'denied')

  let currentDevices = 0
  let outdatedDevices = 0
  let confirmedDevices = 0
  let multiCurrent = 0
  for (const row of eligible) {
    currentDevices += row.current_device_count
    outdatedDevices += row.outdated_device_count
    confirmedDevices += row.confirmed_device_count
    if (row.current_device_count > 1) multiCurrent += 1
  }

  const lastAccepted =
    deliveryResult.error || !deliveryResult.data?.created_at
      ? null
      : String(deliveryResult.data.created_at)

  const autoNotificationsLast24h = autoNotificationsResult.count ?? 0
  const acceptedDeliveriesLast24h = accepted24hResult.count ?? 0

  const warnings = buildReadinessWarnings({
    eligible,
    lastSchedulerAcceptedWithin24h: acceptedDeliveriesLast24h > 0,
    autoNotificationsLast24h,
    acceptedDeliveriesLast24h,
    frontendFingerprint: currentFingerprint,
    backendFingerprint: currentFingerprint,
  })

  const needingSetup = eligible
    .filter((row) => row.readiness_state !== 'confirmed')
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'))

  return {
    summary: {
      active_employees: activeEmployees.length,
      eligible_employees: eligible.length,
      confirmed: confirmed.length,
      connected_unconfirmed: connectedUnconfirmed.length,
      missing: missing.length,
      outdated_only: outdatedOnly.length,
      delivery_failed: deliveryFailed.length,
      denied: denied.length,
      current_devices: currentDevices,
      confirmed_devices: confirmedDevices,
      outdated_devices: outdatedDevices,
      employees_with_multiple_current: multiCurrent,
      last_accepted_delivery_at: lastAccepted,
      employees_with_current: confirmed.length + connectedUnconfirmed.length + deliveryFailed.length,
      employees_without_subscriptions: missing.length,
      employees_only_outdated: outdatedOnly.length,
      employees_with_denied: denied.length,
      devices_with_last_success: confirmedDevices,
    },
    employees: eligible.sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru')),
    employees_needing_setup: needingSetup,
    warnings,
    canonical_fingerprint: currentFingerprint,
  }
}
