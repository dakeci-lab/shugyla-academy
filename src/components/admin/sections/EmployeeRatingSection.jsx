import { useCallback, useEffect, useMemo, useState } from 'react'
import { getStaffEmployees } from '../../../utils/employeeData'
import { getRoleLabel } from '../../../data/roles'
import {
  compareRatingRows,
  getCurrentMonthState,
  RATING_UPDATED_EVENT,
} from '../../../utils/attendanceData'
import { formatMonthYearLabel } from '../../../utils/shiftData'
import { computeEmployeeRatingsForMonth } from '../../../services/academyDataService'
import EmployeeAvatar from '../../EmployeeAvatar'
import EmployeeRatingDetailModal from '../EmployeeRatingDetailModal'
import RatingScoreBar from '../RatingScoreBar'
import { ChevronLeftIcon, ChevronRightIcon } from '../../icons/PlatformIcons'
import '../admin-shared.css'
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
  const [detailEmployee, setDetailEmployee] = useState(null)

  const employees = useMemo(() => {
    const q = search.trim().toLowerCase()
    return getStaffEmployees('active').filter((emp) => {
      if (!q) return true
      return emp.name.toLowerCase().includes(q)
    })
  }, [search])

  const employeeIdsKey = employees.map((e) => e.id).join(',')

  const loadRating = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const employeeIds = employees.map((emp) => emp.id)
      const ratings = await computeEmployeeRatingsForMonth(year, month, employeeIds)
      setRatingsByEmployee(ratings)
    } catch (err) {
      setError(err.message || 'Не удалось загрузить рейтинг')
    } finally {
      setLoading(false)
    }
  }, [year, month, employeeIdsKey])

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

  function changeMonth(delta) {
    setMonthState((prev) => {
      const date = new Date(prev.year, prev.month - 1 + delta, 1)
      return { year: date.getFullYear(), month: date.getMonth() + 1 }
    })
  }

  return (
    <>
      <div className="schedule-month-nav">
        <h2 className="schedule-month-nav__title">{formatMonthYearLabel(year, month)}</h2>
        <div className="schedule-month-nav__controls">
          <button type="button" className="btn btn--outline btn--sm" onClick={() => changeMonth(-1)}>
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => setMonthState(getCurrentMonthState())}
          >
            Текущий месяц
          </button>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => changeMonth(1)}>
            <ChevronRightIcon />
          </button>
        </div>
      </div>

      <label className="admin-form__label rating-page__search">
        Поиск сотрудника
        <input
          className="admin-form__input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Имя или фамилия"
        />
      </label>

      {error && <p className="admin-form__error">{error}</p>}

      {loading ? (
        <p className="schedule-loading">Загрузка рейтинга…</p>
      ) : rows.length === 0 ? (
        <p className="schedule-empty">Сотрудники не найдены</p>
      ) : (
        <div className="rating-list">
          <div className="rating-list__head" aria-hidden="true">
            <span className="rating-list__col rating-list__col--place">№</span>
            <span className="rating-list__col rating-list__col--employee">Сотрудник</span>
            <span className="rating-list__col rating-list__col--position">Должность</span>
            <span className="rating-list__col rating-list__col--score">Баллы</span>
          </div>

          <ul className="rating-list__body">
            {rows.map((row) => (
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
                  <span className="rating-list__col rating-list__col--employee">
                    <EmployeeAvatar
                      name={row.employee.name}
                      avatarUrl={row.employee.avatarUrl}
                      size="sm"
                    />
                    <span className="rating-list__name">{row.employee.name}</span>
                  </span>
                  <span className="rating-list__col rating-list__col--position">
                    {row.employee.position || getRoleLabel(row.employee.role)}
                  </span>
                  <span className="rating-list__col rating-list__col--score">
                    <RatingScoreBar score={row.totalPoints} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

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
