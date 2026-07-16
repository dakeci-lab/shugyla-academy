import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverNotificationToSubscription, type WebPushSenderFn } from './notificationDelivery.ts'
import { sendWebPush } from './webPushSender.ts'
import { buildTimeTrackerPushPayload } from './webPushPayload.ts'
import { getCurrentServerVapidFingerprint } from './vapidFingerprint.ts'

export const APP_TIMEZONE = 'Asia/Almaty'

const ACTIVE_EMPLOYEE_STATUS = 'active'
const REPEAT_EVENT_CODES = new Set(['clock_in_missing', 'clock_out_missing'])

export type ShiftRow = {
  id: string
  employee_id: number
  shift_date: string
  status: string
  planned_start_time: string | null
  planned_end_time: string | null
  actual_start_time: string | null
  actual_end_time: string | null
}

export type ShiftWithEmployee = ShiftRow & {
  employee_status: string
  auth_user_id?: string | null
}

export type PlannedShiftWindow = {
  plannedStartAt: Date
  plannedEndAt: Date
}

export type TimeTrackerRule = {
  id: string
  code: string
  template_id: string
  module_code: string
  event_code: string
  offset_minutes: number
  repeat_after_minutes: number | null
  max_attempts: number
  priority: string
  channels: string[]
}

export type NotificationTemplate = {
  id: string
  code: string
  title_template: string
  body_template: string
  default_action_url: string | null
  default_priority: string
}

export type ExistingAttempt = {
  attempt: number
  createdAt: Date
}

export type RuleMatch = {
  ruleCode: string
  eventCode: string
  attempt: number
  deduplicationKey: string
  templateId: string
  minutesUntilStart?: number
  scheduledFor: Date
}

export type DispatchResult = {
  scannedShifts: number
  matchedEvents: number
  createdNotifications: number
  skippedDuplicates: number
  pushAccepted: number
  pushFailed: number
  noActiveSubscriptions: number
}

function parseTimeParts(time: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return { hours, minutes }
}

function formatTimeValue(time: string | null): string | null {
  if (!time) return null
  const parts = parseTimeParts(time)
  if (!parts) return null
  return `${String(parts.hours).padStart(2, '0')}:${String(parts.minutes).padStart(2, '0')}`
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

export function getDateKeyInTimezone(date: Date, timeZone = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function zonedDateTimeToUtc(dateKey: string, hours: number, minutes: number): Date | null {
  const [y, m, d] = dateKey.split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  const iso = `${y}-${pad(m)}-${pad(d)}T${pad(hours)}:${pad(minutes)}:00+05:00`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

function isShiftEndingAtMidnight(plannedStartTime: string | null, plannedEndTime: string | null): boolean {
  const end = formatTimeValue(plannedEndTime)
  const start = formatTimeValue(plannedStartTime)
  return end === '00:00' && Boolean(start) && start !== '00:00'
}

export function buildPlannedShiftWindow(shift: ShiftRow): PlannedShiftWindow | null {
  const startParts = shift.planned_start_time ? parseTimeParts(shift.planned_start_time) : null
  const endParts = shift.planned_end_time ? parseTimeParts(shift.planned_end_time) : null
  if (!startParts || !endParts) return null

  const plannedStartAt = zonedDateTimeToUtc(shift.shift_date, startParts.hours, startParts.minutes)
  if (!plannedStartAt) return null

  let endDateKey = shift.shift_date
  if (isShiftEndingAtMidnight(shift.planned_start_time, shift.planned_end_time)) {
    endDateKey = addDaysToDateKey(shift.shift_date, 1)
  } else {
    const startMinutes = startParts.hours * 60 + startParts.minutes
    const endMinutes = endParts.hours * 60 + endParts.minutes
    if (endMinutes <= startMinutes) {
      endDateKey = addDaysToDateKey(shift.shift_date, 1)
    }
  }

  const plannedEndAt = zonedDateTimeToUtc(endDateKey, endParts.hours, endParts.minutes)
  if (!plannedEndAt) return null

  return { plannedStartAt, plannedEndAt }
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

function hasActualStart(shift: ShiftRow): boolean {
  return shift.actual_start_time != null && shift.actual_start_time !== ''
}

function hasActualEnd(shift: ShiftRow): boolean {
  return shift.actual_end_time != null && shift.actual_end_time !== ''
}

export function buildDeduplicationKey(
  eventCode: string,
  employeeId: number,
  shiftId: string,
  attempt?: number
): string {
  const base = `time_tracker:${eventCode}:${employeeId}:${shiftId}`
  if (attempt !== undefined && REPEAT_EVENT_CODES.has(eventCode)) {
    return `${base}:a${attempt}`
  }
  return base
}

function parseAttemptFromDedupeKey(deduplicationKey: string, eventCode: string): number {
  if (!REPEAT_EVENT_CODES.has(eventCode)) return 1
  const match = /:a(\d+)$/.exec(deduplicationKey)
  return match ? Number(match[1]) : 1
}

function resolveNextAttempt(
  rule: TimeTrackerRule,
  runAt: Date,
  thresholdAt: Date,
  existingAttempts: ExistingAttempt[]
): number | null {
  const maxAttempts = rule.max_attempts ?? 1
  if (existingAttempts.length >= maxAttempts) return null

  const nextAttempt = existingAttempts.length + 1
  if (runAt.getTime() < thresholdAt.getTime()) return null

  if (nextAttempt === 1) return 1

  const repeatAfterMinutes = rule.repeat_after_minutes ?? 0
  const lastAttempt = existingAttempts[existingAttempts.length - 1]
  const minNextAt = addMinutes(lastAttempt.createdAt, repeatAfterMinutes)
  if (runAt.getTime() < minNextAt.getTime()) return null

  return nextAttempt
}

export function evaluateTimeTrackerRule(params: {
  shift: ShiftWithEmployee
  rule: TimeTrackerRule
  window: PlannedShiftWindow
  runAt: Date
  existingAttempts: ExistingAttempt[]
}): RuleMatch | null {
  const { shift, rule, window, runAt, existingAttempts } = params

  if (shift.status !== 'working') return null
  if (shift.employee_status !== ACTIVE_EMPLOYEE_STATUS) return null
  if (hasActualEnd(shift)) return null

  const eventCode = rule.event_code
  const offsetMinutes = rule.offset_minutes ?? 0

  if (eventCode === 'shift_start_soon') {
    if (hasActualStart(shift)) return null
    const windowStart = addMinutes(window.plannedStartAt, offsetMinutes)
    if (runAt.getTime() < windowStart.getTime()) return null
    if (runAt.getTime() >= window.plannedStartAt.getTime()) return null

    const minutesUntilStart = Math.max(
      0,
      Math.ceil((window.plannedStartAt.getTime() - runAt.getTime()) / 60_000)
    )

    return {
      ruleCode: rule.code,
      eventCode,
      attempt: 1,
      deduplicationKey: buildDeduplicationKey(eventCode, shift.employee_id, shift.id),
      templateId: rule.template_id,
      minutesUntilStart,
      scheduledFor: window.plannedStartAt,
    }
  }

  if (eventCode === 'clock_in_missing') {
    if (hasActualStart(shift)) return null
    const thresholdAt = addMinutes(window.plannedStartAt, offsetMinutes)
    const attempt = resolveNextAttempt(rule, runAt, thresholdAt, existingAttempts)
    if (!attempt) return null

    return {
      ruleCode: rule.code,
      eventCode,
      attempt,
      deduplicationKey: buildDeduplicationKey(eventCode, shift.employee_id, shift.id, attempt),
      templateId: rule.template_id,
      scheduledFor: thresholdAt,
    }
  }

  if (eventCode === 'shift_end_reached') {
    if (!hasActualStart(shift)) return null
    if (hasActualEnd(shift)) return null
    const thresholdAt = addMinutes(window.plannedEndAt, offsetMinutes)
    if (runAt.getTime() < thresholdAt.getTime()) return null

    return {
      ruleCode: rule.code,
      eventCode,
      attempt: 1,
      deduplicationKey: buildDeduplicationKey(eventCode, shift.employee_id, shift.id),
      templateId: rule.template_id,
      scheduledFor: thresholdAt,
    }
  }

  if (eventCode === 'clock_out_missing') {
    if (!hasActualStart(shift)) return null
    if (hasActualEnd(shift)) return null
    const thresholdAt = addMinutes(window.plannedEndAt, offsetMinutes)
    const attempt = resolveNextAttempt(rule, runAt, thresholdAt, existingAttempts)
    if (!attempt) return null

    return {
      ruleCode: rule.code,
      eventCode,
      attempt,
      deduplicationKey: buildDeduplicationKey(eventCode, shift.employee_id, shift.id, attempt),
      templateId: rule.template_id,
      scheduledFor: thresholdAt,
    }
  }

  return null
}

function renderTemplate(template: string, context: { minutes?: number }): string {
  return template.replace(/\{\{minutes\}\}/g, String(context.minutes ?? 0))
}

function isDuplicateKeyError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '23505') return true
  return (error.message ?? '').toLowerCase().includes('duplicate')
}

async function loadTemplates(
  serviceClient: SupabaseClient,
  rules: TimeTrackerRule[]
): Promise<Map<string, NotificationTemplate>> {
  const templateIds = [...new Set(rules.map((rule) => rule.template_id))]
  const { data, error } = await serviceClient
    .from('notification_templates')
    .select('id, code, title_template, body_template, default_action_url, default_priority')
    .in('id', templateIds)

  if (error) throw new Error('template_load_error')

  const map = new Map<string, NotificationTemplate>()
  for (const row of data ?? []) {
    map.set(row.id, row as NotificationTemplate)
  }
  return map
}

async function loadShifts(
  serviceClient: SupabaseClient,
  runAt: Date
): Promise<ShiftWithEmployee[]> {
  const todayKey = getDateKeyInTimezone(runAt)
  const startDate = addDaysToDateKey(todayKey, -1)
  const endDate = addDaysToDateKey(todayKey, 1)

  const { data: shiftRows, error: shiftError } = await serviceClient
    .from('academy_employee_shifts')
    .select(`
      id,
      employee_id,
      shift_date,
      status,
      planned_start_time,
      planned_end_time,
      actual_start_time,
      actual_end_time
    `)
    .gte('shift_date', startDate)
    .lte('shift_date', endDate)

  if (shiftError) throw new Error(`shift_load_error:${shiftError.message}`)

  const employeeIds = [...new Set((shiftRows ?? []).map((row) => row.employee_id))]
  if (!employeeIds.length) return []

  const { data: employees, error: employeeError } = await serviceClient
    .from('academy_users')
    .select('id, status, auth_user_id')
    .in('id', employeeIds)

  if (employeeError) throw new Error(`employee_load_error:${employeeError.message}`)

  const employeeById = new Map(
    (employees ?? []).map((employee) => [employee.id, employee])
  )

  return (shiftRows ?? []).map((row) => {
    const employee = employeeById.get(row.employee_id)
    return {
      id: row.id,
      employee_id: row.employee_id,
      shift_date: row.shift_date,
      status: row.status,
      planned_start_time: row.planned_start_time,
      planned_end_time: row.planned_end_time,
      actual_start_time: row.actual_start_time,
      actual_end_time: row.actual_end_time,
      employee_status: employee?.status ?? '',
      auth_user_id: employee?.auth_user_id ?? null,
    } satisfies ShiftWithEmployee
  })
}

async function loadExistingAttempts(
  serviceClient: SupabaseClient,
  employeeId: number,
  shiftId: string,
  eventCode: string
): Promise<ExistingAttempt[]> {
  const prefix = `time_tracker:${eventCode}:${employeeId}:${shiftId}`
  const { data, error } = await serviceClient
    .from('notifications')
    .select('deduplication_key, created_at')
    .eq('employee_id', employeeId)
    .like('deduplication_key', `${prefix}%`)

  if (error) throw new Error('attempt_load_error')

  return (data ?? [])
    .map((row) => ({
      attempt: parseAttemptFromDedupeKey(row.deduplication_key, eventCode),
      createdAt: new Date(row.created_at),
    }))
    .sort((a, b) => a.attempt - b.attempt)
}

export async function dispatchTimeTrackerNotifications(params: {
  serviceClient: SupabaseClient
  runAt: Date
  rules: TimeTrackerRule[]
  dryRun?: boolean
  sender?: WebPushSenderFn
  shiftIds?: string[]
}): Promise<DispatchResult> {
  const dryRun = params.dryRun ?? false
  const sender = params.sender ?? sendWebPush
  const result: DispatchResult = {
    scannedShifts: 0,
    matchedEvents: 0,
    createdNotifications: 0,
    skippedDuplicates: 0,
    pushAccepted: 0,
    pushFailed: 0,
    noActiveSubscriptions: 0,
  }

  const templates = await loadTemplates(params.serviceClient, params.rules)
  let shifts = await loadShifts(params.serviceClient, params.runAt)
  if (params.shiftIds?.length) {
    const allowed = new Set(params.shiftIds)
    shifts = shifts.filter((shift) => allowed.has(shift.id))
  }

  result.scannedShifts = shifts.length

  for (const shift of shifts) {
    const window = buildPlannedShiftWindow(shift)
    if (!window) continue

    for (const rule of params.rules) {
      const existingAttempts = REPEAT_EVENT_CODES.has(rule.event_code)
        ? await loadExistingAttempts(params.serviceClient, shift.employee_id, shift.id, rule.event_code)
        : []

      const match = evaluateTimeTrackerRule({
        shift,
        rule,
        window,
        runAt: params.runAt,
        existingAttempts,
      })

      if (!match) continue
      result.matchedEvents += 1

      if (dryRun) continue

      const { data: existingNotification } = await params.serviceClient
        .from('notifications')
        .select('id')
        .eq('deduplication_key', match.deduplicationKey)
        .maybeSingle()

      if (existingNotification?.id) {
        result.skippedDuplicates += 1
        continue
      }

      const template = templates.get(match.templateId)
      if (!template) continue

      const title = renderTemplate(template.title_template, { minutes: match.minutesUntilStart })
      const body = renderTemplate(template.body_template, { minutes: match.minutesUntilStart })

      const { data: notification, error: insertError } = await params.serviceClient
        .from('notifications')
        .insert({
          employee_id: shift.employee_id,
          auth_user_id: shift.auth_user_id ?? null,
          template_id: match.templateId,
          rule_id: rule.id,
          module_code: rule.module_code,
          event_code: match.eventCode,
          title,
          body,
          action_url: template.default_action_url,
          priority: rule.priority ?? template.default_priority,
          status: 'processing',
          deduplication_key: match.deduplicationKey,
          metadata: {
            source: 'time_tracker_dispatcher',
            shift_id: shift.id,
            rule_code: match.ruleCode,
            attempt: match.attempt,
            scheduled_for: match.scheduledFor.toISOString(),
          },
        })
        .select('id, title, body, action_url')
        .single()

      if (insertError) {
        if (isDuplicateKeyError(insertError)) {
          result.skippedDuplicates += 1
          continue
        }
        throw new Error('notification_create_error')
      }

      if (!notification?.id) continue
      result.createdNotifications += 1

      const { data: subscriptions, error: subscriptionError } = await params.serviceClient
        .from('notification_push_subscriptions')
        .select('id, endpoint, p256dh_key, auth_key, failure_count, vapid_key_fingerprint')
        .eq('employee_id', shift.employee_id)
        .eq('is_active', true)
        .eq('permission_status', 'granted')

      if (subscriptionError) throw new Error('subscription_load_error')

      const currentVapidFingerprint = await getCurrentServerVapidFingerprint()
      const deliverableSubscriptions = (subscriptions ?? []).filter(
        (subscription) =>
          currentVapidFingerprint &&
          subscription.vapid_key_fingerprint === currentVapidFingerprint
      )

      if (!deliverableSubscriptions.length) {
        result.noActiveSubscriptions += 1
        await params.serviceClient
          .from('notifications')
          .update({ status: 'dispatched' })
          .eq('id', notification.id)
        continue
      }

      const requestId = crypto.randomUUID()
      let acceptedCount = 0
      let failedCount = 0

      for (const subscription of deliverableSubscriptions) {
        const delivery = await deliverNotificationToSubscription({
          serviceClient: params.serviceClient,
          notification,
          subscription,
          requestId,
          attemptNumber: match.attempt,
          sender,
          buildPayload: (notificationId, reqId) =>
            buildTimeTrackerPushPayload(notificationId, reqId, notification),
          updateNotificationStatus: false,
        })

        if (delivery.status === 'accepted') {
          acceptedCount += 1
        } else {
          failedCount += 1
        }
      }

      result.pushAccepted += acceptedCount
      result.pushFailed += failedCount

      const finalStatus =
        failedCount > 0 && acceptedCount === 0
          ? 'failed'
          : 'dispatched'

      await params.serviceClient
        .from('notifications')
        .update({ status: finalStatus })
        .eq('id', notification.id)
    }
  }

  return result
}
