/**
 * Pure helpers for the employee schedule day timeline (Gantt-style).
 * Store window, bar geometry, coverage segments, day stats.
 * Local time helpers keep this module Node-testable without Vite path aliases.
 */
import { STORE_WORK_HOURS } from './storeWorkHours.js'

const DAY_MINUTES = 24 * 60

function formatTimeValue(value) {
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

export function timeToMinutes(value) {
  const label = formatTimeValue(value)
  if (!label) return null
  const [hours, minutes] = label.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

function isWorkingShiftStatus(status) {
  return status === 'working'
}

export function getStoreTimelineWindow(hours = STORE_WORK_HOURS) {
  const startMin = timeToMinutes(hours.startTime)
  let endMin = timeToMinutes(hours.endTime)
  if (startMin == null || endMin == null) {
    return { startMin: 0, endMin: DAY_MINUTES, durationMin: DAY_MINUTES }
  }
  if (endMin <= startMin) endMin += DAY_MINUTES
  return {
    startMin,
    endMin,
    durationMin: endMin - startMin,
  }
}

/**
 * Absolute minutes from midnight of the shift's calendar day.
 * Midnight end (12:45–00:00) and other overnight ends map to endMin > startMin
 * by adding 24h when end <= start (matches shiftWorkWindow overnight rules).
 */
export function resolveShiftAbsoluteMinutes(startTime, endTime) {
  const startMin = timeToMinutes(startTime)
  const endRaw = timeToMinutes(endTime)
  if (startMin == null || endRaw == null) return null
  let endMin = endRaw
  if (endMin <= startMin) endMin += DAY_MINUTES
  return { startMin, endMin }
}

export function minutesToTimelineLabel(absoluteMin) {
  if (absoluteMin == null || Number.isNaN(absoluteMin)) return '—'
  const normalized = ((Math.round(absoluteMin) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function percentInWindow(absoluteMin, window = getStoreTimelineWindow()) {
  if (!window?.durationMin) return 0
  return ((absoluteMin - window.startMin) / window.durationMin) * 100
}

export function clampPercent(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export function getShiftBarLayout(startTime, endTime, window = getStoreTimelineWindow()) {
  const interval = resolveShiftAbsoluteMinutes(startTime, endTime)
  if (!interval) return null
  const left = clampPercent(percentInWindow(interval.startMin, window))
  const right = clampPercent(percentInWindow(interval.endMin, window))
  const width = Math.max(0, right - left)
  return {
    leftPercent: left,
    widthPercent: width,
    startMin: interval.startMin,
    endMin: interval.endMin,
    startLabel: formatTimeValue(startTime),
    endLabel: formatTimeValue(endTime),
  }
}

/** Default hour ticks plus store open/close. */
export function buildTimelineTicks(window = getStoreTimelineWindow()) {
  const candidates = [
    window.startMin,
    ...[10, 12, 14, 16, 18, 20, 22].map((h) => h * 60),
    window.endMin,
  ]
  const unique = []
  for (const min of candidates) {
    if (min < window.startMin || min > window.endMin) continue
    if (unique.length && unique[unique.length - 1] === min) continue
    unique.push(min)
  }
  return unique.map((absoluteMin) => ({
    absoluteMin,
    label: minutesToTimelineLabel(absoluteMin),
    leftPercent: clampPercent(percentInWindow(absoluteMin, window)),
  }))
}

/**
 * @param {Array<{ startMin: number, endMin: number }>} intervals working shifts only
 */
export function buildCoverageSegments(intervals, window = getStoreTimelineWindow()) {
  const points = new Set([window.startMin, window.endMin])
  for (const interval of intervals || []) {
    if (interval == null) continue
    const start = Math.max(window.startMin, Math.min(window.endMin, interval.startMin))
    const end = Math.max(window.startMin, Math.min(window.endMin, interval.endMin))
    points.add(start)
    points.add(end)
  }
  const sorted = [...points].sort((a, b) => a - b)
  const segments = []
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const startMin = sorted[i]
    const endMin = sorted[i + 1]
    if (endMin <= startMin) continue
    const count = (intervals || []).filter(
      (interval) => interval.startMin < endMin && interval.endMin > startMin
    ).length
    const leftPercent = clampPercent(percentInWindow(startMin, window))
    const rightPercent = clampPercent(percentInWindow(endMin, window))
    segments.push({
      startMin,
      endMin,
      count,
      leftPercent,
      widthPercent: Math.max(0, rightPercent - leftPercent),
      startLabel: minutesToTimelineLabel(startMin),
      endLabel: minutesToTimelineLabel(endMin),
    })
  }
  return segments
}

export function summarizeDayCoverage(segments) {
  if (!segments?.length) {
    return {
      maxConcurrent: 0,
      minDuringWork: 0,
      weakestPeriod: null,
    }
  }
  let maxConcurrent = 0
  let minDuringWork = Number.POSITIVE_INFINITY
  for (const segment of segments) {
    maxConcurrent = Math.max(maxConcurrent, segment.count)
    minDuringWork = Math.min(minDuringWork, segment.count)
  }
  if (!Number.isFinite(minDuringWork)) minDuringWork = 0

  const weakestCandidates = segments.filter((s) => s.count === minDuringWork)
  let weakestPeriod = null
  for (const segment of weakestCandidates) {
    const duration = segment.endMin - segment.startMin
    if (
      !weakestPeriod ||
      duration > weakestPeriod.endMin - weakestPeriod.startMin
    ) {
      weakestPeriod = segment
    }
  }

  return {
    maxConcurrent,
    minDuringWork,
    weakestPeriod: weakestPeriod
      ? {
          startMin: weakestPeriod.startMin,
          endMin: weakestPeriod.endMin,
          startLabel: weakestPeriod.startLabel,
          endLabel: weakestPeriod.endLabel,
          count: weakestPeriod.count,
        }
      : null,
  }
}

/**
 * Build day stats from employee rows: [{ shift }].
 * Does not invent shifts; day_off / missing = not working.
 */
export function buildScheduleDayStats(employeeRows, window = getStoreTimelineWindow()) {
  const intervals = []
  let totalWithShift = 0

  for (const row of employeeRows || []) {
    const shift = row?.shift
    if (!shift || !isWorkingShiftStatus(shift.status)) continue
    const layout = getShiftBarLayout(shift.plannedStartTime, shift.plannedEndTime, window)
    if (!layout || layout.widthPercent <= 0) continue
    totalWithShift += 1
    intervals.push({ startMin: layout.startMin, endMin: layout.endMin })
  }

  const segments = buildCoverageSegments(intervals, window)
  const summary = summarizeDayCoverage(segments)

  return {
    totalWithShift,
    maxConcurrent: summary.maxConcurrent,
    minDuringWork: totalWithShift === 0 ? 0 : summary.minDuringWork,
    weakestPeriod: totalWithShift === 0 ? null : summary.weakestPeriod,
    segments,
    intervals,
  }
}

export function classifyScheduleDayCell(shift) {
  if (!shift) {
    return { kind: 'missing', label: 'Нет смены' }
  }
  if (shift.status === 'day_off') {
    return { kind: 'day_off', label: 'Выходной' }
  }
  if (shift.status === 'vacation') {
    return { kind: 'non_working', label: 'Отпуск' }
  }
  if (shift.status === 'sick_leave') {
    return { kind: 'non_working', label: 'Больничный' }
  }
  if (shift.status === 'absence') {
    return { kind: 'non_working', label: 'Неявка' }
  }
  if (!isWorkingShiftStatus(shift.status)) {
    return { kind: 'non_working', label: '—' }
  }
  const start = formatTimeValue(shift.plannedStartTime)
  const end = formatTimeValue(shift.plannedEndTime)
  if (!start || !end) {
    return { kind: 'missing', label: 'Нет смены' }
  }
  return {
    kind: 'working',
    label: `${start}–${end}`,
    start,
    end,
  }
}

/** Minutes since midnight in APP-local wall clock for `now`. */
export function getNowAbsoluteMinutes(now = new Date(), timeZone = 'Asia/Almaty') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

export function getNowLinePercent(dateKey, todayKey, now = new Date(), window = getStoreTimelineWindow()) {
  if (!dateKey || dateKey !== todayKey) return null
  const nowMin = getNowAbsoluteMinutes(now)
  if (nowMin == null) return null
  // After midnight but before store open: hide. After store end (past midnight of next day): hide.
  let absolute = nowMin
  if (absolute < window.startMin) {
    // Early morning of next calendar day while overnight window still open (00:00–open).
    // Only show if we are still before window.endMin when interpreted as +24h.
    if (absolute + DAY_MINUTES <= window.endMin && absolute + DAY_MINUTES >= window.startMin) {
      absolute += DAY_MINUTES
    } else {
      return null
    }
  }
  if (absolute < window.startMin || absolute > window.endMin) return null
  return clampPercent(percentInWindow(absolute, window))
}

export function formatScheduleDayTitle(dateKey) {
  if (!dateKey) return '—'
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return dateKey
  const label = date.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
