import { formatMonthLabel } from '../../services/salesDataService'

const WIDTH = 760
const HEIGHT = 220
const PAD_LEFT = 56
const PAD_RIGHT = 16
const PAD_TOP = 16
const PAD_BOTTOM = 28

/** Hand-rolled SVG line+area chart — no charting dependency for one trend line. */
export default function SalesTrendChart({ points }) {
  if (!points || points.length < 2) {
    return <p className="sales-chart-card__empty">Недостаточно данных для графика.</p>
  }

  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM
  const maxValue = Math.max(...points.map((p) => p.value), 1)
  const minValue = Math.min(0, ...points.map((p) => p.value))
  const range = maxValue - minValue || 1

  const xAt = (i) => PAD_LEFT + (i / (points.length - 1)) * plotW
  const yAt = (value) => PAD_TOP + plotH - ((value - minValue) / range) * plotH

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.value).toFixed(1)}`)
    .join(' ')
  const areaPath = `${linePath} L ${xAt(points.length - 1).toFixed(1)} ${yAt(minValue).toFixed(1)} L ${xAt(0).toFixed(1)} ${yAt(minValue).toFixed(1)} Z`

  const tickCount = Math.min(6, points.length)
  const tickStep = Math.max(1, Math.round((points.length - 1) / (tickCount - 1)))
  const tickIndices = []
  for (let i = 0; i < points.length; i += tickStep) tickIndices.push(i)
  if (tickIndices[tickIndices.length - 1] !== points.length - 1) {
    tickIndices.push(points.length - 1)
  }

  const gridY = [0, 0.5, 1].map((t) => PAD_TOP + t * plotH)
  const last = points[points.length - 1]

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="График выручки по месяцам">
      {gridY.map((y) => (
        <line key={y} x1={PAD_LEFT} y1={y} x2={WIDTH - PAD_RIGHT} y2={y} stroke="var(--color-border, #e2e8f0)" strokeWidth="1" />
      ))}
      <text x={4} y={PAD_TOP + 4} fontSize="10" fill="var(--color-text-secondary, #94a3b8)">
        {Math.round(maxValue).toLocaleString('ru-KZ')}
      </text>
      <text x={4} y={PAD_TOP + plotH} fontSize="10" fill="var(--color-text-secondary, #94a3b8)">
        {Math.round(minValue).toLocaleString('ru-KZ')}
      </text>

      <path d={areaPath} fill="var(--color-primary, #059669)" fillOpacity="0.08" stroke="none" />
      <path d={linePath} fill="none" stroke="var(--color-primary, #059669)" strokeWidth="2" />

      {points.map((p, i) => (
        <circle
          key={p.monthKey}
          cx={xAt(i)}
          cy={yAt(p.value)}
          r={i === points.length - 1 ? 4 : 2.5}
          fill="var(--color-primary, #059669)"
        />
      ))}

      <circle cx={xAt(points.length - 1)} cy={yAt(last.value)} r={4} fill="var(--color-primary, #059669)" />
      <text
        x={xAt(points.length - 1)}
        y={yAt(last.value) - 10}
        fontSize="11"
        fontWeight="700"
        textAnchor="end"
        fill="var(--color-text, #0f172a)"
      >
        {Math.round(last.value).toLocaleString('ru-KZ')} ₸
      </text>

      {tickIndices.map((i) => (
        <text
          key={i}
          x={xAt(i)}
          y={HEIGHT - 8}
          fontSize="10"
          textAnchor="middle"
          fill="var(--color-text-secondary, #94a3b8)"
        >
          {formatMonthLabel(points[i].monthKey).replace(' г.', '').split(' ')[0]}
        </text>
      ))}
    </svg>
  )
}
