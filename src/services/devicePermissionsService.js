import { isCloudMode } from '../lib/dataMode'
import { isPwaStandalone } from '../utils/pwaStandalone'
import {
  isGeolocationSupported,
  queryGeolocationPermission,
  requestGeolocationPermissionProbe,
} from '../utils/geolocation'
import {
  computeVapidPublicFingerprint,
  connectDeviceNotifications,
  getDevicePushDiagnostics,
  getExistingBrowserSubscription,
  getNotificationPermission,
  getOrCreateDeviceId,
  isWebPushSupported,
  WebPushError,
} from './webPushSubscriptionService'
import {
  evaluateDevicePermissionState,
  isDeviceFullyReady,
  shouldShowDeviceSetupOnboarding,
  UI_CONNECTION_LABELS,
  UI_CONNECTION_STATE,
} from './devicePermissionsLogic'

export {
  evaluateDevicePermissionState,
  isDeviceFullyReady,
  shouldShowDeviceSetupOnboarding,
  UI_CONNECTION_LABELS,
  UI_CONNECTION_STATE,
  LAUNCH_MODE,
  SUBSCRIPTION_STATUS,
} from './devicePermissionsLogic'

const SESSION_DISMISS_KEY = 'shugyla.device_setup.session_dismissed'

function hasWindow() {
  return typeof window !== 'undefined'
}

function isIosLikeDevice() {
  if (!hasWindow() || typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function getVapidPublicKey() {
  const key = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY
  if (typeof key !== 'string') return null
  const normalized = key.trim().replace(/\s+/g, '')
  return normalized || null
}

export function readDeviceSetupSessionDismissed() {
  if (!hasWindow()) return false
  try {
    return window.sessionStorage.getItem(SESSION_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissDeviceSetupForSession() {
  if (!hasWindow()) return
  try {
    window.sessionStorage.setItem(SESSION_DISMISS_KEY, '1')
  } catch {
    // Ignore storage failures.
  }
}

export function clearDeviceSetupSessionDismissed() {
  if (!hasWindow()) return
  try {
    window.sessionStorage.removeItem(SESSION_DISMISS_KEY)
  } catch {
    // Ignore storage failures.
  }
}

/**
 * Device notification readiness for onboarding / profile UI.
 * Does not query or prompt for geolocation — Time Tracker requests location on action.
 */
export async function getDevicePermissionState() {
  const standalone = isPwaStandalone()
  const isIosLike = isIosLikeDevice()
  const serviceWorkerSupported =
    hasWindow() && typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  const pushSupported = hasWindow() && 'PushManager' in window
  const notificationSupported = hasWindow() && 'Notification' in window
  const webPushSupported = isWebPushSupported()
  const notificationPermission = getNotificationPermission()
  // Keep capability flag only; never query/prompt geolocation on app load.
  const geolocationSupported = isGeolocationSupported()
  const geolocationPermission = 'unknown'
  const vapidPublicKey = getVapidPublicKey()
  const frontendVapidFingerprint = vapidPublicKey
    ? await computeVapidPublicFingerprint(vapidPublicKey)
    : null

  let browserSubscriptionPresent = false
  let browserVapidMatches = false
  let serverVapidFingerprint = null
  let subscriptionVapidFingerprint = null
  let backendRegistered = false
  let backendActive = false
  let lastSuccessAt = null
  let diagnosticsError = false

  if (webPushSupported && notificationPermission === 'granted' && !(isIosLike && !standalone)) {
    try {
      const diagnostics = await getDevicePushDiagnostics()
      browserSubscriptionPresent = Boolean(diagnostics.pushSubscription)
      serverVapidFingerprint = diagnostics.serverVapidFingerprint ?? null
      subscriptionVapidFingerprint = diagnostics.subscriptionVapidFingerprint ?? null
      backendRegistered = Boolean(diagnostics.serverRegistration)
      lastSuccessAt = diagnostics.lastSuccessAt ?? null

      const looksCurrent =
        diagnostics.vapidKeyStatus === 'current' &&
        browserSubscriptionPresent &&
        backendRegistered &&
        !diagnostics.needsReconnect

      browserVapidMatches = looksCurrent || Boolean(
        browserSubscriptionPresent &&
          diagnostics.vapidKeyStatus === 'current' &&
          diagnostics.issue !== 'vapid_mismatch'
      )
      backendActive = looksCurrent || (backendRegistered && !diagnostics.needsReconnect)

      if (looksCurrent) {
        if (!serverVapidFingerprint && frontendVapidFingerprint) {
          serverVapidFingerprint = frontendVapidFingerprint
        }
        if (!subscriptionVapidFingerprint && frontendVapidFingerprint) {
          subscriptionVapidFingerprint = frontendVapidFingerprint
        }
      }
    } catch {
      diagnosticsError = true
    }
  } else if (webPushSupported && notificationPermission === 'granted') {
    try {
      const browserSub = await getExistingBrowserSubscription()
      browserSubscriptionPresent = Boolean(browserSub)
    } catch {
      diagnosticsError = true
    }
  }

  const state = evaluateDevicePermissionState({
    isIosLike,
    standalone,
    serviceWorkerSupported,
    pushSupported: pushSupported && webPushSupported,
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
    diagnosticsError,
  })

  return {
    ...state,
    deviceIdPresent: Boolean(getOrCreateDeviceId()),
    cloudMode: isCloudMode(),
  }
}

export function getOnboardingVisibility(state) {
  const sessionDismissed = readDeviceSetupSessionDismissed()
  return {
    sessionDismissed,
    showOnboarding: shouldShowDeviceSetupOnboarding(state, { sessionDismissed }),
    fullyReady: isDeviceFullyReady(state),
  }
}

/**
 * Explicit user gesture: request notification permission (if needed) and
 * create / reconnect a browser push subscription with the canonical VAPID key.
 */
export async function enableNotificationsFromUserGesture({ reconnect = false } = {}) {
  const state = await getDevicePermissionState()
  if (state.needsPwaInstall) {
    throw new WebPushError(
      'service_worker_unavailable',
      'Для уведомлений установите приложение на главный экран'
    )
  }
  if (state.notificationPermission === 'denied') {
    throw new WebPushError('permission_denied', 'Уведомления запрещены в настройках устройства')
  }

  const forceReconnect =
    reconnect || state.subscriptionStatus === 'outdated' || state.uiConnectionState === 'reconnection_required'

  await connectDeviceNotifications({ reconnect: forceReconnect })
  return getDevicePermissionState()
}

/** Explicit user gesture: one-shot geolocation probe (no background tracking). */
export async function enableGeolocationFromUserGesture() {
  if (!isGeolocationSupported()) {
    const error = new Error('Геолокация не поддерживается на этом устройстве')
    error.code = 'geolocation_unsupported'
    throw error
  }

  try {
    await requestGeolocationPermissionProbe()
  } catch (err) {
    const permission = await queryGeolocationPermission()
    if (permission === 'denied' || /настройках|permission/i.test(err?.message || '')) {
      const denied = new Error('Геолокация запрещена в настройках устройства')
      denied.code = 'geolocation_denied'
      throw denied
    }
    throw err
  }

  return getDevicePermissionState()
}

/** Re-check permission after the user changes OS settings (does not call requestPermission). */
export async function recheckNotificationPermissionState() {
  return getDevicePermissionState()
}
