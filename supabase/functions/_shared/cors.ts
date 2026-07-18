export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-shugyla-scheduler-timestamp, x-shugyla-scheduler-signature, x-shugyla-scheduler-test-run-at',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // Expose Server-Timing so browsers can read Edge phase durations (no PII in values).
  'Access-Control-Expose-Headers': 'server-timing',
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
