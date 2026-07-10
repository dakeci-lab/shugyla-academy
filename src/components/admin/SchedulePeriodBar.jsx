import { ChevronLeftIcon, ChevronRightIcon } from '../icons/PlatformIcons'
import './EmployeeSchedule.css'

/** Зелёная панель навигации по периоду (неделя / месяц) */
export default function SchedulePeriodBar({
  title,
  onPrev,
  onNext,
  onToday,
  prevLabel = 'Предыдущий период',
  nextLabel = 'Следующий период',
}) {
  return (
    <div className="schedule-week-bar">
      <button
        type="button"
        className="schedule-week-bar__nav"
        onClick={onPrev}
        aria-label={prevLabel}
      >
        <ChevronLeftIcon />
      </button>

      <div className="schedule-week-bar__main">
        <h2 className="schedule-week-bar__title">{title}</h2>
        <button type="button" className="schedule-week-bar__today" onClick={onToday}>
          Сегодня
        </button>
      </div>

      <button
        type="button"
        className="schedule-week-bar__nav"
        onClick={onNext}
        aria-label={nextLabel}
      >
        <ChevronRightIcon />
      </button>
    </div>
  )
}
