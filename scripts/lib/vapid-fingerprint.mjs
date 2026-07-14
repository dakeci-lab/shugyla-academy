import { createHash } from 'crypto'

/**
 * Canonical VAPID public key fingerprint:
 * SHA-256 of decoded base64url raw public key bytes, first 16 hex chars.
 */
export function canonicalVapidFingerprint(publicKeyBase64url) {
  const raw = Buffer.from(publicKeyBase64url, 'base64url')
  return createHash('sha256').update(raw).digest('hex').slice(0, 16)
}

/** Legacy: SHA-256 of the base64url string (UTF-8), used by prepare-local-web-push-edge-env.mjs before Step 21C. */
export function legacyFingerprintBase64urlString(publicKeyBase64url) {
  return createHash('sha256').update(publicKeyBase64url).digest('hex').slice(0, 16)
}

/** Legacy: SHA-256 of uncompressed EC point buffer, used by generate-local-vapid-keys.mjs at generation time. */
export function legacyFingerprintRawBuffer(publicKeyBuffer) {
  return createHash('sha256').update(publicKeyBuffer).digest('hex').slice(0, 16)
}

export function isValidBase64urlKey(value) {
  if (!value || typeof value !== 'string' || value.length < 20) return false
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false
  try {
    const raw = Buffer.from(value, 'base64url')
    return raw.length > 0
  } catch {
    return false
  }
}
