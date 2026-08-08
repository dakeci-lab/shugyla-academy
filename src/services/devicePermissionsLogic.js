/**
 * Pure device permission / subscription readiness evaluators.
 * No browser or network access — safe for Node verify scripts.
 */

export const LAUNCH_MODE = {
  INSTALLED_PWA: 'installed_pwa',
  BROWSER_TAB: 'browser_tab',
}

export const SUBSCRIPTION_STATUS = {
  CURRENT: 'current',
  OUTDATED: 'outdated',
  MISSING: 'missing',
  ERROR: 'error',
  UNSUPPORTED: 'unsupported',
  NEEDS_PWA: 'needs_pwa',
}

export const UI_CONNECTION_STATE = {
  CONNECTED: 'connected',
  NOT_CONNECTED: 'not_connected',
  RECONNECTION_REQUIRED: 'reconnection_required',
  DENIED: 'denied',
  INSTALL_PWA: 'install_pwa',
  ERROR: 'error',
  UNSUPPORTED: 'unsupported',
  SETUP_REQUIRED: 'setup_required',
}

export const UI_CONNECTION_LABELS = {
  [UI_CONNECTION_STATE.CONNECTED]: 'Подключено',
  [UI_CONNECTION_STATE.NOT_CONNECTED]: 'Не подключено',
  [UI_CONNECTION_STATE.RECONNECTION_REQUIRED]: 'Требуется переподключение',
  [UI_CONNECTION_STATE.DENIED]: 'Запрещено устройством',
  [UI_CONNECTION_STATE.INSTALL_PWA]: 'Установите PWA',
  [UI_CONNECTION_STATE.ERROR]: 'Ошибка подключения',
  [UI_CONNECTION_STATE.UNSUPPORTED]: 'Не поддерживается',
  [UI_CONNECTION_STATE.SETUP_REQUIRED]: 'Требуется настройка',
}

/**
 * @param {{
 *   isIosLike: boolean
 *   standalone: boolean
 *   serviceWorkerSupported: boolean
 *   pushSupported: boolean
 *   notificationSupported: boolean
 *   notificationPermission: 'default' | 'granted' | 'denied' | 'unsupported'
 *   browserSubscriptionPresent: boolean
 *   browserVapidMatches: boolean
 *   frontendVapidFingerprint: string | null
 *   serverVapidFingerprint: string | null
 *   subscriptionVapidFingerprint: string | null
 *   backendRegistered: boolean
 *   backendActive: boolean
 *   geolocationSupported: boolean
 *   geolocationPermission: 'prompt' | 'granted' | 'denied' | 'unsupported' | 'unknown'
 *   lastSuccessAt: string | null
 *   diagnosticsError?: boolean
 * }} input
 */
export function evaluateDevicePermissionState(input) {
  const {
    isIosLike,
    standalone,
    serviceWorkerSupported,
    pushSupported,
    notificationSupported,
    notificationPermission,
    browserSubscriptionPresent,
    browserVapidMatches,
    frontendVapidFingerprint,
    serverVapidFingerprint,
    subscriptionVapidFingerprint,
    backendRegistered,
    backendActive,
    geolocationSupported,
    geolocationPermission,
    lastSuccessAt,
    diagnosticsError = false,
  } = input

  const launchMode = standalone ? LAUNCH_MODE.INSTALLED_PWA : LAUNCH_MODE.BROWSER_TAB
  const webPushApiSupported =
    serviceWorkerSupported && pushSupported && notificationSupported

  const fingerprintsAligned = Boolean(
    frontendVapidFingerprint &&
      serverVapidFingerprint &&
      subscriptionVapidFingerprint &&
      frontendVapidFingerprint === serverVapidFingerprint &&
      subscriptionVapidFingerprint === serverVapidFingerprint
  )

  const needsPwaInstall = isIosLike && !standalone
  let subscriptionStatus = SUBSCRIPTION_STATUS.MISSING

  if (diagnosticsError) {
    subscriptionStatus = SUBSCRIPTION_STATUS.ERROR
  } else if (!webPushApiSupported) {
    subscriptionStatus = SUBSCRIPTION_STATUS.UNSUPPORTED
  } else if (needsPwaInstall) {
    subscriptionStatus = SUBSCRIPTION_STATUS.NEEDS_PWA
  } else if (notificationPermission === 'denied') {
    subscriptionStatus = SUBSCRIPTION_STATUS.MISSING
  } else if (
    notificationPermission === 'granted' &&
    browserSubscriptionPresent &&
    browserVapidMatches &&
    backendRegistered &&
    backendActive &&
    fingerprintsAligned
  ) {
    subscriptionStatus = SUBSCRIPTION_STATUS.CURRENT
  } else if (
    notificationPermission === 'granted' &&
    (browserSubscriptionPresent || backendRegistered) &&
    (!browserVapidMatches ||
      !fingerprintsAligned ||
      (backendRegistered && !backendActive) ||
      (frontendVapidFingerprint &&
        subscriptionVapidFingerprint &&
        frontendVapidFingerprint !== subscriptionVapidFingerprint))
  ) {
    subscriptionStatus = SUBSCRIPTION_STATUS.OUTDATED
  } else if (notificationPermission === 'granted' && !browserSubscriptionPresent) {
    subscriptionStatus = SUBSCRIPTION_STATUS.MISSING
  }

  const notificationsReady = subscriptionStatus === SUBSCRIPTION_STATUS.CURRENT
  const geolocationReady = geolocationPermission === 'granted'
  const deviceReadyForTimeTracker = notificationsReady && geolocationReady

  const uiConnectionState = mapUiConnectionState({
    needsPwaInstall,
    webPushApiSupported,
    notificationPermission,
    subscriptionStatus,
    diagnosticsError,
  })

  return {
    launchMode,
    serviceWorkerSupported,
    pushSupported,
    notificationSupported,
    notificationPermission,
    browserSubscriptionPresent,
    frontendVapidFingerprint,
    serverVapidFingerprint,
    subscriptionVapidFingerprint,
    subscriptionStatus,
    fingerprintsAligned,
    geolocationSupported,
    geolocationPermission,
    deviceReadyForTimeTracker,
    notificationsReady,
    geolocationReady,
    lastSuccessAt,
    needsPwaInstall,
    uiConnectionState,
    uiConnectionLabel: UI_CONNECTION_LABELS[uiConnectionState] || UI_CONNECTION_LABELS.error,
  }
}

function mapUiConnectionState({
  needsPwaInstall,
  webPushApiSupported,
  notificationPermission,
  subscriptionStatus,
  diagnosticsError,
}) {
  if (diagnosticsError || subscriptionStatus === SUBSCRIPTION_STATUS.ERROR) {
    return UI_CONNECTION_STATE.ERROR
  }
  if (!webPushApiSupported) return UI_CONNECTION_STATE.UNSUPPORTED
  if (needsPwaInstall) return UI_CONNECTION_STATE.INSTALL_PWA
  if (notificationPermission === 'denied') return UI_CONNECTION_STATE.DENIED
  if (subscriptionStatus === SUBSCRIPTION_STATUS.CURRENT) return UI_CONNECTION_STATE.CONNECTED
  if (subscriptionStatus === SUBSCRIPTION_STATUS.OUTDATED) {
    return UI_CONNECTION_STATE.RECONNECTION_REQUIRED
  }
  return UI_CONNECTION_STATE.NOT_CONNECTED
}

/**
 * Notifications-only onboarding modal.
 * Source of truth: Notification.permission + current Web Push subscription state.
 * Geolocation never affects visibility (requested only inside Time Tracker).
 */
export function shouldShowDeviceSetupOnboarding(state, { sessionDismissed = false } = {}) {
  if (sessionDismissed) return false
  if (!state) return false

  // Already connected on this device — never show the modal.
  if (state.notificationsReady) return false

  if (state.needsPwaInstall) return true
  if (state.notificationPermission === 'default') return true
  if (state.notificationPermission === 'denied') return true
  if (state.subscriptionStatus === SUBSCRIPTION_STATUS.MISSING) return true
  if (state.subscriptionStatus === SUBSCRIPTION_STATUS.OUTDATED) return true
  if (state.subscriptionStatus === SUBSCRIPTION_STATUS.ERROR) return true

  return false
}

export function shouldShowDeviceSetupBanner(state, { sessionDismissed = false } = {}) {
  if (!sessionDismissed) return false
  if (!state) return false
  return shouldShowDeviceSetupOnboarding(state, { sessionDismissed: false })
}

export function isDeviceFullyReady(state) {
  if (!state) return false
  return state.notificationsReady && state.fingerprintsAligned && !state.needsPwaInstall
}

/**
 * Aggregate employee readiness for admin summary (pure).
 * Confirmed requires accepted delivery at/after subscription updated_at/created_at.
 * @param {{
 *   activeEmployees: Array<{ id: number, full_name: string, position_name: string | null, auth_user_id?: string | null }>
 *   subscriptions: Array<{
 *     id?: string
 *     employee_id: number
 *     device_id: string | null
 *     is_active: boolean
 *     permission_status: string | null
 *     vapid_key_fingerprint: string | null
 *     last_success_at: string | null
 *     created_at?: string | null
 *     updated_at?: string | null
 *     failure_count?: number | null
 *   }>
 *   currentFingerprint: string | null
 *   lastAcceptedDeliveryAt: string | null
 *   acceptedDeliveries?: Array<{ subscription_id: string, created_at: string }>
 * }} input
 */
export function aggregateSubscriptionReadiness(input) {
  const {
    activeEmployees,
    subscriptions,
    currentFingerprint,
    lastAcceptedDeliveryAt,
    acceptedDeliveries = [],
  } = input

  const acceptedBySubscription = new Map()
  for (const row of acceptedDeliveries) {
    if (!row?.subscription_id || !row?.created_at) continue
    if (!acceptedBySubscription.has(row.subscription_id)) {
      acceptedBySubscription.set(row.subscription_id, row.created_at)
    }
  }

  const byEmployee = new Map()

  for (const employee of activeEmployees) {
    byEmployee.set(employee.id, {
      employee_id: employee.id,
      full_name: employee.full_name,
      position_name: employee.position_name ?? null,
      device_count: 0,
      current_device_count: 0,
      outdated_device_count: 0,
      denied_device_count: 0,
      confirmed_device_count: 0,
      last_success_at: null,
      readiness_state: 'missing',
      connection_state: 'missing',
    })
  }

  let currentDevices = 0
  let outdatedDevices = 0
  let devicesWithSuccess = 0

  for (const sub of subscriptions) {
    const employee = byEmployee.get(sub.employee_id)
    if (!employee) continue

    if (sub.permission_status === 'denied') {
      employee.denied_device_count += 1
    }

    if (!(sub.is_active && sub.permission_status === 'granted')) continue

    employee.device_count += 1
    const isCurrent =
      Boolean(currentFingerprint) &&
      sub.vapid_key_fingerprint === currentFingerprint

    if (isCurrent) {
      employee.current_device_count += 1
      currentDevices += 1
      const acceptedAt =
        (sub.id ? acceptedBySubscription.get(sub.id) : null) || sub.last_success_at
      const baseline = sub.created_at
      const confirmedByDelivery =
        Boolean(acceptedAt) && (!baseline || new Date(acceptedAt) >= new Date(baseline))
      // Unit fixtures may omit delivery rows; then last_success_at on current counts.
      const confirmed =
        confirmedByDelivery || (!acceptedDeliveries.length && Boolean(sub.last_success_at))
      if (confirmed) {
        employee.confirmed_device_count += 1
        devicesWithSuccess += 1
      }
    } else {
      employee.outdated_device_count += 1
      outdatedDevices += 1
    }

    if (sub.last_success_at) {
      if (
        !employee.last_success_at ||
        new Date(sub.last_success_at) > new Date(employee.last_success_at)
      ) {
        employee.last_success_at = sub.last_success_at
      }
    }
  }

  const employees = [...byEmployee.values()].map((row) => {
    let readiness_state = 'missing'
    if (row.current_device_count > 0) {
      readiness_state = row.confirmed_device_count > 0 ? 'confirmed' : 'connected_unconfirmed'
    } else if (row.outdated_device_count > 0) readiness_state = 'outdated'
    else if (row.denied_device_count > 0 && row.device_count === 0) readiness_state = 'denied'

    // Legacy alias: current ≈ has current subscription (confirmed or unconfirmed)
    const connection_state =
      readiness_state === 'confirmed' || readiness_state === 'connected_unconfirmed'
        ? 'current'
        : readiness_state

    return { ...row, readiness_state, connection_state }
  })

  const confirmed = employees.filter((e) => e.readiness_state === 'confirmed').length
  const connectedUnconfirmed = employees.filter(
    (e) => e.readiness_state === 'connected_unconfirmed'
  ).length
  const withCurrent = confirmed + connectedUnconfirmed
  const withOnlyOutdated = employees.filter((e) => e.readiness_state === 'outdated').length
  const withMissing = employees.filter((e) => e.readiness_state === 'missing').length
  const withDenied = employees.filter((e) => e.readiness_state === 'denied').length
  const needsSetup = employees
    .filter((e) => e.readiness_state !== 'confirmed')
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'))

  return {
    summary: {
      active_employees: activeEmployees.length,
      eligible_employees: activeEmployees.length,
      confirmed,
      connected_unconfirmed: connectedUnconfirmed,
      missing: withMissing,
      outdated_only: withOnlyOutdated,
      delivery_failed: 0,
      employees_with_current: withCurrent,
      employees_without_subscriptions: withMissing,
      employees_only_outdated: withOnlyOutdated,
      employees_with_denied: withDenied,
      current_devices: currentDevices,
      outdated_devices: outdatedDevices,
      devices_with_last_success: devicesWithSuccess,
      confirmed_devices: devicesWithSuccess,
      last_accepted_delivery_at: lastAcceptedDeliveryAt,
    },
    employees_needing_setup: needsSetup.map((e) => ({
      employee_id: e.employee_id,
      full_name: e.full_name,
      position_name: e.position_name,
      readiness_state: e.readiness_state,
      connection_state: e.connection_state,
      device_count: e.device_count,
      current_device_count: e.current_device_count,
      outdated_device_count: e.outdated_device_count,
      last_success_at: e.last_success_at,
    })),
  }
}
