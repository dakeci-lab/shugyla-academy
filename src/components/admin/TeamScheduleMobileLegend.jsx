import { MOBILE_SCHEDULE_LEGEND } from '../../utils/teamScheduleMobileUtils'
import './TeamScheduleMobile.css'

/** Компактная легенда цветов для мобильного графика */
export default function TeamScheduleMobileLegend() {
  return (
    <div className="team-schedule-mobile-legend" aria-label="Легенда статусов">
      {MOBILE_SCHEDULE_LEGEND.map((item) => (
        <div key={item.indicator} className="team-schedule-mobile-legend__item">
          <span
            className={`team-schedule-mobile-indicator team-schedule-mobile-indicator--${item.indicator}`}
            aria-hidden="true"
          />
          <span className="team-schedule-mobile-legend__label">{item.label}</span>
        </div>
      ))}
    </div>
  )
}
