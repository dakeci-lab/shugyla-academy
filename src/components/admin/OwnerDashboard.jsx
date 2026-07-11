import { useCallback, useEffect, useMemo, useState } from 'react'
import { getStaffEmployees } from '../../utils/employeeData'
import {
  computeCompanyHealthMetrics,
  filterShiftsByDate,
  filterShiftsByDateRange,
  filterShiftsByMonth,
  getWeekDateKeys,
} from '../../utils/companyHealth'
import {
  getCurrentMonthState,
  RATING_UPDATED_EVENT,
} from '../../utils/attendanceData'
import {
  addWeeks,
  formatMonthYearLabel,
  formatWeekRangeLabel,
  getInitialWeekStartKey,
  toDateKey,
} from '../../utils/shiftData'
import { getAttendanceSettings, getTeamShiftsForMonth } from '../../services/academyDataService'
import CompanyHealthGauge from './CompanyHealthGauge'
import './admin-shared.css'
import './OwnerDashboard.css'

const PERIOD = {
  TODAY: 'today',
  WEEK: 'week',
  MONTH: 'month',
}

const REFRESH_MS = 60_000

function StatItem({ label, value }) {
  return (
    <div className="owner-dashboard__stat">
      <span className="owner-dashboard__stat-label">{label}</span>
      <span className="owner-dashboard__stat-value">{value}</span>
    </div>
  )
}

/** Главный дашборд владельца (только Администратор) */
export default function OwnerDashboard() {
  const [period, setPeriod] = useState(PERIOD.TODAY)
  const [weekStartKey, setWeekStartKey] = useState(getInitialWeekStartKey)
  const [{ year, month }, setMonthState] = useState(getCurrentMonthState)
  const [settings, setSettings] = useState(null)
  const [allShifts, setAllShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => new Date())

  const todayKey = toDateKey(now)
  const employeeIds = useMemo(
    () => getStaffEmployees('active').map((emp) => emp.id),
    []
  )
  const employeeIdsKey = employeeIds.join(',')

  const weekDateKeys = useMemo(() => getWeekDateKeys(weekStartKey), [weekStartKey])
  const weekStart = weekDateKeys[0]
  const weekEnd = weekDateKeys[weekDateKeys.length - 1]

  const loadData = useCallback(async () => {
    setError('')
    try {
      const attendanceSettings = await getAttendanceSettings()
      setSettings(attendanceSettings)

      const current = getCurrentMonthState()
      const monthsToLoad = new Map()
      monthsToLoad.set(`${current.year}-${current.month}`, current)
      monthsToLoad.set(`${year}-${month}`, { year, month })

      getWeekDateKeys(weekStartKey).forEach((dateKey) => {
        const [y, m] = dateKey.split('-').map(Number)
        monthsToLoad.set(`${y}-${m}`, { year: y, month: m })
      })

      const monthResults = await Promise.all(
        [...monthsToLoad.values()].map(({ year: y, month: m }) =>
          getTeamShiftsForMonth(y, m, employeeIds.length ? employeeIds : null)
        )
      )

      setAllShifts(monthResults.flat())
    } catch (err) {
      setError(err.message || 'Не удалось загрузить данные дашборда')
    } finally {
      setLoading(false)
    }
  }, [weekStartKey, year, month, employeeIdsKey])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    function handleRatingUpdated() {
      loadData()
    }
    window.addEventListener(RATING_UPDATED_EVENT, handleRatingUpdated)
    return () => window.removeEventListener(RATING_UPDATED_EVENT, handleRatingUpdated)
  }, [loadData])

  const todayShifts = useMemo(
    () => filterShiftsByDate(allShifts, todayKey),
    [allShifts, todayKey]
  )

  const weekShifts = useMemo(
    () => filterShiftsByDateRange(allShifts, weekStart, weekEnd),
    [allShifts, weekStart, weekEnd]
  )

  const selectedMonthShifts = useMemo(
    () => filterShiftsByMonth(allShifts, year, month),
    [allShifts, year, month]
  )

  const todayMetrics = useMemo(
    () => (settings ? computeCompanyHealthMetrics(todayShifts, settings, now) : null),
    [todayShifts, settings, now]
  )

  const weekMetrics = useMemo(
    () => (settings ? computeCompanyHealthMetrics(weekShifts, settings, now) : null),
    [weekShifts, settings, now]
  )

  const monthMetrics = useMemo(
    () => (settings ? computeCompanyHealthMetrics(selectedMonthShifts, settings, now) : null),
    [selectedMonthShifts, settings, now]
  )

  const activeMetrics =
    period === PERIOD.TODAY
      ? todayMetrics
      : period === PERIOD.WEEK
        ? weekMetrics
        : monthMetrics

  const currentMonth = getCurrentMonthState()
  const isCurrentMonthSelected =
    year === currentMonth.year && month === currentMonth.month
  const monthLabel = formatMonthYearLabel(year, month)
  const weekLabel = formatWeekRangeLabel(weekStartKey)

  function goTodayPeriod() {
    setPeriod(PERIOD.TODAY)
    setWeekStartKey(getInitialWeekStartKey())
    setMonthState(getCurrentMonthState())
    setNow(new Date())
  }

  const summaryStats = activeMetrics?.stats || {
    scheduled: 0,
    workingNow: 0,
    late: 0,
    absent: 0,
    earlyLeave: 0,
    missingCheckIn: 0,
    missingCheckOut: 0,
  }

  const workingNowLabel =
    period === PERIOD.TODAY
      ? `${summaryStats.workingNow} / ${summaryStats.scheduled}`
      : '—'

  return (
    <div className="owner-dashboard">
      <div className="owner-dashboard__periods">
        <button
          type="button"
          className={`owner-dashboard__period-card ${period === PERIOD.TODAY ? 'owner-dashboard__period-card--active' : ''}`}
          onClick={() => setPeriod(PERIOD.TODAY)}
        >
          <span className="owner-dashboard__period-card-label">Сегодня</span>
          <span className="owner-dashboard__period-card-value">
            {todayMetrics ? `${todayMetrics.health}%` : '—'}
          </span>
        </button>

        <button
          type="button"
          className={`owner-dashboard__period-card ${period === PERIOD.WEEK ? 'owner-dashboard__period-card--active' : ''}`}
          onClick={() => setPeriod(PERIOD.WEEK)}
        >
          <span className="owner-dashboard__period-card-label">Выбранный период</span>
          <span className="owner-dashboard__period-card-hint">{weekLabel}</span>
          <span className="owner-dashboard__period-card-value">
            {weekMetrics ? `${weekMetrics.health}%` : '—'}
          </span>
        </button>

        <button
          type="button"
          className={`owner-dashboard__period-card ${period === PERIOD.MONTH ? 'owner-dashboard__period-card--active' : ''}`}
          onClick={() => setPeriod(PERIOD.MONTH)}
        >
          <span className="owner-dashboard__period-card-label">
            {isCurrentMonthSelected ? `Текущий месяц (${monthLabel})` : monthLabel}
          </span>
          <span className="owner-dashboard__period-card-value">
            {monthMetrics ? `${monthMetrics.health}%` : '—'}
          </span>
        </button>
      </div>

      {period === PERIOD.WEEK && (
        <div className="owner-dashboard__week-nav">
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => setWeekStartKey((prev) => addWeeks(prev, -1))}
          >
            ← Неделя
          </button>
          <button type="button" className="btn btn--outline btn--sm" onClick={goTodayPeriod}>
            Сегодня
          </button>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => setWeekStartKey((prev) => addWeeks(prev, 1))}
          >
            Неделя →
          </button>
        </div>
      )}

      {period === PERIOD.MONTH && !isCurrentMonthSelected && (
        <div className="owner-dashboard__week-nav">
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() =>
              setMonthState((prev) => {
                const date = new Date(prev.year, prev.month - 2, 1)
                return { year: date.getFullYear(), month: date.getMonth() + 1 }
              })
            }
          >
            ← Месяц
          </button>
          <button type="button" className="btn btn--outline btn--sm" onClick={goTodayPeriod}>
            Сегодня
          </button>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() =>
              setMonthState((prev) => {
                const date = new Date(prev.year, prev.month, 1)
                return { year: date.getFullYear(), month: date.getMonth() + 1 }
              })
            }
          >
            Месяц →
          </button>
        </div>
      )}

      {error && <p className="admin-form__error">{error}</p>}

      {loading ? (
        <p className="schedule-loading">Загрузка дашборда…</p>
      ) : (
        <section className="owner-dashboard__hero">
          <CompanyHealthGauge score={activeMetrics?.health ?? 100} />

          <div className="owner-dashboard__summary">
            <h3 className="owner-dashboard__summary-title">Дисциплина сотрудников</h3>
            <div className="owner-dashboard__stats">
              <StatItem label="Работают сейчас" value={workingNowLabel} />
              <StatItem label="Опоздали" value={summaryStats.late} />
              <StatItem label="Отсутствуют" value={summaryStats.absent} />
              <StatItem label="Ранний уход" value={summaryStats.earlyLeave} />
              <StatItem label="Без отметки прихода" value={summaryStats.missingCheckIn} />
              <StatItem label="Без отметки ухода" value={summaryStats.missingCheckOut} />
            </div>
            <p className="owner-dashboard__summary-hint">
              Показатель рассчитывается по правилам тайм-трекера. Выходные и нерабочие дни не
              учитываются.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
