import '@supabase/functions-js/edge-runtime.d.ts'
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import {
  adminErrorResponse,
  authorizeEmployeeAdmin,
} from '../_shared/employeeAuthorization.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  dispatchTimeTrackerNotifications,
  type TimeTrackerRule,
} from '../_shared/timeTrackerNotificationDispatch.ts'
import type { WebPushSendInput, WebPushSendResult } from '../_shared/webPushSender.ts'

const PERMISSION_DISPATCH = 'schedule.edit'
const PRODUCTION_MARKERS = ['supabase.co', 'cxadzerxndlscwvdaymk']

const ALLOWED_RULE_CODES = [
  'time_tracker.rule.shift_start_soon',
  'time_tracker.rule.clock_in_missing',
  'time_tracker.rule.shift_end_reached',
  'time_tracker.rule.clock_out_missing',
] as const

const ALLOWED_BODY_KEYS = new Set(['run_at', 'dry_run', 'rule_codes'])

const FORBIDDEN_BODY_KEYS = new Set([
  'employee_id',
  'shift_id',
  'recipient',
  'title',
  'body',
  'endpoint',
  'subscription_id',
  'auth_user_id',
  'force_send',
  'sender',
  'service_role',
  'token',
])

const RULE_SELECT =
  'id, code, template_id, module_code, event_code, offset_minutes, repeat_after_minutes, max_attempts, channels, priority'

function isLocalEnvironment(): boolean {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').toLowerCase()
  for (const marker of PRODUCTION_MARKERS) {
    if (supabaseUrl.includes(marker)) {
      return false
    }
  }
  return true
}

function isLocalDispatchEnabled(): boolean {
  if (Deno.env.get('TIME_TRACKER_DISPATCH_TEST_ENABLED') !== 'true') {
    return false
  }
  return isLocalEnvironment()
}

function isRealDispatchEnabled(): boolean {
  if (!isLocalDispatchEnabled()) {
    return false
  }
  return Deno.env.get('TIME_TRACKER_DISPATCH_REAL_TEST_ENABLED') === 'true'
}

function parseRunAt(value: unknown): Date | Response {
  if (typeof value !== 'string' || !value.trim()) {
    return adminErrorResponse('validation_error', 422)
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return adminErrorResponse('validation_error', 422)
  }

  return parsed
}

function parseRuleCodes(value: unknown): string[] | Response {
  if (!Array.isArray(value) || value.length === 0) {
    return adminErrorResponse('validation_error', 422)
  }

  const codes: string[] = []
  const seen = new Set<string>()

  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) {
      return adminErrorResponse('validation_error', 422)
    }
    const code = item.trim()
    if (!ALLOWED_RULE_CODES.includes(code as (typeof ALLOWED_RULE_CODES)[number])) {
      return adminErrorResponse('validation_error', 422)
    }
    if (seen.has(code)) {
      return adminErrorResponse('validation_error', 422)
    }
    seen.add(code)
    codes.push(code)
  }

  return codes
}

function validateBody(payload: Record<string, unknown>): Response | {
  runAt: Date
  ruleCodes: string[]
  dryRun: boolean
} {
  for (const key of Object.keys(payload)) {
    if (!ALLOWED_BODY_KEYS.has(key) || FORBIDDEN_BODY_KEYS.has(key)) {
      return adminErrorResponse('validation_error', 422)
    }
  }

  if (payload.dry_run !== true && payload.dry_run !== false) {
    return adminErrorResponse('validation_error', 422)
  }

  const runAt = parseRunAt(payload.run_at)
  if (runAt instanceof Response) return runAt

  const ruleCodes = parseRuleCodes(payload.rule_codes)
  if (ruleCodes instanceof Response) return ruleCodes

  return {
    runAt,
    ruleCodes,
    dryRun: payload.dry_run === true,
  }
}

async function loadRules(
  serviceClient: SupabaseClient,
  ruleCodes: string[]
): Promise<TimeTrackerRule[] | Response> {
  const { data, error } = await serviceClient
    .from('notification_rules')
    .select(RULE_SELECT)
    .in('code', ruleCodes)

  if (error) {
    return adminErrorResponse('internal_error', 500)
  }

  const rows = data ?? []
  if (rows.length !== ruleCodes.length) {
    return adminErrorResponse('validation_error', 422)
  }

  const byCode = new Map(rows.map((row) => [row.code, row as TimeTrackerRule]))
  return ruleCodes.map((code) => byCode.get(code)!)
}

const dryRunGuardSender = async (_input: WebPushSendInput): Promise<WebPushSendResult> => {
  throw new Error('sender_should_not_be_called_in_dry_run')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse()
  }

  if (req.method !== 'POST') {
    return adminErrorResponse('method_not_allowed', 405)
  }

  if (!isLocalDispatchEnabled()) {
    return adminErrorResponse('dispatcher_disabled', 403)
  }

  const authResult = await authorizeEmployeeAdmin(req, PERMISSION_DISPATCH)
  if (authResult instanceof Response) {
    return authResult
  }

  let payload: Record<string, unknown>
  try {
    payload = (await req.json()) as Record<string, unknown>
  } catch {
    return adminErrorResponse('validation_error', 422)
  }

  const validated = validateBody(payload)
  if (validated instanceof Response) {
    return validated
  }

  if (!validated.dryRun && !isRealDispatchEnabled()) {
    return adminErrorResponse('real_dispatch_disabled', 403)
  }

  const rules = await loadRules(authResult.serviceClient, validated.ruleCodes)
  if (rules instanceof Response) {
    return rules
  }

  try {
    const result = await dispatchTimeTrackerNotifications({
      serviceClient: authResult.serviceClient,
      runAt: validated.runAt,
      rules,
      dryRun: validated.dryRun,
      sender: validated.dryRun ? dryRunGuardSender : undefined,
    })

    return jsonResponse({
      ok: true,
      dry_run: validated.dryRun,
      result: {
        scannedShifts: result.scannedShifts,
        matchedEvents: result.matchedEvents,
        createdNotifications: result.createdNotifications,
        skippedDuplicates: result.skippedDuplicates,
        pushAccepted: result.pushAccepted,
        pushFailed: result.pushFailed,
        noActiveSubscriptions: result.noActiveSubscriptions,
      },
    })
  } catch {
    return adminErrorResponse('internal_error', 500)
  }
})
