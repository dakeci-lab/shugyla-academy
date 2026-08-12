/**
 * Client-generated idempotency key for a public vacancy application.
 * Persisted per vacancy so a page reload/retry after a dropped response
 * reuses the same key instead of letting the server create a duplicate row.
 */

const STORAGE_PREFIX = 'shugyla_apply_submission_key:'

function storageKey(vacancyId) {
  return `${STORAGE_PREFIX}${vacancyId}`
}

/** Always returns a valid UUID v4 — the RPC parameter is typed `uuid`, so a non-UUID string would fail server-side. */
function genUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Reuses a previously stored key for this vacancy, or creates and stores a new one. */
export function getOrCreateApplicationSubmissionKey(vacancyId) {
  if (!vacancyId || typeof window === 'undefined' || !window.sessionStorage) return genUuid()

  const key = storageKey(vacancyId)
  try {
    const existing = window.sessionStorage.getItem(key)
    if (existing) return existing
    const created = genUuid()
    window.sessionStorage.setItem(key, created)
    return created
  } catch {
    return genUuid()
  }
}

/** Clears the stored key once the application has been submitted successfully. */
export function clearApplicationSubmissionKey(vacancyId) {
  if (!vacancyId || typeof window === 'undefined' || !window.sessionStorage) return
  try {
    window.sessionStorage.removeItem(storageKey(vacancyId))
  } catch {
    /* ignore */
  }
}
