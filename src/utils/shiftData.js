/** Модель смен и графика сотрудников */

import { isEffectivePlannedEndReached } from './shiftWorkWindow'

export const SHIFT_STATUS = {
  WORKING: 'working',
  DAY_OFF: 'day_off',
  VACATION: 'vacation',
  SICK_LEAVE: 'sick_leave',
  ABSENCE: 'absence',
}

/** @deprecated Вычисляемые поля больше не сохраняются в БД */
export const SHIFT_ATTENDANCE_DEFAULTS = {
  lateMinutes: 0,
  earlyLeaveMinutes: 0,
  workedMinutes: 0,
  missingCheckIn: false,
  missingCheckOut: false,
  attendanceStatus: 'scheduled',
}

export const SHIFT_STATUS_LABELS = {
  working: 'Рабочий день',
  day_off: 'Выходной',
  vacation: 'Отпуск',
  sick_leave: 'Больничный',
  absence: 'Неявка',
}

export const SHIFT_STATUS_SHORT = {
  working: '',
  day_off: 'Вых',
  vacation: 'Отп',
  sick_leave: 'Бол',
  absence: 'Н/я',
}

export const SHIFT_STATUS_CSS = {
  working: 'shift-day--working',
  day_off: 'shift-day--day-off',
  vacation: 'shift-day--vacation',
  sick_leave: 'shift-day--sick-leave',
  absence: 'shift-day--absence',
}

export const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
export const WEEKDAY_INDICES = [1, 2, 3, 4, 5, 6, 0]

export const SHIFT_STATUS_OPTIONS = [
  { value: SHIFT_STATUS.WORKING, label: SHIFT_STATUS_LABELS.working },
  { value: SHIFT_STATUS.DAY_OFF, label: SHIFT_STATUS_LABELS.day_off },
  { value: SHIFT_STATUS.VACATION, label: SHIFT_STATUS_LABELS.vacation },
  { value: SHIFT_STATUS.SICK_LEAVE, label: SHIFT_STATUS_LABELS.sick_leave },
  { value: SHIFT_STATUS.ABSENCE, label: SHIFT_STATUS_LABELS.absence },
]

/** Коды вычисляемого статуса attendance (не хранятся в БД) */
export const SHIFT_RESULT_CODE = {
  DAY_OFF: 'day_off',
  VACATION: 'vacation',
  SICK_LEAVE: 'sick_leave',
  ABSENCE: 'absence',
  ON_TIME: 'on_time',
  LATE: 'late',
  MISSING_CHECKOUT: 'missing_checkout',
  EARLY_LEAVE: 'early_leave',
  SCHEDULED: 'scheduled',
}

export function isWorkingShiftStatus(status) {
  return status === SHIFT_STATUS.WORKING
}

/** Только фактические поля из БД — без вычисляемых метрик */
function normalizeShiftFacts(raw) {
  if (!raw) return null
  return {
    id: raw.id,
    employeeId: raw.employeeId ?? raw.employee_id,
    shiftDate: raw.shiftDate ?? raw.shift_date,
    status: raw.status || SHIFT_STATUS.WORKING,
    plannedStartTime: raw.plannedStartTime ?? raw.planned_start_time ?? null,
    plannedEndTime: raw.plannedEndTime ?? raw.planned_end_time ?? null,
    plannedBreakStart: raw.plannedBreakStart ?? raw.planned_break_start ?? null,
    plannedBreakEnd: raw.plannedBreakEnd ?? raw.planned_break_end ?? null,
    actualStartTime: raw.actualStartTime ?? raw.actual_start_time ?? null,
    actualEndTime: raw.actualEndTime ?? raw.actual_end_time ?? null,
    actualBreakStart: raw.actualBreakStart ?? raw.actual_break_start ?? null,
    actualBreakEnd: raw.actualBreakEnd ?? raw.actual_break_end ?? null,
    comment: raw.comment || '',
    createdBy: raw.createdBy ?? raw.created_by ?? null,
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? null,
    checkInLatitude: raw.checkInLatitude ?? raw.check_in_latitude ?? null,
    checkInLongitude: raw.checkInLongitude ?? raw.check_in_longitude ?? null,
    checkInAccuracy: raw.checkInAccuracy ?? raw.check_in_accuracy ?? null,
    checkOutLatitude: raw.checkOutLatitude ?? raw.check_out_latitude ?? null,
    checkOutLongitude: raw.checkOutLongitude ?? raw.check_out_longitude ?? null,
    checkOutAccuracy: raw.checkOutAccuracy ?? raw.check_out_accuracy ?? null,
    workLocationId: raw.workLocationId ?? raw.work_location_id ?? null,
  }
}

/** Нормализация смены: факты из БД + динамически вычисленный статус */
export function normalizeShift(raw) {
  const facts = normalizeShiftFacts(raw)
  if (!facts) return null
  const computed = computeShiftStatus(facts)
  const safeComputed = computed ?? {
    code: SHIFT_RESULT_CODE.SCHEDULED,
    label: '',
    variant: 'scheduled',
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    workedMinutes: 0,
  }
  return {
    ...facts,
    lateMinutes: safeComputed.lateMinutes,
    earlyLeaveMinutes: safeComputed.earlyLeaveMinutes,
    workedMinutes: safeComputed.workedMinutes,
    missingCheckIn: safeComputed.code === SHIFT_RESULT_CODE.ABSENCE,
    missingCheckOut: safeComputed.code === SHIFT_RESULT_CODE.MISSING_CHECKOUT,
    computedStatus: safeComputed,
  }
}

export function formatTimeValue(value) {
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

/** Собирает timestamptz из даты смены и локального времени HH:MM (без сдвига часового пояса) */
export function combineDateAndTime(dateKey, timeValue) {
  const time = formatTimeValue(timeValue)
  if (!dateKey || !time) return null
  const [year, month, day] = dateKey.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0)
  if (Number.isNaN(localDate.getTime())) return null
  return localDate.toISOString()
}

export function formatTimeRange(start, end) {
  const startLabel = formatTimeValue(start)
  const endLabel = formatTimeValue(end)
  if (!startLabel || !endLabel) return ''
  return `${startLabel}–${endLabel}`
}

export function formatShiftCellLabel(shift) {
  if (!shift) return ''
  if (!isWorkingShiftStatus(shift.status)) {
    return SHIFT_STATUS_SHORT[shift.status] || '—'
  }
  return formatTimeRange(shift.plannedStartTime, shift.plannedEndTime) || '—'
}

/** Есть ли фактическое время (приход или уход) */
function hasActualTime(value) {
  return Boolean(formatTimeValue(value))
}

function buildShiftPlannedDateTime(shiftDate, timeValue) {
  const time = formatTimeValue(timeValue)
  if (!shiftDate || !time) return null
  return new Date(`${shiftDate}T${time}:00`)
}

function isShiftPlannedEndPassed(shift, now = new Date()) {
  return isEffectivePlannedEndReached(shift, now)
}

function isPastShiftDay(shift, now = new Date()) {
  if (!shift?.shiftDate) return false
  const day = parseDateKey(shift.shiftDate)
  if (Number.isNaN(day.getTime())) return false
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return day < today
}

/** Минуты опоздания по плановому и фактическому приходу */
export function computeLateMinutesFromTimes(shift) {
  const facts = normalizeShiftFacts(shift)
  if (!facts?.actualStartTime) return 0
  const plannedStart = timeToMinutes(facts.plannedStartTime)
  const actualStart = timeToMinutes(formatTimeValue(facts.actualStartTime))
  if (plannedStart == null || actualStart == null) return 0
  return Math.max(0, actualStart - plannedStart)
}

/** Минуты раннего ухода по плановому и фактическому уходу */
export function computeEarlyLeaveMinutesFromTimes(shift) {
  const facts = normalizeShiftFacts(shift)
  if (!facts?.actualEndTime) return 0
  const plannedEnd = timeToMinutes(facts.plannedEndTime)
  const actualEnd = timeToMinutes(formatTimeValue(facts.actualEndTime))
  if (plannedEnd == null || actualEnd == null) return 0
  return Math.max(0, plannedEnd - actualEnd)
}

export function computeWorkedMinutesFromTimes(shift) {
  const facts = normalizeShiftFacts(shift)
  if (!hasActualTime(facts?.actualStartTime) || !hasActualTime(facts?.actualEndTime)) {
    return 0
  }
  const start = timeToMinutes(formatTimeValue(facts.actualStartTime))
  const end = timeToMinutes(formatTimeValue(facts.actualEndTime))
  if (start == null || end == null || end <= start) return 0
  return end - start
}

/**
 * Единая функция вычисления статуса смены.
 * Использует только тип дня, плановое и фактическое время. Ничего не читает из БД-кэша.
 */
export function computeShiftStatus(shift, now = new Date()) {
  const facts = normalizeShiftFacts(shift)
  if (!facts) return null

  const workedMinutes = computeWorkedMinutesFromTimes(facts)

  if (facts.status === SHIFT_STATUS.DAY_OFF) {
    return {
      code: SHIFT_RESULT_CODE.DAY_OFF,
      label: 'Выходной',
      variant: 'day-off',
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workedMinutes: 0,
    }
  }
  if (facts.status === SHIFT_STATUS.VACATION) {
    return {
      code: SHIFT_RESULT_CODE.VACATION,
      label: SHIFT_STATUS_LABELS.vacation,
      variant: 'vacation',
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workedMinutes: 0,
    }
  }
  if (facts.status === SHIFT_STATUS.SICK_LEAVE) {
    return {
      code: SHIFT_RESULT_CODE.SICK_LEAVE,
      label: SHIFT_STATUS_LABELS.sick_leave,
      variant: 'sick-leave',
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workedMinutes: 0,
    }
  }
  if (facts.status === SHIFT_STATUS.ABSENCE) {
    return {
      code: SHIFT_RESULT_CODE.ABSENCE,
      label: 'Отсутствие',
      variant: 'absence',
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workedMinutes: 0,
    }
  }

  if (!isWorkingShiftStatus(facts.status)) return null

  const hasCheckIn = hasActualTime(facts.actualStartTime)
  const hasCheckOut = hasActualTime(facts.actualEndTime)
  const lateMinutes = computeLateMinutesFromTimes(facts)
  const earlyLeaveMinutes = computeEarlyLeaveMinutesFromTimes(facts)

  if (!hasCheckIn && !hasCheckOut) {
    if (isPastShiftDay(facts, now) || isShiftPlannedEndPassed(facts, now)) {
      return {
        code: SHIFT_RESULT_CODE.ABSENCE,
        label: 'Отсутствие',
        variant: 'absence',
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        workedMinutes: 0,
      }
    }
    return {
      code: SHIFT_RESULT_CODE.SCHEDULED,
      label: '',
      variant: 'scheduled',
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workedMinutes: 0,
    }
  }

  if (hasCheckIn && !hasCheckOut && isShiftPlannedEndPassed(facts, now)) {
    return {
      code: SHIFT_RESULT_CODE.MISSING_CHECKOUT,
      label: 'Не отметил уход',
      variant: 'missing-checkout',
      lateMinutes,
      earlyLeaveMinutes: 0,
      workedMinutes: 0,
    }
  }

  if (hasCheckOut && earlyLeaveMinutes > 0) {
    return {
      code: SHIFT_RESULT_CODE.EARLY_LEAVE,
      label: 'Ранний уход',
      variant: 'early-leave',
      lateMinutes,
      earlyLeaveMinutes,
      workedMinutes,
    }
  }

  if (lateMinutes > 0) {
    return {
      code: SHIFT_RESULT_CODE.LATE,
      label: 'Опоздание',
      variant: 'late',
      lateMinutes,
      earlyLeaveMinutes: 0,
      workedMinutes,
    }
  }

  return {
    code: SHIFT_RESULT_CODE.ON_TIME,
    label: 'Вовремя',
    variant: 'on-time',
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    workedMinutes,
  }
}

/** @deprecated Используйте computeShiftStatus */
export const computeShiftDisplayStatus = computeShiftStatus

/** Компактное содержимое ячейки общего графика: время и бейдж статуса */
export function getTeamScheduleBadge(shift, now = new Date()) {
  const display = computeShiftStatus(shift, now)
  if (!display?.label) return null
  return { label: display.label, variant: display.variant }
}

function formatActualTimeRange(start, end) {
  const startLabel = formatTimeValue(start)
  const endLabel = formatTimeValue(end)
  if (!startLabel && !endLabel) return null
  if (startLabel && endLabel) return `${startLabel}–${endLabel}`
  return startLabel || endLabel
}

/** Компактное содержимое ячейки общего недельного графика */
export function formatTeamScheduleCell(shift, now = new Date()) {
  if (!shift) {
    return {
      plannedTime: '',
      actualTime: null,
      showPlan: false,
      showActual: false,
      badge: null,
      comment: '',
    }
  }

  const facts = normalizeShiftFacts(shift)
  const badge = getTeamScheduleBadge(shift, now)
  const comment = facts.comment?.trim() || ''
  const working = isWorkingShiftStatus(facts.status)

  if (!working) {
    return {
      plannedTime: '',
      actualTime: null,
      showPlan: false,
      showActual: false,
      badge,
      comment,
    }
  }

  const plannedTime = formatTimeRange(facts.plannedStartTime, facts.plannedEndTime)
  const actualTime = formatActualTimeRange(facts.actualStartTime, facts.actualEndTime)

  return {
    plannedTime,
    actualTime,
    showPlan: Boolean(plannedTime),
    showActual: true,
    badge,
    comment,
  }
}

/** @deprecated Tooltip удалён из UI; используйте formatTeamScheduleCell */
export function buildTeamScheduleTooltip(shift, now = new Date()) {
  const facts = normalizeShiftFacts(shift)
  if (!facts) return ''

  const planned = formatTimeRange(facts.plannedStartTime, facts.plannedEndTime)
  const actualIn = formatTimeValue(facts.actualStartTime)
  const actualOut = formatTimeValue(facts.actualEndTime)
  const display = computeShiftStatus(facts, now)

  const lines = [
    `• Плановая смена: ${planned || '—'}`,
    `• Фактический приход: ${actualIn || '—'}`,
    `• Фактический уход: ${actualOut || '—'}`,
    `• Статус: ${display?.label || SHIFT_STATUS_LABELS[facts.status] || '—'}`,
    `• Минут опоздания: ${display?.lateMinutes ?? 0}`,
  ]

  if (facts.comment?.trim()) {
    lines.push(`• Комментарий: ${facts.comment.trim()}`)
  }

  return lines.join('\n')
}

export function formatMonthYearLabel(year, month) {
  const date = new Date(year, month - 1, 1)
  const label = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function toDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseDateKey(dateKey) {
  if (!dateKey || typeof dateKey !== 'string') {
    return new Date(Number.NaN)
  }
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Понедельник недели, в которую попадает date (неделя с Пн) */
export function getMondayOfWeek(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const weekday = d.getDay()
  const diff = weekday === 0 ? -6 : 1 - weekday
  d.setDate(d.getDate() + diff)
  return d
}

export function getInitialWeekStartKey() {
  return toDateKey(getMondayOfWeek(new Date()))
}

export function buildWeekDates(weekStartKey) {
  const start = parseDateKey(weekStartKey)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

export function addWeeks(weekStartKey, weeksDelta) {
  const date = parseDateKey(weekStartKey)
  date.setDate(date.getDate() + weeksDelta * 7)
  return toDateKey(date)
}

export function formatWeekRangeLabel(weekStartKey) {
  const dates = buildWeekDates(weekStartKey)
  const start = dates[0]
  const end = dates[6]
  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()

  const monthLabel = start
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    .replace(/^\d+\s*/, '')

  if (sameMonth) {
    return `${start.getDate()}–${end.getDate()} ${monthLabel} ${start.getFullYear()}`
  }

  const startLabel = start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  const endLabel = end
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/\s?г\.?$/, '')
  return `${startLabel} – ${endLabel}`
}

export function formatWeekDayHeader(date) {
  const weekday = WEEKDAY_LABELS[(date.getDay() + 6) % 7]
  return { weekday, day: date.getDate() }
}

/** Уникальные пары year/month, которые пересекает неделя */
export function getMonthsForWeek(weekStartKey) {
  const months = new Map()
  buildWeekDates(weekStartKey).forEach((date) => {
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`
    months.set(key, { year: date.getFullYear(), month: date.getMonth() + 1 })
  })
  return [...months.values()]
}

export function getMonthBounds(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end, daysInMonth: lastDay }
}

export function buildMonthCalendar(year, month) {
  const { daysInMonth } = getMonthBounds(year, month)
  const firstDay = new Date(year, month - 1, 1)
  let startOffset = firstDay.getDay() - 1
  if (startOffset < 0) startOffset = 6

  const cells = []
  for (let i = 0; i < startOffset; i += 1) {
    cells.push(null)
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month - 1, day))
  }
  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  return cells
}

export function shiftsToMap(shifts) {
  const map = new Map()
  shifts.forEach((shift) => {
    const normalized = normalizeShift(shift)
    if (normalized?.shiftDate) {
      map.set(normalized.shiftDate, normalized)
    }
  })
  return map
}

export function timeToMinutes(value) {
  const label = formatTimeValue(value)
  if (!label) return null
  const [hours, minutes] = label.split(':').map(Number)
  return hours * 60 + minutes
}

export function minutesToDurationLabel(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return '—'
  const abs = Math.abs(Math.round(minutes))
  const hours = Math.floor(abs / 60)
  const mins = abs % 60
  if (hours && mins) return `${hours} ч ${mins} мин`
  if (hours) return `${hours} ч`
  return `${mins} мин`
}

export function calculateShiftMetrics(shift) {
  const normalized = normalizeShift(shift)
  if (!normalized) {
    return {
      latenessMinutes: null,
      earlyLeaveMinutes: null,
      plannedWorkMinutes: null,
      actualWorkMinutes: null,
      overtimeMinutes: null,
      undertimeMinutes: null,
    }
  }

  const plannedStart = timeToMinutes(normalized.plannedStartTime)
  const plannedEnd = timeToMinutes(normalized.plannedEndTime)

  const actualStart = normalized.actualStartTime
    ? timeToMinutes(formatTimeValue(normalized.actualStartTime))
    : null
  const actualEnd = normalized.actualEndTime
    ? timeToMinutes(formatTimeValue(normalized.actualEndTime))
    : null

  let plannedWorkMinutes = null
  if (plannedStart != null && plannedEnd != null && plannedEnd > plannedStart) {
    plannedWorkMinutes = plannedEnd - plannedStart
  }

  let actualWorkMinutes = null
  if (actualStart != null && actualEnd != null && actualEnd > actualStart) {
    actualWorkMinutes = actualEnd - actualStart
  }

  const latenessMinutes =
    plannedStart != null && actualStart != null ? Math.max(0, actualStart - plannedStart) : null
  const earlyLeaveMinutes =
    plannedEnd != null && actualEnd != null ? Math.max(0, plannedEnd - actualEnd) : null

  let overtimeMinutes = null
  let undertimeMinutes = null
  if (plannedWorkMinutes != null && actualWorkMinutes != null) {
    const diff = actualWorkMinutes - plannedWorkMinutes
    overtimeMinutes = diff > 0 ? diff : 0
    undertimeMinutes = diff < 0 ? Math.abs(diff) : 0
  }

  return {
    latenessMinutes,
    earlyLeaveMinutes,
    plannedWorkMinutes,
    actualWorkMinutes,
    overtimeMinutes,
    undertimeMinutes,
  }
}

export function buildShiftTooltip(shift) {
  const normalized = normalizeShift(shift)
  if (!normalized) return ''
  const display = normalized.computedStatus
  const lines = [display?.label || SHIFT_STATUS_LABELS[normalized.status] || normalized.status]
  if (isWorkingShiftStatus(normalized.status)) {
    const range = formatTimeRange(normalized.plannedStartTime, normalized.plannedEndTime)
    if (range) lines.push(`Смена: ${range}`)
  }
  const actualRange = formatTimeRange(normalized.actualStartTime, normalized.actualEndTime)
  if (actualRange) lines.push(`Факт: ${actualRange}`)
  if (normalized.lateMinutes > 0) lines.push(`Опоздание: ${normalized.lateMinutes} мин`)
  if (normalized.earlyLeaveMinutes > 0) lines.push(`Ранний уход: ${normalized.earlyLeaveMinutes} мин`)
  if (normalized.workedMinutes > 0) lines.push(`Отработано: ${normalized.workedMinutes} мин`)
  if (normalized.missingCheckOut) lines.push('Не отметил уход')
  if (normalized.missingCheckIn) lines.push('Отсутствие')
  if (normalized.comment?.trim()) lines.push(normalized.comment.trim())
  return lines.join('\n')
}

export function emptyShiftForm(dateKey) {
  return {
    status: SHIFT_STATUS.WORKING,
    plannedStartTime: '09:00',
    plannedEndTime: '19:00',
    actualStartTime: '',
    actualEndTime: '',
    comment: '',
    shiftDate: dateKey,
  }
}

export function shiftToForm(shift, dateKey) {
  if (!shift) return emptyShiftForm(dateKey)
  const normalized = normalizeShift(shift)
  return {
    status: normalized.status,
    plannedStartTime: formatTimeValue(normalized.plannedStartTime),
    plannedEndTime: formatTimeValue(normalized.plannedEndTime),
    actualStartTime: formatTimeValue(normalized.actualStartTime),
    actualEndTime: formatTimeValue(normalized.actualEndTime),
    comment: normalized.comment || '',
    shiftDate: dateKey,
  }
}

export function validateShiftForm(form) {
  const errors = {}
  if (!form.shiftDate) errors.shiftDate = 'Не указана дата'
  if (isWorkingShiftStatus(form.status)) {
    if (!form.plannedStartTime) errors.plannedStartTime = 'Укажите начало смены'
    if (!form.plannedEndTime) errors.plannedEndTime = 'Укажите конец смены'
  }
  return errors
}

export function validateBulkScheduleForm(form) {
  const errors = {}
  if (!form.startDate) errors.startDate = 'Укажите дату начала'
  if (!form.endDate) errors.endDate = 'Укажите дату окончания'
  if (form.startDate && form.endDate && form.startDate > form.endDate) {
    errors.endDate = 'Дата окончания не может быть раньше начала'
  }
  if (!form.weekdays?.length) errors.weekdays = 'Выберите хотя бы один день недели'
  if (form.setWorking) {
    if (!form.plannedStartTime) errors.plannedStartTime = 'Укажите начало смены'
    if (!form.plannedEndTime) errors.plannedEndTime = 'Укажите конец смены'
  }
  return errors
}

export function enumerateDatesInRange(startDate, endDate) {
  const dates = []
  const current = parseDateKey(startDate)
  const end = parseDateKey(endDate)
  while (current <= end) {
    dates.push(toDateKey(current))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

export function buildBulkShiftEntries(form) {
  const dates = enumerateDatesInRange(form.startDate, form.endDate)
  const weekdaySet = new Set(form.weekdays)
  const entries = []

  dates.forEach((dateKey) => {
    const weekday = parseDateKey(dateKey).getDay()
    const isSelected = weekdaySet.has(weekday)
    if (isSelected && form.setWorking) {
      entries.push({
        shiftDate: dateKey,
        status: SHIFT_STATUS.WORKING,
        plannedStartTime: form.plannedStartTime,
        plannedEndTime: form.plannedEndTime,
      })
    } else if (!isSelected && form.markOthersDayOff) {
      entries.push({
        shiftDate: dateKey,
        status: SHIFT_STATUS.DAY_OFF,
        plannedStartTime: null,
        plannedEndTime: null,
      })
    } else if (isSelected && !form.setWorking) {
      entries.push({
        shiftDate: dateKey,
        status: SHIFT_STATUS.DAY_OFF,
        plannedStartTime: null,
        plannedEndTime: null,
      })
    }
  })

  return entries
}

export function formToShiftPayload(form) {
  const working = isWorkingShiftStatus(form.status)
  return {
    shiftDate: form.shiftDate,
    status: form.status,
    plannedStartTime: working ? form.plannedStartTime || null : null,
    plannedEndTime: working ? form.plannedEndTime || null : null,
    plannedBreakStart: null,
    plannedBreakEnd: null,
    actualStartTime: combineDateAndTime(form.shiftDate, form.actualStartTime),
    actualEndTime: combineDateAndTime(form.shiftDate, form.actualEndTime),
    actualBreakStart: null,
    actualBreakEnd: null,
    comment: form.comment?.trim() || '',
  }
}
