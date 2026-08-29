import { formatMonthLabel } from '../../services/salesDataService'

const WIDTH = 900
const HEIGHT = 280
const PAD_LEFT = 54
const PAD_RIGHT = 50
const PAD_TOP = 36
const PAD_BOTTOM = 30

const REVENUE_COLOR = '#93c5fd'
const MARGIN_COLOR = 'var(--color-primary, #059669)'
const MARGIN_PCT_COLOR = '#f59e0b'

function niceMax(value) {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / magnitude) * magnitude
}

function monthTick(monthKey) {
  return formatMonthLabel(monthKey).replace(' г.', '').split(' ')[0]
}

/**
 * Hand-rolled SVG combo chart — no charting dependency. Grouped bars for
 * revenue/valovaya marzha on the left (₸) axis, a line for marginPct on
 * the right (%) axis — mirrors the reference dashboard's "Динамика выручки
 * и маржи" over the whole synced history.
 */
export default function SalesTrendChart({ points }) {
  if (!points || points.length < 2) {
    return <p className="sales-chart-card__empty">Недостаточно данных для графика.</p>
  }

  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM

  const maxRevenue = niceMax(Math.max(...points.map((p) => p.revenue), 1))
  const maxPct = Math.max(10, niceMax(Math.max(...points.map((p) => p.marginPct || 0), 1)))

  const slotW = plotW / points.length
  const barGap = slotW * 0.14
  const barW = (slotW - barGap * 3) / 2

  const xSlot = (i) => PAD_LEFT + i * slotW
  const yFromCurrency = (v) => PAD_TOP + plotH - (Math.max(v, 0) / maxRevenue) * plotH
  const yFromPct = (v) => PAD_TOP + plotH - (Math.max(v, 0) / maxPct) * plotH

  const linePath = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${(xSlot(i) + slotW / 2).toFixed(1)} ${yFromPct(p.marginPct || 0).toFixed(1)}`
    )
    .join(' ')

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => PAD_TOP + t * plotH)

  const tickCount = Math.min(8, points.length)
  const tickStep = Math.max(1, Math.round((points.length - 1) / (tickCount - 1)))
  const tickIndices = []
  for (let i = 0; i < points.length; i += tickStep) tickIndices.push(i)
  if (tickIndices[tickIndices.length - 1] !== points.length - 1) tickIndices.push(points.length - 1)

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Выручка, валовая маржа и маржинальность по месяцам">
      <rect x={PAD_LEFT} y={7} width={10} height={10} fill={REVENUE_COLOR} rx="2" />
      <text x={PAD_LEFT + 16} y={16} fontSize="11" fill="var(--color-text-secondary, #64748b)">
        Выручка
      </text>
      <rect x={PAD_LEFT + 92} y={7} width={10} height={10} fill={MARGIN_COLOR} rx="2" />
      <text x={PAD_LEFT + 108} y={16} fontSize="11" fill="var(--color-text-secondary, #64748b)">
        Валовая маржа
      </text>
      <circle cx={PAD_LEFT + 228} cy={12} r={4} fill={MARGIN_PCT_COLOR} />
      <text x={PAD_LEFT + 237} y={16} fontSize="11" fill="var(--color-text-secondary, #64748b)">
        Маржинальность %
      </text>

      {gridY.map((y) => (
        <line
          key={y}
          x1={PAD_LEFT}
          y1={y}
          x2={WIDTH - PAD_RIGHT}
          y2={y}
          stroke="var(--color-border, #e2e8f0)"
          strokeWidth="1"
        />
      ))}

      <text x={2} y={PAD_TOP + 4} fontSize="10" fill="var(--color-text-secondary, #94a3b8)">
        {Math.round(maxRevenue).toLocaleString('ru-KZ')}
      </text>
      <text x={2} y={PAD_TOP + plotH} fontSize="10" fill="var(--color-text-secondary, #94a3b8)">
        0
      </text>

      <text x={WIDTH - PAD_RIGHT + 6} y={PAD_TOP + 4} fontSize="10" fill="var(--color-text-secondary, #94a3b8)">
        {Math.round(maxPct)}%
      </text>
      <text x={WIDTH - PAD_RIGHT + 6} y={PAD_TOP + plotH} fontSize="10" fill="var(--color-text-secondary, #94a3b8)">
        0%
      </text>

      {points.map((p, i) => (
        <g key={p.monthKey}>
          <rect
            x={xSlot(i) + barGap}
            y={yFromCurrency(p.revenue)}
            width={barW}
            height={Math.max(0, PAD_TOP + plotH - yFromCurrency(p.revenue))}
            fill={REVENUE_COLOR}
            rx="2"
          />
          <rect
            x={xSlot(i) + barGap * 2 + barW}
            y={yFromCurrency(p.grossMargin)}
            width={barW}
            height={Math.max(0, PAD_TOP + plotH - yFromCurrency(p.grossMargin))}
            fill={MARGIN_COLOR}
            rx="2"
          />
        </g>
      ))}

      <path d={linePath} fill="none" stroke={MARGIN_PCT_COLOR} strokeWidth="2" />
      {points.map((p, i) => (
        <circle
          key={`dot-${p.monthKey}`}
          cx={xSlot(i) + slotW / 2}
          cy={yFromPct(p.marginPct || 0)}
          r={i === points.length - 1 ? 4 : 2.5}
          fill={MARGIN_PCT_COLOR}
        />
      ))}

      {tickIndices.map((i) => (
        <text
          key={i}
          x={xSlot(i) + slotW / 2}
          y={HEIGHT - 8}
          fontSize="10"
          textAnchor="middle"
          fill="var(--color-text-secondary, #94a3b8)"
        >
          {monthTick(points[i].monthKey)}
        </text>
      ))}
    </svg>
  )
}
