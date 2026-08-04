/** Parse HMAC-authorized controlled scheduler body (shift-scoped). */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const ALLOWED_KEYS = new Set([
  'controlled',
  'shift_ids',
  'employee_ids',
  'run_at',
  'run_id',
  'rule_codes',
  'recipient_employee_ids',
  'suppress_employee_push',
  'escalation_only',
  'escalation_events',
])

export type ControlledSchedulerRun = {
  controlled: true
  shiftIds: string[]
  employeeIds: number[]
  runAt: Date
  runId: string
  ruleCodes: string[] | null
  recipientEmployeeIds: number[] | null
  suppressEmployeePush: boolean
  escalationOnly: boolean
  escalationEvents: Array<'admin_clock_in_escalation' | 'admin_clock_out_escalation'> | null
}

export function isControlledRunEnabled(): boolean {
  return Deno.env.get('TIME_TRACKER_SCHEDULER_CONTROLLED_RUN_ENABLED') === 'true'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseUuidList(value: unknown, field: string): string[] | string {
  if (!Array.isArray(value) || value.length === 0) {
    return `${field}_required`
  }
  if (value.length > 20) return `${field}_too_many`
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || !UUID_RE.test(item.trim())) {
      return `${field}_invalid`
    }
    out.push(item.trim())
  }
  return [...new Set(out)]
}

function parseEmployeeIds(value: unknown, optionalEmpty = false): number[] | string {
  if (value === undefined) return optionalEmpty ? [] : []
  if (!Array.isArray(value)) return 'employee_ids_invalid'
  if (value.length === 0) return optionalEmpty ? [] : 'employee_ids_invalid'
  if (value.length > 20) return 'employee_ids_too_many'
  const out: number[] = []
  for (const item of value) {
    if (!Number.isInteger(item) || Number(item) <= 0) return 'employee_ids_invalid'
    out.push(Number(item))
  }
  return [...new Set(out)]
}

function parseRuleCodes(value: unknown): string[] | null | string {
  if (value === undefined) return null
  if (!Array.isArray(value) || value.length === 0) return 'rule_codes_invalid'
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || !item.startsWith('time_tracker.rule.')) {
      return 'rule_codes_invalid'
    }
    out.push(item.trim())
  }
  return [...new Set(out)]
}

function parseEscalationEvents(
  value: unknown
): Array<'admin_clock_in_escalation' | 'admin_clock_out_escalation'> | null | string {
  if (value === undefined) return null
  if (!Array.isArray(value) || value.length === 0) return 'escalation_events_invalid'
  const out: Array<'admin_clock_in_escalation' | 'admin_clock_out_escalation'> = []
  for (const item of value) {
    if (item !== 'admin_clock_in_escalation' && item !== 'admin_clock_out_escalation') {
      return 'escalation_events_invalid'
    }
    out.push(item)
  }
  return [...new Set(out)]
}

/**
 * Cron body must remain `{}`.
 * Controlled body requires enabled flag + shift_ids + run_at + run_id.
 * recipient_employee_ids / suppress_employee_push only valid here (never in cron).
 */
export function parseSchedulerRequestBody(
  rawBody: Uint8Array
): { mode: 'cron' } | { mode: 'controlled'; run: ControlledSchedulerRun } | { mode: 'error'; code: string } {
  const text = new TextDecoder().decode(rawBody).trim()
  const effective = text === '' ? '{}' : text

  let parsed: unknown
  try {
    parsed = JSON.parse(effective)
  } catch {
    return { mode: 'error', code: 'malformed_json' }
  }

  if (!isPlainObject(parsed)) {
    return { mode: 'error', code: 'validation_error' }
  }

  const keys = Object.keys(parsed)
  if (keys.length === 0) {
    return { mode: 'cron' }
  }

  for (const key of keys) {
    if (!ALLOWED_KEYS.has(key)) {
      return { mode: 'error', code: 'forbidden_field' }
    }
  }

  if (parsed.controlled !== true) {
    return { mode: 'error', code: 'validation_error' }
  }

  if (!isControlledRunEnabled()) {
    return { mode: 'error', code: 'controlled_run_disabled' }
  }

  const shiftIds = parseUuidList(parsed.shift_ids, 'shift_ids')
  if (typeof shiftIds === 'string') {
    return { mode: 'error', code: shiftIds }
  }

  const employeeIds = parseEmployeeIds(parsed.employee_ids, true)
  if (typeof employeeIds === 'string') {
    return { mode: 'error', code: employeeIds }
  }

  const recipientEmployeeIdsRaw = parseEmployeeIds(parsed.recipient_employee_ids, true)
  if (typeof recipientEmployeeIdsRaw === 'string') {
    return { mode: 'error', code: 'recipient_employee_ids_invalid' }
  }

  const ruleCodes = parseRuleCodes(parsed.rule_codes)
  if (typeof ruleCodes === 'string') {
    return { mode: 'error', code: ruleCodes }
  }

  const escalationEvents = parseEscalationEvents(parsed.escalation_events)
  if (typeof escalationEvents === 'string') {
    return { mode: 'error', code: escalationEvents }
  }

  if (typeof parsed.run_at !== 'string' || !parsed.run_at.trim()) {
    return { mode: 'error', code: 'run_at_required' }
  }
  const runAt = new Date(parsed.run_at)
  if (Number.isNaN(runAt.getTime())) {
    return { mode: 'error', code: 'run_at_invalid' }
  }

  if (typeof parsed.run_id !== 'string' || !parsed.run_id.trim()) {
    return { mode: 'error', code: 'run_id_required' }
  }
  const runId = parsed.run_id.trim()
  if (
    runId.length < 8 ||
    runId.length > 80 ||
    !/^(TT-PUSH-E2E|TT-ADMIN-ESC-E2E)-[A-Za-z0-9:_-]+$/.test(runId)
  ) {
    return { mode: 'error', code: 'run_id_invalid' }
  }

  if (parsed.suppress_employee_push != null && typeof parsed.suppress_employee_push !== 'boolean') {
    return { mode: 'error', code: 'validation_error' }
  }
  if (parsed.escalation_only != null && typeof parsed.escalation_only !== 'boolean') {
    return { mode: 'error', code: 'validation_error' }
  }

  return {
    mode: 'controlled',
    run: {
      controlled: true,
      shiftIds,
      employeeIds,
      runAt,
      runId,
      ruleCodes,
      recipientEmployeeIds: recipientEmployeeIdsRaw.length ? recipientEmployeeIdsRaw : null,
      suppressEmployeePush: parsed.suppress_employee_push === true,
      escalationOnly: parsed.escalation_only === true,
      escalationEvents,
    },
  }
}
