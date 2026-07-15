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
    return 'Устройство не зарегистрировано. Включите уведомления снова.'
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
  if (code === 'unauthorized') {
    return WEB_PUSH_ERROR_MESSAGES.session_expired
  }
  return fallback
}

export async function sendServerTestWebPush() {
  if (!import.meta.env.DEV) {
    throw new Error('Server test push is only available in development mode')
  }

  if (!isWebPushSupported()) {
    throw new Error('Этот браузер не поддерживает системные уведомления')
  }

  if (getNotificationPermission() !== 'granted') {
    throw new Error('Разрешение на уведомления не получено')
  }

  const browserSub = await getExistingBrowserSubscription()
  if (!browserSub) {
    throw new Error('Устройство не зарегистрировано. Включите уведомления снова.')
  }

  const deviceId = getOrCreateDeviceId()
  if (!deviceId) {
    throw new Error('Не удалось определить устройство')
  }

  await ensureAuthSession()

  const requestId = crypto.randomUUID()
  const { data, error } = await supabase.functions.invoke('send-test-web-push', {
    body: {
      device_id: deviceId,
      request_id: requestId,
    },
  })

  if (error) {
    const contextBody = error.context?.json ?? error.context?.body
    if (contextBody && typeof contextBody === 'object') {
      throw new Error(mapSendTestError(contextBody, 'Не удалось отправить push-уведомление'))
    }
    throw new Error('Не удалось отправить push-уведомление')
  }

  if (!data?.ok) {
    throw new Error(mapSendTestError(data, 'Не удалось отправить push-уведомление'))
  }

  return {
    notificationId: data.notification_id,
    deliveryStatus: data.delivery?.status ?? 'accepted',
  }
}
