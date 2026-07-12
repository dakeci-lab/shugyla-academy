import {
  computeShiftStatus,
  formatTeamScheduleCell,
  formatTimeRange,
  formatTimeValue,
  formatWeekDayHeader,
  isWorkingShiftStatus,
  normalizeShift,
  SHIFT_STATUS,
  SHIFT_STATUS_LABELS,
  SHIFT_STATUS_SHORT,
} from './shiftData'

/** Варианты цветного индикатора в компактной ячейке */
export const MOBILE_INDICATOR = {
  ON_TIME: 'on-time',
  WARNING: 'warning',
  ABSENCE: 'absence',
  DAY_OFF: 'day-off',
  SCHEDULED: 'scheduled',
  UNASSIGNED: 'unassigned',
}

function mapVariantToIndicator(variant) {
  switch (variant) {
    case 'on-time':
      return MOBILE_INDICATOR.ON_TIME
    case 'late':
    case 'early-leave':
    case 'missing-checkout':
      return MOBILE_INDICATOR.WARNING
    case 'absence':
      return MOBILE_INDICATOR.ABSENCE
    case 'day-off':
      return MOBILE_INDICATOR.DAY_OFF
    case 'scheduled':
      return MOBILE_INDICATOR.SCHEDULED
    case 'vacation':
    case 'sick-leave':
      return MOBILE_INDICATOR.DAY_OFF
    default:
      return MOBILE_INDICATOR.UNASSIGNED
  }
}

/** Компактные данные одного дня для мобильной карточки */
export function formatTeamScheduleMobileDay(shift, date, now = new Date()) {
  const { weekday, day } = formatWeekDayHeader(date)

  if (!shift) {
    return {
      weekday,
      day,
      startTime: null,
      endTime: null,
      shortLabel: '—',
      indicator: MOBILE_INDICATOR.UNASSIGNED,
      cell: formatTeamScheduleCell(null, now),
      status: null,
      facts: null,
    }
  }

  const facts = normalizeShift(shift)
  const cell = formatTeamScheduleCell(shift, now)
  const status = computeShiftStatus(shift, now)
  const working = isWorkingShiftStatus(facts?.status)

  let shortLabel = '—'
  let startTime = null
  let endTime = null

  if (!working) {
    shortLabel = SHIFT_STATUS_SHORT[facts.status] || '—'
  } else {
    startTime = formatTimeValue(facts.plannedStartTime) || null
    endTime = formatTimeValue(facts.plannedEndTime) || null
    if (!startTime && !endTime) shortLabel = '—'
  }

  const indicator = status?.variant
    ? mapVariantToIndicator(status.variant)
    : MOBILE_INDICATOR.UNASSIGNED

  return {
    weekday,
    day,
    startTime,
    endTime,
    shortLabel,
    indicator,
    cell,
    status,
    facts,
  }
}

export function formatScheduleDaySheetDate(date) {
  const weekday = date.toLocaleDateString('ru-RU', { weekday: 'long' })
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  const rest = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  return `${capitalized}, ${rest}`
}

function resolveSheetStatusLabel(status, facts) {
  if (!facts) return 'График не назначен'
  if (status?.label) return status.label
  if (status?.variant === 'scheduled') return 'Запланировано'
  return SHIFT_STATUS_LABELS[facts.status] || '—'
}

/** Данные для bottom sheet по выбранному дню */
export function buildTeamScheduleDaySheetModel(employee, shift, date, now = new Date()) {
  const facts = shift ? normalizeShift(shift) : null
  const status = shift ? computeShiftStatus(shift, now) : null
  const planned =
    facts && isWorkingShiftStatus(facts.status)
      ? formatTimeRange(facts.plannedStartTime, facts.plannedEndTime)
      : facts && facts.status === SHIFT_STATUS.DAY_OFF
        ? 'Выходной'
        : facts && facts.status !== SHIFT_STATUS.WORKING
          ? SHIFT_STATUS_LABELS[facts.status] || '—'
          : ''
  const actualIn = facts ? formatTimeValue(facts.actualStartTime) : ''
  const actualOut = facts ? formatTimeValue(facts.actualEndTime) : ''
  const actual =
    actualIn || actualOut
      ? [actualIn, actualOut].filter(Boolean).join('–') || '—'
      : '—'

  return {
    employeeName: employee?.name || '—',
    dateLabel: formatScheduleDaySheetDate(date),
    planned: planned || '—',
    actual,
    actualIn: actualIn || '—',
    actualOut: actualOut || '—',
    statusLabel: resolveSheetStatusLabel(status, facts),
    lateMinutes: status?.lateMinutes ?? 0,
    earlyLeaveMinutes: status?.earlyLeaveMinutes ?? 0,
    isAbsence: status?.variant === 'absence',
    comment: facts?.comment?.trim() || '',
  }
}

export const MOBILE_SCHEDULE_LEGEND = [
  { indicator: MOBILE_INDICATOR.ON_TIME, label: 'Вовремя' },
  { indicator: MOBILE_INDICATOR.WARNING, label: 'Опоздание / ранний уход' },
  { indicator: MOBILE_INDICATOR.ABSENCE, label: 'Отсутствие' },
  { indicator: MOBILE_INDICATOR.DAY_OFF, label: 'Выходной' },
  { indicator: MOBILE_INDICATOR.SCHEDULED, label: 'Запланировано' },
  { indicator: MOBILE_INDICATOR.UNASSIGNED, label: 'Не назначено' },
]
