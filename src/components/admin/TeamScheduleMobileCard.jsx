import { useState } from 'react'
import EmployeeAvatar from '../EmployeeAvatar'
import { ChevronDownIcon } from '../icons/PlatformIcons'
import { toDateKey } from '../../utils/shiftData'
import { formatTeamScheduleMobileDay } from '../../utils/teamScheduleMobileUtils'
import './TeamScheduleMobile.css'

function TeamScheduleMobileDayCell({ day, isToday, onOpen }) {
  const hasTimes = day.startTime || day.endTime

  return (
    <button
      type="button"
      className={`team-schedule-mobile-day${isToday ? ' team-schedule-mobile-day--today' : ''}`}
      onClick={onOpen}
      aria-label={`${day.weekday} ${day.day}, открыть подробности`}
    >
      <span className="team-schedule-mobile-day__weekday">{day.weekday}</span>
      <span className="team-schedule-mobile-day__number">{day.day}</span>

      {hasTimes ? (
        <span className="team-schedule-mobile-day__times">
          {day.startTime && <span className="team-schedule-mobile-day__time">{day.startTime}</span>}
          {day.endTime && <span className="team-schedule-mobile-day__time">{day.endTime}</span>}
        </span>
      ) : (
        <span className="team-schedule-mobile-day__label">{day.shortLabel}</span>
      )}

      <span
        className={`team-schedule-mobile-indicator team-schedule-mobile-indicator--${day.indicator}`}
        aria-hidden="true"
      />
    </button>
  )
}

function TeamScheduleMobileDayExpanded({ day }) {
  const { cell } = day
  const badgeLabel = day.status?.label || cell.badge?.label || '—'

  return (
    <div className="team-schedule-mobile-expanded-day">
      <div className="team-schedule-mobile-expanded-day__head">
        <span className="team-schedule-mobile-expanded-day__weekday">{day.weekday}</span>
        <span className="team-schedule-mobile-expanded-day__number">{day.day}</span>
      </div>
      <div className="team-schedule-mobile-expanded-day__row">
        <span className="team-schedule-mobile-expanded-day__key">План</span>
        <span>{cell.showPlan && cell.plannedTime ? cell.plannedTime : day.shortLabel}</span>
      </div>
      {cell.showActual && (
        <div className="team-schedule-mobile-expanded-day__row">
          <span className="team-schedule-mobile-expanded-day__key">Факт</span>
          <span>{cell.actualTime || '—'}</span>
        </div>
      )}
      <div className="team-schedule-mobile-expanded-day__row">
        <span className="team-schedule-mobile-expanded-day__key">Статус</span>
        <span>{badgeLabel || (day.indicator === 'scheduled' ? 'Запланировано' : '—')}</span>
      </div>
    </div>
  )
}

/** Мобильная карточка сотрудника с недельной сеткой */
export default function TeamScheduleMobileCard({
  index,
  employee,
  weekDates,
  shiftsMap,
  todayKey,
  onDayOpen,
  onEmployeeOpen,
  canOpenEmployee,
}) {
  const [expanded, setExpanded] = useState(false)

  const days = weekDates.map((date) => {
    const dateKey = toDateKey(date)
    const shift = shiftsMap.get(dateKey)
    return {
      date,
      dateKey,
      ...formatTeamScheduleMobileDay(shift, date),
    }
  })

  function toggleExpanded() {
    setExpanded((prev) => !prev)
  }

  return (
    <article className={`team-schedule-mobile-card${expanded ? ' team-schedule-mobile-card--expanded' : ''}`}>
      <button
        type="button"
        className="team-schedule-mobile-card__header"
        onClick={toggleExpanded}
        aria-expanded={expanded}
      >
        <span className="team-schedule-mobile-card__index">{index + 1}</span>

        <EmployeeAvatar
          name={employee.name}
          firstName={employee.firstName}
          lastName={employee.lastName}
          avatarUrl={employee.avatarUrl}
          size="sm"
          className="team-schedule-mobile-card__avatar"
        />

        <span className="team-schedule-mobile-card__identity">
          {canOpenEmployee ? (
            <span
              role="link"
              tabIndex={0}
              className="team-schedule-mobile-card__name team-schedule-mobile-card__name--link"
              onClick={(event) => {
                event.stopPropagation()
                onEmployeeOpen?.(employee.id)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  event.stopPropagation()
                  onEmployeeOpen?.(employee.id)
                }
              }}
            >
              {employee.name}
            </span>
          ) : (
            <span className="team-schedule-mobile-card__name">{employee.name}</span>
          )}
          <span className="team-schedule-mobile-card__role">{employee.position}</span>
        </span>

        <span
          className={`team-schedule-mobile-card__chevron-wrap${expanded ? ' team-schedule-mobile-card__chevron-wrap--open' : ''}`}
          aria-hidden="true"
        >
          <ChevronDownIcon size={18} />
        </span>
      </button>

      {expanded ? (
        <div className="team-schedule-mobile-card__expanded-grid">
          {days.map((day) => (
            <TeamScheduleMobileDayExpanded key={day.dateKey} day={day} />
          ))}
        </div>
      ) : (
        <div className="team-schedule-mobile-card__week">
          {days.map((day) => (
            <TeamScheduleMobileDayCell
              key={day.dateKey}
              day={day}
              isToday={day.dateKey === todayKey}
              onOpen={() => onDayOpen?.(employee, day.date, shiftsMap.get(day.dateKey))}
            />
          ))}
        </div>
      )}
    </article>
  )
}
