import { supabase } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'

const DEVICE_ID_STORAGE_KEY = 'shugyla.web_push.device_id'
const LOGOUT_CLEANUP_MS = 3000

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

async function ensureAuthSession() {
  if (!isCloudMode() || !supabase) {
    throw new Error('Web Push доступен только в облачном режиме')
  }
  const { data, error } = await supabase.auth.getSession()
  if (error || !data?.session?.access_token) {
    throw new Error('Сессия истекла. Войдите в аккаунт заново.')
  }
}

function mapFunctionError(data, fallback) {
  const code = data?.code
  if (code === 'unauthorized') return 'Сессия истекла. Войдите в аккаунт заново.'
  if (code === 'inactive_caller' || code === 'forbidden') {
    return 'Нет доступа для управления уведомлениями на этом устройстве.'
  }
  if (code === 'validation_error' || code === 'invalid_subscription' || code === 'forbidden_field') {
    return 'Не удалось подключить уведомления. Проверьте настройки браузера.'
  }
  return fallback
}

async function invokeManageSubscription(body) {
  await ensureAuthSession()
  const { data, error } = await supabase.functions.invoke('manage-push-subscription', { body })
  if (error) {
    const contextBody = error.context?.json ?? error.context?.body
    if (contextBody && typeof contextBody === 'object') {
      throw new Error(mapFunctionError(contextBody, 'Не удалось обновить регистрацию уведомлений'))
    }
    throw new Error('Не удалось обновить регистрацию уведомлений')
  }
  if (!data?.ok) {
    throw new Error(mapFunctionError(data, 'Не удалось обновить регистрацию уведомлений'))
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

export async function requestAndRegisterPushSubscription() {
  if (!isWebPushSupported()) {
    throw new Error('Этот браузер не поддерживает системные уведомления')
  }

  const vapidPublicKey = getVapidPublicKey()
  if (!vapidPublicKey) {
    throw new Error('Локальный VAPID public key не настроен')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Разрешение на уведомления не получено')
  }

  const registration = await getServiceWorkerRegistration()
  if (!registration) {
    throw new Error('Service worker недоступен')
  }

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
  }

  const deviceId = getOrCreateDeviceId()
  if (!deviceId) {
    throw new Error('Не удалось определить устройство')
  }

  const data = await invokeManageSubscription({
    action: 'register',
    device_id: deviceId,
    subscription: serializeSubscription(subscription),
  })

  return data.subscription
}

export async function disablePushNotifications() {
  const deviceId = getOrCreateDeviceId()
  if (!deviceId) return null

  await invokeManageSubscription({ action: 'disable', device_id: deviceId })

  const browserSub = await getExistingBrowserSubscription()
  if (browserSub) {
    await browserSub.unsubscribe()
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
  } catch (err) {
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
    return 'Сессия истекла. Войдите в аккаунт заново.'
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
