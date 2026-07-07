import './ProgressBar.css'

/**
 * Полоса прогресса — используется на странице курса и в кабинете
 */
export default function ProgressBar({ percent, label }) {
  return (
    <div className="progress-bar">
      {label && (
        <div className="progress-bar__header">
          <span className="progress-bar__label">{label}</span>
          <span className="progress-bar__percent">{percent}%</span>
        </div>
      )}
      <div className="progress-bar__track">
        <div
          className="progress-bar__fill"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
