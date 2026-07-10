import {
  WEEKDAY_LABELS,
  buildMonthCalendar,
  toDateKey,
  formatTimeRange,
  formatTimeValue,
  SHIFT_STATUS_LABELS,
  SHIFT_STATUS_CSS,
  isWorkingShiftStatus,
} from '../../utils/shiftData'
import { PencilIcon } from '../icons/PlatformIcons'
import './EmployeeSchedule.css'

function ShiftDayCell({ date, shift, editable, onEdit }) {
  if (!date) {
    return <div className="schedule-calendar__cell schedule-calendar__cell--empty" />
  }

  const dateKey = toDateKey(date)
  const status = shift?.status
  const statusClass = status ? SHIFT_STATUS_CSS[status] : 'shift-day--empty'
  const isToday = toDateKey(new Date()) === dateKey

  function handleClick() {
    if (editable) onEdit(dateKey)
  }

  function handleEditClick(event) {
    event.stopPropagation()
    if (editable) onEdit(dateKey)
  }

  return (
    <div className="schedule-calendar__cell">
      <div
        className={`shift-day ${statusClass}`}
        onClick={handleClick}
        role={editable ? 'button' : undefined}
        tabIndex={editable ? 0 : undefined}
        onKeyDown={(event) => {
          if (editable && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            onEdit(dateKey)
          }
        }}
      >
        <span className="shift-day__number">{date.getDate()}{isToday ? ' ·' : ''}</span>
        {shift ? (
          <>
            {isWorkingShiftStatus(status) && (
              <span className="shift-day__time">
                {formatTimeRange(shift.plannedStartTime, shift.plannedEndTime)}
              </span>
            )}
            <span className="shift-day__status">{SHIFT_STATUS_LABELS[status]}</span>
            {(shift.actualStartTime || shift.actualEndTime) && (
              <span className="shift-day__actual">
                Факт: {formatTimeRange(shift.actualStartTime, shift.actualEndTime)}
              </span>
            )}
            {shift.lateMinutes > 0 && (
              <span className="shift-day__actual">Опозд: {shift.lateMinutes} мин</span>
            )}
            {shift.earlyLeaveMinutes > 0 && (
              <span className="shift-day__actual">Ранний уход: {shift.earlyLeaveMinutes} мин</span>
            )}
          </>
        ) : (
          <span className="shift-day__status">—</span>
        )}
        {editable && (
          <button type="button" className="shift-day__edit" onClick={handleEditClick} aria-label="Редактировать день">
            <PencilIcon size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

/** Месячный календарь смен */
export default function EmployeeScheduleCalendar({
  year,
  month,
  shiftMap,
  editable = false,
  onEditDay,
}) {
  const cells = buildMonthCalendar(year, month)

  return (
    <div className="schedule-calendar" role="grid" aria-label="Календарь смен">
      {WEEKDAY_LABELS.map((label) => (
        <div key={label} className="schedule-calendar__weekday">
          {label}
        </div>
      ))}
      {cells.map((date, index) => (
        <ShiftDayCell
          key={date ? toDateKey(date) : `empty-${index}`}
          date={date}
          shift={date ? shiftMap.get(toDateKey(date)) : null}
          editable={editable}
          onEdit={onEditDay}
        />
      ))}
    </div>
  )
}

export { formatTimeValue }
