import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStaffEmployees } from '../../../utils/employeeData'
import { getRoleLabel, EMPLOYEE_FORM_ROLES } from '../../../data/roles'
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
import { ChevronLeftIcon, ChevronRightIcon } from '../../icons/PlatformIcons'
import AdminModal from '../AdminModal'
import TeamScheduleCell from '../TeamScheduleCell'
import '../admin-shared.css'
import '../EmployeeSchedule.css'
import '../RecruitmentSection.css'

/** Общий график всех сотрудников (недельный вид) */
export default function WorkScheduleSection() {
  const navigate = useNavigate()
  const [weekStartKey, setWeekStartKey] = useState(getInitialWeekStartKey)
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [commentPreview, setCommentPreview] = useState(null)

  const weekDates = useMemo(() => buildWeekDates(weekStartKey), [weekStartKey])
  const todayKey = toDateKey(new Date())
  const isCurrentWeek = weekDates.some((date) => toDateKey(date) === todayKey)
  const weekTitle = isCurrentWeek
    ? `Текущая неделя (${formatWeekRangeLabel(weekStartKey)})`
    : formatWeekRangeLabel(weekStartKey)

  const employees = useMemo(() => {
    let list = getStaffEmployees('active')
    if (roleFilter !== 'all') {
      list = list.filter((emp) => emp.role === roleFilter)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((emp) => emp.name.toLowerCase().includes(q))
    }
    return list
  }, [roleFilter, search])

  const employeeIds = useMemo(() => employees.map((emp) => emp.id), [employees])
  const employeeIdsKey = employeeIds.join(',')

  const loadShifts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const months = getMonthsForWeek(weekStartKey)
      const ids = employeeIds.length ? employeeIds : null
      const monthResults = await Promise.all(
        months.map(({ year, month }) => getTeamShiftsForMonth(year, month, ids))
      )
      setShifts(monthResults.flat())
    } catch (err) {
      setError(err.message || 'Не удалось загрузить график')
    } finally {
      setLoading(false)
    }
  }, [weekStartKey, employeeIdsKey])

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

  return (
    <>
      <div className="schedule-week-bar">
        <button
          type="button"
          className="schedule-week-bar__nav"
          onClick={() => changeWeek(-1)}
          aria-label="Предыдущая неделя"
        >
          <ChevronLeftIcon />
        </button>

        <div className="schedule-week-bar__main">
          <h2 className="schedule-week-bar__title">{weekTitle}</h2>
          <button type="button" className="schedule-week-bar__today" onClick={goToday}>
            Сегодня
          </button>
        </div>

        <button
          type="button"
          className="schedule-week-bar__nav"
          onClick={() => changeWeek(1)}
          aria-label="Следующая неделя"
        >
          <ChevronRightIcon />
        </button>
      </div>

      <div className="admin-toolbar admin-toolbar--stack">
        <div className="admin-form__row">
          <label className="admin-form__label">
            Должность
            <select className="admin-form__select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">Все</option>
              {EMPLOYEE_FORM_ROLES.map((roleId) => (
                <option key={roleId} value={roleId}>
                  {getRoleLabel(roleId)}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-form__label">
            Поиск сотрудника
            <input
              className="admin-form__input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Имя или фамилия"
            />
          </label>
        </div>
      </div>

      {error && <p className="admin-form__error">{error}</p>}

      {loading ? (
        <div className="schedule-loading">Загрузка графика…</div>
      ) : employees.length === 0 ? (
        <p className="schedule-empty">Сотрудники не найдены</p>
      ) : (
        <div className="team-schedule-wrap">
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
                      <button
                        type="button"
                        className="team-schedule-table__employee-btn"
                        onClick={() => openEmployeeSchedule(emp.id)}
                      >
                        {emp.name}
                      </button>
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
      )}

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
