export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-shugyla-scheduler-timestamp, x-shugyla-scheduler-signature, x-shugyla-scheduler-test-run-at',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  })
}
