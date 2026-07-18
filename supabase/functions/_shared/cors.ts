export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-shugyla-scheduler-timestamp, x-shugyla-scheduler-signature, x-shugyla-scheduler-test-run-at',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // Expose Server-Timing + DB-call budget (counts only; no PII).
  'Access-Control-Expose-Headers': 'server-timing, x-workforce-db-calls',
  'Timing-Allow-Origin': '*',
}

export function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  })
}

/** Build a Server-Timing header from phase durations in milliseconds. */
export function buildServerTimingHeader(phases: Record<string, number>): string {
  return Object.entries(phases)
    .filter(([, dur]) => Number.isFinite(dur))
    .map(([name, dur]) => `${name};dur=${Math.max(0, Math.round(dur))}`)
    .join(', ')
}
