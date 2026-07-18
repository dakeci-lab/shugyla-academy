import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isCloudMode } from '../../../lib/dataMode'
import { getStaffEmployees } from '../../../utils/employeeData'
import { getRoleLabel } from '../../../data/roles'
import {
  getCurrentMonthState,
  RATING_UPDATED_EVENT,
  calculateRatingsByEmployee,
} from '../../../utils/attendanceData'
import { buildRatingDisplayRows, RATING_STATUS } from '../../../utils/ratingEligibility'
import { formatMonthYearLabel, getMondayOfWeek, toDateKey, parseDateKey } from '../../../utils/shiftData'
import { fetchTeamWorkforceForMonth } from '../../../services/workforceAdminService'
import { getAttendanceSettings, computeEmployeeRatingsForMonth } from '../../../services/academyDataService'
import { usePlatformPageRefresh } from '../../../context/PullToRefreshContext'
import EmployeeAvatar from '../../EmployeeAvatar'
import EmployeeRatingDetailModal from '../EmployeeRatingDetailModal'
import RatingScoreBar from '../RatingScoreBar'
import PlatformPeriodHeader from '../../platform/PlatformPeriodHeader'
import PlatformSearchToolbar from '../../platform/PlatformSearchToolbar'
import '../admin-shared.css'
import '../EmployeeSchedule.css'
import '../EmployeeRating.css'

const PLACE_CLASS = {
  1: 'rating-list__place--gold',
  2: 'rating-list__place--silver',
  3: 'rating-list__place--bronze',
}

function RatingRow({ row, onSelect }) {
  const roleLabel = row.employee.position || getRoleLabel(row.employee.role)
  const isInsufficient = row.ratingStatus === RATING_STATUS.INSUFFICIENT_DATA
  const placeLabel = row.place ?? '—'

  return (
    <li>
      <button
        type="button"
        className={`rating-list__row${isInsufficient ? ' rating-list__row--insufficient' : ''}`}
        onClick={() => onSelect(row.employee)}
      >
        <span
          className={`rating-list__col rating-list__col--place rating-list__place ${
            row.showTopPlace ? PLACE_CLASS[row.place] || '' : ''
          }`}
        >
          {placeLabel}
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
            {isInsufficient && (
              <span className="rating-list__badge rating-list__badge--insufficient">
                Недостаточно данных
              </span>
            )}
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
}

/** Страница рейтинга сотрудников (расчёт на лету по сменам) */
export default function EmployeeRatingSection() {
  const navigate = useNavigate()
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

  const loadRating = useCallback(async (options = {}) => {
    const quiet = options?.quiet === true
    if (!quiet) setLoading(true)
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
        const employeeIds = getStaffEmployees('active').map((emp) => emp.id)
        const ratings = await computeEmployeeRatingsForMonth(year, month, employeeIds)
        setRatingsByEmployee(ratings)
      }
    } catch (err) {
      setError(err.message || 'Не удалось загрузить рейтинг')
    } finally {
      if (!quiet) setLoading(false)
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

  const { eligibleRows, insufficientRows, excludedNoScheduleCount } = useMemo(
    () => buildRatingDisplayRows(employees, ratingsByEmployee),
    [employees, ratingsByEmployee]
  )

  const hasVisibleRows = eligibleRows.length > 0 || insufficientRows.length > 0
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

  function openScheduleForPeriod() {
    const firstDay = parseDateKey(`${year}-${String(month).padStart(2, '0')}-01`)
    const weekStart = toDateKey(getMondayOfWeek(firstDay))
    navigate(`/platform/employees/schedule?week=${encodeURIComponent(weekStart)}`)
  }

  return (
    <>
      <PlatformPeriodHeader
        title={monthTitle}
        onPrev={() => changeMonth(-1)}
        onNext={() => changeMonth(1)}
        onToday={goToday}
        prevLabel="Предыдущий месяц"
        nextLabel="Следующий месяц"
      />

      {excludedNoScheduleCount > 0 && (
        <div className="rating-excluded-banner" role="status">
          <span>
            Не участвуют в рейтинге: {excludedNoScheduleCount}{' '}
            {excludedNoScheduleCount === 1 ? 'сотрудник' : 'сотрудников'} — не установлен график за
            выбранный период
          </span>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={openScheduleForPeriod}
          >
            Посмотреть
          </button>
        </div>
      )}

      <PlatformSearchToolbar
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск по ФИО"
        ariaLabel="Поиск по ФИО"
      />

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
      ) : !error && !hasVisibleRows ? (
        <p className="schedule-empty">Нет сотрудников с достаточными данными за этот период</p>
      ) : !error ? (
        <div className="rating-list">
          <div className="rating-list__head" aria-hidden="true">
            <span className="rating-list__col rating-list__col--place">№</span>
            <span className="rating-list__col rating-list__col--employee">Сотрудник</span>
            <span className="rating-list__col rating-list__col--position">Должность</span>
            <span className="rating-list__col rating-list__col--score">Баллы</span>
          </div>

          <ul className="rating-list__body">
            {eligibleRows.map((row) => (
              <RatingRow key={row.employee.id} row={row} onSelect={setDetailEmployee} />
            ))}
          </ul>

          {insufficientRows.length > 0 && (
            <>
              <div className="rating-list__section-label">Недостаточно данных</div>
              <ul className="rating-list__body rating-list__body--insufficient">
                {insufficientRows.map((row) => (
                  <RatingRow key={row.employee.id} row={row} onSelect={setDetailEmployee} />
                ))}
              </ul>
            </>
          )}
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
