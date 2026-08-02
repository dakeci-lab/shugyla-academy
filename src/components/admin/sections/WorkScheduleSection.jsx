import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import { isCloudMode } from '../../../lib/dataMode'
import { canEditEmployeeSchedule, canViewTeamSchedule } from '../../../config/permissions'
import {
  getEmployeePositionDisplay,
  getScheduleEligibleEmployees,
  participatesInStoreSchedule,
} from '../../../utils/employeeData'
import {
  flattenEmployeeOrganization,
  groupEmployeesByPositionStructure,
} from '../../../utils/employeeOrganizationStructure'
import {
  shiftsToMap,
  toDateKey,
  formatWeekRangeLabel,
  formatWeekDayHeader,
  getInitialWeekStartKey,
  addWeeks,
  buildWeekDates,
  getMonthsForWeek,
  getMondayOfWeek,
  isDateKey,
  parseDateKey,
} from '../../../utils/shiftData'
import { addDaysToDateKey, toDateKeyInAppTimezone } from '../../../utils/timezone'
import { formatScheduleDayTitle } from '../../../utils/scheduleDayTimeline'
import { getTeamShiftsForMonth } from '../../../services/platformDataService'
import { fetchTeamWorkforceData } from '../../../services/workforceAdminService'
import { usePlatformPageRefresh } from '../../../context/PullToRefreshContext'
import AdminModal from '../AdminModal'
import TeamScheduleCell from '../TeamScheduleCell'
import TeamScheduleMobileCard from '../TeamScheduleMobileCard'
import TeamScheduleDaySheet from '../TeamScheduleDaySheet'
import TeamScheduleMobileLegend from '../TeamScheduleMobileLegend'
import ScheduleViewModeToggle from '../ScheduleViewModeToggle'
import ScheduleDayTimeline from '../ScheduleDayTimeline'
import PlatformPeriodHeader from '../../platform/PlatformPeriodHeader'
import PlatformSearchToolbar from '../../platform/PlatformSearchToolbar'
import useMediaQuery, { MOBILE_SCHEDULE_QUERY } from '../../../hooks/useMediaQuery'
import { buildTeamScheduleDaySheetModel } from '../../../utils/teamScheduleMobileUtils'
import '../admin-shared.css'
import '../EmployeeSchedule.css'
import '../TeamScheduleMobile.css'

function resolveViewMode(raw) {
  return raw === 'day' ? 'day' : 'week'
}

function mondayKeyForDate(dateKey) {
  return toDateKey(getMondayOfWeek(parseDateKey(dateKey)))
}

/** Общий график всех сотрудников (недельный и дневной вид) */
export default function WorkScheduleSection() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useSession()
  const viewTeam = canViewTeamSchedule(user)
  const canEditSchedule = canEditEmployeeSchedule(user)
  const selfEmployeeId = user?.id != null ? Number(user.id) : null

  const viewMode = resolveViewMode(searchParams.get('view'))
  const todayKey = toDateKeyInAppTimezone()

  const [weekStartKey, setWeekStartKey] = useState(() => {
    const weekFromUrl = searchParams.get('week')
    const dateFromUrl = searchParams.get('date')
    if (isDateKey(weekFromUrl)) return weekFromUrl
    if (isDateKey(dateFromUrl)) return mondayKeyForDate(dateFromUrl)
    return getInitialWeekStartKey()
  })
  const [dayKey, setDayKey] = useState(() => {
    const dateFromUrl = searchParams.get('date')
    return isDateKey(dateFromUrl) ? dateFromUrl : todayKey
  })

  const [shifts, setShifts] = useState([])
  const [loadedEmployees, setLoadedEmployees] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [commentPreview, setCommentPreview] = useState(null)
  const [daySheet, setDaySheet] = useState(null)
  const isMobileSchedule = useMediaQuery(MOBILE_SCHEDULE_QUERY)

  const weekDates = useMemo(() => buildWeekDates(weekStartKey), [weekStartKey])
  const isCurrentWeek = weekDates.some((date) => toDateKey(date) === todayKey)
  const weekTitle = isCurrentWeek
    ? `Текущая неделя (${formatWeekRangeLabel(weekStartKey)})`
    : formatWeekRangeLabel(weekStartKey)
  const dayTitle = formatScheduleDayTitle(dayKey)

  const rangeFrom = viewMode === 'day' ? dayKey : toDateKey(weekDates[0])
  const rangeTo =
    viewMode === 'day' ? dayKey : toDateKey(weekDates[weekDates.length - 1])

  const employees = useMemo(() => {
    const base =
      isCloudMode() && loadedEmployees != null
        ? loadedEmployees
        : getScheduleEligibleEmployees('active')
    let list = base.filter(participatesInStoreSchedule)
    if (!viewTeam && selfEmployeeId) {
      list = list.filter((emp) => Number(emp.id) === selfEmployeeId)
    }
    const q = search.trim().toLowerCase()
    const filtered = list.filter((emp) => {
      if (!q) return true
      return emp.name.toLowerCase().includes(q)
    })
    // Flat organisational order (group → position → FIO). No visual group headers.
    return flattenEmployeeOrganization(groupEmployeesByPositionStructure(filtered))
  }, [search, viewTeam, selfEmployeeId, loadedEmployees])

  const syncUrl = useCallback(
    (next) => {
      const params = new URLSearchParams(searchParams)
      params.set('view', next.viewMode)
      if (next.viewMode === 'day') {
        params.set('date', next.dayKey)
        params.set('week', mondayKeyForDate(next.dayKey))
      } else {
        params.set('week', next.weekStartKey)
        if (params.has('date') && !isDateKey(params.get('date'))) {
          params.delete('date')
        }
      }
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  const loadShifts = useCallback(
    async (options = {}) => {
      const quiet = options?.quiet === true
      if (!quiet) setLoading(true)
      setError('')
      try {
        if (isCloudMode()) {
          const bundle = await fetchTeamWorkforceData({
            dateFrom: rangeFrom,
            dateTo: rangeTo,
            view: 'schedule',
            employeeId: viewTeam ? null : selfEmployeeId,
          })
          setLoadedEmployees(bundle.employees)
          setShifts(bundle.shifts)
        } else {
          const ids =
            !viewTeam && selfEmployeeId
              ? [selfEmployeeId]
              : getScheduleEligibleEmployees('active')
                  .filter(participatesInStoreSchedule)
                  .map((emp) => emp.id)
          if (viewMode === 'day') {
            const date = parseDateKey(dayKey)
            const year = date.getFullYear()
            const month = date.getMonth() + 1
            const rows = await getTeamShiftsForMonth(year, month, ids.length ? ids : null)
            setShifts(rows.filter((row) => row.shiftDate === dayKey))
          } else {
            const months = getMonthsForWeek(weekStartKey)
            const monthResults = await Promise.all(
              months.map(({ year, month }) =>
                getTeamShiftsForMonth(year, month, ids.length ? ids : null)
              )
            )
            setShifts(monthResults.flat())
          }
        }
      } catch (err) {
        setError(err.message || 'Не удалось загрузить график')
        setLoadedEmployees(null)
        setShifts([])
      } finally {
        if (!quiet) setLoading(false)
      }
    },
    [rangeFrom, rangeTo, viewTeam, selfEmployeeId, viewMode, dayKey, weekStartKey]
  )

  usePlatformPageRefresh(loadShifts)

  useEffect(() => {
    loadShifts()
  }, [loadShifts])

  useEffect(() => {
    const weekFromUrl = searchParams.get('week')
    const dateFromUrl = searchParams.get('date')
    const viewFromUrl = resolveViewMode(searchParams.get('view'))

    if (viewFromUrl === 'day') {
      if (isDateKey(dateFromUrl) && dateFromUrl !== dayKey) {
        setDayKey(dateFromUrl)
        setWeekStartKey(mondayKeyForDate(dateFromUrl))
      }
      return
    }
    if (isDateKey(weekFromUrl) && weekFromUrl !== weekStartKey) {
      setWeekStartKey(weekFromUrl)
    }
  }, [searchParams, dayKey, weekStartKey])

  const shiftsByEmployee = useMemo(() => {
    const map = new Map()
    employees.forEach((emp) =>
      map.set(emp.id, shiftsToMap(shifts.filter((s) => s.employeeId === emp.id)))
    )
    return map
  }, [employees, shifts])

  function setViewMode(nextMode) {
    if (nextMode === 'day') {
      const nextDay =
        weekDates.some((d) => toDateKey(d) === todayKey) ? todayKey : toDateKey(weekDates[0])
      const resolvedDay = isDateKey(dayKey) && weekDates.some((d) => toDateKey(d) === dayKey)
        ? dayKey
        : nextDay
      setDayKey(resolvedDay)
      setWeekStartKey(mondayKeyForDate(resolvedDay))
      syncUrl({ viewMode: 'day', dayKey: resolvedDay, weekStartKey: mondayKeyForDate(resolvedDay) })
      return
    }
    const nextWeek = mondayKeyForDate(dayKey)
    setWeekStartKey(nextWeek)
    syncUrl({ viewMode: 'week', weekStartKey: nextWeek, dayKey })
  }

  function changeWeek(delta) {
    setWeekStartKey((prev) => {
      const next = addWeeks(prev, delta)
      syncUrl({ viewMode: 'week', weekStartKey: next, dayKey })
      return next
    })
  }

  function goTodayWeek() {
    const next = getInitialWeekStartKey()
    setWeekStartKey(next)
    syncUrl({ viewMode: 'week', weekStartKey: next, dayKey: todayKey })
  }

  function changeDay(delta) {
    setDayKey((prev) => {
      const next = addDaysToDateKey(prev, delta)
      const nextWeek = mondayKeyForDate(next)
      setWeekStartKey(nextWeek)
      syncUrl({ viewMode: 'day', dayKey: next, weekStartKey: nextWeek })
      return next
    })
  }

  function goTodayDay() {
    const nextWeek = mondayKeyForDate(todayKey)
    setDayKey(todayKey)
    setWeekStartKey(nextWeek)
    syncUrl({ viewMode: 'day', dayKey: todayKey, weekStartKey: nextWeek })
  }

  function openDayView(dateKey) {
    if (!isDateKey(dateKey)) return
    const nextWeek = mondayKeyForDate(dateKey)
    setDayKey(dateKey)
    setWeekStartKey(nextWeek)
    syncUrl({ viewMode: 'day', dayKey: dateKey, weekStartKey: nextWeek })
  }

  function openEmployeeSchedule(employeeId, focusDateKey = null) {
    if (!canEditSchedule) return
    let weekQuery = isDateKey(weekStartKey) ? `?week=${encodeURIComponent(weekStartKey)}` : ''
    if (isDateKey(focusDateKey)) {
      weekQuery += `${weekQuery ? '&' : '?'}date=${encodeURIComponent(focusDateKey)}`
    }
    navigate(`/platform/employees/${employeeId}${weekQuery}#schedule`)
  }

  function openDaySheet(employee, date, shift) {
    setDaySheet({
      detail: buildTeamScheduleDaySheetModel(employee, shift, date),
    })
  }

  function closeDaySheet() {
    setDaySheet(null)
  }

  const scheduleTable = (
    <div className="team-schedule-wrap team-schedule-wrap--desktop">
      <table className="team-schedule-table team-schedule-table--week">
        <thead>
          <tr>
            <th className="team-schedule-table__index" scope="col">
              №
            </th>
            <th className="team-schedule-table__employee" scope="col">
              Сотрудник
            </th>
            {weekDates.map((date) => {
              const dateKey = toDateKey(date)
              const { weekday, day } = formatWeekDayHeader(date)
              const isToday = dateKey === todayKey
              const dayClass = [
                'team-schedule-table__day',
                isToday ? 'team-schedule-table__day--today' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <th key={dateKey} scope="col" className={dayClass}>
                  <button
                    type="button"
                    className="team-schedule-table__day-btn"
                    onClick={() => openDayView(dateKey)}
                    aria-label={`Открыть дневной график на ${formatScheduleDayTitle(dateKey)}`}
                  >
                    {isToday ? (
                      <span className="team-schedule-table__today-badge">
                        <span className="team-schedule-table__day-weekday">{weekday}</span>
                        <span className="team-schedule-table__day-number">{day}</span>
                      </span>
                    ) : (
                      <>
                        <span className="team-schedule-table__day-weekday">{weekday}</span>
                        <span className="team-schedule-table__day-number">{day}</span>
                      </>
                    )}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {employees.map((emp, index) => {
            const empShifts = shiftsByEmployee.get(emp.id) || new Map()
            return (
              <tr key={emp.id}>
                <td className="team-schedule-table__index">{index + 1}</td>
                <td className="team-schedule-table__employee">
                  <div className="team-schedule-table__person">
                    {canEditSchedule ? (
                      <button
                        type="button"
                        className="team-schedule-table__employee-btn team-schedule-table__name"
                        onClick={() => openEmployeeSchedule(emp.id)}
                        aria-label={`Редактировать график сотрудника ${emp.name}`}
                      >
                        {emp.name}
                      </button>
                    ) : (
                      <span className="team-schedule-table__name">{emp.name}</span>
                    )}
                    <span className="team-schedule-table__role">
                      {getEmployeePositionDisplay(emp)}
                    </span>
                  </div>
                </td>
                {weekDates.map((date) => {
                  const dateKey = toDateKey(date)
                  const shift = empShifts.get(dateKey)
                  const isToday = dateKey === todayKey
                  const cellClass = [
                    'team-schedule-table__day',
                    'team-schedule-cell',
                    isToday ? 'team-schedule-table__day--today' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')

                  return (
                    <td key={dateKey} className={cellClass}>
                      <TeamScheduleCell
                        shift={shift}
                        onCommentClick={(text) =>
                          setCommentPreview({ text, employeeName: emp.name, dateKey })
                        }
                      />
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const scheduleMobile = (
    <div className="team-schedule-mobile">
      <div className="team-schedule-mobile__list">
        {employees.map((emp, index) => (
          <TeamScheduleMobileCard
            key={emp.id}
            index={index}
            employee={emp}
            weekDates={weekDates}
            shiftsMap={shiftsByEmployee.get(emp.id) || new Map()}
            todayKey={todayKey}
            onDayOpen={openDaySheet}
            onEmployeeOpen={openEmployeeSchedule}
            canOpenEmployee={canEditSchedule}
          />
        ))}
      </div>
      <TeamScheduleMobileLegend />
    </div>
  )

  return (
    <>
      <PlatformPeriodHeader
        title={viewMode === 'day' ? dayTitle : weekTitle}
        onPrev={() => (viewMode === 'day' ? changeDay(-1) : changeWeek(-1))}
        onNext={() => (viewMode === 'day' ? changeDay(1) : changeWeek(1))}
        onToday={() => (viewMode === 'day' ? goTodayDay() : goTodayWeek())}
        prevLabel={viewMode === 'day' ? 'Предыдущий день' : 'Предыдущая неделя'}
        nextLabel={viewMode === 'day' ? 'Следующий день' : 'Следующая неделя'}
      />

      <ScheduleViewModeToggle value={viewMode} onChange={setViewMode} />

      {viewTeam && (
        <PlatformSearchToolbar
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по ФИО"
          ariaLabel="Поиск по ФИО"
        />
      )}

      {error && (
        <div className="schedule-error">
          <p className="admin-form__error">{error}</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={loadShifts}>
            Повторить
          </button>
        </div>
      )}

      {loading ? (
        <div className="schedule-loading">Загрузка графика…</div>
      ) : !error && employees.length === 0 ? (
        <p className="schedule-empty">Сотрудники не найдены</p>
      ) : !error && viewMode === 'day' ? (
        <ScheduleDayTimeline
          dateKey={dayKey}
          employees={employees}
          shiftsByEmployee={shiftsByEmployee}
          canEdit={canEditSchedule}
          onEditEmployee={openEmployeeSchedule}
        />
      ) : !error ? (
        <>
          {!isMobileSchedule && scheduleTable}
          {isMobileSchedule && scheduleMobile}
        </>
      ) : null}

      <TeamScheduleDaySheet
        open={Boolean(daySheet)}
        detail={daySheet?.detail}
        onClose={closeDaySheet}
      />

      {commentPreview && (
        <AdminModal
          title="Комментарий"
          onClose={() => setCommentPreview(null)}
          footer={
            <button type="button" className="btn btn--primary" onClick={() => setCommentPreview(null)}>
              Закрыть
            </button>
          }
        >
          <p className="admin-form__hint">
            {commentPreview.employeeName} · {commentPreview.dateKey}
          </p>
          <p className="team-schedule-comment-preview">{commentPreview.text}</p>
        </AdminModal>
      )}
    </>
  )
}
