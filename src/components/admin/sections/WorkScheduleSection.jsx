import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import { isCloudMode } from '../../../lib/dataMode'
import { canViewTeamSchedule } from '../../../config/permissions'
import { getStaffEmployees } from '../../../utils/employeeData'
import {
  shiftsToMap,
  toDateKey,
  formatWeekRangeLabel,
  formatWeekDayHeader,
  getInitialWeekStartKey,
  addWeeks,
  buildWeekDates,
  getMonthsForWeek,
} from '../../../utils/shiftData'
import { getTeamShiftsForMonth } from '../../../services/academyDataService'
import { fetchTeamWorkforceData } from '../../../services/workforceAdminService'
import { usePlatformPageRefresh } from '../../../context/PullToRefreshContext'
import AdminModal from '../AdminModal'
import TeamScheduleCell from '../TeamScheduleCell'
import TeamScheduleMobileCard from '../TeamScheduleMobileCard'
import TeamScheduleDaySheet from '../TeamScheduleDaySheet'
import TeamScheduleMobileLegend from '../TeamScheduleMobileLegend'
import SchedulePeriodBar from '../SchedulePeriodBar'
import EmployeeSearchToolbar from '../EmployeeSearchToolbar'
import useMediaQuery, { MOBILE_SCHEDULE_QUERY } from '../../../hooks/useMediaQuery'
import { buildTeamScheduleDaySheetModel } from '../../../utils/teamScheduleMobileUtils'
import '../admin-shared.css'
import '../EmployeeSchedule.css'
import '../TeamScheduleMobile.css'

/** Общий график всех сотрудников (недельный вид) */
export default function WorkScheduleSection() {
  const navigate = useNavigate()
  const { user } = useSession()
  const viewTeam = canViewTeamSchedule(user)
  const selfEmployeeId = user?.id != null ? Number(user.id) : null
  const [weekStartKey, setWeekStartKey] = useState(getInitialWeekStartKey)
  const [shifts, setShifts] = useState([])
  const [loadedEmployees, setLoadedEmployees] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [commentPreview, setCommentPreview] = useState(null)
  const [daySheet, setDaySheet] = useState(null)
  const isMobileSchedule = useMediaQuery(MOBILE_SCHEDULE_QUERY)

  const weekDates = useMemo(() => buildWeekDates(weekStartKey), [weekStartKey])
  const todayKey = toDateKey(new Date())
  const isCurrentWeek = weekDates.some((date) => toDateKey(date) === todayKey)
  const weekTitle = isCurrentWeek
    ? `Текущая неделя (${formatWeekRangeLabel(weekStartKey)})`
    : formatWeekRangeLabel(weekStartKey)

  const employees = useMemo(() => {
    const base =
      isCloudMode() && viewTeam && loadedEmployees != null
        ? loadedEmployees
        : getStaffEmployees('active')
    let list = base
    if (!viewTeam && selfEmployeeId) {
      list = list.filter((emp) => Number(emp.id) === selfEmployeeId)
    }
    const q = search.trim().toLowerCase()
    return list.filter((emp) => {
      if (!q) return true
      return emp.name.toLowerCase().includes(q)
    })
  }, [search, viewTeam, selfEmployeeId, loadedEmployees])

  const employeeIds = useMemo(() => employees.map((emp) => emp.id), [employees])
  const employeeIdsKey = employeeIds.join(',')

  const loadShifts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (isCloudMode() && viewTeam) {
        const dateFrom = toDateKey(weekDates[0])
        const dateTo = toDateKey(weekDates[weekDates.length - 1])
        const bundle = await fetchTeamWorkforceData({
          dateFrom,
          dateTo,
          view: 'schedule',
        })
        setLoadedEmployees(bundle.employees)
        setShifts(bundle.shifts)
      } else {
        const months = getMonthsForWeek(weekStartKey)
        const ids = employeeIds.length ? employeeIds : null
        const monthResults = await Promise.all(
          months.map(({ year, month }) => getTeamShiftsForMonth(year, month, ids))
        )
        setShifts(monthResults.flat())
      }
    } catch (err) {
      setError(err.message || 'Не удалось загрузить график')
    } finally {
      setLoading(false)
    }
  }, [weekStartKey, viewTeam, weekDates])

  usePlatformPageRefresh(loadShifts)

  useEffect(() => {
    loadShifts()
  }, [loadShifts])

  const shiftsByEmployee = useMemo(() => {
    const map = new Map()
    employees.forEach((emp) =>
      map.set(emp.id, shiftsToMap(shifts.filter((s) => s.employeeId === emp.id)))
    )
    return map
  }, [employees, shifts])

  function changeWeek(delta) {
    setWeekStartKey((prev) => addWeeks(prev, delta))
  }

  function goToday() {
    setWeekStartKey(getInitialWeekStartKey())
  }

  function openEmployeeSchedule(employeeId) {
    navigate(`/platform/employees/${employeeId}/schedule`)
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
              return (
                <th key={dateKey} scope="col" className="team-schedule-table__day">
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
                  {viewTeam ? (
                    <button
                      type="button"
                      className="team-schedule-table__employee-btn"
                      onClick={() => openEmployeeSchedule(emp.id)}
                    >
                      {emp.name}
                    </button>
                  ) : (
                    <span>{emp.name}</span>
                  )}
                </td>
                {weekDates.map((date) => {
                  const dateKey = toDateKey(date)
                  const shift = empShifts.get(dateKey)

                  return (
                    <td key={dateKey} className="team-schedule-table__day team-schedule-cell">
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
            canOpenEmployee={viewTeam}
          />
        ))}
      </div>
      <TeamScheduleMobileLegend />
    </div>
  )

  return (
    <>
      <SchedulePeriodBar
        title={weekTitle}
        onPrev={() => changeWeek(-1)}
        onNext={() => changeWeek(1)}
        onToday={goToday}
        prevLabel="Предыдущая неделя"
        nextLabel="Следующая неделя"
      />

      {viewTeam && (
        <EmployeeSearchToolbar value={search} onChange={(e) => setSearch(e.target.value)} />
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
