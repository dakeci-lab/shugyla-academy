import * as webpush from 'jsr:@negrel/webpush@0.5'
import {
  classifyPushError,
  classifyPushStatusCode,
  extractPushResponseStatus,
  type PushClassification,
} from './webPushClassification.ts'

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

function readVapidConfig(): VapidConfig | null {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')?.trim()
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')?.trim()
  const subject = Deno.env.get('VAPID_SUBJECT')?.trim()

  if (!publicKey || !privateKey || !subject) {
    return null
  }

  if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) {
    return null
  }

  return { publicKey, privateKey, subject }
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
  if (!appServerPromise) {
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

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)

    try {
      await subscriber.pushTextMessage(payload, {
        ttl: input.ttl ?? 180,
        urgency: mapUrgency(input.urgency),
        topic: input.topic,
      })
      return {
        ok: true,
        statusCode: 201,
        classification: 'accepted',
        provider,
      }
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
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
    }
  }
}

export function isWebPushConfigured(): boolean {
  return readVapidConfig() !== null
}
