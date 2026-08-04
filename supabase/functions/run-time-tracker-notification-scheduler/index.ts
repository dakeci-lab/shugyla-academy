import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import { adminErrorResponse } from '../_shared/employeeAuthorization.ts'
import {
  isSchedulerSecretConfigured,
  verifySchedulerRequest,
} from '../_shared/schedulerRequestAuth.ts'
import { parseSchedulerRequestBody } from '../_shared/schedulerControlledRun.ts'
import { runTimeTrackerNotificationScheduler } from '../_shared/timeTrackerNotificationScheduler.ts'
import { getVapidDiagnostics } from '../_shared/vapidFingerprint.ts'

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

function resolveLocalTestRunAt(req: Request): Response | Date | null {
  const testHeader = req.headers.get(TEST_RUN_AT_HEADER)
  if (!testHeader) return null

  if (!isLocalTestMode()) {
    return adminErrorResponse('validation_error', 422)
  }

  const parsed = new Date(testHeader)
  if (Number.isNaN(parsed.getTime())) {
    return adminErrorResponse('validation_error', 422)
  }

  return parsed
}

function mapControlledParseError(code: string): Response {
  if (code === 'malformed_json') return adminErrorResponse('malformed_json', 400)
  if (code === 'controlled_run_disabled') {
    return jsonResponse({ ok: false, code: 'controlled_run_disabled' }, 403)
  }
  if (code === 'forbidden_field') return adminErrorResponse('forbidden_field', 422)
  return adminErrorResponse('validation_error', 422)
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

  const parsedBody = parseSchedulerRequestBody(rawBody)
  if (parsedBody.mode === 'error') {
    return mapControlledParseError(parsedBody.code)
  }

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    if (parsedBody.mode === 'controlled') {
      const vapid = await getVapidDiagnostics()
      const result = await runTimeTrackerNotificationScheduler({
        serviceClient,
        runAt: parsedBody.run.runAt,
        dryRun: false,
        shiftIds: parsedBody.run.shiftIds,
        employeeIds: parsedBody.run.employeeIds,
        controlledRunId: parsedBody.run.runId,
        ruleCodesFilter: parsedBody.run.ruleCodes ?? undefined,
      })

      return jsonResponse({
        ok: true,
        status: result.status,
        mode: 'controlled',
        runId: parsedBody.run.runId,
        runAt: result.runAt,
        enabledRules: result.enabledRules,
        shiftIds: parsedBody.run.shiftIds,
        vapid: {
          configured: vapid.configured,
          pair_matches: vapid.pairMatches,
          public_key_fingerprint: vapid.publicKeyFingerprint,
          subject_valid: vapid.subjectValid,
          subject_kind: vapid.subjectKind,
          public_key_decoded_bytes: vapid.publicKeyDecodedBytes,
          private_key_decoded_bytes: vapid.privateKeyDecodedBytes,
          private_key_fingerprint: vapid.privateKeyFingerprint,
        },
        result: result.result,
      })
    }

    const localTestRunAt = resolveLocalTestRunAt(req)
    if (localTestRunAt instanceof Response) return localTestRunAt

    const result = await runTimeTrackerNotificationScheduler({
      serviceClient,
      runAt: localTestRunAt ?? new Date(),
      dryRun: false,
    })

    return jsonResponse({
      ok: true,
      status: result.status,
      mode: 'cron',
      runAt: result.runAt,
      enabledRules: result.enabledRules,
      result: result.result,
    })
  } catch {
    return adminErrorResponse('internal_error', 500)
  }
})
