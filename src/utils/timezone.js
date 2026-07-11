/** Часовой пояс компании — Казахстан (UTC+5, без DST) */
export const APP_TIMEZONE = 'Asia/Almaty'

/** YYYY-MM-DD в часовом поясе приложения */
export function toDateKeyInAppTimezone(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Смещение dateKey на N календарных дней */
export function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getYesterdayDateKeyInAppTimezone(date = new Date()) {
  return addDaysToDateKey(toDateKeyInAppTimezone(date), -1)
}
