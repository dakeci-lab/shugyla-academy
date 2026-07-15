import { supabase } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'

const DEVICE_ID_STORAGE_KEY = 'shugyla.web_push.device_id'
const LOGOUT_CLEANUP_MS = 3000

export const WEB_PUSH_ERROR_MESSAGES = {
  permission_denied: 'Уведомления запрещены в настройках браузера',
  service_worker_unavailable: 'Не удалось подготовить уведомления на этом устройстве',
  browser_subscribe_failed: 'Браузер не смог создать подписку на уведомления',
  backend_registration_failed: 'Не удалось сохранить регистрацию устройства',
  session_expired: 'Сессия истекла. Войдите снова',
  network: 'Нет соединения. Повторите попытку',
}

export class WebPushError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'WebPushError'
    this.code = code
  }
}

function hasWindow() {
  return typeof window !== 'undefined'
}

export function isWebPushSupported() {
  if (!hasWindow()) return false
  return Boolean(
    'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
  )
}

export function getNotificationPermission() {
  if (!hasWindow() || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export function getOrCreateDeviceId() {
  if (!hasWindow()) return null
  const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing
  const next = crypto.randomUUID()
  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, next)
  return next
}

function getVapidPublicKey() {
  const key = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY
  return typeof key === 'string' && key.trim() ? key.trim() : null
}

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function subscriptionApplicationServerKey(subscription) {
  const key = subscription.options?.applicationServerKey
  if (!key) return null
  if (key instanceof ArrayBuffer) return new Uint8Array(key)
  if (ArrayBuffer.isView(key)) return new Uint8Array(key.buffer, key.byteOffset, key.byteLength)
  return null
}

function subscriptionMatchesVapid(subscription, vapidPublicKey) {
  const subKey = subscriptionApplicationServerKey(subscription)
  if (!subKey) return true
  const expected = urlBase64ToUint8Array(vapidPublicKey)
  if (subKey.length !== expected.length) return false
  return subKey.every((byte, index) => byte === expected[index])
}

function isNetworkError(error) {
  const message = error?.message ?? ''
  return /failed to fetch|networkerror|load failed|network request failed/i.test(message)
}

async function ensureAuthSession() {
  if (!isCloudMode() || !supabase) {
    throw new WebPushError(
      'service_worker_unavailable',
      'Web Push доступен только в облачном режиме'
    )
  }
  const { data, error } = await supabase.auth.getSession()
  if (error || !data?.session?.access_token) {
    throw new WebPushError('session_expired', WEB_PUSH_ERROR_MESSAGES.session_expired)
  }
}

function mapFunctionError(data, fallback) {
  const code = data?.code
  if (code === 'unauthorized') return WEB_PUSH_ERROR_MESSAGES.session_expired
  if (code === 'inactive_caller' || code === 'forbidden') {
    return 'Нет доступа для управления уведомлениями на этом устройстве.'
  }
  if (code === 'validation_error' || code === 'invalid_subscription' || code === 'forbidden_field') {
    return 'Не удалось подключить уведомления. Проверьте настройки браузера.'
  }
  return fallback
}

function classifyInvokeFailure(error, data) {
  const status = error?.context?.status
  if (status === 401) {
    return new WebPushError('session_expired', WEB_PUSH_ERROR_MESSAGES.session_expired)
  }
  if (isNetworkError(error)) {
    return new WebPushError('network', WEB_PUSH_ERROR_MESSAGES.network)
  }
  const contextBody = error?.context?.json ?? error?.context?.body
  if (contextBody && typeof contextBody === 'object') {
    return new WebPushError(
      'backend_registration_failed',
      mapFunctionError(contextBody, WEB_PUSH_ERROR_MESSAGES.backend_registration_failed)
    )
  }
  if (data && !data.ok) {
    return new WebPushError(
      'backend_registration_failed',
      mapFunctionError(data, WEB_PUSH_ERROR_MESSAGES.backend_registration_failed)
    )
  }
  return new WebPushError(
    'backend_registration_failed',
    WEB_PUSH_ERROR_MESSAGES.backend_registration_failed
  )
}

async function invokeManageSubscription(body) {
  await ensureAuthSession()
  const { data, error } = await supabase.functions.invoke('manage-push-subscription', { body })
  if (error) {
    throw classifyInvokeFailure(error, data)
  }
  if (!data?.ok) {
    throw classifyInvokeFailure(null, data)
  }
  return data
}

function serializeSubscription(subscription) {
  const json = subscription.toJSON()
  return {
    endpoint: json.endpoint,
    expiration_time: json.expirationTime ?? null,
    keys: {
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    },
  }
}

async function createBrowserSubscription(registration, vapidPublicKey) {
  try {
    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
  } catch {
    throw new WebPushError('browser_subscribe_failed', WEB_PUSH_ERROR_MESSAGES.browser_subscribe_failed)
  }
}

async function registerBrowserSubscriptionWithBackend(deviceId, subscription) {
  await invokeManageSubscription({
    action: 'register',
    device_id: deviceId,
    subscription: serializeSubscription(subscription),
  })
}

async function resolveBrowserSubscription(registration, vapidPublicKey) {
  let subscription = await registration.pushManager.getSubscription()

  if (subscription && !subscriptionMatchesVapid(subscription, vapidPublicKey)) {
    await subscription.unsubscribe().catch(() => {})
    subscription = null
  }

  if (!subscription) {
    subscription = await createBrowserSubscription(registration, vapidPublicKey)
  }

  return subscription
}

export async function getServiceWorkerRegistration() {
  if (!isWebPushSupported()) return null
  await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
    scope: import.meta.env.BASE_URL,
  })
  return navigator.serviceWorker.ready
}

export async function getExistingBrowserSubscription() {
  const registration = await getServiceWorkerRegistration()
  if (!registration) return null
  return registration.pushManager.getSubscription()
}

export async function getPushRegistrationStatus() {
  if (!isWebPushSupported()) {
    return { supported: false, permission: 'unsupported', registered: false, active: false }
  }

  const permission = getNotificationPermission()
  const deviceId = getOrCreateDeviceId()
  if (!deviceId || permission !== 'granted') {
    return {
      supported: true,
      permission,
      registered: false,
      active: false,
    }
  }

  try {
    const data = await invokeManageSubscription({ action: 'status', device_id: deviceId })
    return {
      supported: true,
      permission,
      registered: Boolean(data.subscription?.registered),
      active: Boolean(data.subscription?.active),
      serverPermission: data.subscription?.permission ?? 'default',
    }
  } catch {
    const browserSub = await getExistingBrowserSubscription()
    return {
      supported: true,
      permission,
      registered: Boolean(browserSub),
      active: Boolean(browserSub),
      syncPending: true,
    }
  }
}

export async function syncExistingPushSubscription() {
  if (!isWebPushSupported()) return null
  if (getNotificationPermission() !== 'granted') return null

  const deviceId = getOrCreateDeviceId()
  if (!deviceId) return null

  const browserSub = await getExistingBrowserSubscription()
  if (!browserSub) return null

  const data = await invokeManageSubscription({
    action: 'register',
    device_id: deviceId,
    subscription: serializeSubscription(browserSub),
  })

  return data.subscription
}

export async function enablePushNotifications() {
  if (!isWebPushSupported()) {
    throw new WebPushError(
      'service_worker_unavailable',
      WEB_PUSH_ERROR_MESSAGES.service_worker_unavailable
    )
  }

  const vapidPublicKey = getVapidPublicKey()
  if (!vapidPublicKey) {
    throw new WebPushError(
      'backend_registration_failed',
      WEB_PUSH_ERROR_MESSAGES.backend_registration_failed
    )
  }

  let permission = getNotificationPermission()
  if (permission === 'denied') {
    throw new WebPushError('permission_denied', WEB_PUSH_ERROR_MESSAGES.permission_denied)
  }
  if (permission === 'default') {
    permission = await Notification.requestPermission()
  }
  if (permission !== 'granted') {
    throw new WebPushError('permission_denied', WEB_PUSH_ERROR_MESSAGES.permission_denied)
  }

  const registration = await getServiceWorkerRegistration()
  if (!registration) {
    throw new WebPushError(
      'service_worker_unavailable',
      WEB_PUSH_ERROR_MESSAGES.service_worker_unavailable
    )
  }

  const deviceId = getOrCreateDeviceId()
  if (!deviceId) {
    throw new WebPushError(
      'backend_registration_failed',
      WEB_PUSH_ERROR_MESSAGES.backend_registration_failed
    )
  }

  let subscription = await resolveBrowserSubscription(registration, vapidPublicKey)

  try {
    await registerBrowserSubscriptionWithBackend(deviceId, subscription)
  } catch (err) {
    if (!(err instanceof WebPushError) || err.code !== 'backend_registration_failed') {
      throw err
    }

    await subscription.unsubscribe().catch(() => {})
    subscription = await createBrowserSubscription(registration, vapidPublicKey)
    await registerBrowserSubscriptionWithBackend(deviceId, subscription)
  }

  const verified = await registration.pushManager.getSubscription()
  if (!verified) {
    throw new WebPushError(
      'browser_subscribe_failed',
      WEB_PUSH_ERROR_MESSAGES.browser_subscribe_failed
    )
  }

  return verified
}

export async function requestAndRegisterPushSubscription() {
  const subscription = await enablePushNotifications()
  return { registered: true, active: true, permission: 'granted', subscription }
}

export async function disablePushNotifications() {
  const deviceId = getOrCreateDeviceId()
  if (!deviceId) return null

  try {
    await invokeManageSubscription({ action: 'disable', device_id: deviceId })
  } catch (err) {
    if (err instanceof WebPushError && err.code === 'network') {
      throw err
    }
    if (err instanceof WebPushError && err.code === 'session_expired') {
      throw err
    }
    throw new WebPushError(
      'backend_registration_failed',
      WEB_PUSH_ERROR_MESSAGES.backend_registration_failed
    )
  }

  const browserSub = await getExistingBrowserSubscription()
  if (browserSub) {
    try {
      await browserSub.unsubscribe()
    } catch {
      // Browser unsubscribe is best-effort after backend deactivation.
    }
  }

  return { disabled: true }
}

export async function removePushSubscriptionForLogout() {
  if (!isWebPushSupported() || !isCloudMode() || !supabase) return null

  const deviceId = getOrCreateDeviceId()
  if (!deviceId) return null

  try {
    await Promise.race([
      invokeManageSubscription({ action: 'remove', device_id: deviceId }),
      new Promise((resolve) => window.setTimeout(resolve, LOGOUT_CLEANUP_MS)),
    ])
  } catch {
    console.warn('Push subscription cleanup failed during logout')
    return null
  }

  return { removed: true }
}

export async function showDevelopmentTestNotification() {
  if (!import.meta.env.DEV) {
    throw new Error('Dev test notification is only available in development mode')
  }

  const registration = await getServiceWorkerRegistration()
  if (!registration) {
    throw new Error('Service worker недоступен')
  }

  const base = import.meta.env.BASE_URL
  await registration.showNotification('Shugyla Platform', {
    body: 'Тестовое локальное уведомление',
    icon: `${base}icons/icon-192.png`,
    badge: `${base}icons/icon-192.png`,
    tag: 'shugyla-dev-test',
    data: {
      url: `${base}platform/profile`,
      type: 'dev_test',
    },
  })
}

function mapSendTestError(data, fallback) {
  const code = data?.code
  if (code === 'active_subscription_not_found') {
    return SEND_TEST_ERROR_MESSAGES.device_not_registered
  }
  if (code === 'subscription_expired') {
    return 'Подписка устарела. Включите уведомления снова.'
  }
  if (code === 'rate_limited') {
    return 'Подождите несколько секунд перед повторной отправкой.'
  }
  if (code === 'push_temporarily_unavailable') {
    return 'Сервис уведомлений временно недоступен.'
  }
  if (code === 'web_push_not_configured') {
    return 'Серверная отправка уведомлений не настроена.'
  }
  if (code === 'test_sender_disabled') {
    return SEND_TEST_ERROR_MESSAGES.test_disabled
  }
  if (code === 'unauthorized') {
    return SEND_TEST_ERROR_MESSAGES.session_expired
  }
  if (code === 'inactive_caller' || code === 'forbidden') {
    return SEND_TEST_ERROR_MESSAGES.server_rejected
  }
  if (code === 'validation_error' || code === 'forbidden_field' || code === 'malformed_json') {
    return SEND_TEST_ERROR_MESSAGES.validation
  }
  return fallback
}

export const SEND_TEST_ERROR_MESSAGES = {
  session_expired: 'Сессия истекла',
  device_not_registered: 'Устройство не зарегистрировано',
  test_disabled: 'Тестовая отправка временно отключена',
  network: 'Не удалось связаться с сервером',
  server_rejected: 'Сервер отклонил запрос',
  validation: 'Сервер отклонил запрос',
  generic: 'Не удалось отправить push-уведомление',
}

const SEND_TEST_DIAGNOSTIC_STORAGE_KEY = 'shugyla.web_push.last_test_send_diagnostic'
const SEND_TEST_REQUEST_STORAGE_KEY = 'shugyla.web_push.test_send_request_id'
const PREFLIGHT_DIAGNOSTIC_STORAGE_KEY = 'shugyla.web_push.last_preflight_diagnostic'
const DEVICE_ID_UUID_RE = /^[0-9a-f-]{36}$/i

export const PREPARE_TEST_SUCCESS_MESSAGE = 'Устройство готово к тестовому уведомлению'
export const PREFLIGHT_SUCCESS_MESSAGE = 'Сервер и устройство готовы. Тестовая отправка выключена'

export const PREFLIGHT_ERROR_MESSAGES = {
  session_expired: 'Сессия истекла',
  inactive_caller: 'Сотрудник неактивен',
  forbidden: 'Нет доступа',
  active_subscription_not_found: 'Активная подписка устройства не найдена',
  matching_subscription_conflict: 'Найден конфликт подписок',
  web_push_not_configured: 'Web Push не настроен на сервере',
  internal_error: 'Ошибка сервера',
  network: 'Не удалось связаться с сервером',
  generic: 'Не удалось проверить готовность сервера',
}

export const PREPARE_TEST_ERROR_MESSAGES = {
  permission_denied: 'Уведомления не разрешены в настройках браузера',
  no_browser_subscription: 'Не удалось получить подписку браузера',
  backend_not_active: 'Устройство не зарегистрировано на сервере',
  matching_not_one: 'Не удалось подтвердить единственную активную подписку для этого устройства',
  vapid_mismatch: 'Подписка браузера не соответствует production VAPID key',
}

export async function parseFunctionInvokeContext(error) {
  if (!error?.context) return null
  const context = error.context
  if (context && typeof context === 'object' && typeof context.json !== 'function') {
    if (context.json && typeof context.json === 'object') return context.json
    if (context.body && typeof context.body === 'object') return context.body
  }
  if (context && typeof context.json === 'function') {
    try {
      const response = typeof context.clone === 'function' ? context.clone() : context
      return await response.json()
    } catch {
      return null
    }
  }
  return null
}

export function classifySendTestFailure({
  stage,
  httpStatus = 0,
  errorCode = '',
  attempted = false,
}) {
  return {
    stage,
    httpStatus,
    errorCode: errorCode || 'unknown',
    attempted,
    message: resolveSendTestMessage(stage, httpStatus, errorCode),
  }
}

function resolveSendTestMessage(stage, httpStatus, errorCode) {
  if (stage === 'session') return SEND_TEST_ERROR_MESSAGES.session_expired
  if (stage === 'device') return SEND_TEST_ERROR_MESSAGES.device_not_registered
  if (stage === 'subscription') return SEND_TEST_ERROR_MESSAGES.device_not_registered
  if (stage === 'flag') return SEND_TEST_ERROR_MESSAGES.test_disabled
  if (stage === 'network') return SEND_TEST_ERROR_MESSAGES.network
  if (errorCode === 'test_sender_disabled') return SEND_TEST_ERROR_MESSAGES.test_disabled
  if (errorCode === 'active_subscription_not_found' || errorCode === 'subscription_expired') {
    return SEND_TEST_ERROR_MESSAGES.device_not_registered
  }
  if (errorCode === 'unauthorized') return SEND_TEST_ERROR_MESSAGES.session_expired
  if (httpStatus === 401) return SEND_TEST_ERROR_MESSAGES.session_expired
  if (httpStatus === 403) return SEND_TEST_ERROR_MESSAGES.server_rejected
  if (httpStatus === 409) return SEND_TEST_ERROR_MESSAGES.device_not_registered
  if (httpStatus === 422) return SEND_TEST_ERROR_MESSAGES.validation
  if (httpStatus >= 500) return SEND_TEST_ERROR_MESSAGES.server_rejected
  if (stage === 'invoke') return SEND_TEST_ERROR_MESSAGES.server_rejected
  return SEND_TEST_ERROR_MESSAGES.generic
}

export function logSendTestDiagnostic(diagnostic) {
  if (!import.meta.env.DEV && !isProductionE2eTestSendEnabled()) return
  console.info('web_push_test_send_diagnostic', {
    stage: diagnostic.stage,
    httpStatus: diagnostic.httpStatus ?? 0,
    errorCode: diagnostic.errorCode ?? 'unknown',
    attempted: Boolean(diagnostic.attempted),
    at: diagnostic.at ?? new Date().toISOString(),
  })
}

export function persistSendTestDiagnostic(diagnostic) {
  if (!hasWindow()) return
  try {
    window.sessionStorage.setItem(
      SEND_TEST_DIAGNOSTIC_STORAGE_KEY,
      JSON.stringify({
        stage: diagnostic.stage,
        httpStatus: diagnostic.httpStatus ?? 0,
        errorCode: diagnostic.errorCode ?? 'unknown',
        message: diagnostic.message,
        at: diagnostic.at ?? new Date().toISOString(),
      })
    )
  } catch {
    // Ignore storage failures.
  }
}

export function readPersistedSendTestDiagnostic() {
  if (!hasWindow()) return null
  try {
    const raw = window.sessionStorage.getItem(SEND_TEST_DIAGNOSTIC_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function clearPersistedSendTestDiagnostic() {
  if (!hasWindow()) return
  try {
    window.sessionStorage.removeItem(SEND_TEST_DIAGNOSTIC_STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function readPersistedSendTestRequest() {
  if (!hasWindow()) return null
  try {
    const raw = window.sessionStorage.getItem(SEND_TEST_REQUEST_STORAGE_KEY)
    return raw && DEVICE_ID_UUID_RE.test(raw) ? raw : null
  } catch {
    return null
  }
}

export function persistSendTestRequest(requestId) {
  if (!hasWindow()) return
  try {
    window.sessionStorage.setItem(SEND_TEST_REQUEST_STORAGE_KEY, requestId)
  } catch {
    // Ignore storage failures.
  }
}

export function hasAttemptedSendTestRequest() {
  return Boolean(readPersistedSendTestRequest())
}

function mapPreflightError(data, fallback) {
  const code = data?.code
  if (code === 'unauthorized') return PREFLIGHT_ERROR_MESSAGES.session_expired
  if (code === 'inactive_caller') return PREFLIGHT_ERROR_MESSAGES.inactive_caller
  if (code === 'forbidden' || code === 'forbidden_field') return PREFLIGHT_ERROR_MESSAGES.forbidden
  if (code === 'active_subscription_not_found') return PREFLIGHT_ERROR_MESSAGES.active_subscription_not_found
  if (code === 'matching_subscription_conflict') return PREFLIGHT_ERROR_MESSAGES.matching_subscription_conflict
  if (code === 'web_push_not_configured') return PREFLIGHT_ERROR_MESSAGES.web_push_not_configured
  if (code === 'validation_error' || code === 'malformed_json') return PREFLIGHT_ERROR_MESSAGES.forbidden
  return fallback
}

export function persistPreflightDiagnostic(diagnostic) {
  if (!hasWindow()) return
  try {
    window.sessionStorage.setItem(PREFLIGHT_DIAGNOSTIC_STORAGE_KEY, JSON.stringify(diagnostic))
  } catch {
    // Ignore storage failures.
  }
}

export function readPersistedPreflightDiagnostic() {
  if (!hasWindow()) return null
  try {
    const raw = window.sessionStorage.getItem(PREFLIGHT_DIAGNOSTIC_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function formatPreflightSuccessSummary(checks) {
  const lines = [
    'авторизация: готово',
    'устройство: готово',
    `active subscription: ${checks?.matching_active_subscriptions ?? 1}`,
    `сервер Web Push: ${checks?.web_push_configured ? 'готов' : 'не готов'}`,
    `test gates: ${checks?.test_sender_enabled && checks?.production_test_enabled ? 'включены' : 'выключены'}`,
    `отправка: ${checks?.ready_to_send ? 'разрешена' : 'заблокирована'}`,
  ]
  return lines.join('\n')
}

export async function preflightServerTestWebPush() {
  if (!isCloudMode() || !supabase) {
    throw new WebPushError(
      'service_worker_unavailable',
      'Web Push доступен только в облачном режиме'
    )
  }

  try {
    await ensureAuthSession()
  } catch (err) {
    if (err instanceof WebPushError && err.code === 'session_expired') {
      const diagnostic = {
        stage: 'preflight',
        httpStatus: 401,
        errorCode: 'session_expired',
        authenticated: false,
        at: new Date().toISOString(),
        message: PREFLIGHT_ERROR_MESSAGES.session_expired,
      }
      persistPreflightDiagnostic(diagnostic)
      throw new Error(diagnostic.message)
    }
    throw err
  }

  const deviceId = getOrCreateDeviceId()
  if (!deviceId) {
    throw new Error(PREFLIGHT_ERROR_MESSAGES.generic)
  }

  const { data, error } = await supabase.functions.invoke('send-test-web-push', {
    body: {
      action: 'preflight',
      device_id: deviceId,
    },
  })

  if (error) {
    const contextBody = await parseFunctionInvokeContext(error)
    const httpStatus = typeof error.context?.status === 'number' ? error.context.status : 0
    const errorCode = contextBody?.code ?? 'invoke_error'
    const message = contextBody
      ? mapPreflightError(contextBody, PREFLIGHT_ERROR_MESSAGES.generic)
      : isNetworkError(error)
        ? PREFLIGHT_ERROR_MESSAGES.network
        : PREFLIGHT_ERROR_MESSAGES.generic

    persistPreflightDiagnostic({
      stage: 'preflight',
      httpStatus,
      errorCode,
      authenticated: httpStatus !== 401,
      at: new Date().toISOString(),
      message,
    })
    throw new Error(message)
  }

  if (!data?.ok) {
    const errorCode = data?.code ?? 'preflight_failed'
    const message = mapPreflightError(data, PREFLIGHT_ERROR_MESSAGES.generic)
    persistPreflightDiagnostic({
      stage: 'preflight',
      httpStatus: 0,
      errorCode,
      authenticated: errorCode !== 'unauthorized',
      at: new Date().toISOString(),
      message,
    })
    throw new Error(message)
  }

  const checks = data.checks ?? {}
  const diagnostic = {
    stage: 'preflight',
    httpStatus: 200,
    errorCode: 'ok',
    authenticated: Boolean(checks.authenticated),
    matchingActiveSubscriptions: checks.matching_active_subscriptions ?? 0,
    webPushConfigured: Boolean(checks.web_push_configured),
    testSenderEnabled: Boolean(checks.test_sender_enabled),
    productionTestEnabled: Boolean(checks.production_test_enabled),
    readyExceptGates: Boolean(checks.ready_except_gates),
    readyToSend: Boolean(checks.ready_to_send),
    at: new Date().toISOString(),
    message: PREFLIGHT_SUCCESS_MESSAGE,
  }
  persistPreflightDiagnostic(diagnostic)

  return {
    checks,
    message: PREFLIGHT_SUCCESS_MESSAGE,
    summary: formatPreflightSuccessSummary(checks),
  }
}

export function evaluateTestSendReadiness({
  permission,
  browserSubscriptionPresent,
  registered,
  active,
  matchingSubscriptions,
}) {
  return {
    testReady:
      permission === 'granted' &&
      browserSubscriptionPresent &&
      registered &&
      active &&
      matchingSubscriptions === 1,
    matchingSubscriptions,
  }
}

export async function fingerprintDeviceId(deviceId) {
  if (!deviceId || !hasWindow() || !window.crypto?.subtle) return null
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(deviceId))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12)
}

export async function getDeviceTestSendStatus() {
  const permission = getNotificationPermission()
  const deviceId = getOrCreateDeviceId()
  if (!deviceId || permission !== 'granted') {
    return {
      ...evaluateTestSendReadiness({
        permission,
        browserSubscriptionPresent: false,
        registered: false,
        active: false,
        matchingSubscriptions: 0,
      }),
      testSenderEnabled: false,
    }
  }

  const browserSub = await getExistingBrowserSubscription()
  const data = await invokeManageSubscription({ action: 'status', device_id: deviceId })
  const readiness = evaluateTestSendReadiness({
    permission,
    browserSubscriptionPresent: Boolean(browserSub),
    registered: Boolean(data.subscription?.registered),
    active: Boolean(data.subscription?.active),
    matchingSubscriptions: Number(data.subscription?.matching_subscriptions ?? 0),
  })

  return {
    ...readiness,
    testSenderEnabled: Boolean(data.test_sender_enabled),
  }
}

export async function prepareDeviceForTestSend() {
  if (!isWebPushSupported()) {
    throw new WebPushError(
      'service_worker_unavailable',
      WEB_PUSH_ERROR_MESSAGES.service_worker_unavailable
    )
  }

  if (getNotificationPermission() !== 'granted') {
    throw new WebPushError('permission_denied', PREPARE_TEST_ERROR_MESSAGES.permission_denied)
  }

  const vapidPublicKey = getVapidPublicKey()
  if (!vapidPublicKey) {
    throw new WebPushError(
      'backend_registration_failed',
      WEB_PUSH_ERROR_MESSAGES.backend_registration_failed
    )
  }

  const registration = await getServiceWorkerRegistration()
  if (!registration) {
    throw new WebPushError(
      'service_worker_unavailable',
      WEB_PUSH_ERROR_MESSAGES.service_worker_unavailable
    )
  }

  const deviceId = getOrCreateDeviceId()
  if (!deviceId) {
    throw new WebPushError(
      'backend_registration_failed',
      WEB_PUSH_ERROR_MESSAGES.backend_registration_failed
    )
  }

  let subscription = await resolveBrowserSubscription(registration, vapidPublicKey)
  if (!subscription) {
    throw new WebPushError('browser_subscribe_failed', PREPARE_TEST_ERROR_MESSAGES.no_browser_subscription)
  }

  if (!subscriptionMatchesVapid(subscription, vapidPublicKey)) {
    throw new WebPushError('browser_subscribe_failed', PREPARE_TEST_ERROR_MESSAGES.vapid_mismatch)
  }

  try {
    await registerBrowserSubscriptionWithBackend(deviceId, subscription)
  } catch (err) {
    if (!(err instanceof WebPushError) || err.code !== 'backend_registration_failed') {
      throw err
    }

    await subscription.unsubscribe().catch(() => {})
    subscription = await createBrowserSubscription(registration, vapidPublicKey)
    await registerBrowserSubscriptionWithBackend(deviceId, subscription)
  }

  const status = await getDeviceTestSendStatus()
  if (!status.testReady) {
    if (status.matchingSubscriptions > 1) {
      throw new WebPushError('backend_registration_failed', PREPARE_TEST_ERROR_MESSAGES.matching_not_one)
    }
    throw new WebPushError('backend_registration_failed', PREPARE_TEST_ERROR_MESSAGES.backend_not_active)
  }

  return status
}

function throwSendTestFailure(diagnostic) {
  const payload = {
    ...diagnostic,
    at: diagnostic.at ?? new Date().toISOString(),
  }
  logSendTestDiagnostic(payload)
  persistSendTestDiagnostic(payload)
  const err = new Error(payload.message)
  err.sendTestDiagnostic = payload
  throw err
}

export function isProductionE2eTestSendEnabled() {
  return import.meta.env.VITE_WEB_PUSH_PRODUCTION_E2E_TEST === 'true'
}

export async function sendServerTestWebPush() {
  if (hasAttemptedSendTestRequest()) {
    throwSendTestFailure(
      classifySendTestFailure({ stage: 'flag', errorCode: 'request_already_attempted', attempted: true })
    )
  }

  if (!import.meta.env.DEV && !isProductionE2eTestSendEnabled()) {
    throwSendTestFailure(
      classifySendTestFailure({ stage: 'flag', errorCode: 'production_test_disabled', attempted: false })
    )
  }

  const readiness = await getDeviceTestSendStatus()
  if (!readiness.testReady) {
    throwSendTestFailure(
      classifySendTestFailure({
        stage: 'subscription',
        errorCode: readiness.matchingSubscriptions === 0 ? 'active_subscription_not_found' : 'matching_not_one',
        attempted: false,
      })
    )
  }

  if (!import.meta.env.DEV && !readiness.testSenderEnabled) {
    throwSendTestFailure(
      classifySendTestFailure({ stage: 'flag', errorCode: 'test_sender_disabled', attempted: false })
    )
  }

  if (!isWebPushSupported()) {
    throwSendTestFailure(
      classifySendTestFailure({ stage: 'subscription', errorCode: 'unsupported', attempted: false })
    )
  }

  if (getNotificationPermission() !== 'granted') {
    throwSendTestFailure(
      classifySendTestFailure({ stage: 'subscription', errorCode: 'permission_denied', attempted: false })
    )
  }

  const browserSub = await getExistingBrowserSubscription()
  if (!browserSub) {
    throwSendTestFailure(
      classifySendTestFailure({
        stage: 'subscription',
        errorCode: 'browser_subscription_missing',
        attempted: false,
      })
    )
  }

  const deviceId = getOrCreateDeviceId()
  if (!deviceId) {
    throwSendTestFailure(
      classifySendTestFailure({ stage: 'device', errorCode: 'missing_device_id', attempted: false })
    )
  }

  try {
    await ensureAuthSession()
  } catch (err) {
    if (err instanceof WebPushError && err.code === 'session_expired') {
      throwSendTestFailure(classifySendTestFailure({ stage: 'session', errorCode: 'session_expired', attempted: false }))
    }
    throw err
  }

  const requestId = crypto.randomUUID()
  persistSendTestRequest(requestId)
  logSendTestDiagnostic(
    classifySendTestFailure({ stage: 'invoke', errorCode: 'invoke_started', attempted: true })
  )

  const { data, error } = await supabase.functions.invoke('send-test-web-push', {
    body: {
      action: 'send',
      device_id: deviceId,
      request_id: requestId,
    },
  })

  if (error) {
    const contextBody = await parseFunctionInvokeContext(error)
    const httpStatus = typeof error.context?.status === 'number' ? error.context.status : 0
    const errorCode = contextBody?.code ?? error.name ?? 'invoke_error'
    const message = contextBody
      ? mapSendTestError(contextBody, resolveSendTestMessage('invoke', httpStatus, errorCode))
      : isNetworkError(error)
        ? SEND_TEST_ERROR_MESSAGES.network
        : resolveSendTestMessage('network', httpStatus, errorCode)

    throwSendTestFailure({
      stage: isNetworkError(error) ? 'network' : 'invoke',
      httpStatus,
      errorCode,
      attempted: true,
      message,
    })
  }

  if (!data?.ok) {
    const errorCode = data?.code ?? 'delivery_failed'
    throwSendTestFailure({
      stage: 'invoke',
      httpStatus: 0,
      errorCode,
      attempted: true,
      message: mapSendTestError(data, SEND_TEST_ERROR_MESSAGES.generic),
    })
  }

  clearPersistedSendTestDiagnostic()

  return {
    notificationId: data.notification_id,
    deliveryStatus: data.delivery?.status ?? 'accepted',
  }
}
