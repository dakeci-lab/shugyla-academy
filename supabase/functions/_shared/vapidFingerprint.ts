/** VAPID public key fingerprint helpers — shared by Edge Functions. */

/** Normalize public key text: trim whitespace/newlines; keep URL-safe base64. */
export function normalizeVapidPublicKey(publicKeyBase64url: string | null | undefined): string | null {
  if (typeof publicKeyBase64url !== 'string') return null
  const trimmed = publicKeyBase64url.trim().replace(/\s+/g, '')
  if (!trimmed || !/^[A-Za-z0-9_-]+$/.test(trimmed)) return null
  return trimmed
}

/** Normalize private key text the same way (URL-safe base64, no whitespace). */
export function normalizeVapidPrivateKey(privateKeyBase64url: string | null | undefined): string | null {
  if (typeof privateKeyBase64url !== 'string') return null
  const trimmed = privateKeyBase64url.trim().replace(/\s+/g, '')
  if (!trimmed || !/^[A-Za-z0-9_-]+$/.test(trimmed)) return null
  return trimmed
}

/**
 * Canonical fingerprint: SHA-256 of decoded public key bytes, first 16 lowercase hex chars.
 * Must stay identical to frontend `computeVapidPublicFingerprint` / scripts/lib/vapid-fingerprint.mjs.
 */
export async function fingerprintPublicKeyBase64url(
  publicKeyBase64url: string
): Promise<string | null> {
  const trimmed = normalizeVapidPublicKey(publicKeyBase64url)
  if (!trimmed) return null

  const bytes = decodeBase64Url(trimmed)
  if (!bytes.length) return null

  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return bufferToHex(new Uint8Array(digest)).slice(0, 16).toLowerCase()
}

export async function getCurrentServerVapidFingerprint(): Promise<string | null> {
  const publicKey = normalizeVapidPublicKey(Deno.env.get('VAPID_PUBLIC_KEY'))
  if (!publicKey) return null
  return fingerprintPublicKeyBase64url(publicKey)
}

/**
 * Verify VAPID public/private pair via Web Crypto.
 * Avoid Deno node:crypto createECDH('prime256v1') — it can false-negative on Edge.
 */
export async function verifyVapidKeyPair(publicKey: string, privateKey: string): Promise<boolean> {
  try {
    const pubRaw = decodeBase64Url(publicKey)
    const privRaw = decodeBase64Url(privateKey)
    if (pubRaw.length !== 65 || pubRaw[0] !== 0x04 || privRaw.length !== 32) return false

    const x = encodeBase64Url(pubRaw.subarray(1, 33))
    const y = encodeBase64Url(pubRaw.subarray(33, 65))
    const d = encodeBase64Url(privRaw)

    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x, y, d },
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign']
    )
    const exported = await crypto.subtle.exportKey('jwk', key)
    return exported.x === x && exported.y === y && typeof exported.d === 'string'
  } catch {
    return false
  }
}

export async function getVapidDiagnostics(): Promise<{
  configured: boolean
  pairMatches: boolean
  publicKeyFingerprint: string | null
  privateKeyFingerprint: string | null
  subjectValid: boolean
  publicKeyDecodedBytes: number | null
  privateKeyDecodedBytes: number | null
  subjectKind: 'https' | 'mailto' | 'invalid' | 'missing'
}> {
  const publicKey = normalizeVapidPublicKey(Deno.env.get('VAPID_PUBLIC_KEY')) ?? ''
  const privateKey = normalizeVapidPrivateKey(Deno.env.get('VAPID_PRIVATE_KEY')) ?? ''
  const subject = Deno.env.get('VAPID_SUBJECT')?.trim() ?? ''

  const subjectKind = subject.startsWith('https://')
    ? 'https'
    : subject.startsWith('mailto:')
      ? 'mailto'
      : subject
        ? 'invalid'
        : 'missing'
  const subjectValid = subjectKind === 'https' || subjectKind === 'mailto'
  const configured = Boolean(publicKey && privateKey && subjectValid)
  const publicKeyFingerprint = configured ? await fingerprintPublicKeyBase64url(publicKey) : null
  const pairMatches = configured ? await verifyVapidKeyPair(publicKey, privateKey) : false

  let publicKeyDecodedBytes: number | null = null
  let privateKeyDecodedBytes: number | null = null
  let privateKeyFingerprint: string | null = null
  try {
    if (publicKey) publicKeyDecodedBytes = decodeBase64Url(publicKey).length
  } catch {
    publicKeyDecodedBytes = null
  }
  try {
    if (privateKey) {
      const raw = decodeBase64Url(privateKey)
      privateKeyDecodedBytes = raw.length
      const digest = await crypto.subtle.digest('SHA-256', raw)
      privateKeyFingerprint = bufferToHex(new Uint8Array(digest)).slice(0, 16).toLowerCase()
    }
  } catch {
    privateKeyDecodedBytes = null
    privateKeyFingerprint = null
  }

  return {
    configured,
    pairMatches,
    publicKeyFingerprint,
    privateKeyFingerprint,
    subjectValid,
    publicKeyDecodedBytes,
    privateKeyDecodedBytes,
    subjectKind,
  }
}

export function isCurrentVapidFingerprint(
  stored: string | null | undefined,
  current: string | null
): boolean {
  if (!current || !stored) return false
  return stored.trim().toLowerCase() === current.trim().toLowerCase()
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

function bufferToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}
