import { clampRatingScore, getRatingScoreColor } from '../../utils/attendanceData'
import './EmployeeRating.css'

/** Горизонтальная шкала рейтинга 0–100 */
export default function RatingScoreBar({ score }) {
  const value = clampRatingScore(score)
  const fillColor = getRatingScoreColor(value)
  const fillWidth = value === 0 ? '4%' : `${value}%`

  return (
    <div className="rating-score-bar" aria-label={`Рейтинг ${value} из 100`}>
      <div
        className="rating-score-bar__fill"
        style={{ width: fillWidth, backgroundColor: fillColor }}
      />
      <span className="rating-score-bar__value">{value}</span>
    </div>
  )
}
