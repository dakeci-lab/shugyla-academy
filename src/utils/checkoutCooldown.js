/** Защита от случайного ухода сразу после открытия смены (только UI тайм-трекера). */
export const CHECKOUT_COOLDOWN_MS = 60_000

/**
 * Оставшееся время блокировки «Я ухожу» / «Завершить смену».
 * Источник истины — timestamp успешного открытия смены (actualStartTime).
 */
export function getCheckoutCooldownRemainingMs(actualStartTime, now = new Date()) {
  if (!actualStartTime) return 0

  const start = new Date(actualStartTime)
  if (Number.isNaN(start.getTime())) return 0

  const elapsed = now.getTime() - start.getTime()
  if (elapsed < 0) return CHECKOUT_COOLDOWN_MS
  return Math.max(0, CHECKOUT_COOLDOWN_MS - elapsed)
}

/** Компактная подпись для disabled-кнопки ухода */
export function formatCheckoutCooldownHint(remainingMs) {
  if (!remainingMs || remainingMs <= 0) return ''

  const totalSec = Math.max(1, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return `Будет доступно через ${mm}:${ss}`
}
