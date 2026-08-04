import * as webpush from 'jsr:@negrel/webpush@0.5'
import {
  classifyPushError,
  classifyPushStatusCode,
  extractPushResponseStatus,
  type PushClassification,
} from './webPushClassification.ts'
import { normalizeVapidPrivateKey, normalizeVapidPublicKey } from './vapidFingerprint.ts'

const MAX_PAYLOAD_BYTES = 3800
const SEND_TIMEOUT_MS = 5_000

export type WebPushSendInput = {
  endpoint: string
  p256dh: string
  auth: string
  payload: Record<string, unknown>
  ttl?: number
  urgency?: 'very-low' | 'low' | 'normal' | 'high'
  topic?: string
}

export type WebPushSendResult = {
  ok: boolean
  statusCode: number | null
  classification: PushClassification
  provider?: string
  /** Safe provider reason (no secrets); truncated Apple/FCM body when available. */
  providerReason?: string | null
}

export function resolvePushProvider(endpoint: string): string {
  try {
    const host = new URL(endpoint).hostname
    if (host.includes('apple')) return 'apple'
    if (host.includes('mozilla')) return 'mozilla'
    if (host.includes('google') || host.includes('fcm')) return 'fcm'
    if (host.includes('windows')) return 'windows'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

type VapidConfig = {
  publicKey: string
  privateKey: string
  subject: string
}

let appServerPromise: Promise<webpush.ApplicationServer> | null = null
let appServerConfigKey: string | null = null

function readVapidConfig(): VapidConfig | null {
  const publicKey = normalizeVapidPublicKey(Deno.env.get('VAPID_PUBLIC_KEY'))
  const privateKey = normalizeVapidPrivateKey(Deno.env.get('VAPID_PRIVATE_KEY'))
  const subject = Deno.env.get('VAPID_SUBJECT')?.trim()

  if (!publicKey || !privateKey || !subject) {
    return null
  }

  if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) {
    return null
  }

  return { publicKey, privateKey, subject }
}

function vapidConfigCacheKey(config: VapidConfig): string {
  return `${config.publicKey.slice(0, 24)}:${config.privateKey.slice(0, 24)}:${config.subject}`
}

/** Apple Topic: ASCII printable, max 32 chars. Invalid topics → HTTP 400 BadTopic. */
function sanitizePushTopic(topic: string | undefined, provider: string): string | undefined {
  if (!topic) return undefined
  const trimmed = topic.trim()
  if (!trimmed) return undefined
  if (trimmed.length > 32) return undefined
  if (!/^[\x20-\x7E]+$/.test(trimmed)) return undefined
  // Prefer omitting topic on Apple unless it is a short stable coalescing key.
  if (provider === 'apple' && trimmed.length > 24) return undefined
  return trimmed
}

function extractProviderReason(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return typeof error === 'string' ? error.slice(0, 180) : null
  }
  const maybe = error as {
    message?: unknown
    name?: unknown
    response?: { statusText?: unknown; body?: unknown }
  }
  const parts: string[] = []
  if (typeof maybe.name === 'string' && maybe.name) parts.push(maybe.name)
  if (typeof maybe.message === 'string' && maybe.message) parts.push(maybe.message)
  if (typeof maybe.response?.statusText === 'string' && maybe.response.statusText) {
    parts.push(maybe.response.statusText)
  }
  if (typeof maybe.response?.body === 'string' && maybe.response.body) {
    parts.push(maybe.response.body.slice(0, 120))
  }
  const joined = parts.join(' | ').replace(/[\r\n]+/g, ' ').trim()
  if (!joined) return null
  // Never persist key material if a library ever echoes it.
  if (/p256dh|auth=|vapid|endpoint/i.test(joined)) return joined.slice(0, 40)
  return joined.slice(0, 180)
}

function decodeBase64Url(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function toExportedVapidKeys(publicKey: string, privateKey: string): webpush.ExportedVapidKeys {
  const pub = decodeBase64Url(publicKey)
  const priv = decodeBase64Url(privateKey)

  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('invalid_vapid_public_key')
  }
  if (priv.length !== 32) {
    throw new Error('invalid_vapid_private_key')
  }

  const x = pub.slice(1, 33)
  const y = pub.slice(33, 65)

  return {
    publicKey: {
      kty: 'EC',
      crv: 'P-256',
      x: encodeBase64Url(x),
      y: encodeBase64Url(y),
    },
    privateKey: {
      kty: 'EC',
      crv: 'P-256',
      x: encodeBase64Url(x),
      y: encodeBase64Url(y),
      d: encodeBase64Url(priv),
    },
  }
}

function boundedPayload(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(json)
  if (bytes.length > MAX_PAYLOAD_BYTES) {
    throw new Error('payload_too_large')
  }
  return json
}

function mapUrgency(value: WebPushSendInput['urgency']): webpush.Urgency {
  switch (value) {
    case 'very-low':
      return webpush.Urgency.VeryLow
    case 'low':
      return webpush.Urgency.Low
    case 'high':
      return webpush.Urgency.High
    default:
      return webpush.Urgency.Normal
  }
}

async function getApplicationServer(config: VapidConfig): Promise<webpush.ApplicationServer> {
  const cacheKey = vapidConfigCacheKey(config)
  if (!appServerPromise || appServerConfigKey !== cacheKey) {
    appServerConfigKey = cacheKey
    const exported = toExportedVapidKeys(config.publicKey, config.privateKey)
    const vapidKeys = await webpush.importVapidKeys(exported)
    appServerPromise = webpush.ApplicationServer.new({
      contactInformation: config.subject,
      vapidKeys,
    })
  }
  return appServerPromise
}

function classifyPushResponseStatus(
  statusCode: number,
  error?: { isGone?: () => boolean }
): PushClassification {
  if (error?.isGone?.() || statusCode === 404 || statusCode === 410) {
    return 'subscription_expired'
  }
  return classifyPushStatusCode(statusCode)
}

export async function sendWebPush(input: WebPushSendInput): Promise<WebPushSendResult> {
  const provider = resolvePushProvider(input.endpoint)
  const vapid = readVapidConfig()
  if (!vapid) {
    return {
      ok: false,
      statusCode: null,
      classification: 'configuration_error',
      provider,
    }
  }

  try {
    const app = await getApplicationServer(vapid)
    const payload = boundedPayload(input.payload)
    const subscriber = app.subscribe({
      endpoint: input.endpoint,
      keys: {
        p256dh: input.p256dh,
        auth: input.auth,
      },
    })

    const topic = sanitizePushTopic(input.topic, provider)
    const pushPromise = subscriber.pushTextMessage(payload, {
      ttl: input.ttl ?? 180,
      urgency: mapUrgency(input.urgency),
      ...(topic ? { topic } : {}),
    })
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('web_push_timeout')), SEND_TIMEOUT_MS)
    })
    await Promise.race([pushPromise, timeoutPromise])
    return {
      ok: true,
      statusCode: 201,
      classification: 'accepted',
      provider,
      providerReason: null,
    }
  } catch (error) {
    const providerReason = extractProviderReason(error)
    const responseStatus = extractPushResponseStatus(error)
    if (responseStatus != null) {
      const classification = classifyPushResponseStatus(
        responseStatus,
        error as { isGone?: () => boolean }
      )
      return {
        ok: false,
        statusCode: responseStatus,
        classification,
        provider,
        providerReason,
      }
    }

    const statusCode =
      typeof error === 'object' && error && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode)
        : null

    const classification = statusCode != null && Number.isFinite(statusCode)
      ? classifyPushStatusCode(statusCode)
      : classifyPushError(error)

    return {
      ok: false,
      statusCode: Number.isFinite(statusCode) ? statusCode : null,
      classification,
      provider,
      providerReason,
    }
  }
}

export function isWebPushConfigured(): boolean {
  return readVapidConfig() !== null
}
