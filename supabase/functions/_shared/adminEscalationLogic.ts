/** Pure evaluation for admin time-tracker escalations. */

import {
  buildPlannedShiftWindow,
  type PlannedShiftWindow,
  type ShiftRow,
} from './timeTrackerNotificationDispatch.ts'

export type EscalationSettings = {
  is_enabled: boolean
  clock_in_delay_minutes: number
  clock_out_delay_minutes: number
  recipient_mode: 'duty' | 'duty_with_fallback'
  fallback_employee_ids: number[]
  push_enabled: boolean
  in_app_enabled: boolean
}

export type EscalationMatch = {
  violationType: 'clock_in' | 'clock_out'
  eventCode: 'admin_clock_in_escalation' | 'admin_clock_out_escalation'
  plannedAt: Date
  delayMinutes: number
  thresholdAt: Date
  employeeRemindersExhausted: boolean
}

export const DEFAULT_ESCALATION_SETTINGS: EscalationSettings = {
  is_enabled: true,
  clock_in_delay_minutes: 15,
  clock_out_delay_minutes: 20,
  recipient_mode: 'duty_with_fallback',
  fallback_employee_ids: [],
  push_enabled: true,
  in_app_enabled: true,
}

const NON_WORKING = new Set(['day_off', 'vacation', 'sick_leave', 'absence'])

export function isWorkingShiftStatus(status: string | null | undefined): boolean {
  return status === 'working'
}

export function isExcludedShiftStatus(status: string | null | undefined): boolean {
  return Boolean(status && NON_WORKING.has(status))
}

export function buildAdminEscalationDedupeKey(
  eventCode: string,
  shiftId: string,
  recipientEmployeeId: number
): string {
  return `${eventCode}:${shiftId}:${recipientEmployeeId}`
}

export function buildViolationActionUrl(params: {
  employeeId: number
  shiftId: string
  violationType: 'clock_in' | 'clock_out'
}): string {
  const violation = params.violationType === 'clock_in' ? 'clock_in' : 'clock_out'
  return `/platform?employee=${params.employeeId}&shift=${params.shiftId}&violation=${violation}`
}

function hasActualStart(shift: ShiftRow): boolean {
  return shift.actual_start_time != null && shift.actual_start_time !== ''
}

function hasActualEnd(shift: ShiftRow): boolean {
  return shift.actual_end_time != null && shift.actual_end_time !== ''
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

/**
 * Employee reminders are considered exhausted when either:
 * - two clock_in_missing / clock_out_missing notifications already exist, or
 * - enough time has passed that both reminders should have fired
 *   (clock_in: offset 5 + repeat 10 → second at +15; clock_out: 10 + 10 → second at +20).
 */
export function evaluateAdminEscalation(params: {
  shift: ShiftRow
  employeeStatus: string
  runAt: Date
  settings: EscalationSettings
  existingClockInAttempts: number
  existingClockOutAttempts: number
  existingViolationTypes: Set<'clock_in' | 'clock_out'>
}): EscalationMatch | null {
  const { shift, employeeStatus, runAt, settings } = params
  if (!settings.is_enabled) return null
  if (employeeStatus !== 'active') return null
  if (!isWorkingShiftStatus(shift.status)) return null
  if (isExcludedShiftStatus(shift.status)) return null

  const window = buildPlannedShiftWindow(shift)
  if (!window) return null

  const clockInMatch = evaluateClockInEscalation({
    shift,
    window,
    runAt,
    delayMinutes: settings.clock_in_delay_minutes,
    existingAttempts: params.existingClockInAttempts,
    alreadyEscalated: params.existingViolationTypes.has('clock_in'),
  })
  if (clockInMatch) return clockInMatch

  return evaluateClockOutEscalation({
    shift,
    window,
    runAt,
    delayMinutes: settings.clock_out_delay_minutes,
    existingAttempts: params.existingClockOutAttempts,
    alreadyEscalated: params.existingViolationTypes.has('clock_out'),
  })
}

function evaluateClockInEscalation(params: {
  shift: ShiftRow
  window: PlannedShiftWindow
  runAt: Date
  delayMinutes: number
  existingAttempts: number
  alreadyEscalated: boolean
}): EscalationMatch | null {
  if (params.alreadyEscalated) return null
  if (hasActualStart(params.shift)) return null

  const thresholdAt = addMinutes(params.window.plannedStartAt, params.delayMinutes)
  if (params.runAt.getTime() < thresholdAt.getTime()) return null

  // Default 15m aligns with two personal reminders (5 + 10). Absence of employee push
  // must not block escalation — treat time threshold as "should have received".
  const remindersExhausted =
    params.existingAttempts >= 2 || params.runAt.getTime() >= thresholdAt.getTime()

  const delayMinutes = Math.max(
    0,
    Math.floor((params.runAt.getTime() - params.window.plannedStartAt.getTime()) / 60_000)
  )

  return {
    violationType: 'clock_in',
    eventCode: 'admin_clock_in_escalation',
    plannedAt: params.window.plannedStartAt,
    delayMinutes,
    thresholdAt,
    employeeRemindersExhausted: remindersExhausted,
  }
}

function evaluateClockOutEscalation(params: {
  shift: ShiftRow
  window: PlannedShiftWindow
  runAt: Date
  delayMinutes: number
  existingAttempts: number
  alreadyEscalated: boolean
}): EscalationMatch | null {
  if (params.alreadyEscalated) return null
  if (!hasActualStart(params.shift)) return null
  if (hasActualEnd(params.shift)) return null

  const thresholdAt = addMinutes(params.window.plannedEndAt, params.delayMinutes)
  if (params.runAt.getTime() < thresholdAt.getTime()) return null

  const remindersExhausted =
    params.existingAttempts >= 2 || params.runAt.getTime() >= thresholdAt.getTime()

  const delayMinutes = Math.max(
    0,
    Math.floor((params.runAt.getTime() - params.window.plannedEndAt.getTime()) / 60_000)
  )

  return {
    violationType: 'clock_out',
    eventCode: 'admin_clock_out_escalation',
    plannedAt: params.window.plannedEndAt,
    delayMinutes,
    thresholdAt,
    employeeRemindersExhausted: remindersExhausted,
  }
}

export function renderEscalationTemplate(
  template: string,
  context: Record<string, string | number>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = context[key]
    return value == null ? '' : String(value)
  })
}

export function formatAlmatyHm(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Almaty',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}
