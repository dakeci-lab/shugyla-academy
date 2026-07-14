import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import { adminErrorResponse } from '../_shared/employeeAuthorization.ts'
import {
  isSchedulerSecretConfigured,
  verifySchedulerRequest,
} from '../_shared/schedulerRequestAuth.ts'
import { runTimeTrackerNotificationScheduler } from '../_shared/timeTrackerNotificationScheduler.ts'

const PRODUCTION_MARKERS = ['supabase.co', 'cxadzerxndlscwvdaymk']
const TEST_RUN_AT_HEADER = 'x-shugyla-scheduler-test-run-at'

function isLocalEnvironment(): boolean {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').toLowerCase()
  for (const marker of PRODUCTION_MARKERS) {
    if (supabaseUrl.includes(marker)) return false
  }
  return supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost')
}

function isSchedulerEnabled(): boolean {
  if (Deno.env.get('TIME_TRACKER_SCHEDULER_ENABLED') !== 'true') return false
  const current = Deno.env.get('TIME_TRACKER_SCHEDULER_SECRET_CURRENT')
  return isSchedulerSecretConfigured(current)
}

function isLocalTestMode(): boolean {
  if (Deno.env.get('TIME_TRACKER_SCHEDULER_TEST_MODE') !== 'true') return false
  return isLocalEnvironment()
}

function validateBody(rawBody: Uint8Array): Response | null {
  const text = new TextDecoder().decode(rawBody).trim()
  const effective = text === '' ? '{}' : text

  let parsed: unknown
  try {
    parsed = JSON.parse(effective)
  } catch {
    return adminErrorResponse('validation_error', 422)
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return adminErrorResponse('validation_error', 422)
  }

  if (Object.keys(parsed as Record<string, unknown>).length > 0) {
    return adminErrorResponse('validation_error', 422)
  }

  return null
}

function resolveRunAt(req: Request): Response | Date {
  const testHeader = req.headers.get(TEST_RUN_AT_HEADER)
  if (!testHeader) return new Date()

  if (!isLocalTestMode()) {
    return adminErrorResponse('validation_error', 422)
  }

  const parsed = new Date(testHeader)
  if (Number.isNaN(parsed.getTime())) {
    return adminErrorResponse('validation_error', 422)
  }

  return parsed
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse()
  }

  if (req.method !== 'POST') {
    return adminErrorResponse('method_not_allowed', 405)
  }

  if (!isSchedulerEnabled()) {
    return adminErrorResponse('scheduler_disabled', 503)
  }

  const rawBody = new Uint8Array(await req.arrayBuffer())

  const authorized = await verifySchedulerRequest({
    request: req,
    rawBody,
    currentSecret: Deno.env.get('TIME_TRACKER_SCHEDULER_SECRET_CURRENT'),
    previousSecret: Deno.env.get('TIME_TRACKER_SCHEDULER_SECRET_PREVIOUS'),
    now: new Date(),
  })

  if (!authorized) {
    return adminErrorResponse('unauthorized', 401)
  }

  const bodyError = validateBody(rawBody)
  if (bodyError) return bodyError

  const runAt = resolveRunAt(req)
  if (runAt instanceof Response) return runAt

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    const result = await runTimeTrackerNotificationScheduler({
      serviceClient,
      runAt,
      dryRun: false,
    })

    return jsonResponse({
      ok: true,
      status: result.status,
      runAt: result.runAt,
      enabledRules: result.enabledRules,
      result: result.result,
    })
  } catch {
    return adminErrorResponse('internal_error', 500)
  }
})
