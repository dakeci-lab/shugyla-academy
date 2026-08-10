/**
 * Pure settlements period math (Asia/Aqtobe calendar days).
 * No DOM — safe for unit-style verify scripts.
 */

export const SETTLEMENTS_PERIOD_PRESET = {
  YESTERDAY: 'yesterday',
  TODAY: 'today',
  WEEK: 'week',
  MONTH: 'month',
  THREE_MONTHS: 'three_months',
  CUSTOM: 'custom',
}

export const SETTLEMENTS_PERIOD_PRESET_OPTIONS = [
  { id: SETTLEMENTS_PERIOD_PRESET.YESTERDAY, label: 'Вчера' },
  { id: SETTLEMENTS_PERIOD_PRESET.TODAY, label: 'Сегодня' },
  { id: SETTLEMENTS_PERIOD_PRESET.WEEK, label: 'Неделя' },
  { id: SETTLEMENTS_PERIOD_PRESET.MONTH, label: 'Месяц' },
  { id: SETTLEMENTS_PERIOD_PRESET.THREE_MONTHS, label: 'Три месяца' },
]

const MONTHS_RU = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

const MONTHS_RU_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
]

function parseKey(dateKey) {
  const [y, m, d] = String(dateKey || '')
    .split('-')
    .map(Number)
  if (!y || !m || !d) return null
  return { y, m, d }
}

function toKey(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function toUtcDate(parts) {
  return new Date(Date.UTC(parts.y, parts.m - 1, parts.d))
}

function fromUtcDate(date) {
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
  }
}

export function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Local calendar YYYY-MM-DD in Asia/Aqtobe. */
export function toSettlementsDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Aqtobe',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${d}`
}

export function addDaysToDateKey(dateKey, days) {
  const parts = parseKey(dateKey)
  if (!parts) return dateKey
  const utc = toUtcDate(parts)
  utc.setUTCDate(utc.getUTCDate() + Number(days || 0))
  const next = fromUtcDate(utc)
  return toKey(next.y, next.m, next.d)
}

export function diffDaysInclusive(dateFrom, dateTo) {
  const a = parseKey(dateFrom)
  const b = parseKey(dateTo)
  if (!a || !b) return 1
  const ms = toUtcDate(b).getTime() - toUtcDate(a).getTime()
  return Math.max(1, Math.round(ms / 86400000) + 1)
}

/** Monday of the week containing dateKey (Mon–Sun weeks). */
export function startOfWeekMonday(dateKey) {
  const parts = parseKey(dateKey)
  if (!parts) return dateKey
  const utc = toUtcDate(parts)
  const day = utc.getUTCDay() // 0 Sun … 6 Sat
  const offset = day === 0 ? -6 : 1 - day
  utc.setUTCDate(utc.getUTCDate() + offset)
  const next = fromUtcDate(utc)
  return toKey(next.y, next.m, next.d)
}

export function getMonthRangeKeys(year, month) {
  const dateFrom = toKey(year, month, 1)
  const dateTo = toKey(year, month, lastDayOfMonth(year, month))
  return { dateFrom, dateTo }
}

/** Current calendar month of `reference` (Aqtobe). */
export function getMonthPeriodKeys(reference = new Date()) {
  const key = toSettlementsDateKey(reference)
  const parts = parseKey(key)
  return getMonthRangeKeys(parts.y, parts.m)
}

/** Three full months ending at the anchor month of `reference` (current + 2 previous). */
export function getThreeMonthsPeriodKeys(reference = new Date()) {
  const key = toSettlementsDateKey(reference)
  const parts = parseKey(key)
  return getThreeMonthsEndingAt(parts.y, parts.m)
}

function getThreeMonthsEndingAt(endYear, endMonth) {
  const end = getMonthRangeKeys(endYear, endMonth)
  const startUtc = new Date(Date.UTC(endYear, endMonth - 1 - 2, 1))
  const start = fromUtcDate(startUtc)
  return {
    dateFrom: toKey(start.y, start.m, 1),
    dateTo: end.dateTo,
  }
}

export function getSettlementsPeriodDates(presetId, reference = new Date()) {
  const today = toSettlementsDateKey(reference)
  if (presetId === SETTLEMENTS_PERIOD_PRESET.YESTERDAY) {
    const day = addDaysToDateKey(today, -1)
    return { dateFrom: day, dateTo: day }
  }
  if (presetId === SETTLEMENTS_PERIOD_PRESET.TODAY) {
    return { dateFrom: today, dateTo: today }
  }
  if (presetId === SETTLEMENTS_PERIOD_PRESET.WEEK) {
    const dateFrom = startOfWeekMonday(today)
    return { dateFrom, dateTo: addDaysToDateKey(dateFrom, 6) }
  }
  if (presetId === SETTLEMENTS_PERIOD_PRESET.THREE_MONTHS) {
    return getThreeMonthsPeriodKeys(reference)
  }
  return getMonthPeriodKeys(reference)
}

export function getSettlementsPeriodDefaults(reference = new Date()) {
  const dates = getMonthPeriodKeys(reference)
  return {
    periodPreset: SETTLEMENTS_PERIOD_PRESET.MONTH,
    dateFrom: dates.dateFrom,
    dateTo: dates.dateTo,
  }
}

function isFullMonthRange(dateFrom, dateTo) {
  const a = parseKey(dateFrom)
  const b = parseKey(dateTo)
  if (!a || !b) return false
  if (a.y !== b.y || a.m !== b.m || a.d !== 1) return false
  return b.d === lastDayOfMonth(a.y, a.m)
}

function isWeekRange(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return false
  if (startOfWeekMonday(dateFrom) !== dateFrom) return false
  return dateTo === addDaysToDateKey(dateFrom, 6)
}

function isThreeMonthRange(dateFrom, dateTo) {
  const a = parseKey(dateFrom)
  const b = parseKey(dateTo)
  if (!a || !b || a.d !== 1) return false
  if (b.d !== lastDayOfMonth(b.y, b.m)) return false
  const months = (b.y - a.y) * 12 + (b.m - a.m)
  return months === 2
}

export function resolveSettlementsPeriodPreset(dateFrom, dateTo, reference = new Date()) {
  const today = toSettlementsDateKey(reference)
  const yesterday = addDaysToDateKey(today, -1)
  if (dateFrom === today && dateTo === today) return SETTLEMENTS_PERIOD_PRESET.TODAY
  if (dateFrom === yesterday && dateTo === yesterday) return SETTLEMENTS_PERIOD_PRESET.YESTERDAY
  if (isWeekRange(dateFrom, dateTo)) return SETTLEMENTS_PERIOD_PRESET.WEEK
  if (isThreeMonthRange(dateFrom, dateTo)) return SETTLEMENTS_PERIOD_PRESET.THREE_MONTHS
  if (isFullMonthRange(dateFrom, dateTo)) return SETTLEMENTS_PERIOD_PRESET.MONTH
  return SETTLEMENTS_PERIOD_PRESET.CUSTOM
}

export function isSettlementsFilterActive(dateFrom, dateTo, reference = new Date()) {
  const current = getMonthPeriodKeys(reference)
  return dateFrom !== current.dateFrom || dateTo !== current.dateTo
}

function shiftMonthRange(dateFrom, direction) {
  const parts = parseKey(dateFrom)
  if (!parts) return { dateFrom, dateTo: dateFrom }
  const utc = new Date(Date.UTC(parts.y, parts.m - 1 + direction, 1))
  const next = fromUtcDate(utc)
  return getMonthRangeKeys(next.y, next.m)
}

function shiftThreeMonthBlock(dateTo, direction) {
  const parts = parseKey(dateTo)
  if (!parts) return { dateFrom: dateTo, dateTo }
  const utc = new Date(Date.UTC(parts.y, parts.m - 1 + direction * 3, 1))
  const next = fromUtcDate(utc)
  return getThreeMonthsEndingAt(next.y, next.m)
}

/**
 * Shift the selected calendar period.
 * @param {string} preset
 * @param {string} dateFrom
 * @param {string} dateTo
 * @param {number} direction -1 | 1
 */
export function shiftSettlementsPeriod(preset, dateFrom, dateTo, direction) {
  const dir = direction < 0 ? -1 : 1
  if (
    preset === SETTLEMENTS_PERIOD_PRESET.TODAY ||
    preset === SETTLEMENTS_PERIOD_PRESET.YESTERDAY ||
    (preset === SETTLEMENTS_PERIOD_PRESET.CUSTOM && dateFrom === dateTo)
  ) {
    const next = addDaysToDateKey(dateFrom, dir)
    return { dateFrom: next, dateTo: next }
  }
  if (preset === SETTLEMENTS_PERIOD_PRESET.WEEK) {
    return {
      dateFrom: addDaysToDateKey(dateFrom, dir * 7),
      dateTo: addDaysToDateKey(dateTo, dir * 7),
    }
  }
  if (preset === SETTLEMENTS_PERIOD_PRESET.MONTH) {
    return shiftMonthRange(dateFrom, dir)
  }
  if (preset === SETTLEMENTS_PERIOD_PRESET.THREE_MONTHS) {
    return shiftThreeMonthBlock(dateTo, dir)
  }
  const span = diffDaysInclusive(dateFrom, dateTo)
  return {
    dateFrom: addDaysToDateKey(dateFrom, dir * span),
    dateTo: addDaysToDateKey(dateTo, dir * span),
  }
}

function formatDayMonthYear(dateKey) {
  const parts = parseKey(dateKey)
  if (!parts) return dateKey || '—'
  return `${parts.d} ${MONTHS_RU[parts.m - 1]} ${parts.y}`
}

function formatDayMonthShort(dateKey) {
  const parts = parseKey(dateKey)
  if (!parts) return dateKey || '—'
  return `${String(parts.d).padStart(2, '0')}.${String(parts.m).padStart(2, '0')}`
}

function formatDotDate(dateKey) {
  const parts = parseKey(dateKey)
  if (!parts) return dateKey || '—'
  return `${String(parts.d).padStart(2, '0')}.${String(parts.m).padStart(2, '0')}.${parts.y}`
}

/** Center label for the period navigator. */
export function formatSettlementsPeriodNavigatorLabel(preset, dateFrom, dateTo) {
  if (preset === SETTLEMENTS_PERIOD_PRESET.MONTH && isFullMonthRange(dateFrom, dateTo)) {
    const parts = parseKey(dateFrom)
    const name = MONTHS_RU[parts.m - 1]
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${parts.y}`
  }
  if (preset === SETTLEMENTS_PERIOD_PRESET.THREE_MONTHS && isThreeMonthRange(dateFrom, dateTo)) {
    const a = parseKey(dateFrom)
    const b = parseKey(dateTo)
    const left = MONTHS_RU_SHORT[a.m - 1]
    const right = MONTHS_RU_SHORT[b.m - 1]
    if (a.y === b.y) return `${left} — ${right} ${a.y}`
    return `${left} ${a.y} — ${right} ${b.y}`
  }
  if (preset === SETTLEMENTS_PERIOD_PRESET.WEEK && isWeekRange(dateFrom, dateTo)) {
    const a = parseKey(dateFrom)
    const b = parseKey(dateTo)
    if (a.m === b.m && a.y === b.y) {
      return `${a.d}–${b.d} ${MONTHS_RU_SHORT[a.m - 1]} ${a.y}`
    }
    return `${formatDayMonthShort(dateFrom)} – ${formatDayMonthShort(dateTo)}.${b.y}`
  }
  if (dateFrom === dateTo) return formatDayMonthYear(dateFrom)
  return `${formatDotDate(dateFrom)} — ${formatDotDate(dateTo)}`
}

/** Compact period label for settlements chrome. */
export function describeSettlementsPeriod(dateFrom, dateTo, reference = new Date()) {
  const preset = resolveSettlementsPeriodPreset(dateFrom, dateTo, reference)
  if (preset === SETTLEMENTS_PERIOD_PRESET.YESTERDAY) return 'Вчера'
  if (preset === SETTLEMENTS_PERIOD_PRESET.TODAY) return 'Сегодня'
  if (preset === SETTLEMENTS_PERIOD_PRESET.WEEK) return 'Неделя'
  if (preset === SETTLEMENTS_PERIOD_PRESET.MONTH) {
    const current = getMonthPeriodKeys(reference)
    if (dateFrom === current.dateFrom && dateTo === current.dateTo) return 'Месяц'
    const parts = parseKey(dateFrom)
    const name = MONTHS_RU[parts.m - 1]
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${parts.y}`
  }
  if (preset === SETTLEMENTS_PERIOD_PRESET.THREE_MONTHS) return 'Три месяца'
  return `${formatDotDate(dateFrom)} — ${formatDotDate(dateTo)}`
}
