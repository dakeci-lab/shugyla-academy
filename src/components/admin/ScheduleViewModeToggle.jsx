import './ScheduleViewModeToggle.css'

/**
 * Week / Day mode toggle for the team schedule.
 */
export default function ScheduleViewModeToggle({ value, onChange }) {
  return (
    <div className="schedule-view-toggle" role="group" aria-label="Режим графика">
      <button
        type="button"
        className={`schedule-view-toggle__btn${value === 'week' ? ' schedule-view-toggle__btn--active' : ''}`}
        aria-pressed={value === 'week'}
        onClick={() => onChange('week')}
      >
        Неделя
      </button>
      <button
        type="button"
        className={`schedule-view-toggle__btn${value === 'day' ? ' schedule-view-toggle__btn--active' : ''}`}
        aria-pressed={value === 'day'}
        onClick={() => onChange('day')}
      >
        День
      </button>
    </div>
  )
}
