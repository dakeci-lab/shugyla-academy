import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStaffEmployees } from '../../../utils/employeeData'
import { getRoleLabel, EMPLOYEE_FORM_ROLES } from '../../../data/roles'
import {
  shiftsToMap,
  formatMonthYearLabel,
  getMonthBounds,
  formatShiftCellLabel,
  buildShiftTooltip,
  SHIFT_STATUS_CSS,
} from '../../../utils/shiftData'
import { getTeamShiftsForMonth } from '../../../services/academyDataService'
import { ChevronLeftIcon, ChevronRightIcon } from '../../icons/PlatformIcons'
import '../admin-shared.css'
import '../EmployeeSchedule.css'
import '../RecruitmentSection.css'

function getInitialMonth() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/** Общий график всех сотрудников */
export default function WorkScheduleSection() {
  const navigate = useNavigate()
  const [{ year, month }, setMonthState] = useState(getInitialMonth)
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [search, setSearch] = useState('')

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

  const employeeIds = employees.map((emp) => emp.id)
  const { daysInMonth } = getMonthBounds(year, month)

  const loadShifts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await getTeamShiftsForMonth(year, month, employeeIds.length ? employeeIds : null)
      setShifts(rows)
    } catch (err) {
      setError(err.message || 'Не удалось загрузить график')
    } finally {
      setLoading(false)
    }
  }, [year, month, employeeIds.join(',')])

  useEffect(() => {
    loadShifts()
  }, [loadShifts])

  const shiftsByEmployee = useMemo(() => {
    const map = new Map()
    employees.forEach((emp) => map.set(emp.id, shiftsToMap(shifts.filter((s) => s.employeeId === emp.id))))
    return map
  }, [employees, shifts])

  function changeMonth(delta) {
    setMonthState((prev) => {
      const date = new Date(prev.year, prev.month - 1 + delta, 1)
      return { year: date.getFullYear(), month: date.getMonth() + 1 }
    })
  }

  function goToday() {
    setMonthState(getInitialMonth())
  }

  function openEmployeeSchedule(employeeId) {
    navigate(`/platform/employees/${employeeId}/schedule`)
  }

  return (
    <>
      <div className="admin-toolbar admin-toolbar--stack">
        <div className="schedule-month-nav" style={{ marginBottom: 0 }}>
          <h2 className="schedule-month-nav__title">{formatMonthYearLabel(year, month)}</h2>
          <div className="schedule-month-nav__controls">
            <button type="button" className="btn btn--outline btn--sm" onClick={() => changeMonth(-1)}>
              <ChevronLeftIcon />
            </button>
            <button type="button" className="btn btn--outline btn--sm" onClick={goToday}>
              Сегодня
            </button>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => changeMonth(1)}>
              <ChevronRightIcon />
            </button>
          </div>
        </div>

        <div className="admin-form__row" style={{ marginTop: '0.75rem' }}>
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
          <table className="team-schedule-table">
            <thead>
              <tr>
                <th className="team-schedule-table__employee">Сотрудник</th>
                {Array.from({ length: daysInMonth }, (_, index) => (
                  <th key={index + 1}>{index + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const empShifts = shiftsByEmployee.get(emp.id) || new Map()
                return (
                  <tr key={emp.id}>
                    <td className="team-schedule-table__employee">
                      <button
                        type="button"
                        className="team-schedule-table__employee-btn"
                        onClick={() => openEmployeeSchedule(emp.id)}
                      >
                        {emp.name}
                      </button>
                    </td>
                    {Array.from({ length: daysInMonth }, (_, index) => {
                      const day = index + 1
                      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                      const shift = empShifts.get(dateKey)
                      const statusClass = shift ? SHIFT_STATUS_CSS[shift.status]?.replace('shift-day', 'team-schedule-cell') : ''
                      return (
                        <td
                          key={dateKey}
                          className={`team-schedule-cell ${statusClass || ''}`}
                          title={shift ? buildShiftTooltip(shift) : ''}
                        >
                          {shift ? formatShiftCellLabel(shift) || '—' : ''}
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
    </>
  )
}
