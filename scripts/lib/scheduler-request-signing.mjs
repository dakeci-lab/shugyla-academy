import crypto from 'crypto'

const SIGNATURE_PREFIX = 'v1='

export function decodeSchedulerSecret(value) {
  if (!value || typeof value !== 'string') return null

  try {
    const bytes = Buffer.from(value, 'base64url')
    if (bytes.length >= 32) return bytes
  } catch {
    // fall through
  }

  const utf8 = Buffer.from(value, 'utf8')
  return utf8.length >= 32 ? utf8 : null
}

export function generateSchedulerSecret() {
  return crypto.randomBytes(32).toString('base64url')
}

export function fingerprintSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex').slice(0, 16)
}

export function signSchedulerRequest({ secret, method = 'POST', body = '{}', timestamp }) {
  const keyBytes = decodeSchedulerSecret(secret)
  if (!keyBytes) {
    throw new Error('invalid_scheduler_secret')
  }

  const ts = timestamp ?? Math.floor(Date.now() / 1000).toString()
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex')
  const canonical = `${ts}\n${method}\n${bodyHash}`
  const mac = crypto.createHmac('sha256', keyBytes).update(canonical).digest('hex')

  return {
    timestamp: ts,
    signature: `${SIGNATURE_PREFIX}${mac}`,
    body,
  }
}

export function parseEdgeEnv(content) {
  const values = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    values[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
  }
  return values
}
