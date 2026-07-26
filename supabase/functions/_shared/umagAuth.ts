/**
 * Server-side UMAG session lifecycle for Edge Functions.
 *
 * - Prefer UMAG_LOGIN/UMAG_USERNAME + UMAG_PASSWORD (Basic signin → sessionToken)
 * - Optional in-memory session cache across warm isolates
 * - On UMAG 401/403: signin once and retry the original request exactly once
 * - Never log password or full sessionToken; never return them to clients
 *
 * HAR: GET /rest/cabinet/org/login/signin with Authorization: Basic …
 * Subsequent APIs use Authorization: <sessionToken> (no Bearer prefix).
 * No refresh-token endpoint observed — refreshTime is a session timestamp only.
 */

import {
  maskStoreId,
  UMAG_TIMEOUT_MS,
  type UmagConfig,
} from './umagConfig.ts'

export type UmagAuthErrorCode =
  | 'UMAG_NOT_CONFIGURED'
  | 'UMAG_AUTH_FAILED'
  | 'UMAG_LOGIN_FAILED'
  | 'UMAG_TIMEOUT'
  | 'UMAG_NETWORK_ERROR'

export type UmagSession = {
  baseUrl: string
  storeId: string
  apiVer: string
  clientVer: string
  /** Raw sessionToken for Authorization header — never log/return. */
  authorization: string
  /** True when token came from password signin (can re-auth). */
  canReauth: boolean
}

type CachedSession = {
  authorization: string
  obtainedAtMs: number
  /** UMAG refreshTime when available (epoch ms). */
  refreshTimeMs: number | null
}

/** Warm-isolate cache — best-effort only; always safe to miss. */
let memorySession: CachedSession | null = null

const SIGNIN_PATH = '/rest/cabinet/org/login/signin'

function envTrim(name: string): string {
  return (Deno.env.get(name) || '').trim()
}

export function resolveUmagLoginPassword():
  | { login: string; password: string }
  | { error: 'UMAG_NOT_CONFIGURED' } {
  const login = envTrim('UMAG_LOGIN') || envTrim('UMAG_USERNAME')
  const password = envTrim('UMAG_PASSWORD')
  if (!login || !password) {
    return { error: 'UMAG_NOT_CONFIGURED' }
  }
  return { login, password }
}

export function resolveUmagConnection():
  | {
      baseUrl: string
      storeId: string
      apiVer: string
      clientVer: string
      credentials: { login: string; password: string } | null
      staticAuthorization: string | null
    }
  | { error: 'UMAG_NOT_CONFIGURED' } {
  const baseUrl = (
    envTrim('UMAG_BASE_URL') ||
    envTrim('UMAG_API_BASE_URL') ||
    'https://api.umag.kz'
  ).replace(/\/+$/, '')

  const storeId = envTrim('UMAG_STORE_ID')
  const apiVer = envTrim('UMAG_API_VER') || '1.4'
  const clientVer = envTrim('UMAG_CLIENT_VER') || 'angular_cabinet_20.0.15'

  const creds = resolveUmagLoginPassword()
  const credentials = 'error' in creds ? null : creds
  const staticAuthorization =
    envTrim('UMAG_AUTHORIZATION') || envTrim('UMAG_AUTH_TOKEN') || null

  if (!storeId) {
    return { error: 'UMAG_NOT_CONFIGURED' }
  }
  if (!credentials && !staticAuthorization) {
    return { error: 'UMAG_NOT_CONFIGURED' }
  }

  return { baseUrl, storeId, apiVer, clientVer, credentials, staticAuthorization }
}

function toBasicAuthorization(login: string, password: string): string {
  const bytes = new TextEncoder().encode(`${login}:${password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}

function isCacheFresh(cache: CachedSession): boolean {
  const now = Date.now()
  // Prefer UMAG refreshTime when present; otherwise keep warm for 25 minutes.
  if (cache.refreshTimeMs != null && Number.isFinite(cache.refreshTimeMs)) {
    // Re-signin a few minutes before refreshTime if it looks like an expiry.
    return now < cache.refreshTimeMs - 60_000
  }
  return now - cache.obtainedAtMs < 25 * 60_000
}

function clearMemorySession() {
  memorySession = null
}

function setMemorySession(authorization: string, refreshTimeMs: number | null) {
  memorySession = {
    authorization,
    obtainedAtMs: Date.now(),
    refreshTimeMs,
  }
}

export type UmagSignInResult =
  | { ok: true; authorization: string; refreshTimeMs: number | null }
  | { ok: false; code: UmagAuthErrorCode; status?: number }

/**
 * GET /rest/cabinet/org/login/signin with Basic credentials.
 * Returns sessionToken only — never logs it.
 */
export async function umagSignIn(connection: {
  baseUrl: string
  apiVer: string
  clientVer: string
  login: string
  password: string
}): Promise<UmagSignInResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UMAG_TIMEOUT_MS)
  const started = performance.now()

  try {
    const res = await fetch(`${connection.baseUrl}${SIGNIN_PATH}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
        Authorization: toBasicAuthorization(connection.login, connection.password),
        'api-ver': connection.apiVer,
        'client-ver': connection.clientVer,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    })

    const elapsedMs = Math.round(performance.now() - started)
    let json: Record<string, unknown> | null = null
    try {
      json = (await res.json()) as Record<string, unknown>
    } catch {
      json = null
    }

    if (res.status === 401 || res.status === 403) {
      console.error('umag_signin_rejected', { status: res.status, elapsedMs })
      return { ok: false, code: 'UMAG_AUTH_FAILED', status: res.status }
    }

    if (res.status !== 200) {
      console.error('umag_signin_http_error', { status: res.status, elapsedMs })
      return { ok: false, code: 'UMAG_LOGIN_FAILED', status: res.status }
    }

    const sessionToken =
      json && typeof json.sessionToken === 'string' ? json.sessionToken.trim() : ''
    if (!sessionToken) {
      console.error('umag_signin_missing_session_token', {
        elapsedMs,
        hasBody: Boolean(json),
        keys: json ? Object.keys(json) : [],
      })
      return { ok: false, code: 'UMAG_LOGIN_FAILED', status: res.status }
    }

    // Detect unexpected challenge flows without logging secrets
    if (
      json &&
      (json.captcha ||
        json.captchaRequired ||
        json.requireCaptcha ||
        json.otp ||
        json.sms ||
        json.twoFactor ||
        json.require2fa)
    ) {
      console.error('umag_signin_challenge_required', { elapsedMs })
      return { ok: false, code: 'UMAG_AUTH_FAILED', status: res.status }
    }

    const refreshTimeMs =
      typeof json.refreshTime === 'number' && Number.isFinite(json.refreshTime)
        ? json.refreshTime
        : null

    console.info('umag_signin_ok', {
      elapsedMs,
      tokenLen: sessionToken.length,
      hasRefreshTime: refreshTimeMs != null,
    })

    return { ok: true, authorization: sessionToken, refreshTimeMs }
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    if (name === 'AbortError') {
      console.error('umag_signin_timeout')
      return { ok: false, code: 'UMAG_TIMEOUT' }
    }
    console.error('umag_signin_network_error')
    return { ok: false, code: 'UMAG_NETWORK_ERROR' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Obtain a usable UMAG session for this invocation.
 * Prefers warm memory cache → fresh signin → static secret fallback.
 *
 * Optional secret UMAG_TEST_STALE_TOKEN: when set with credentials present,
 * returns that value as the first Authorization so 401→signin→retry can be verified.
 * Must remain unset in normal production.
 */
export async function acquireUmagSession(
  options: { forceSignIn?: boolean } = {}
): Promise<UmagSession | { error: UmagAuthErrorCode }> {
  const connection = resolveUmagConnection()
  if ('error' in connection) {
    return { error: 'UMAG_NOT_CONFIGURED' }
  }

  const testStaleToken = envTrim('UMAG_TEST_STALE_TOKEN')
  if (testStaleToken && connection.credentials && !options.forceSignIn) {
    console.warn('umag_test_stale_token_active', { tokenLen: testStaleToken.length })
    return {
      baseUrl: connection.baseUrl,
      storeId: connection.storeId,
      apiVer: connection.apiVer,
      clientVer: connection.clientVer,
      authorization: testStaleToken,
      canReauth: true,
    }
  }

  if (!options.forceSignIn && memorySession && isCacheFresh(memorySession)) {
    return {
      baseUrl: connection.baseUrl,
      storeId: connection.storeId,
      apiVer: connection.apiVer,
      clientVer: connection.clientVer,
      authorization: memorySession.authorization,
      canReauth: Boolean(connection.credentials),
    }
  }

  if (connection.credentials) {
    const signed = await umagSignIn({
      baseUrl: connection.baseUrl,
      apiVer: connection.apiVer,
      clientVer: connection.clientVer,
      login: connection.credentials.login,
      password: connection.credentials.password,
    })
    if (!signed.ok) {
      return { error: signed.code }
    }
    setMemorySession(signed.authorization, signed.refreshTimeMs)
    return {
      baseUrl: connection.baseUrl,
      storeId: connection.storeId,
      apiVer: connection.apiVer,
      clientVer: connection.clientVer,
      authorization: signed.authorization,
      canReauth: true,
    }
  }

  // Legacy static token — cannot reauth without credentials
  return {
    baseUrl: connection.baseUrl,
    storeId: connection.storeId,
    apiVer: connection.apiVer,
    clientVer: connection.clientVer,
    authorization: connection.staticAuthorization as string,
    canReauth: false,
  }
}

export function sessionToUmagConfig(session: UmagSession): UmagConfig {
  return {
    baseUrl: session.baseUrl,
    authorization: session.authorization,
    storeId: session.storeId,
    apiVer: session.apiVer,
    clientVer: session.clientVer,
  }
}

export type UmagAuthedFetchResult = {
  status: number
  json: unknown
  elapsedMs: number
  retriedAfterSignIn: boolean
}

/**
 * Authenticated UMAG GET with exactly one re-signin retry on 401/403.
 */
export async function umagFetchAuthed(
  path: string,
  search: Record<string, string | number | boolean>,
  options: { timeoutMs?: number } = {}
): Promise<UmagAuthedFetchResult | { error: UmagAuthErrorCode }> {
  let session = await acquireUmagSession()
  if ('error' in session) return session

  const timeoutMs = options.timeoutMs ?? UMAG_TIMEOUT_MS

  const doFetch = async (authorization: string) => {
    const url = new URL(`${session.baseUrl}${path}`)
    for (const [key, value] of Object.entries(search)) {
      url.searchParams.set(key, String(value))
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const started = performance.now()
    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
          Authorization: authorization,
          'api-ver': session.apiVer,
          'client-ver': session.clientVer,
        },
        signal: controller.signal,
      })
      const elapsedMs = Math.round(performance.now() - started)
      let json: unknown = null
      try {
        json = await res.json()
      } catch {
        json = null
      }
      return { status: res.status, json, elapsedMs }
    } finally {
      clearTimeout(timer)
    }
  }

  let result: { status: number; json: unknown; elapsedMs: number }
  try {
    result = await doFetch(session.authorization)
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    if (name === 'AbortError') return { error: 'UMAG_TIMEOUT' }
    return { error: 'UMAG_NETWORK_ERROR' }
  }

  const authFailed = result.status === 401 || result.status === 403
  if (!authFailed) {
    return { ...result, retriedAfterSignIn: false }
  }

  if (!session.canReauth) {
    console.error('umag_auth_failed_no_reauth', {
      status: result.status,
      path,
      storeId: maskStoreId(session.storeId),
    })
    return { error: 'UMAG_AUTH_FAILED' }
  }

  console.warn('umag_auth_retry_after_signin', {
    status: result.status,
    path,
    storeId: maskStoreId(session.storeId),
  })

  clearMemorySession()
  const renewed = await acquireUmagSession({ forceSignIn: true })
  if ('error' in renewed) {
    return { error: renewed.error === 'UMAG_NOT_CONFIGURED' ? 'UMAG_AUTH_FAILED' : renewed.error }
  }
  session = renewed

  try {
    result = await doFetch(session.authorization)
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    if (name === 'AbortError') return { error: 'UMAG_TIMEOUT' }
    return { error: 'UMAG_NETWORK_ERROR' }
  }

  if (result.status === 401 || result.status === 403) {
    console.error('umag_auth_failed_after_retry', {
      status: result.status,
      path,
      storeId: maskStoreId(session.storeId),
    })
    clearMemorySession()
    return { error: 'UMAG_AUTH_FAILED' }
  }

  return { ...result, retriedAfterSignIn: true }
}

/** Test helper: clear warm cache (used by verification scripts via force path). */
export function __resetUmagSessionCacheForTests() {
  clearMemorySession()
}
