/**
 * One way to show money (tenge) everywhere: a whole amount without decimals («150 ₸», «17 040 ₸»), an amount with
 * tiyn always with exactly two digits («246 917,60 ₸», «42,40 ₸»), never «246 917,6». The number is rounded to tiyn first.
 */
export function formatTengeNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n * 100) / 100
  const whole = Number.isInteger(rounded)
  return (rounded === 0 ? 0 : rounded).toLocaleString('ru-RU', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
}

export function formatTenge(value, empty = '—') {
  if (value == null || value === '') return empty
  const text = formatTengeNumber(value)
  return text == null ? empty : `${text} ₸`
}
