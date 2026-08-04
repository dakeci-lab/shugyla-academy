/** VAPID public key fingerprint helpers — shared by Edge Functions. */

import { createECDH, timingSafeEqual } from 'node:crypto'

/** Normalize public key text: trim whitespace/newlines; keep URL-safe base64. */
export function normalizeVapidPublicKey(publicKeyBase64url: string | null | undefined): string | null {
  if (typeof publicKeyBase64url !== 'string') return null
  const trimmed = publicKeyBase64url.trim().replace(/\s+/g, '')
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

export async function verifyVapidKeyPair(publicKey: string, privateKey: string): Promise<boolean> {
  try {
    const pubRaw = Buffer.from(decodeBase64Url(publicKey))
    const privRaw = Buffer.from(decodeBase64Url(privateKey))
    if (pubRaw.length !== 65 || pubRaw[0] !== 0x04 || privRaw.length !== 32) return false

    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(privRaw)
    const derived = ecdh.getPublicKey(null, 'uncompressed')
    return derived.length === pubRaw.length && timingSafeEqual(derived, pubRaw)
  } catch {
    return false
  }
}

export async function getVapidDiagnostics(): Promise<{
  configured: boolean
  pairMatches: boolean
  publicKeyFingerprint: string | null
  subjectValid: boolean
}> {
  const publicKey = normalizeVapidPublicKey(Deno.env.get('VAPID_PUBLIC_KEY')) ?? ''
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')?.trim() ?? ''
  const subject = Deno.env.get('VAPID_SUBJECT')?.trim() ?? ''

  const subjectValid = subject.startsWith('mailto:') || subject.startsWith('https://')
  const configured = Boolean(publicKey && privateKey && subjectValid)
  const publicKeyFingerprint = configured ? await fingerprintPublicKeyBase64url(publicKey) : null
  const pairMatches = configured ? await verifyVapidKeyPair(publicKey, privateKey) : false

  return {
    configured,
    pairMatches,
    publicKeyFingerprint,
    subjectValid,
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

function bufferToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}
