/**
 * Shared UMAG secrets + request helpers for Edge Functions.
 * Never log Authorization or cookies.
 */

export const UMAG_TIMEOUT_MS = 30_000
export const UMAG_PAGE_SIZE = 500
export const UMAG_TIMEZONE_OFFSET_MS = 5 * 60 * 60 * 1000 // Asia/Aqtobe (+05), no DST

export type UmagConfig = {
  baseUrl: string
  authorization: string
  storeId: string
  apiVer: string
  clientVer: string
}

export function resolveUmagConfig(): UmagConfig | { error: 'UMAG_NOT_CONFIGURED' } {
  const baseUrl = (
    Deno.env.get('UMAG_BASE_URL') ||
    Deno.env.get('UMAG_API_BASE_URL') ||
    'https://api.umag.kz'
  ).replace(/\/+$/, '')

  const authorization = (
    Deno.env.get('UMAG_AUTHORIZATION') ||
    Deno.env.get('UMAG_AUTH_TOKEN') ||
    ''
  ).trim()

  const storeId = (Deno.env.get('UMAG_STORE_ID') || '').trim()
  const apiVer = (Deno.env.get('UMAG_API_VER') || '1.4').trim()
  const clientVer = (Deno.env.get('UMAG_CLIENT_VER') || 'angular_cabinet_20.0.15').trim()

  if (!authorization || !storeId) {
    return { error: 'UMAG_NOT_CONFIGURED' }
  }

  return { baseUrl, authorization, storeId, apiVer, clientVer }
}

export function maskStoreId(value: string): string {
  if (!value) return '(empty)'
  if (value.length <= 2) return '**'
  return `${value.slice(0, 1)}…${value.slice(-1)} (len=${value.length})`
}

/** Inclusive day bounds in Asia/Aqtobe as Unix milliseconds for UMAG fromTime/toTime. */
export function aqtobeDayBoundsMs(dateKey: string): { fromTime: number; toTime: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null
  const [y, m, d] = dateKey.split('-').map(Number)
  const fromTime = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - UMAG_TIMEZONE_OFFSET_MS
  const toTime = Date.UTC(y, m - 1, d, 23, 59, 59, 999) - UMAG_TIMEZONE_OFFSET_MS
  return { fromTime, toTime }
}

export function aqtobePeriodBoundsMs(
  dateFrom: string,
  dateTo: string
): { fromTime: number; toTime: number } | null {
  const start = aqtobeDayBoundsMs(dateFrom)
  const end = aqtobeDayBoundsMs(dateTo)
  if (!start || !end || start.fromTime > end.toTime) return null
  return { fromTime: start.fromTime, toTime: end.toTime }
}

export function umagHeaders(config: UmagConfig): HeadersInit {
  return {
    Accept: 'application/json, text/plain, */*',
    Authorization: config.authorization,
    'api-ver': config.apiVer,
    'client-ver': config.clientVer,
  }
}

export async function umagFetch(
  config: UmagConfig,
  path: string,
  search: Record<string, string | number | boolean>
): Promise<{ status: number; json: unknown; elapsedMs: number }> {
  const url = new URL(`${config.baseUrl}${path}`)
  for (const [key, value] of Object.entries(search)) {
    url.searchParams.set(key, String(value))
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UMAG_TIMEOUT_MS)
  const started = performance.now()

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: umagHeaders(config),
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

/** Sum numeric fields without premature 2-decimal rounding. */
export function sumNumbers(values: Array<number | string | null | undefined>): number {
  let total = 0
  for (const value of values) {
    if (value == null || value === '') continue
    const n = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(n)) total += n
  }
  return total
}

export function nearlyEqual(a: number, b: number, epsilon = 0.01): boolean {
  return Math.abs(a - b) <= epsilon
}

export function msToIso(ms: unknown): string | null {
  const n = typeof ms === 'number' ? ms : Number(ms)
  if (!Number.isFinite(n) || n <= 0) return null
  return new Date(n).toISOString()
}

export function parseUmagEditTime(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return msToIso(value)
  const s = String(value)
  const parsed = Date.parse(s)
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  return null
}
