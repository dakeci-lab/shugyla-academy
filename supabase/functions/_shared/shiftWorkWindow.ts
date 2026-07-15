const APP_TIMEZONE = 'Asia/Almaty'

function formatTimeValue(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') {
    if (value.includes('T')) {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }
    return value.slice(0, 5)
  }
  return ''
}

function timeToMinutes(timeValue: unknown): number | null {
  const time = formatTimeValue(timeValue)
  if (!time) return null
  const [hours, minutes] = time.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

export function getDateKeyInTimezone(date: Date, timeZone = APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value ?? '0000'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}

export function addDaysToDateKey(dateKey: string, delta: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + delta))
  return date.toISOString().slice(0, 10)
}

export function isOvernightPlannedShift(plannedStartTime: unknown, plannedEndTime: unknown): boolean {
  const start = timeToMinutes(plannedStartTime)
  const end = timeToMinutes(plannedEndTime)
  if (start == null || end == null) return false
  return end <= start
}

export function isShiftEndingAtMidnight(plannedStartTime: unknown, plannedEndTime: unknown): boolean {
  const end = formatTimeValue(plannedEndTime)
  const start = formatTimeValue(plannedStartTime)
  return end === '00:00' && Boolean(start) && start !== '00:00'
}

export type ShiftLike = {
  shift_date?: string
  shiftDate?: string
  planned_start_time?: string | null
  plannedStartTime?: string | null
  planned_end_time?: string | null
  plannedEndTime?: string | null
  actual_start_time?: string | null
  actualStartTime?: string | null
  actual_end_time?: string | null
  actualEndTime?: string | null
  status?: string | null
}

function readShiftDate(shift: ShiftLike): string | null {
  const value = shift.shift_date ?? shift.shiftDate
  return value ? String(value) : null
}

function readField<T>(shift: ShiftLike, snake: keyof ShiftLike, camel: keyof ShiftLike): T | null {
  const value = shift[snake] ?? shift[camel]
  return (value ?? null) as T | null
}

export function buildEffectivePlannedEndAt(shift: ShiftLike): Date | null {
  const shiftDate = readShiftDate(shift)
  if (!shiftDate) return null
  const endTime = formatTimeValue(readField(shift, 'planned_end_time', 'plannedEndTime'))
  if (!endTime) return null

  let dateKey = shiftDate
  const plannedStart = readField(shift, 'planned_start_time', 'plannedStartTime')
  const plannedEnd = readField(shift, 'planned_end_time', 'plannedEndTime')
  if (isShiftEndingAtMidnight(plannedStart, plannedEnd) || isOvernightPlannedShift(plannedStart, plannedEnd)) {
    dateKey = addDaysToDateKey(shiftDate, 1)
  }

  const [year, month, day] = dateKey.split('-').map(Number)
  const [hours, minutes] = endTime.split(':').map(Number)
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0)
  return Number.isNaN(date.getTime()) ? null : date
}

export function isEffectivePlannedEndReached(shift: ShiftLike, now = new Date()): boolean {
  const plannedEnd = buildEffectivePlannedEndAt(shift)
  if (!plannedEnd) return false
  return now.getTime() >= plannedEnd.getTime()
}

export function isOpenShiftWorkWindowActive(shift: ShiftLike, now = new Date()): boolean {
  const actualStart = readField(shift, 'actual_start_time', 'actualStartTime')
  const actualEnd = readField(shift, 'actual_end_time', 'actualEndTime')
  if (!actualStart || actualEnd) return false
  const plannedEnd = buildEffectivePlannedEndAt(shift)
  if (!plannedEnd) return true
  return now.getTime() < plannedEnd.getTime()
}

export function isStaleOpenShift(shift: ShiftLike, now = new Date()): boolean {
  const actualStart = readField(shift, 'actual_start_time', 'actualStartTime')
  const actualEnd = readField(shift, 'actual_end_time', 'actualEndTime')
  if (!actualStart || actualEnd) return false
  return isEffectivePlannedEndReached(shift, now)
}

export function resolveWorkWindowShift(shifts: ShiftLike[], now = new Date()) {
  const todayKey = getDateKeyInTimezone(now)
  const yesterdayKey = addDaysToDateKey(todayKey, -1)
  const byDate = new Map<string, ShiftLike>()

  for (const row of shifts) {
    const dateKey = readShiftDate(row)
    if (dateKey) byDate.set(dateKey, row)
  }

  const todayShift = byDate.get(todayKey) ?? null
  const yesterdayShift = byDate.get(yesterdayKey) ?? null

  if (yesterdayShift && isOpenShiftWorkWindowActive(yesterdayShift, now)) {
    return {
      activeShift: yesterdayShift,
      todayShift,
      yesterdayShift,
      previousShiftMissedClockOut: false,
    }
  }

  return {
    activeShift: todayShift,
    todayShift,
    yesterdayShift,
    previousShiftMissedClockOut: Boolean(yesterdayShift && isStaleOpenShift(yesterdayShift, now)),
  }
}

export function deriveTrackerStatus(shift: ShiftLike | null, now = new Date()) {
  if (!shift) return 'no_shift'
  if (shift.status === 'day_off') return 'day_off'
  if (shift.status === 'vacation' || shift.status === 'sick_leave') return 'day_off'
  if (shift.status !== 'working') return 'no_shift'
  const actualStart = readField(shift, 'actual_start_time', 'actualStartTime')
  const actualEnd = readField(shift, 'actual_end_time', 'actualEndTime')
  if (actualStart && actualEnd) return 'completed'
  if (actualStart && isOpenShiftWorkWindowActive(shift, now)) return 'working'
  if (actualStart && isStaleOpenShift(shift, now)) return 'completed'
  return 'not_started'
}
