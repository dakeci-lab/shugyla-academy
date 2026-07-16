import '@supabase/functions-js/edge-runtime.d.ts'
import { authorizeEmployeeAdmin, adminErrorResponse } from '../_shared/employeeAuthorization.ts'
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'

const PERMISSION_MANAGE = 'notifications.manage'

const TIME_TRACKER_RULE_CODES = [
  'time_tracker.rule.shift_start_soon',
  'time_tracker.rule.clock_in_missing',
  'time_tracker.rule.shift_end_reached',
  'time_tracker.rule.clock_out_missing',
] as const

const RULE_SELECT =
  'id, code, event_code, is_enabled, offset_minutes, repeat_after_minutes, max_attempts, updated_at'

const ALLOWED_BODY_KEYS = new Set(['action', 'settings'])

const FORBIDDEN_BODY_KEYS = new Set([
  'id',
  'template_id',
  'module_code',
  'event_code',
  'channels',
  'priority',
  'trigger_type',
  'recipient_type',
  'repeat_after_minutes',
  'max_attempts',
  'employee_id',
  'auth_user_id',
  'role',
])

type RuleCode = (typeof TIME_TRACKER_RULE_CODES)[number]

type RuleRow = {
  id: string
  code: string
  event_code: string
  is_enabled: boolean
  offset_minutes: number
  repeat_after_minutes: number | null
  max_attempts: number
  updated_at: string
}

type SettingInput = {
  code: string
  is_enabled: boolean
  offset_minutes: number
}

const MIN_OFFSET = 0
const MAX_OFFSET = 1440

function isRuleCode(value: string): value is RuleCode {
  return TIME_TRACKER_RULE_CODES.includes(value as RuleCode)
}

function displayOffsetMinutes(eventCode: string, storedOffset: number): number {
  if (eventCode === 'shift_start_soon') return Math.abs(storedOffset)
  return Math.max(0, storedOffset)
}

function storedOffsetMinutes(eventCode: string, displayOffset: number): number {
  if (eventCode === 'shift_start_soon') return -Math.abs(displayOffset)
  return Math.abs(displayOffset)
}

function validateDisplayOffset(value: unknown): value is number {
  return Number.isInteger(value) && value >= MIN_OFFSET && value <= MAX_OFFSET
}

function mapRuleForClient(rule: RuleRow) {
  return {
    code: rule.code,
    event_code: rule.event_code,
    is_enabled: rule.is_enabled,
    offset_minutes: displayOffsetMinutes(rule.event_code, rule.offset_minutes),
    default_offset_minutes: displayOffsetMinutes(
      rule.event_code,
      defaultOffsetForEvent(rule.event_code)
    ),
    repeat_after_minutes: rule.repeat_after_minutes,
    max_attempts: rule.max_attempts,
    updated_at: rule.updated_at,
  }
}

function defaultOffsetForEvent(eventCode: string): number {
  switch (eventCode) {
    case 'shift_start_soon':
      return -10
    case 'clock_in_missing':
      return 5
    case 'shift_end_reached':
      return 0
    case 'clock_out_missing':
      return 10
    default:
      return 0
  }
}

function parseSettingsInput(payload: Record<string, unknown>): SettingInput[] | Response {
  if (!Array.isArray(payload.settings) || payload.settings.length === 0) {
    return adminErrorResponse('validation_error', 422)
  }

  const parsed: SettingInput[] = []

  for (const item of payload.settings) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return adminErrorResponse('validation_error', 422)
    }

    const row = item as Record<string, unknown>
    for (const key of Object.keys(row)) {
      if (!['code', 'is_enabled', 'offset_minutes'].includes(key)) {
        return adminErrorResponse('forbidden_field', 422)
      }
    }

    if (typeof row.code !== 'string' || !isRuleCode(row.code.trim())) {
      return adminErrorResponse('validation_error', 422)
    }

    if (typeof row.is_enabled !== 'boolean') {
      return adminErrorResponse('validation_error', 422)
    }

    if (!validateDisplayOffset(row.offset_minutes)) {
      return adminErrorResponse('validation_error', 422)
    }

    parsed.push({
      code: row.code.trim(),
      is_enabled: row.is_enabled,
      offset_minutes: row.offset_minutes,
    })
  }

  const uniqueCodes = new Set(parsed.map((item) => item.code))
  if (uniqueCodes.size !== parsed.length) {
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

  let payload: Record<string, unknown>
  try {
    payload = (await req.json()) as Record<string, unknown>
  } catch {
    return adminErrorResponse('malformed_json', 400)
  }

  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_BODY_KEYS.has(key)) {
      return adminErrorResponse('forbidden_field', 422)
    }
    if (!ALLOWED_BODY_KEYS.has(key)) {
      return adminErrorResponse('forbidden_field', 422)
    }
  }

  const action = typeof payload.action === 'string' ? payload.action.trim() : ''
  if (action !== 'get_settings' && action !== 'update_settings') {
    return adminErrorResponse('validation_error', 422)
  }

  const authResult = await authorizeEmployeeAdmin(req, PERMISSION_MANAGE)
  if (authResult instanceof Response) return authResult

  const { serviceClient } = authResult

  const { data: rules, error: rulesError } = await serviceClient
    .from('notification_rules')
    .select(RULE_SELECT)
    .eq('module_code', 'time_tracker')
    .in('code', [...TIME_TRACKER_RULE_CODES])
    .order('code')

  if (rulesError) {
    console.error('notification_settings_load_failed', rulesError.message)
    return adminErrorResponse('internal_error', 500)
  }

  const existingRules = (rules ?? []) as RuleRow[]
  const existingByCode = new Map(existingRules.map((rule) => [rule.code, rule]))

  if (existingByCode.size !== TIME_TRACKER_RULE_CODES.length) {
    console.error('notification_settings_missing_rules', {
      found: existingByCode.size,
      expected: TIME_TRACKER_RULE_CODES.length,
    })
    return adminErrorResponse('internal_error', 500)
  }

  if (action === 'get_settings') {
    return jsonResponse({
      ok: true,
      settings: TIME_TRACKER_RULE_CODES.map((code) =>
        mapRuleForClient(existingByCode.get(code)!)
      ),
    })
  }

  const parsedSettings = parseSettingsInput(payload)
  if (parsedSettings instanceof Response) return parsedSettings

  for (const item of parsedSettings) {
    const current = existingByCode.get(item.code)
    if (!current) {
      return adminErrorResponse('validation_error', 422)
    }

    const nextOffset = storedOffsetMinutes(current.event_code, item.offset_minutes)

    const { error: updateError } = await serviceClient
      .from('notification_rules')
      .update({
        is_enabled: item.is_enabled,
        offset_minutes: nextOffset,
        updated_at: new Date().toISOString(),
      })
      .eq('id', current.id)
      .eq('code', item.code)

    if (updateError) {
      console.error('notification_settings_update_failed', {
        code: item.code,
        message: updateError.message,
      })
      return adminErrorResponse('internal_error', 500)
    }
  }

  const { data: updatedRules, error: reloadError } = await serviceClient
    .from('notification_rules')
    .select(RULE_SELECT)
    .eq('module_code', 'time_tracker')
    .in('code', [...TIME_TRACKER_RULE_CODES])
    .order('code')

  if (reloadError) {
    return adminErrorResponse('internal_error', 500)
  }

  return jsonResponse({
    ok: true,
    settings: ((updatedRules ?? []) as RuleRow[]).map(mapRuleForClient),
  })
})
