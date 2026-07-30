import { useEffect, useMemo, useState } from 'react'
import { getRoleLabel } from '../../data/roles'
import {
  buildScheduleDayStats,
  buildTimelineTicks,
  classifyScheduleDayCell,
  formatScheduleDayTitle,
  getNowLinePercent,
  getShiftBarLayout,
  getStoreTimelineWindow,
} from '../../utils/scheduleDayTimeline'
import { SCHEDULE_DAY_TIMELINE_MIN_WIDTH_PX } from '../../utils/storeWorkHours'
import { toDateKeyInAppTimezone } from '../../utils/timezone'
import './ScheduleDayTimeline.css'

function DayStats({ stats }) {
  const weakest =
    stats.weakestPeriod != null
      ? `${stats.weakestPeriod.startLabel}–${stats.weakestPeriod.endLabel}`
      : '—'
  return (
    <div className="schedule-day-stats" aria-label="Показатели дня">
      <div className="schedule-day-stats__item">
        <span className="schedule-day-stats__label">Всего сотрудников со сменой</span>
        <strong className="schedule-day-stats__value">{stats.totalWithShift}</strong>
      </div>
      <div className="schedule-day-stats__item">
        <span className="schedule-day-stats__label">Максимум одновременно</span>
        <strong className="schedule-day-stats__value">{stats.maxConcurrent}</strong>
      </div>
      <div className="schedule-day-stats__item">
        <span className="schedule-day-stats__label">Минимум в рабочее время</span>
        <strong className="schedule-day-stats__value">{stats.minDuringWork}</strong>
      </div>
      <div className="schedule-day-stats__item">
        <span className="schedule-day-stats__label">Самый слабый период</span>
        <strong className="schedule-day-stats__value">{weakest}</strong>
      </div>
    </div>
  )
}

function CoverageRow({ segments, nowLinePercent }) {
  return (
    <div className="schedule-day-coverage" aria-label="Сотрудников на смене">
      <div className="schedule-day-coverage__label">
        <span className="schedule-day-coverage__title">Сотрудников на смене</span>
      </div>
      <div className="schedule-day-coverage__track-wrap">
        <div className="schedule-day-coverage__track">
          {segments.map((segment) => (
            <div
              key={`${segment.startMin}-${segment.endMin}`}
              className="schedule-day-coverage__segment"
              style={{
                left: `${segment.leftPercent}%`,
                width: `${segment.widthPercent}%`,
              }}
              title={`${segment.startLabel}–${segment.endLabel}: ${segment.count}`}
            >
              {segment.widthPercent >= 4.5 ? (
                <span className="schedule-day-coverage__count">{segment.count}</span>
              ) : null}
            </div>
          ))}
          {nowLinePercent != null ? (
            <div
              className="schedule-day-now"
              style={{ left: `${nowLinePercent}%` }}
              aria-hidden="true"
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function TimeScale({ ticks, nowLinePercent, nowLabel }) {
  return (
    <div className="schedule-day-scale" aria-hidden="true">
      <div className="schedule-day-scale__spacer" />
      <div className="schedule-day-scale__track-wrap">
        <div className="schedule-day-scale__track">
          {ticks.map((tick) => (
            <span
              key={tick.absoluteMin}
              className="schedule-day-scale__tick"
              style={{ left: `${tick.leftPercent}%` }}
            >
              {tick.label}
            </span>
          ))}
          {nowLinePercent != null ? (
            <div className="schedule-day-now schedule-day-now--labeled" style={{ left: `${nowLinePercent}%` }}>
              <span className="schedule-day-now__label">{nowLabel}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ShiftBar({ employeeName, cell, layout, canEdit, onEdit }) {
  if (cell.kind !== 'working' || !layout) {
    return (
      <div className={`schedule-day-bar-empty schedule-day-bar-empty--${cell.kind}`}>
        {cell.label}
      </div>
    )
  }

  const aria = `${employeeName}, смена с ${cell.start} до ${cell.end}`
  const showLabel = layout.widthPercent >= 9
  const content = (
    <>
      <span
        className="schedule-day-bar"
        style={{
          left: `${layout.leftPercent}%`,
          width: `${layout.widthPercent}%`,
        }}
        title={cell.label}
      >
        {showLabel ? <span className="schedule-day-bar__text">{cell.label}</span> : null}
      </span>
    </>
  )

  if (!canEdit || !onEdit) {
    return (
      <div className="schedule-day-bar-track" aria-label={aria}>
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      className="schedule-day-bar-track schedule-day-bar-track--button"
      aria-label={`Редактировать: ${aria}`}
      onClick={onEdit}
    >
      {content}
    </button>
  )
}

function EmployeeRow({
  employee,
  shift,
  canEdit,
  onEdit,
  nowLinePercent,
  window,
}) {
  const cell = classifyScheduleDayCell(shift)
  const layout =
    cell.kind === 'working' ? getShiftBarLayout(cell.start, cell.end, window) : null
  const role = employee.position || getRoleLabel(employee.role) || '—'

  return (
    <div className="schedule-day-row">
      <div className="schedule-day-row__employee">
        {canEdit ? (
          <button
            type="button"
            className="schedule-day-row__name-btn"
            onClick={onEdit}
            aria-label={`Редактировать график сотрудника ${employee.name}`}
          >
            {employee.name}
          </button>
        ) : (
          <span className="schedule-day-row__name">{employee.name}</span>
        )}
        <span className="schedule-day-row__role">{role}</span>
      </div>
      <div className="schedule-day-row__timeline">
        <ShiftBar
          employeeName={employee.name}
          cell={cell}
          layout={layout}
          canEdit={canEdit}
          onEdit={onEdit}
        />
        {nowLinePercent != null ? (
          <div
            className="schedule-day-now"
            style={{ left: `${nowLinePercent}%` }}
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  )
}

/**
 * Day timeline for the team schedule.
 * employees order must match the week view (caller prepares the array).
 */
export default function ScheduleDayTimeline({
  dateKey,
  employees,
  shiftsByEmployee,
  canEdit = false,
  onEditEmployee,
}) {
  const window = useMemo(() => getStoreTimelineWindow(), [])
  const ticks = useMemo(() => buildTimelineTicks(window), [window])
  const todayKey = toDateKeyInAppTimezone()
  const [nowTick, setNowTick] = useState(() => Date.now())

  useEffect(() => {
    if (dateKey !== todayKey) return undefined
    const id = globalThis.setInterval(() => setNowTick(Date.now()), 60_000)
    return () => globalThis.clearInterval(id)
  }, [dateKey, todayKey])

  const now = useMemo(() => new Date(nowTick), [nowTick])
  const nowLinePercent = useMemo(
    () => getNowLinePercent(dateKey, todayKey, now, window),
    [dateKey, todayKey, now, window]
  )
  const nowLabel = useMemo(() => {
    if (nowLinePercent == null) return ''
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Almaty',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now)
  }, [now, nowLinePercent])

  const rows = useMemo(
    () =>
      (employees || []).map((employee) => ({
        employee,
        shift: shiftsByEmployee?.get(employee.id)?.get(dateKey) || null,
      })),
    [employees, shiftsByEmployee, dateKey]
  )

  const stats = useMemo(() => buildScheduleDayStats(rows, window), [rows, window])

  if (!employees?.length) {
    return <p className="schedule-empty">Сотрудники не найдены</p>
  }

  return (
    <div className="schedule-day" aria-label={`График на ${formatScheduleDayTitle(dateKey)}`}>
      <DayStats stats={stats} />

      <div className="schedule-day-scroll">
        <div
          className="schedule-day-grid"
          style={{ minWidth: `max(100%, ${SCHEDULE_DAY_TIMELINE_MIN_WIDTH_PX}px)` }}
        >
          <TimeScale ticks={ticks} nowLinePercent={nowLinePercent} nowLabel={nowLabel} />
          <CoverageRow segments={stats.segments} nowLinePercent={nowLinePercent} />
          <div className="schedule-day-body">
            {rows.map(({ employee, shift }) => (
              <EmployeeRow
                key={employee.id}
                employee={employee}
                shift={shift}
                canEdit={canEdit}
                onEdit={canEdit ? () => onEditEmployee?.(employee.id, dateKey) : undefined}
                nowLinePercent={nowLinePercent}
                window={window}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
