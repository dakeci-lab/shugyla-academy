const SIGNATURE_PREFIX = 'v1='
const MAX_SKEW_SECONDS = 300

export type VerifySchedulerRequestParams = {
  request: Request
  rawBody: Uint8Array
  currentSecret: string | undefined
  previousSecret: string | undefined
  now?: Date
}

function decodeSchedulerSecret(value: string): Uint8Array | null {
  if (!value || typeof value !== 'string') return null

  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    if (bytes.length >= 32) return bytes
  } catch {
    // fall through to UTF-8 decode
  }

  const utf8 = new TextEncoder().encode(value)
  return utf8.length >= 32 ? utf8 : null
}

function parseTimestampHeader(value: string | null, now: Date): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null
  const seconds = Number(value.trim())
  if (!Number.isInteger(seconds) || seconds <= 0) return null
  const nowSeconds = Math.floor(now.getTime() / 1000)
  if (Math.abs(nowSeconds - seconds) > MAX_SKEW_SECONDS) return null
  return seconds
}

function parseSignatureHeader(value: string | null): Uint8Array | null {
  if (!value || !value.startsWith(SIGNATURE_PREFIX)) return null
  const hex = value.slice(SIGNATURE_PREFIX.length).trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(hex)) return null
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function importHmacKey(secret: string): Promise<CryptoKey | null> {
  const bytes = decodeSchedulerSecret(secret)
  if (!bytes) return null
  return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
}

async function verifyWithSecret(
  secret: string | undefined,
  canonical: string,
  signature: Uint8Array
): Promise<boolean> {
  if (!secret) return false
  const key = await importHmacKey(secret)
  if (!key) return false
  const message = new TextEncoder().encode(canonical)
  return crypto.subtle.verify('HMAC', key, signature, message)
}

export async function verifySchedulerRequest(params: VerifySchedulerRequestParams): Promise<boolean> {
  const now = params.now ?? new Date()
  const timestampHeader = params.request.headers.get('x-shugyla-scheduler-timestamp')
  const signatureHeader = params.request.headers.get('x-shugyla-scheduler-signature')

  if (!timestampHeader || !signatureHeader) return false

  const timestamp = parseTimestampHeader(timestampHeader, now)
  if (timestamp === null) return false

  const signature = parseSignatureHeader(signatureHeader)
  if (!signature) return false

  const method = params.request.method.toUpperCase()
  const bodyHash = await sha256Hex(params.rawBody)
  const canonical = `${timestamp}\n${method}\n${bodyHash}`

  if (await verifyWithSecret(params.currentSecret, canonical, signature)) {
    return true
  }

  if (await verifyWithSecret(params.previousSecret, canonical, signature)) {
    return true
  }

  return false
}

export function isSchedulerSecretConfigured(secret: string | undefined): boolean {
  if (!secret) return false
  return decodeSchedulerSecret(secret) !== null
}
