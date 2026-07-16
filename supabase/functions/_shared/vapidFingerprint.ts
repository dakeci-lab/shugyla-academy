/** VAPID public key fingerprint helpers — shared by Edge Functions. */

import { createECDH, timingSafeEqual } from 'node:crypto'

export async function fingerprintPublicKeyBase64url(
  publicKeyBase64url: string
): Promise<string | null> {
  const trimmed = publicKeyBase64url?.trim()
  if (!trimmed || !/^[A-Za-z0-9_-]+$/.test(trimmed)) return null

  const bytes = decodeBase64Url(trimmed)
  if (!bytes.length) return null

  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return bufferToHex(new Uint8Array(digest)).slice(0, 16)
}

export async function getCurrentServerVapidFingerprint(): Promise<string | null> {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')?.trim()
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
  serverPublicFingerprint: string | null
  derivedPublicFingerprint: string | null
  pairMatches: boolean
  configured: boolean
}> {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')?.trim() ?? ''
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')?.trim() ?? ''
  const subject = Deno.env.get('VAPID_SUBJECT')?.trim() ?? ''

  const configured = Boolean(publicKey && privateKey && subject)
  const serverPublicFingerprint = configured
    ? await fingerprintPublicKeyBase64url(publicKey)
    : null
  const pairMatches = configured ? await verifyVapidKeyPair(publicKey, privateKey) : false

  let derivedPublicFingerprint: string | null = null
  if (configured && pairMatches) {
    const privRaw = Buffer.from(decodeBase64Url(privateKey))
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(privRaw)
    const derivedPublic = ecdh.getPublicKey(null, 'uncompressed').toString('base64url')
    derivedPublicFingerprint = await fingerprintPublicKeyBase64url(derivedPublic)
  }

  return {
    serverPublicFingerprint,
    derivedPublicFingerprint,
    pairMatches,
    configured,
  }
}

export function isCurrentVapidFingerprint(
  stored: string | null | undefined,
  current: string | null
): boolean {
  if (!current || !stored) return false
  return stored === current
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
