/** Метаданные и валидация настроек автоматических уведомлений тайм-трекера */

export const TIME_TRACKER_RULE_CODES = [
  'time_tracker.rule.shift_start_soon',
  'time_tracker.rule.clock_in_missing',
  'time_tracker.rule.shift_end_reached',
  'time_tracker.rule.clock_out_missing',
]

export const OFFSET_MIN = 0
export const OFFSET_MAX = 1440

export const TIME_TRACKER_RULE_META = {
  'time_tracker.rule.shift_start_soon': {
    title: 'Напоминание о начале смены',
    description: 'Уведомление сотруднику перед запланированным началом смены.',
    offsetPrefix: 'Отправлять за',
    offsetLabel: 'минут до начала смены',
    defaultOffsetMinutes: 10,
  },
  'time_tracker.rule.clock_in_missing': {
    title: 'Не отмечен приход',
    description: 'Напоминание, если сотрудник не нажал «Я на работе» после начала смены.',
    offsetPrefix: 'Отправлять через',
    offsetLabel: 'минут после начала смены',
    defaultOffsetMinutes: 5,
  },
  'time_tracker.rule.shift_end_reached': {
    title: 'Завершение смены',
    description: 'Уведомление в момент запланированного окончания смены.',
    offsetPrefix: 'Отправлять через',
    offsetLabel: 'минут после окончания смены',
    defaultOffsetMinutes: 0,
  },
  'time_tracker.rule.clock_out_missing': {
    title: 'Не отмечен уход',
    description: 'Напоминание, если сотрудник не нажал «Я ухожу» после окончания смены.',
    offsetPrefix: 'Отправлять через',
    offsetLabel: 'минут после окончания смены',
    defaultOffsetMinutes: 10,
  },
}

const RULE_ORDER = TIME_TRACKER_RULE_CODES

export function sortNotificationSettings(settings = []) {
  return [...settings].sort(
    (a, b) => RULE_ORDER.indexOf(a.code) - RULE_ORDER.indexOf(b.code)
  )
}

export function validateOffsetMinutes(value) {
  if (value === '' || value == null) {
    return 'Укажите количество минут'
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    return 'Значение должно быть от 0 до 1440 минут'
  }
  if (parsed < OFFSET_MIN || parsed > OFFSET_MAX) {
    return 'Значение должно быть от 0 до 1440 минут'
  }
  return null
}

export function normalizeOffsetInput(value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return null
  if (parsed < OFFSET_MIN || parsed > OFFSET_MAX) return null
  return parsed
}

export function enrichNotificationSetting(row) {
  const meta = TIME_TRACKER_RULE_META[row.code] || {}
  const defaultOffsetMinutes = row.default_offset_minutes ?? meta.defaultOffsetMinutes ?? 0
  const offsetLabel = meta.offsetLabel || 'минут'

  return {
    ...row,
    title: meta.title || row.code,
    description: meta.description || '',
    offsetPrefix: meta.offsetPrefix || 'Отправлять через',
    offsetLabel,
    defaultOffsetMinutes,
    defaultOffsetText: `Стандартное значение: ${defaultOffsetMinutes} ${offsetLabel}`,
  }
}
