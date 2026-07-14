import type { SupabaseClient } from '@supabase/supabase-js'
import {
  dispatchTimeTrackerNotifications,
  type DispatchResult,
  type TimeTrackerRule,
} from './timeTrackerNotificationDispatch.ts'
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
}): Promise<SchedulerResult> {
  const dryRun = params.dryRun ?? false
  const runAtIso = params.runAt.toISOString()

  const rules = params.rulesOverride ?? (await loadEnabledRules(params.serviceClient))

  if (!rules.length) {
    return {
      ok: true,
      status: 'no_enabled_rules',
      runAt: runAtIso,
      dryRun,
      enabledRules: 0,
      result: zeroCounts(),
    }
  }

  const result = await dispatchTimeTrackerNotifications({
    serviceClient: params.serviceClient,
    runAt: params.runAt,
    rules,
    dryRun,
    sender: params.sender,
    shiftIds: params.shiftIds,
  })

  return {
    ok: true,
    status: 'completed',
    runAt: runAtIso,
    dryRun,
    enabledRules: rules.length,
    result,
  }
}
