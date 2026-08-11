import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverNotificationToSubscription } from './notificationDelivery.ts'
import { sendWebPush } from './webPushSender.ts'
import { buildWebPushPayload } from './webPushPayload.ts'
import { getCurrentServerVapidFingerprint } from './vapidFingerprint.ts'
import { loadCurrentVapidPushSubscriptions } from './pushSubscriptionSelection.ts'
import {
  addDaysToDateKey,
  getDateKeyInTimezone,
  type ShiftWithEmployee,
} from './timeTrackerNotificationDispatch.ts'
import {
  DEFAULT_ESCALATION_SETTINGS,
  buildAdminEscalationDedupeKey,
  buildViolationActionUrl,
  evaluateAdminEscalation,
  formatAlmatyHm,
  renderEscalationTemplate,
  type EscalationSettings,
} from './adminEscalationLogic.ts'
import { resolveAdminEscalationRecipients } from './adminEscalationRecipients.ts'

export type EscalationDispatchResult = {
  scannedShifts: number
  matchedEscalations: number
  createdViolations: number
  createdNotifications: number
  skippedDuplicates: number
  skippedResolved: number
  pushAccepted: number
  pushFailed: number
  noCurrentSubscription: number
}

type TemplateRow = {
  id: string
  code: string
  title_template: string
  body_template: string
  default_action_url: string | null
}

function zeroResult(): EscalationDispatchResult {
  return {
    scannedShifts: 0,
    matchedEscalations: 0,
    createdViolations: 0,
    createdNotifications: 0,
    skippedDuplicates: 0,
    skippedResolved: 0,
    pushAccepted: 0,
    pushFailed: 0,
    noCurrentSubscription: 0,
  }
}

async function loadSettings(serviceClient: SupabaseClient): Promise<EscalationSettings> {
  const { data, error } = await serviceClient
    .from('time_tracker_escalation_settings')
    .select(
      'is_enabled, clock_in_delay_minutes, clock_out_delay_minutes, recipient_mode, fallback_employee_ids, push_enabled, in_app_enabled'
    )
    .eq('id', 1)
    .maybeSingle()

  if (error || !data) return { ...DEFAULT_ESCALATION_SETTINGS }

  return {
    is_enabled: Boolean(data.is_enabled),
    clock_in_delay_minutes: Number(data.clock_in_delay_minutes) || 15,
    clock_out_delay_minutes: Number(data.clock_out_delay_minutes) || 20,
    recipient_mode: data.recipient_mode === 'duty' ? 'duty' : 'duty_with_fallback',
    fallback_employee_ids: Array.isArray(data.fallback_employee_ids)
      ? data.fallback_employee_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [],
    push_enabled: data.push_enabled !== false,
    in_app_enabled: data.in_app_enabled !== false,
  }
}

async function loadShiftsForEscalation(
  serviceClient: SupabaseClient,
  runAt: Date,
  shiftIds?: string[],
  employeeIds?: number[]
): Promise<ShiftWithEmployee[]> {
  const todayKey = getDateKeyInTimezone(runAt)
  const startDate = addDaysToDateKey(todayKey, -1)
  const endDate = addDaysToDateKey(todayKey, 1)

  let query = serviceClient
    .from('academy_employee_shifts')
    .select(
      'id, employee_id, shift_date, status, planned_start_time, planned_end_time, actual_start_time, actual_end_time'
    )
    .gte('shift_date', startDate)
    .lte('shift_date', endDate)

  if (shiftIds?.length) query = query.in('id', shiftIds)

  const { data: shiftRows, error } = await query
  if (error) throw new Error(`escalation_shift_load_error:${error.message}`)

  let rows = shiftRows ?? []
  if (employeeIds?.length) {
    const allowed = new Set(employeeIds)
    rows = rows.filter((row) => allowed.has(row.employee_id))
  }

  const ids = [...new Set(rows.map((row) => row.employee_id))]
  if (!ids.length) return []

  const { data: employees, error: empError } = await serviceClient
    .from('academy_users')
    .select('id, status, auth_user_id, full_name, first_name, last_name, position')
    .in('id', ids)

  if (empError) throw new Error('escalation_employee_load_error')

  const byId = new Map((employees ?? []).map((row) => [row.id, row]))

  return rows.map((row) => {
    const employee = byId.get(row.employee_id)
    return {
      ...row,
      employee_status: employee?.status ?? '',
      auth_user_id: employee?.auth_user_id ?? null,
      employee_name:
        employee?.full_name ||
        [employee?.first_name, employee?.last_name].filter(Boolean).join(' ') ||
        `Сотрудник #${row.employee_id}`,
      position_name: employee?.position ?? null,
    } as ShiftWithEmployee & { employee_name: string; position_name: string | null }
  })
}

async function countEmployeeAttempts(
  serviceClient: SupabaseClient,
  employeeId: number,
  shiftId: string,
  eventCode: string
): Promise<number> {
  const prefix = `time_tracker:${eventCode}:${employeeId}:${shiftId}`
  const { data, error } = await serviceClient
    .from('notifications')
    .select('id')
    .eq('employee_id', employeeId)
    .like('deduplication_key', `${prefix}%`)

  if (error) return 0
  return data?.length ?? 0
}

async function loadExistingViolationTypes(
  serviceClient: SupabaseClient,
  shiftId: string
): Promise<Set<'clock_in' | 'clock_out'>> {
  const { data } = await serviceClient
    .from('time_tracker_violations')
    .select('violation_type, status')
    .eq('shift_id', shiftId)

  const set = new Set<'clock_in' | 'clock_out'>()
  for (const row of data ?? []) {
    if (row.violation_type === 'clock_in' || row.violation_type === 'clock_out') {
      set.add(row.violation_type)
    }
  }
  return set
}

async function resolveOpenViolations(serviceClient: SupabaseClient, shifts: ShiftWithEmployee[]) {
  for (const shift of shifts) {
    if (shift.actual_start_time) {
      await serviceClient
        .from('time_tracker_violations')
        .update({
          status: 'resolved',
          actual_at: shift.actual_start_time,
          resolved_at: new Date().toISOString(),
        })
        .eq('shift_id', shift.id)
        .eq('violation_type', 'clock_in')
        .eq('status', 'active')
    }
    if (shift.actual_end_time) {
      await serviceClient
        .from('time_tracker_violations')
        .update({
          status: 'resolved',
          actual_at: shift.actual_end_time,
          resolved_at: new Date().toISOString(),
        })
        .eq('shift_id', shift.id)
        .eq('violation_type', 'clock_out')
        .eq('status', 'active')
    }
  }
}

export async function dispatchAdminEscalations(params: {
  serviceClient: SupabaseClient
  runAt: Date
  dryRun?: boolean
  shiftIds?: string[]
  employeeIds?: number[]
  controlledRunId?: string
  controlledRecipientIds?: number[] | null
  eventFilter?: Array<'admin_clock_in_escalation' | 'admin_clock_out_escalation'>
}): Promise<EscalationDispatchResult> {
  const result = zeroResult()
  const settings = await loadSettings(params.serviceClient)
  if (!settings.is_enabled && !params.controlledRunId) return result

  const effectiveSettings = params.controlledRunId
    ? { ...settings, is_enabled: true }
    : settings

  const shifts = await loadShiftsForEscalation(
    params.serviceClient,
    params.runAt,
    params.shiftIds,
    params.employeeIds
  )
  result.scannedShifts = shifts.length

  await resolveOpenViolations(params.serviceClient, shifts)

  const { data: templates } = await params.serviceClient
    .from('notification_templates')
    .select('id, code, title_template, body_template, default_action_url')
    .in('code', [
      'time_tracker.admin_clock_in_escalation',
      'time_tracker.admin_clock_out_escalation',
    ])

  const templateByEvent = new Map<string, TemplateRow>()
  for (const row of (templates ?? []) as TemplateRow[]) {
    if (row.code.includes('clock_in')) templateByEvent.set('admin_clock_in_escalation', row)
    if (row.code.includes('clock_out')) templateByEvent.set('admin_clock_out_escalation', row)
  }

  const currentFingerprint = await getCurrentServerVapidFingerprint()
  const loadedSubs = await loadCurrentVapidPushSubscriptions(params.serviceClient)

  for (const shift of shifts) {
    const existingTypes = await loadExistingViolationTypes(params.serviceClient, shift.id)
    const clockInAttempts = await countEmployeeAttempts(
      params.serviceClient,
      shift.employee_id,
      shift.id,
      'clock_in_missing'
    )
    const clockOutAttempts = await countEmployeeAttempts(
      params.serviceClient,
      shift.employee_id,
      shift.id,
      'clock_out_missing'
    )

    const match = evaluateAdminEscalation({
      shift,
      employeeStatus: shift.employee_status,
      runAt: params.runAt,
      settings: effectiveSettings,
      existingClockInAttempts: clockInAttempts,
      existingClockOutAttempts: clockOutAttempts,
      existingViolationTypes: existingTypes,
    })

    if (!match) continue
    if (params.eventFilter?.length && !params.eventFilter.includes(match.eventCode)) continue

    // Race cancel: re-read shift before create
    const { data: fresh } = await params.serviceClient
      .from('academy_employee_shifts')
      .select('actual_start_time, actual_end_time, status')
      .eq('id', shift.id)
      .maybeSingle()

    if (!fresh || fresh.status !== 'working') {
      result.skippedResolved += 1
      continue
    }
    if (match.violationType === 'clock_in' && fresh.actual_start_time) {
      result.skippedResolved += 1
      continue
    }
    if (match.violationType === 'clock_out' && fresh.actual_end_time) {
      result.skippedResolved += 1
      continue
    }

    result.matchedEscalations += 1

    if (params.dryRun) continue

    const employeeName =
      (shift as ShiftWithEmployee & { employee_name?: string }).employee_name ||
      `Сотрудник #${shift.employee_id}`
    const positionName =
      (shift as ShiftWithEmployee & { position_name?: string | null }).position_name || ''

    const recipients = await resolveAdminEscalationRecipients({
      serviceClient: params.serviceClient,
      violatorEmployeeId: shift.employee_id,
      violationAt: match.thresholdAt,
      settings: effectiveSettings,
      controlledRecipientIds: params.controlledRecipientIds,
    })

    const employeePushNote =
      clockInAttempts + clockOutAttempts === 0
        ? 'employee_reminders_missing_or_no_subscription'
        : 'employee_reminders_present'

    const { data: violation, error: violationError } = await params.serviceClient
      .from('time_tracker_violations')
      .insert({
        shift_id: shift.id,
        employee_id: shift.employee_id,
        violation_type: match.violationType,
        shift_date: shift.shift_date,
        planned_at: match.plannedAt.toISOString(),
        delay_minutes: match.delayMinutes,
        status: 'active',
        notified_admin_ids: recipients.map((row) => row.employee_id),
        employee_push_note: employeePushNote,
        metadata: {
          event_code: match.eventCode,
          controlled_run_id: params.controlledRunId ?? null,
          recipient_sources: recipients.map((row) => row.source),
        },
      })
      .select('id')
      .maybeSingle()

    if (violationError) {
      if (violationError.code === '23505') {
        result.skippedDuplicates += 1
        continue
      }
      throw new Error(`violation_insert_error:${violationError.message}`)
    }

    result.createdViolations += 1

    const template = templateByEvent.get(match.eventCode)
    if (!template) continue
    if (!effectiveSettings.in_app_enabled && !effectiveSettings.push_enabled) continue

    const plannedLabel = formatAlmatyHm(match.plannedAt)
    const context = {
      employee_name: employeeName,
      planned_start_time: plannedLabel,
      planned_end_time: plannedLabel,
      delay_minutes: match.delayMinutes,
      position: positionName,
    }

    const title = renderEscalationTemplate(template.title_template, context)
    const body = renderEscalationTemplate(template.body_template, context)
    const actionUrl = buildViolationActionUrl({
      employeeId: shift.employee_id,
      shiftId: shift.id,
      violationType: match.violationType,
    })

    let acceptedTotal = 0
    let failedTotal = 0
    let noSubTotal = 0

    for (const recipient of recipients) {
      const dedupe = buildAdminEscalationDedupeKey(
        match.eventCode,
        shift.id,
        recipient.employee_id
      )

      const { data: existing } = await params.serviceClient
        .from('notifications')
        .select('id')
        .eq('deduplication_key', dedupe)
        .maybeSingle()

      if (existing?.id) {
        result.skippedDuplicates += 1
        continue
      }

      const { data: notification, error: notificationError } = await params.serviceClient
        .from('notifications')
        .insert({
          employee_id: recipient.employee_id,
          auth_user_id: recipient.auth_user_id,
          module_code: 'time_tracker',
          event_code: match.eventCode,
          title,
          body,
          action_url: actionUrl,
          priority: 'high',
          status: 'processing',
          deduplication_key: dedupe,
          metadata: {
            source: 'time_tracker_admin_escalation',
            violation_id: violation?.id ?? null,
            violator_employee_id: shift.employee_id,
            shift_id: shift.id,
            violation_type: match.violationType,
            recipient_source: recipient.source,
            controlled_run_id: params.controlledRunId ?? null,
            employee_push_note: employeePushNote,
          },
        })
        .select('id')
        .single()

      if (notificationError) {
        if (notificationError.code === '23505') {
          result.skippedDuplicates += 1
          continue
        }
        throw new Error(`escalation_notification_insert_error:${notificationError.message}`)
      }

      result.createdNotifications += 1

      if (!effectiveSettings.push_enabled || !currentFingerprint) {
        await params.serviceClient
          .from('notifications')
          .update({
            status: 'dispatched',
            metadata: {
              source: 'time_tracker_admin_escalation',
              violation_id: violation?.id ?? null,
              web_push_outcome: 'push_disabled',
            },
          })
          .eq('id', notification.id)
        continue
      }

      const subs = loadedSubs.current.filter((sub) => sub.employee_id === recipient.employee_id)
      if (!subs.length) {
        noSubTotal += 1
        result.noCurrentSubscription += 1
        await params.serviceClient
          .from('notifications')
          .update({
            status: 'dispatched',
            metadata: {
              source: 'time_tracker_admin_escalation',
              violation_id: violation?.id ?? null,
              violator_employee_id: shift.employee_id,
              shift_id: shift.id,
              web_push_outcome: 'no_current_subscription',
              controlled_run_id: params.controlledRunId ?? null,
            },
          })
          .eq('id', notification.id)
        continue
      }

      let accepted = 0
      let failed = 0
      const requestId = crypto.randomUUID()

      for (const subscription of subs) {
        const delivery = await deliverNotificationToSubscription({
          serviceClient: params.serviceClient,
          notification: {
            id: notification.id,
            title,
            body,
            action_url: actionUrl,
          },
          subscription,
          requestId,
          attemptNumber: 1,
          sender: sendWebPush,
          updateNotificationStatus: false,
          buildPayload: (notificationId, reqId) =>
            buildWebPushPayload({
              title,
              body,
              url: actionUrl,
              type: match.eventCode,
              tag: `esc-${reqId.replace(/-/g, '').slice(0, 8)}`,
              notificationId,
              requestId: reqId,
            }),
        })
        if (delivery.status === 'accepted') accepted += 1
        else failed += 1
      }

      acceptedTotal += accepted
      failedTotal += failed
      result.pushAccepted += accepted
      result.pushFailed += failed

      const outcome =
        accepted > 0 && failed > 0 ? 'partial' : accepted > 0 ? 'accepted' : 'failed'

      await params.serviceClient
        .from('notifications')
        .update({
          status: accepted > 0 ? 'dispatched' : 'failed',
          metadata: {
            source: 'time_tracker_admin_escalation',
            violation_id: violation?.id ?? null,
            violator_employee_id: shift.employee_id,
            shift_id: shift.id,
            violation_type: match.violationType,
            web_push_outcome: outcome,
            web_push_accepted_count: accepted,
            web_push_failed_count: failed,
            controlled_run_id: params.controlledRunId ?? null,
          },
        })
        .eq('id', notification.id)
    }

    const violationOutcome =
      acceptedTotal > 0 && (failedTotal > 0 || noSubTotal > 0)
        ? 'partial'
        : acceptedTotal > 0
          ? 'accepted'
          : noSubTotal > 0 && acceptedTotal === 0
            ? 'no_current_subscription'
            : 'failed'

    if (violation?.id) {
      await params.serviceClient
        .from('time_tracker_violations')
        .update({ web_push_outcome: violationOutcome })
        .eq('id', violation.id)
    }
  }

  return result
}
