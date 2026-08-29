import { useState } from 'react'
import { formatMonthLabel } from '../../services/salesDataService'
import { formatUmagMoney } from '../../services/umagSettlementsService'
import './SalesShared.css'

const WIDTH = 900
const HEIGHT = 280
const PAD_LEFT = 54
const PAD_RIGHT = 50
const PAD_TOP = 36
const PAD_BOTTOM = 30

const REVENUE_COLOR = '#93c5fd'
const REVENUE_COLOR_HOVER = '#3b82f6'
const MARGIN_COLOR = 'var(--color-primary, #059669)'
const MARGIN_COLOR_HOVER = '#047857'
const MARGIN_PCT_COLOR = '#f59e0b'

const REVENUE_TICK_STEP = 10_000_000
const PCT_TICK_UNIT = 5
const MIN_TICK_COUNT = 4
const TOOLTIP_W = 150
const TOOLTIP_H = 70

function formatAxisMoney(value) {
  if (value <= 0) return '0'
  const millions = value / 1_000_000
  const rounded = Math.round(millions * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}М`
}

function monthTick(monthKey) {
  return formatMonthLabel(monthKey).replace(' г.', '').split(' ')[0]
}

function monthTooltipTitle(monthKey) {
  const label = formatMonthLabel(monthKey).replace(' г.', '')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/**
 * Hand-rolled SVG combo chart — no charting dependency. Grouped bars for
 * revenue/valovaya marzha on the left (₸) axis, a line for marginPct on
 * the right (%) axis — mirrors the reference dashboard's "Динамика выручки
 * и маржи" over the whole synced history, with a hover tooltip per month.
 */
export default function SalesTrendChart({ points }) {
  const [hoverIndex, setHoverIndex] = useState(null)

  if (!points || points.length < 2) {
    return <p className="sales-chart-card__empty">Недостаточно данных для графика.</p>
  }

  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM

  const maxRevenueRaw = Math.max(...points.map((p) => p.revenue), 1)
  const maxPctRaw = Math.max(...points.map((p) => p.marginPct || 0), 1)

  // Revenue gets a fixed round step (10M ₸) — the number of gridlines follows
  // from the data. The % axis is then snapped to the nearest multiple of 5
  // across that same number of gridlines, so both axes stay on round numbers
  // while sharing one set of horizontal gridlines.
  const TICK_COUNT = Math.max(MIN_TICK_COUNT, Math.ceil(maxRevenueRaw / REVENUE_TICK_STEP))
  const maxRevenue = TICK_COUNT * REVENUE_TICK_STEP
  const pctStep = Math.max(PCT_TICK_UNIT, Math.ceil(maxPctRaw / TICK_COUNT / PCT_TICK_UNIT) * PCT_TICK_UNIT)
  const maxPct = pctStep * TICK_COUNT

  const slotW = plotW / points.length
  const barGap = slotW * 0.14
  const barW = (slotW - barGap * 3) / 2

  const xSlot = (i) => PAD_LEFT + i * slotW
  const yFromCurrency = (v) => PAD_TOP + plotH - (Math.max(v, 0) / maxRevenue) * plotH
  const yFromPct = (v) => PAD_TOP + plotH - (Math.max(v, 0) / maxPct) * plotH
  const yFromTick = (i) => PAD_TOP + plotH - (i / TICK_COUNT) * plotH

  const linePath = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${(xSlot(i) + slotW / 2).toFixed(1)} ${yFromPct(p.marginPct || 0).toFixed(1)}`
    )
    .join(' ')

  const gridTicks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => i)

  const tickCount = Math.min(8, points.length)
  const tickStep = Math.max(1, Math.round((points.length - 1) / (tickCount - 1)))
  const tickIndices = []
  for (let i = 0; i < points.length; i += tickStep) tickIndices.push(i)
  if (tickIndices[tickIndices.length - 1] !== points.length - 1) tickIndices.push(points.length - 1)

  const hovered = hoverIndex != null ? points[hoverIndex] : null
  const hoverCenterX = hoverIndex != null ? xSlot(hoverIndex) + slotW / 2 : 0
  const tooltipX = Math.min(Math.max(hoverCenterX - TOOLTIP_W / 2, PAD_LEFT), WIDTH - PAD_RIGHT - TOOLTIP_W)

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Выручка, валовая маржа и маржинальность по месяцам">
      <circle cx={PAD_LEFT + 4} cy={12} r={4} fill={REVENUE_COLOR} />
      <text x={PAD_LEFT + 14} y={16} fontSize="11" fill="var(--color-text-secondary, #64748b)">
        Выручка
      </text>
      <circle cx={PAD_LEFT + 96} cy={12} r={4} fill={MARGIN_COLOR} />
      <text x={PAD_LEFT + 106} y={16} fontSize="11" fill="var(--color-text-secondary, #64748b)">
        Валовая маржа
      </text>
      <circle cx={PAD_LEFT + 232} cy={12} r={4} fill={MARGIN_PCT_COLOR} />
      <text x={PAD_LEFT + 242} y={16} fontSize="11" fill="var(--color-text-secondary, #64748b)">
        Маржинальность %
      </text>

      {gridTicks.map((i) => (
        <line
          key={i}
          x1={PAD_LEFT}
          y1={yFromTick(i)}
          x2={WIDTH - PAD_RIGHT}
          y2={yFromTick(i)}
          stroke="var(--color-border, #e2e8f0)"
          strokeWidth="1"
          opacity={i === 0 ? 1 : 0.6}
        />
      ))}

      {gridTicks.map((i) => (
        <text key={`l-${i}`} x={2} y={yFromTick(i) + 3} fontSize="10" fill="var(--color-text-secondary, #94a3b8)">
          {formatAxisMoney(i * REVENUE_TICK_STEP)}
        </text>
      ))}
      {gridTicks.map((i) => (
        <text
          key={`r-${i}`}
          x={WIDTH - PAD_RIGHT + 6}
          y={yFromTick(i) + 3}
          fontSize="10"
          fill="var(--color-text-secondary, #94a3b8)"
        >
          {Math.round(i * pctStep)}%
        </text>
      ))}

      {hoverIndex != null ? (
        <g className="sales-combo-chart__guide" style={{ transform: `translateX(${hoverCenterX}px)` }}>
          <line x1={0} y1={PAD_TOP} x2={0} y2={PAD_TOP + plotH} stroke="var(--color-text-secondary, #94a3b8)" strokeWidth="1" strokeDasharray="3 3" />
        </g>
      ) : null}

      {points.map((p, i) => (
        <g key={p.monthKey}>
          <rect
            className="sales-combo-chart__bar"
            x={xSlot(i) + barGap}
            y={yFromCurrency(p.revenue)}
            width={barW}
            height={Math.max(0, PAD_TOP + plotH - yFromCurrency(p.revenue))}
            fill={hoverIndex === i ? REVENUE_COLOR_HOVER : REVENUE_COLOR}
            rx="2"
          />
          <rect
            className="sales-combo-chart__bar"
            x={xSlot(i) + barGap * 2 + barW}
            y={yFromCurrency(p.grossMargin)}
            width={barW}
            height={Math.max(0, PAD_TOP + plotH - yFromCurrency(p.grossMargin))}
            fill={hoverIndex === i ? MARGIN_COLOR_HOVER : MARGIN_COLOR}
            rx="2"
          />
        </g>
      ))}

      <path d={linePath} fill="none" stroke={MARGIN_PCT_COLOR} strokeWidth="2" />
      {points.map((p, i) => (
        <circle
          key={`dot-${p.monthKey}`}
          className="sales-combo-chart__dot"
          cx={xSlot(i) + slotW / 2}
          cy={yFromPct(p.marginPct || 0)}
          r={hoverIndex === i ? 5 : i === points.length - 1 ? 4 : 2.5}
          fill={MARGIN_PCT_COLOR}
        />
      ))}

      {points.map((p, i) => (
        <rect
          key={`hit-${p.monthKey}`}
          x={xSlot(i)}
          y={PAD_TOP}
          width={slotW}
          height={plotH}
          fill="transparent"
          onMouseEnter={() => setHoverIndex(i)}
          onMouseLeave={() => setHoverIndex((cur) => (cur === i ? null : cur))}
          style={{ cursor: 'pointer' }}
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

      {hovered ? (
        <g
          className="sales-combo-chart__tooltip"
          style={{ transform: `translate(${tooltipX}px, ${PAD_TOP + 4}px)` }}
        >
          <rect
            width={TOOLTIP_W}
            height={TOOLTIP_H}
            rx="7"
            fill="var(--color-white, #fff)"
            stroke="var(--color-border, #e2e8f0)"
          />
          <text x={10} y={16} fontSize="11" fontWeight="600" fill="var(--color-text, #0f172a)">
            {monthTooltipTitle(hovered.monthKey)}
          </text>

          <circle cx={14} cy={30} r={3} fill={MARGIN_PCT_COLOR} />
          <text x={22} y={33} fontSize="10" fill="var(--color-text-secondary, #64748b)">
            Маржинальность: <tspan fontWeight="600" fill="var(--color-text, #0f172a)">{(hovered.marginPct || 0).toFixed(1)}%</tspan>
          </text>

          <circle cx={14} cy={46} r={3} fill={REVENUE_COLOR_HOVER} />
          <text x={22} y={49} fontSize="10" fill="var(--color-text-secondary, #64748b)">
            Выручка: <tspan fontWeight="600" fill="var(--color-text, #0f172a)">{formatUmagMoney(hovered.revenue)}</tspan>
          </text>

          <circle cx={14} cy={59} r={3} fill={MARGIN_COLOR_HOVER} />
          <text x={22} y={62} fontSize="10" fill="var(--color-text-secondary, #64748b)">
            Маржа: <tspan fontWeight="600" fill="var(--color-text, #0f172a)">{formatUmagMoney(hovered.grossMargin)}</tspan>
          </text>
        </g>
      ) : null}
    </svg>
  )
}
