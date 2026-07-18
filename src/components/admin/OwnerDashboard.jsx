import { useCallback, useEffect, useMemo, useState } from 'react'
import { isCloudMode } from '../../lib/dataMode'
import {
  getScheduleEligibleEmployees,
  participatesInStoreSchedule,
} from '../../utils/employeeData'
import { RATING_UPDATED_EVENT } from '../../utils/attendanceData'
import { APP_TIMEZONE, addDaysToDateKey, toDateKeyInAppTimezone } from '../../utils/timezone'
import {
  formatTimeRange,
  isWorkingShiftStatus,
  timeToMinutes,
} from '../../utils/shiftData'
import {
  getAttendanceSettings,
  getTeamShiftsForMonth,
} from '../../services/academyDataService'
import { fetchHomeWorkforceSummary } from '../../services/workforceAdminService'
import { usePlatformPageRefresh } from '../../context/PullToRefreshContext'
import PlatformPeriodHeader from '../platform/PlatformPeriodHeader'
import AdminModal from './AdminModal'
import CompanyHealthGauge from './CompanyHealthGauge'
import './admin-shared.css'
import './OwnerDashboard.css'

const REFRESH_MS = 60_000

const METRIC_KEYS = {
  SCHEDULED: 'scheduled',
  ON_TIME: 'onTime',
  LATE: 'late',
  ABSENT: 'absent',
}

const METRIC_CONFIG = {
  [METRIC_KEYS.SCHEDULED]: {
    label: 'По графику',
    tone: 'neutral',
    empty: 'На выбранный день рабочих смен нет.',
  },
  [METRIC_KEYS.ON_TIME]: {
    label: 'Пришли вовремя',
    tone: 'success',
    empty: 'За выбранный день своевременных приходов нет.',
  },
  [METRIC_KEYS.LATE]: {
    label: 'Опоздали',
    tone: 'warning',
    empty: 'За выбранный день опозданий нет.',
  },
  [METRIC_KEYS.ABSENT]: {
    label: 'Отсутствуют',
    tone: 'danger',
    empty: 'За выбранный день отсутствующих нет.',
  },
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return { year, month, day }
}

function getMonthStateFromDateKey(dateKey) {
  const { year, month } = parseDateKey(dateKey)
  return { year, month }
}

function formatSelectedDate(dateKey) {
  const { year, month, day } = parseDateKey(dateKey)
  const date = new Date(year, month - 1, day)
  const formatted = date.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function getTimeLabelInAppTimezone(value) {
  if (!value) return ''
  if (typeof value === 'string' && value.includes('T')) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: APP_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date)
  }
  return String(value).slice(0, 5)
}

function getMinutesInAppTimezone(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const hours = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const minutes = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  return hours * 60 + minutes
}

function getActualStartMinutes(shift) {
  return timeToMinutes(getTimeLabelInAppTimezone(shift.actualStartTime))
}

function getPlannedStartMinutes(shift) {
  return timeToMinutes(shift.plannedStartTime)
}

function getLateMinutes(shift) {
  const plannedStart = getPlannedStartMinutes(shift)
  const actualStart = getActualStartMinutes(shift)
  if (plannedStart == null || actualStart == null) return 0
  return Math.max(0, actualStart - plannedStart)
}

function hasCheckIn(shift) {
  return Boolean(getTimeLabelInAppTimezone(shift.actualStartTime))
}

function isAbsenceDue(shift, selectedDateKey, todayKey, settings, now) {
  if (hasCheckIn(shift)) return false
  if (selectedDateKey < todayKey) return true
  if (selectedDateKey > todayKey) return false

  const plannedStart = getPlannedStartMinutes(shift)
  if (plannedStart == null) return false

  const grace = Number(settings?.lateGraceMinutes) || 0
  return getMinutesInAppTimezone(now) > plannedStart + grace
}

function createDetail(employee, shift, extra = '') {
  const planned = formatTimeRange(shift.plannedStartTime, shift.plannedEndTime) || '—'
  const actualIn = getTimeLabelInAppTimezone(shift.actualStartTime) || '—'
  return {
    id: employee.id,
    name: employee.name || `Сотрудник #${employee.id}`,
    position: employee.position || employee.roleName || employee.role || '',
    planned,
    actualIn,
    extra,
  }
}

function addUnique(target, employee, shift, extra = '') {
  if (!target.has(employee.id)) {
    target.set(employee.id, createDetail(employee, shift, extra))
  }
}

function emptyMetricMaps() {
  return {
    [METRIC_KEYS.SCHEDULED]: new Map(),
    [METRIC_KEYS.ON_TIME]: new Map(),
    [METRIC_KEYS.LATE]: new Map(),
    [METRIC_KEYS.ABSENT]: new Map(),
  }
}

function chooseEmployeeShift(shifts) {
  return (
    shifts.find((shift) => hasCheckIn(shift)) ||
    shifts.find((shift) => isWorkingShiftStatus(shift.status)) ||
    shifts[0]
  )
}

function buildDailyMetrics({
  employees,
  shifts,
  settings,
  selectedDateKey,
  todayKey,
  now,
}) {
  const employeesById = new Map(employees.map((employee) => [Number(employee.id), employee]))
  const groupedShifts = new Map()

  shifts
    .filter((shift) => shift.shiftDate === selectedDateKey && isWorkingShiftStatus(shift.status))
    .forEach((shift) => {
      const employeeId = Number(shift.employeeId)
      if (!employeesById.has(employeeId)) return
      if (!groupedShifts.has(employeeId)) groupedShifts.set(employeeId, [])
      groupedShifts.get(employeeId).push(shift)
    })

  const metrics = emptyMetricMaps()
  let checkInCount = 0

  groupedShifts.forEach((employeeShifts, employeeId) => {
    const employee = employeesById.get(employeeId)
    const shift = chooseEmployeeShift(employeeShifts)
    if (!employee || !shift) return

    addUnique(metrics[METRIC_KEYS.SCHEDULED], employee, shift)

    const checkedIn = hasCheckIn(shift)
    const lateMinutes = getLateMinutes(shift)
    const grace = Number(settings?.lateGraceMinutes) || 0

    if (checkedIn) {
      checkInCount += 1
      if (lateMinutes > grace) {
        addUnique(metrics[METRIC_KEYS.LATE], employee, shift, `${lateMinutes} мин`)
      } else {
        addUnique(metrics[METRIC_KEYS.ON_TIME], employee, shift)
      }
    } else if (isAbsenceDue(shift, selectedDateKey, todayKey, settings, now)) {
      addUnique(metrics[METRIC_KEYS.ABSENT], employee, shift)
    }
  })

  const problemEmployeeIds = new Set([
    ...metrics[METRIC_KEYS.LATE].keys(),
    ...metrics[METRIC_KEYS.ABSENT].keys(),
  ])
  const scheduled = metrics[METRIC_KEYS.SCHEDULED].size
  const health = scheduled
    ? Math.max(0, Math.round(((scheduled - problemEmployeeIds.size) / scheduled) * 100))
    : 100

  return {
    health,
    hasCheckIns: checkInCount > 0,
    stats: {
      scheduled,
      onTime: metrics[METRIC_KEYS.ON_TIME].size,
      late: metrics[METRIC_KEYS.LATE].size,
      absent: metrics[METRIC_KEYS.ABSENT].size,
    },
    details: Object.fromEntries(
      Object.entries(metrics).map(([key, value]) => [key, [...value.values()]])
    ),
  }
}

function MetricCard({ metricKey, value, onOpen }) {
  const config = METRIC_CONFIG[metricKey]
  return (
    <button
      type="button"
      className={`owner-dashboard__metric owner-dashboard__metric--${config.tone}`}
      onClick={onOpen}
    >
      <span className="owner-dashboard__metric-label">{config.label}</span>
      <span className="owner-dashboard__metric-value">{value}</span>
    </button>
  )
}

/** Главный дашборд владельца (только Администратор) */
export default function OwnerDashboard() {
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKeyInAppTimezone())
  const [settings, setSettings] = useState(null)
  const [dayShifts, setDayShifts] = useState([])
  const [teamEmployees, setTeamEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => new Date())
  const [activeMetric, setActiveMetric] = useState(null)

  const todayKey = toDateKeyInAppTimezone(now)
  const cloudMode = isCloudMode()
  const employees = useMemo(() => {
    const base = cloudMode ? teamEmployees : getScheduleEligibleEmployees('active')
    return base.filter(participatesInStoreSchedule)
  }, [cloudMode, teamEmployees])
  const employeeIds = useMemo(() => employees.map((emp) => emp.id), [employees])
  // Cloud workforce ignores employeeIds; including the key re-triggers load after setTeamEmployees.
  const localEmployeeIdsKey = cloudMode ? '' : employeeIds.join(',')
  const selectedMonthState = useMemo(
    () => getMonthStateFromDateKey(selectedDateKey),
    [selectedDateKey]
  )
  const selectedDateLabel = formatSelectedDate(selectedDateKey)
  const isTodaySelected = selectedDateKey === todayKey
  const isFutureSelected = selectedDateKey > todayKey

  const loadData = useCallback(async (options = {}) => {
    const quiet = options?.quiet === true
    setError('')
    if (!quiet) setLoading(true)
    try {
      if (cloudMode) {
        // Compact home-summary: one day, only employees who have shifts that day.
        const [attendanceSettings, bundle] = await Promise.all([
          getAttendanceSettings(),
          fetchHomeWorkforceSummary(selectedDateKey),
        ])
        setSettings(attendanceSettings)
        setTeamEmployees(bundle.employees)
        setDayShifts(bundle.shifts || [])
      } else {
        const ids = localEmployeeIdsKey
          ? localEmployeeIdsKey.split(',').filter(Boolean)
          : []
        const [attendanceSettings, shifts] = await Promise.all([
          getAttendanceSettings(),
          getTeamShiftsForMonth(
            selectedMonthState.year,
            selectedMonthState.month,
            ids.length ? ids : null
          ),
        ])
        setSettings(attendanceSettings)
        setDayShifts((shifts || []).filter((shift) => shift.shiftDate === selectedDateKey))
      }
    } catch (err) {
      setError(err.message || 'Не удалось загрузить данные дашборда')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [cloudMode, selectedDateKey, selectedMonthState.year, selectedMonthState.month, localEmployeeIdsKey])

  usePlatformPageRefresh(loadData)

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (selectedDateKey > todayKey) {
      setSelectedDateKey(todayKey)
    }
  }, [selectedDateKey, todayKey])

  useEffect(() => {
    function handleRatingUpdated() {
      loadData()
    }
    window.addEventListener(RATING_UPDATED_EVENT, handleRatingUpdated)
    return () => window.removeEventListener(RATING_UPDATED_EVENT, handleRatingUpdated)
  }, [loadData])

  const dailyMetrics = useMemo(
    () =>
      settings
        ? buildDailyMetrics({
            employees,
            shifts: dayShifts,
            settings,
            selectedDateKey,
            todayKey,
            now,
          })
        : null,
    [employees, dayShifts, settings, selectedDateKey, todayKey, now]
  )

  const stats = dailyMetrics?.stats || {
    scheduled: 0,
    onTime: 0,
    late: 0,
    absent: 0,
  }
  const hasNoMarks = !loading && !error && dailyMetrics && !dailyMetrics.hasCheckIns
  const showMetrics = !loading && !error && dailyMetrics
  const activeMetricConfig = activeMetric ? METRIC_CONFIG[activeMetric] : null
  const activeMetricRows = activeMetric ? dailyMetrics?.details?.[activeMetric] || [] : []

  function shiftDay(delta) {
    setSelectedDateKey((prev) => {
      const next = addDaysToDateKey(prev, delta)
      return next > todayKey ? todayKey : next
    })
  }

  function goToday() {
    setSelectedDateKey(toDateKeyInAppTimezone())
    setNow(new Date())
  }

  return (
    <div className="owner-dashboard">
      <PlatformPeriodHeader
        title={selectedDateLabel}
        onPrev={() => shiftDay(-1)}
        onNext={() => shiftDay(1)}
        onToday={goToday}
        prevLabel="Предыдущий день"
        nextLabel="Следующий день"
        nextDisabled={isTodaySelected || isFutureSelected}
        todayDisabled={isTodaySelected}
        aria-label="Выбор дня"
      />

      {error && (
        <div className="owner-dashboard__error">
          <p className="admin-form__error">{error}</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={loadData}>
            Повторить
          </button>
        </div>
      )}

      {loading ? (
        <p className="schedule-loading">Загрузка дашборда…</p>
      ) : showMetrics ? (
        <section className="owner-dashboard__hero">
          <CompanyHealthGauge score={dailyMetrics?.health ?? 100} size={188} />

          <div className="owner-dashboard__summary">
            <div className="owner-dashboard__summary-head">
              <h3 className="owner-dashboard__summary-title">Статус команды</h3>
              <p className="owner-dashboard__summary-subtitle">
                Уникальные сотрудники по графику и фактическим отметкам прихода.
              </p>
            </div>

            <div className="owner-dashboard__metrics">
              <MetricCard
                metricKey={METRIC_KEYS.SCHEDULED}
                value={stats.scheduled}
                onOpen={() => setActiveMetric(METRIC_KEYS.SCHEDULED)}
              />
              <MetricCard
                metricKey={METRIC_KEYS.ON_TIME}
                value={stats.onTime}
                onOpen={() => setActiveMetric(METRIC_KEYS.ON_TIME)}
              />
              <MetricCard
                metricKey={METRIC_KEYS.LATE}
                value={stats.late}
                onOpen={() => setActiveMetric(METRIC_KEYS.LATE)}
              />
              <MetricCard
                metricKey={METRIC_KEYS.ABSENT}
                value={stats.absent}
                onOpen={() => setActiveMetric(METRIC_KEYS.ABSENT)}
              />
            </div>

            {hasNoMarks && (
              <p className="owner-dashboard__empty-note">За этот день отметок пока нет.</p>
            )}
          </div>
        </section>
      ) : null}

      {activeMetric && activeMetricConfig && (
        <AdminModal title={activeMetricConfig.label} onClose={() => setActiveMetric(null)}>
          {activeMetricRows.length > 0 ? (
            <div className="owner-dashboard__people-list">
              {activeMetricRows.map((row) => (
                <div key={row.id} className="owner-dashboard__person">
                  <div className="owner-dashboard__person-main">
                    <span className="owner-dashboard__person-name">{row.name}</span>
                    {row.position && (
                      <span className="owner-dashboard__person-position">{row.position}</span>
                    )}
                  </div>
                  <div className="owner-dashboard__person-meta">
                    <span>План: {row.planned}</span>
                    <span>Приход: {row.actualIn}</span>
                    {row.extra && <span>{row.extra}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="owner-dashboard__modal-empty">{activeMetricConfig.empty}</p>
          )}
        </AdminModal>
      )}
    </div>
  )
}
