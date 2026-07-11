import {
  clampRatingScore,
  getRatingScoreGradient,
} from '../../utils/attendanceData'
import './EmployeeRating.css'

/** Горизонтальная шкала рейтинга 0–100 */
export default function RatingScoreBar({ score, compact = false, className = '' }) {
  const value = clampRatingScore(score)
  const gradient = getRatingScoreGradient(value)
  const fillWidth = value === 0 ? '0%' : compact ? `max(22px, ${value}%)` : `${value}%`

  if (compact) {
    return (
      <div
        className={`rating-score-bar rating-score-bar--compact${className ? ` ${className}` : ''}`}
        aria-label={`Рейтинг ${value} из 100`}
      >
        <div
          className="rating-score-bar__fill"
          style={{ width: fillWidth, background: gradient }}
        >
          {value > 0 && (
            <span className="rating-score-bar__value">{value}</span>
          )}
        </div>
        {value === 0 && (
          <span className="rating-score-bar__value rating-score-bar__value--empty">{value}</span>
        )}
      </div>
    )
  }

  return (
    <div
      className={`rating-score-bar${className ? ` ${className}` : ''}`}
      aria-label={`Рейтинг ${value} из 100`}
    >
      <div
        className="rating-score-bar__fill"
        style={{ width: fillWidth, background: gradient }}
      />
      <span className="rating-score-bar__value rating-score-bar__value--overlay">{value}</span>
    </div>
  )
}
