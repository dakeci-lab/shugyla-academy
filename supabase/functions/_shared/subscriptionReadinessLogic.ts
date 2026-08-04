/** Pure readiness state machine for employee Web Push rollout (no I/O). */

export type ReadinessState =
  | 'confirmed'
  | 'connected_unconfirmed'
  | 'outdated'
  | 'missing'
  | 'delivery_failed'
  | 'denied'
  | 'not_eligible'

export type SubscriptionInput = {
  id: string
  employee_id: number
  device_id: string | null
  is_active: boolean
  revoked_at?: string | null
  permission_status: string | null
  vapid_key_fingerprint: string | null
  created_at: string | null
  updated_at: string | null
  last_success_at: string | null
  failure_count?: number | null
}

export type AcceptedDeliveryInput = {
  subscription_id: string
  created_at: string
}

export type EmployeeInput = {
  id: number
  status: string | null
  auth_user_id: string | null
  full_name: string
  position_name: string | null
}

export type EmployeeReadinessRow = {
  employee_id: number
  full_name: string
  position_name: string | null
  account_active: boolean
  has_auth: boolean
  readiness_state: ReadinessState
  current_device_count: number
  outdated_device_count: number
  confirmed_device_count: number
  unconfirmed_current_device_count: number
  denied_device_count: number
  multiple_devices: boolean
  last_connected_at: string | null
  last_accepted_delivery_at: string | null
  time_tracker_ready: boolean
  primary_action:
    | 'send_instruction'
    | 'check_connection'
    | 'send_personal_test'
    | 'show_reason'
    | 'refresh_status'
  reason_code: string | null
}

function isActiveStatus(status: string | null | undefined): boolean {
  if (!status) return false
  const normalized =
    status === 'deactivated'
      ? 'inactive'
      : status === 'internship' || status === 'trainee'
        ? 'active'
        : status
  return normalized === 'active'
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return new Date(a) >= new Date(b) ? a : b
}

/** Subscription is confirmed when an accepted delivery exists at/after last material update. */
export function isSubscriptionConfirmed(
  sub: SubscriptionInput,
  acceptedBySubscription: Map<string, string>
): boolean {
  const acceptedAt = acceptedBySubscription.get(sub.id)
  if (!acceptedAt) return false
  const baseline = sub.updated_at || sub.created_at
  if (!baseline) return true
  return new Date(acceptedAt) >= new Date(baseline)
}

export function resolveEmployeeReadiness(params: {
  employee: EmployeeInput
  subscriptions: SubscriptionInput[]
  currentFingerprint: string | null
  acceptedBySubscription: Map<string, string>
}): EmployeeReadinessRow {
  const { employee, subscriptions, currentFingerprint, acceptedBySubscription } = params
  const accountActive = isActiveStatus(employee.status)
  const hasAuth = Boolean(employee.auth_user_id)

  if (!accountActive || !hasAuth) {
    return {
      employee_id: employee.id,
      full_name: employee.full_name,
      position_name: employee.position_name,
      account_active: accountActive,
      has_auth: hasAuth,
      readiness_state: 'not_eligible',
      current_device_count: 0,
      outdated_device_count: 0,
      confirmed_device_count: 0,
      unconfirmed_current_device_count: 0,
      denied_device_count: 0,
      multiple_devices: false,
      last_connected_at: null,
      last_accepted_delivery_at: null,
      time_tracker_ready: false,
      primary_action: 'show_reason',
      reason_code: !accountActive ? 'inactive_employee' : 'missing_auth_user',
    }
  }

  let currentDeviceCount = 0
  let outdatedDeviceCount = 0
  let confirmedDeviceCount = 0
  let deniedDeviceCount = 0
  let lastConnectedAt: string | null = null
  let lastAcceptedDeliveryAt: string | null = null
  let currentFailedWithoutAccept = false

  for (const sub of subscriptions) {
    if (sub.employee_id !== employee.id) continue
    if (sub.permission_status === 'denied') deniedDeviceCount += 1

    const active = sub.is_active && !sub.revoked_at && sub.permission_status === 'granted'
    if (!active) continue

    lastConnectedAt = maxIso(lastConnectedAt, sub.updated_at || sub.created_at)
    const isCurrent =
      Boolean(currentFingerprint) && sub.vapid_key_fingerprint === currentFingerprint

    if (isCurrent) {
      currentDeviceCount += 1
      const confirmed = isSubscriptionConfirmed(sub, acceptedBySubscription)
      if (confirmed) {
        confirmedDeviceCount += 1
        const acceptedAt = acceptedBySubscription.get(sub.id) ?? sub.last_success_at
        lastAcceptedDeliveryAt = maxIso(lastAcceptedDeliveryAt, acceptedAt)
      } else if ((sub.failure_count ?? 0) > 0) {
        currentFailedWithoutAccept = true
      }
    } else {
      outdatedDeviceCount += 1
    }
  }

  // Re-scan for accepted timestamps on confirmed currents (already done) and any accepted map hits
  for (const sub of subscriptions) {
    if (sub.employee_id !== employee.id) continue
    const acceptedAt = acceptedBySubscription.get(sub.id)
    if (acceptedAt) lastAcceptedDeliveryAt = maxIso(lastAcceptedDeliveryAt, acceptedAt)
  }

  const unconfirmedCurrent = Math.max(0, currentDeviceCount - confirmedDeviceCount)
  let readiness_state: ReadinessState = 'missing'
  let primary_action: EmployeeReadinessRow['primary_action'] = 'send_instruction'
  let reason_code: string | null = 'no_subscription'

  if (currentDeviceCount > 0) {
    if (confirmedDeviceCount > 0) {
      readiness_state = 'confirmed'
      primary_action = 'refresh_status'
      reason_code = null
    } else if (currentFailedWithoutAccept) {
      readiness_state = 'delivery_failed'
      primary_action = 'show_reason'
      reason_code = 'provider_rejected'
    } else {
      readiness_state = 'connected_unconfirmed'
      primary_action = 'send_personal_test'
      reason_code = 'awaiting_accepted_delivery'
    }
  } else if (outdatedDeviceCount > 0) {
    readiness_state = 'outdated'
    primary_action = 'send_instruction'
    reason_code = 'vapid_outdated'
  } else if (deniedDeviceCount > 0) {
    readiness_state = 'denied'
    primary_action = 'show_reason'
    reason_code = 'permission_denied'
  } else {
    readiness_state = 'missing'
    primary_action = 'send_instruction'
    reason_code = 'no_subscription'
  }

  return {
    employee_id: employee.id,
    full_name: employee.full_name,
    position_name: employee.position_name,
    account_active: true,
    has_auth: true,
    readiness_state,
    current_device_count: currentDeviceCount,
    outdated_device_count: outdatedDeviceCount,
    confirmed_device_count: confirmedDeviceCount,
    unconfirmed_current_device_count: unconfirmedCurrent,
    denied_device_count: deniedDeviceCount,
    multiple_devices: currentDeviceCount + outdatedDeviceCount > 1,
    last_connected_at: lastConnectedAt,
    last_accepted_delivery_at: lastAcceptedDeliveryAt,
    time_tracker_ready: readiness_state === 'confirmed',
    primary_action,
    reason_code,
  }
}

export function buildReadinessWarnings(params: {
  eligible: EmployeeReadinessRow[]
  lastSchedulerAcceptedWithin24h: boolean
  autoNotificationsLast24h: number
  acceptedDeliveriesLast24h: number
  frontendFingerprint: string | null
  backendFingerprint: string | null
  confirmedShareThreshold?: number
}): Array<{ code: string; severity: 'info' | 'warning'; message: string }> {
  const {
    eligible,
    lastSchedulerAcceptedWithin24h,
    autoNotificationsLast24h,
    acceptedDeliveriesLast24h,
    frontendFingerprint,
    backendFingerprint,
    confirmedShareThreshold = 0.5,
  } = params

  const warnings: Array<{ code: string; severity: 'info' | 'warning'; message: string }> = []
  const eligibleCount = eligible.length || 1
  const confirmed = eligible.filter((e) => e.readiness_state === 'confirmed').length
  const confirmedShare = confirmed / eligibleCount

  if (autoNotificationsLast24h > 0 && acceptedDeliveriesLast24h === 0) {
    warnings.push({
      code: 'no_accepted_deliveries_24h',
      severity: 'warning',
      message:
        'За последние 24 часа создавались автоматические уведомления, но accepted deliveries отсутствуют.',
    })
  }

  if (confirmedShare < confirmedShareThreshold) {
    warnings.push({
      code: 'low_confirmed_share',
      severity: 'info',
      message: `Подтверждённых сотрудников меньше ${Math.round(confirmedShareThreshold * 100)}% от eligible.`,
    })
  }

  const failed = eligible.filter((e) => e.readiness_state === 'delivery_failed').length
  if (failed > 0) {
    warnings.push({
      code: 'delivery_failed_employees',
      severity: 'warning',
      message: `У ${failed} сотрудников current subscription получает ошибки доставки.`,
    })
  }

  if (
    frontendFingerprint &&
    backendFingerprint &&
    frontendFingerprint !== backendFingerprint
  ) {
    warnings.push({
      code: 'vapid_fingerprint_mismatch',
      severity: 'warning',
      message: 'Frontend и backend VAPID fingerprint различаются.',
    })
  }

  if (!lastSchedulerAcceptedWithin24h && autoNotificationsLast24h === 0) {
    // informational silence — no extra noise
  }

  return warnings
}
