import { clampRatingScore } from '../../utils/attendanceData'
import { getCompanyHealthColor } from '../../utils/companyHealth'

/** Круговой индикатор здоровья компании 0–100% */
export default function CompanyHealthGauge({ score, size = 220 }) {
  const value = clampRatingScore(score)
  const color = getCompanyHealthColor(value)
  const stroke = 14
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference
  const center = size / 2

  return (
    <div
      className="company-health-gauge"
      style={{ width: size, height: size }}
      aria-label={`Здоровье компании ${value}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-border, #e5e7eb)"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          className="company-health-gauge__arc"
        />
      </svg>
      <div className="company-health-gauge__center">
        <span className="company-health-gauge__value">{value}%</span>
        <span className="company-health-gauge__label">Здоровье компании</span>
      </div>
    </div>
  )
}
