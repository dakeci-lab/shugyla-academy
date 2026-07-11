import SchedulePeriodBar from '../admin/SchedulePeriodBar'
import { formatWeekDayHeader, toDateKey } from '../../utils/shiftData'
import './SimpleDeliveryCard.css'
import '../admin/EmployeeSchedule.css'

/** Единая навигация: неделя + выбор дня (Закуп / Приёмка) */
export default function WeekScheduleNav({
  weekTitle,
  weekDates,
  selectedDateKey,
  todayKey,
  countsByDate = {},
  onPrevWeek,
  onNextWeek,
  onToday,
  onSelectDate,
}) {
  return (
    <>
      <SchedulePeriodBar
        title={weekTitle}
        onPrev={onPrevWeek}
        onNext={onNextWeek}
        onToday={onToday}
        prevLabel="Предыдущая неделя"
        nextLabel="Следующая неделя"
      />

      <div className="simple-receiving-day-bar" role="tablist" aria-label="Дни недели">
        {weekDates.map((date) => {
          const dateKey = toDateKey(date)
          const { weekday, day } = formatWeekDayHeader(date)
          const isToday = dateKey === todayKey
          const isSelected = selectedDateKey === dateKey
          const count = countsByDate[dateKey] || 0

          return (
            <button
              key={dateKey}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`simple-receiving-day-bar__day${isSelected ? ' simple-receiving-day-bar__day--active' : ''}${isToday ? ' simple-receiving-day-bar__day--today' : ''}`}
              onClick={() => onSelectDate(dateKey)}
            >
              <span className="simple-receiving-day-bar__weekday">{weekday}</span>
              <span className="simple-receiving-day-bar__number">{day}</span>
              {count > 0 && (
                <span className="simple-receiving-day-bar__count">{count}</span>
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}
