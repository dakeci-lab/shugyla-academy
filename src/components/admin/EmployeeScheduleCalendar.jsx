import {
  WEEKDAY_LABELS,
  buildMonthCalendar,
  isOutsideViewMonth,
  toDateKey,
  formatTimeRange,
  formatTimeValue,
  SHIFT_STATUS_LABELS,
  SHIFT_STATUS_CSS,
  isWorkingShiftStatus,
} from '../../utils/shiftData'
import { SYNC_STATUS } from '../../hooks/useScheduleBackgroundSync'
import { PencilIcon } from '../icons/PlatformIcons'
import './EmployeeSchedule.css'

function ShiftDayCell({
  date,
  shift,
  syncMeta,
  dayEditable,
  restrictionReason,
  onEdit,
  onRetrySync,
  outsideMonth = false,
}) {
  const dateKey = toDateKey(date)
  const status = shift?.status
  const statusClass = status ? SHIFT_STATUS_CSS[status] : 'shift-day--empty'
  const isToday = toDateKey(new Date()) === dateKey
  const syncFailed = syncMeta?.syncStatus === SYNC_STATUS.ERROR || syncMeta?.syncStatus === SYNC_STATUS.UNSYNCED
  const interactive = Boolean(dayEditable && onEdit)
  const employmentLocked = Boolean(restrictionReason)

  function openDay() {
    if (interactive) onEdit(dateKey)
  }

  function handleEditClick(event) {
    event.stopPropagation()
    openDay()
  }

  return (
    <div className="schedule-calendar__cell">
      <div
        className={[
          'shift-day',
          statusClass,
          isToday ? 'shift-day--today' : '',
          syncFailed ? 'shift-day--sync-error' : '',
          interactive ? 'shift-day--interactive' : '',
          employmentLocked ? 'shift-day--employment-locked' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={openDay}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-disabled={employmentLocked ? true : undefined}
        title={restrictionReason || undefined}
        onKeyDown={(event) => {
          if (interactive && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            openDay()
          }
        }}
      >
        <div className="shift-day__top">
          <span
            className={[
              'shift-day__number',
              outsideMonth ? 'shift-day__number--outside' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {date.getDate()}
          </span>
          {dayEditable && (
            <button
              type="button"
              className="shift-day__edit"
              onClick={handleEditClick}
              aria-label="Открыть смену"
            >
              <PencilIcon size={12} />
            </button>
          )}
        </div>

        {shift ? (
          <>
            <span className="shift-day__time">
              {isWorkingShiftStatus(status)
                ? formatTimeRange(shift.plannedStartTime, shift.plannedEndTime)
                : '—'}
            </span>
            <span className="shift-day__status">{SHIFT_STATUS_LABELS[status] || '—'}</span>
          </>
        ) : (
          <>
            <span className="shift-day__time">—</span>
            <span className="shift-day__status">Нет смены</span>
          </>
        )}

        {syncFailed && dayEditable && (
          <button
            type="button"
            className="shift-day__retry"
            onClick={(event) => {
              event.stopPropagation()
              onRetrySync?.(dateKey)
            }}
            aria-label="Повторить синхронизацию"
            title="Не синхронизировано — повторить"
          >
            !
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
  syncMetaByDate = {},
  editable = false,
  canEditDate = null,
  getDateRestrictionReason = null,
  onEditDay,
  onRetrySync,
}) {
  const cells = buildMonthCalendar(year, month)

  return (
    <div className="schedule-calendar" role="grid" aria-label="Календарь смен">
      {WEEKDAY_LABELS.map((label) => (
        <div key={label} className="schedule-calendar__weekday">
          {label}
        </div>
      ))}
      {cells.map((date) => {
        const dateKey = toDateKey(date)
        const restrictionReason = getDateRestrictionReason?.(dateKey) || null
        const dayEditable =
          Boolean(editable) &&
          (typeof canEditDate === 'function' ? canEditDate(dateKey) : true) &&
          !restrictionReason

        return (
          <ShiftDayCell
            key={dateKey}
            date={date}
            shift={shiftMap.get(dateKey) || null}
            syncMeta={syncMetaByDate[dateKey]}
            dayEditable={dayEditable}
            restrictionReason={restrictionReason}
            onEdit={onEditDay}
            onRetrySync={onRetrySync}
            outsideMonth={isOutsideViewMonth(date, year, month)}
          />
        )
      })}
    </div>
  )
}

export { formatTimeValue }
