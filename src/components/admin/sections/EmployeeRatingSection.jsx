import { useCallback, useEffect, useMemo, useState } from 'react'
import { isCloudMode } from '../../../lib/dataMode'
import { getStaffEmployees } from '../../../utils/employeeData'
import { getRoleLabel } from '../../../data/roles'
import {
  compareRatingRows,
  getCurrentMonthState,
  RATING_UPDATED_EVENT,
  calculateRatingsByEmployee,
} from '../../../utils/attendanceData'
import { formatMonthYearLabel } from '../../../utils/shiftData'
import { fetchTeamWorkforceForMonth } from '../../../services/workforceAdminService'
import { getAttendanceSettings, computeEmployeeRatingsForMonth } from '../../../services/academyDataService'
import { usePlatformPageRefresh } from '../../../context/PullToRefreshContext'
import EmployeeAvatar from '../../EmployeeAvatar'
import EmployeeRatingDetailModal from '../EmployeeRatingDetailModal'
import RatingScoreBar from '../RatingScoreBar'
import SchedulePeriodBar from '../SchedulePeriodBar'
import EmployeeSearchToolbar from '../EmployeeSearchToolbar'
import '../admin-shared.css'
import '../EmployeeSchedule.css'
import '../EmployeeRating.css'

const PLACE_CLASS = {
  1: 'rating-list__place--gold',
  2: 'rating-list__place--silver',
  3: 'rating-list__place--bronze',
}

/** Страница рейтинга сотрудников (расчёт на лету по сменам) */
export default function EmployeeRatingSection() {
  const [{ year, month }, setMonthState] = useState(getCurrentMonthState)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ratingsByEmployee, setRatingsByEmployee] = useState(new Map())
  const [loadedEmployees, setLoadedEmployees] = useState(null)
  const [detailEmployee, setDetailEmployee] = useState(null)

  const employees = useMemo(() => {
    const base = isCloudMode() && loadedEmployees != null ? loadedEmployees : getStaffEmployees('active')
    const q = search.trim().toLowerCase()
    return base.filter((emp) => {
      if (!q) return true
      return emp.name.toLowerCase().includes(q)
    })
  }, [search, loadedEmployees])

  const loadRating = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (isCloudMode()) {
        const [settings, bundle] = await Promise.all([
          getAttendanceSettings(),
          fetchTeamWorkforceForMonth(year, month, 'rating'),
        ])
        setLoadedEmployees(bundle.employees)
        const employeeIds = bundle.employees.map((emp) => emp.id)
        const ratings = calculateRatingsByEmployee(
          bundle.shifts,
          employeeIds,
          settings,
          new Date()
        )
        setRatingsByEmployee(ratings)
      } else {
        const employeeIds = employees.map((emp) => emp.id)
        const ratings = await computeEmployeeRatingsForMonth(year, month, employeeIds)
        setRatingsByEmployee(ratings)
      }
    } catch (err) {
      setError(err.message || 'Не удалось загрузить рейтинг')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  usePlatformPageRefresh(loadRating)

  useEffect(() => {
    loadRating()
  }, [loadRating])

  useEffect(() => {
    function handleRatingUpdated(event) {
      const { year: eventYear, month: eventMonth } = event.detail || {}
      if (Number(eventYear) === year && Number(eventMonth) === month) {
        loadRating()
      }
    }
    window.addEventListener(RATING_UPDATED_EVENT, handleRatingUpdated)
    return () => window.removeEventListener(RATING_UPDATED_EVENT, handleRatingUpdated)
  }, [year, month, loadRating])

  const rows = useMemo(() => {
    return employees
      .map((employee) => {
        const rating = ratingsByEmployee.get(Number(employee.id))
        return { employee, ...(rating?.stats || { totalPoints: 100 }) }
      })
      .sort(compareRatingRows)
      .map((row, index) => ({ ...row, place: index + 1 }))
  }, [employees, ratingsByEmployee])

  const currentMonth = getCurrentMonthState()
  const isCurrentMonth = year === currentMonth.year && month === currentMonth.month
  const monthLabel = formatMonthYearLabel(year, month)
  const monthTitle = isCurrentMonth ? `Текущий месяц (${monthLabel})` : monthLabel

  function changeMonth(delta) {
    setMonthState((prev) => {
      const date = new Date(prev.year, prev.month - 1 + delta, 1)
      return { year: date.getFullYear(), month: date.getMonth() + 1 }
    })
  }

  function goToday() {
    setMonthState(getCurrentMonthState())
  }

  return (
    <>
      <SchedulePeriodBar
        title={monthTitle}
        onPrev={() => changeMonth(-1)}
        onNext={() => changeMonth(1)}
        onToday={goToday}
        prevLabel="Предыдущий месяц"
        nextLabel="Следующий месяц"
      />

      <EmployeeSearchToolbar value={search} onChange={(e) => setSearch(e.target.value)} />

      {error && (
        <div className="schedule-error">
          <p className="admin-form__error">{error}</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={loadRating}>
            Повторить
          </button>
        </div>
      )}

      {loading ? (
        <p className="schedule-loading">Загрузка рейтинга…</p>
      ) : !error && rows.length === 0 ? (
        <p className="schedule-empty">Сотрудники не найдены</p>
      ) : !error ? (
        <div className="rating-list">
          <div className="rating-list__head" aria-hidden="true">
            <span className="rating-list__col rating-list__col--place">№</span>
            <span className="rating-list__col rating-list__col--employee">Сотрудник</span>
            <span className="rating-list__col rating-list__col--position">Должность</span>
            <span className="rating-list__col rating-list__col--score">Баллы</span>
          </div>

          <ul className="rating-list__body">
            {rows.map((row) => {
              const roleLabel = row.employee.position || getRoleLabel(row.employee.role)

              return (
                <li key={row.employee.id}>
                  <button
                    type="button"
                    className="rating-list__row"
                    onClick={() => setDetailEmployee(row.employee)}
                  >
                    <span
                      className={`rating-list__col rating-list__col--place rating-list__place ${PLACE_CLASS[row.place] || ''}`}
                    >
                      {row.place}
                    </span>

                    <span className="rating-list__profile">
                      <EmployeeAvatar
                        name={row.employee.name}
                        avatarUrl={row.employee.avatarUrl}
                        size="sm"
                        className="rating-list__avatar"
                      />
                      <span className="rating-list__info">
                        <span className="rating-list__name">{row.employee.name}</span>
                        <span className="rating-list__role">{roleLabel}</span>
                        <RatingScoreBar
                          score={row.totalPoints}
                          compact
                          className="rating-list__bar--mobile"
                        />
                      </span>
                    </span>

                    <span className="rating-list__col rating-list__col--position rating-list__desktop-only">
                      {roleLabel}
                    </span>
                    <span className="rating-list__col rating-list__col--score rating-list__desktop-only">
                      <RatingScoreBar score={row.totalPoints} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {detailEmployee && (
        <EmployeeRatingDetailModal
          employee={detailEmployee}
          year={year}
          month={month}
          onClose={() => setDetailEmployee(null)}
        />
      )}
    </>
  )
}
