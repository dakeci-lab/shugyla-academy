/**
 * Heat-scale coloring for sales data cells, ported 1:1 from the reference
 * dashboard (Дашборд_Воронка_продаж_2025_2026 20.07 с закупом.html) so the
 * platform's version reads the same way: red→yellow→green relative to a
 * row's own min/median/max, plus a separate 5-step band for Δ год cells.
 */

/** Diverging red→amber→green, interpolated around `mid` (usually the row's median). */
export function heatColor(v, lo, mid, hi) {
  if (v == null || Number.isNaN(v)) return ''
  let r, g, b
  if (v <= mid) {
    const t = (v - lo) / (mid - lo || 1)
    r = Math.round(248 + (255 - 248) * t)
    g = Math.round(105 + (235 - 105) * t)
    b = Math.round(107 + (132 - 107) * t)
  } else {
    const t = (v - mid) / (hi - mid || 1)
    r = Math.round(255 + (99 - 255) * t)
    g = Math.round(235 + (190 - 235) * t)
    b = Math.round(132 + (123 - 132) * t)
  }
  return `rgb(${r}, ${g}, ${b})`
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length === 0) return 0
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Background + readable-on-heat text color for one value within a row of values. */
export function heatCellStyle(value, rowValues, { bold = true } = {}) {
  const numeric = rowValues.filter((v) => v != null && !Number.isNaN(v))
  const lo = numeric.length ? Math.min(...numeric) : 0
  const hi = numeric.length ? Math.max(...numeric) : 0
  const mid = median(numeric)
  if (!(hi > lo) || value == null || Number.isNaN(value)) return {}
  return { background: heatColor(value, lo, mid, hi), color: '#04243a', fontWeight: bold ? 600 : 400 }
}

/**
 * 5-step band for a year-over-year % (or pp) change — same thresholds as
 * the reference's `col5`: < -40% dark red, < -15% pink, |Δ| ≤ 15% neutral
 * white, ≤ 40% light green, else green.
 */
export function deltaBandColor(pct) {
  if (pct == null || Number.isNaN(pct)) return ''
  if (pct < -40) return '#e06666'
  if (pct < -15) return '#ffc7ce'
  if (pct <= 15) return '#ffffff'
  if (pct <= 40) return '#c6efce'
  return '#6fcf97'
}

export function deltaCellStyle(pct) {
  const background = deltaBandColor(pct)
  if (!background) return {}
  return { background, color: '#06223d', fontWeight: 600 }
}
