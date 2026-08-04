import type { SupabaseClient } from '@supabase/supabase-js'
import {
  dispatchTimeTrackerNotifications,
  type DispatchResult,
  type TimeTrackerRule,
} from './timeTrackerNotificationDispatch.ts'
import {
  dispatchAdminEscalations,
  type EscalationDispatchResult,
} from './adminEscalationDispatch.ts'
import type { WebPushSenderFn } from './notificationDelivery.ts'

export const WHITELIST_RULE_CODES = [
  'time_tracker.rule.shift_start_soon',
  'time_tracker.rule.clock_in_missing',
  'time_tracker.rule.shift_end_reached',
  'time_tracker.rule.clock_out_missing',
] as const

const RULE_SELECT =
  'id, code, template_id, module_code, event_code, offset_minutes, repeat_after_minutes, max_attempts, channels, priority'

export type SchedulerStatus = 'completed' | 'no_enabled_rules'

export type SchedulerResult = {
  ok: true
  status: SchedulerStatus
  runAt: string
  dryRun: boolean
  enabledRules: number
  result: DispatchResult
  escalation?: EscalationDispatchResult
}

function zeroCounts(): DispatchResult {
  return {
    scannedShifts: 0,
    matchedEvents: 0,
    createdNotifications: 0,
    skippedDuplicates: 0,
    pushAccepted: 0,
    pushFailed: 0,
    noActiveSubscriptions: 0,
  }
}

async function loadEnabledRules(serviceClient: SupabaseClient): Promise<TimeTrackerRule[]> {
  const { data, error } = await serviceClient
    .from('notification_rules')
    .select(RULE_SELECT)
    .eq('module_code', 'time_tracker')
    .eq('is_enabled', true)
    .eq('trigger_type', 'scheduled')
    .in('code', [...WHITELIST_RULE_CODES])

  if (error) throw new Error('rule_load_error')

  const rows = (data ?? []) as TimeTrackerRule[]
  const allowed = new Set<string>(WHITELIST_RULE_CODES)
  return rows.filter((row) => allowed.has(row.code))
}

export async function runTimeTrackerNotificationScheduler(params: {
  serviceClient: SupabaseClient
  runAt: Date
  dryRun?: boolean
  sender?: WebPushSenderFn
  rulesOverride?: TimeTrackerRule[]
  shiftIds?: string[]
  employeeIds?: number[]
  controlledRunId?: string
  ruleCodesFilter?: string[]
  suppressEmployeePush?: boolean
  controlledRecipientIds?: number[] | null
  escalationEventFilter?: Array<'admin_clock_in_escalation' | 'admin_clock_out_escalation'>
  escalationOnly?: boolean
}): Promise<SchedulerResult> {
  const dryRun = params.dryRun ?? false
  const runAtIso = params.runAt.toISOString()

  let rules = params.rulesOverride ?? (await loadEnabledRules(params.serviceClient))
  if (params.ruleCodesFilter?.length) {
    const allowed = new Set(params.ruleCodesFilter)
    rules = rules.filter((rule) => allowed.has(rule.code))
  }

  let result = zeroCounts()
  if (!params.escalationOnly && !params.suppressEmployeePush && rules.length) {
    result = await dispatchTimeTrackerNotifications({
      serviceClient: params.serviceClient,
      runAt: params.runAt,
      rules,
      dryRun,
      sender: params.sender,
      shiftIds: params.shiftIds,
      employeeIds: params.employeeIds,
      controlledRunId: params.controlledRunId,
    })
  }

  const escalation = await dispatchAdminEscalations({
    serviceClient: params.serviceClient,
    runAt: params.runAt,
    dryRun,
    shiftIds: params.shiftIds,
    employeeIds: params.employeeIds,
    controlledRunId: params.controlledRunId,
    controlledRecipientIds: params.controlledRecipientIds,
    eventFilter: params.escalationEventFilter,
  })

  const hasWork =
    rules.length > 0 ||
    escalation.matchedEscalations > 0 ||
    escalation.createdViolations > 0 ||
    Boolean(params.escalationOnly)

  return {
    ok: true,
    status: hasWork || escalation.scannedShifts >= 0 ? 'completed' : 'no_enabled_rules',
    runAt: runAtIso,
    dryRun,
    enabledRules: rules.length,
    result,
    escalation,
  }
}
