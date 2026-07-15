import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEmployeeById } from '../../../utils/employeeData'
import { getRoleLabel } from '../../../data/roles'
import {
  shiftsToMap,
  formatMonthYearLabel,
  parseDateKey,
  isDateKey,
} from '../../../utils/shiftData'
import {
  getEmployeeShiftsForMonth,
  saveEmployeeShift,
  applyBulkEmployeeShifts,
} from '../../../services/academyDataService'
import { fetchEmployeeWorkforceBundle } from '../../../services/workforceAdminService'
import { isCloudMode } from '../../../lib/dataMode'
import { usePlatformPageRefresh } from '../../../context/PullToRefreshContext'
import { canEditEmployeeSchedule } from '../../../config/permissions'
import { useSession } from '../../../context/SessionContext'
import EmployeeAvatar from '../../EmployeeAvatar'
import EmployeeScheduleCalendar from '../EmployeeScheduleCalendar'
import ShiftDayEditModal from '../ShiftDayEditModal'
import BulkScheduleModal from '../BulkScheduleModal'
import { ChevronLeftIcon, ChevronRightIcon } from '../../icons/PlatformIcons'
import '../../EmployeeAvatar.css'
import '../admin-shared.css'
import '../EmployeeSchedule.css'

function getInitialMonth(weekStartKey) {
  if (isDateKey(weekStartKey)) {
    const date = parseDateKey(weekStartKey)
    return { year: date.getFullYear(), month: date.getMonth() + 1 }
  }
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

function formatDateLabel(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Персональный график сотрудника */
export default function EmployeeScheduleSection({ employeeId, weekStartKey = null }) {
  const navigate = useNavigate()
  const { user } = useSession()
  const canEdit = canEditEmployeeSchedule(user)

  const [{ year, month }, setMonthState] = useState(() => getInitialMonth(weekStartKey))
  const [employee, setEmployee] = useState(null)
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [employeeMissing, setEmployeeMissing] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [editDateKey, setEditDateKey] = useState(null)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [bulkApplying, setBulkApplying] = useState(false)

  const shiftMap = useMemo(() => shiftsToMap(shifts), [shifts])

  const loadScheduleData = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    setError('')
    setEmployeeMissing(false)
    try {
      if (isCloudMode()) {
        const bundle = await fetchEmployeeWorkforceBundle(employeeId, year, month, 'schedule')
        setEmployee(bundle.employee)
        setShifts(bundle.shifts)
        setEmployeeMissing(!bundle.employee)
      } else {
        const localEmployee = getEmployeeById(Number(employeeId))
        setEmployee(localEmployee)
        setEmployeeMissing(!localEmployee)
        if (localEmployee) {
          const rows = await getEmployeeShiftsForMonth(employeeId, year, month)
          setShifts(rows)
        } else {
          setShifts([])
        }
      }
    } catch (err) {
      setError(err.message || 'Не удалось загрузить график')
    } finally {
      setLoading(false)
    }
  }, [employeeId, year, month])

  usePlatformPageRefresh(loadScheduleData)

  useEffect(() => {
    loadScheduleData()
  }, [loadScheduleData])

  function changeMonth(delta) {
    setMonthState((prev) => {
      const date = new Date(prev.year, prev.month - 1 + delta, 1)
      return { year: date.getFullYear(), month: date.getMonth() + 1 }
    })
  }

  function goToday() {
    setMonthState(getInitialMonth(null))
  }

  function goBack() {
    if (isDateKey(weekStartKey)) {
      navigate(`/platform/employees/schedule?week=${encodeURIComponent(weekStartKey)}`)
      return
    }
    navigate(-1)
  }

  async function handleSaveShift(payload) {
    setSaving(true)
    setError('')
    try {
      await saveEmployeeShift(employeeId, payload, user?.id || null)
      await loadScheduleData()
      setEditDateKey(null)
      setSuccessMessage('График сотрудника сохранён')
    } catch (err) {
      setError(err.message || 'Не удалось сохранить смену')
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function handleBulkApply(entries, options) {
    setBulkApplying(true)
    setError('')
    try {
      await applyBulkEmployeeShifts(employeeId, entries, {
        ...options,
        createdBy: user?.id || null,
      })
      await loadScheduleData()
      setShowBulkModal(false)
      setSuccessMessage('График сотрудника сохранён')
    } catch (err) {
      setError(err.message || 'Не удалось применить график')
    } finally {
      setBulkApplying(false)
    }
  }

  if (loading && !employee) {
    return <div className="schedule-loading">Загрузка графика…</div>
  }

  if (employeeMissing || !employee) {
    return <p className="admin-form__error">Сотрудник не найден</p>
  }

  const hasShifts = shifts.length > 0
  const editShift = editDateKey ? shiftMap.get(editDateKey) : null

  return (
    <>
      <div className="schedule-header">
        <button type="button" className="btn btn--outline btn--sm" onClick={goBack}>
          ← Назад
        </button>
        <div className="schedule-header__profile">
          <EmployeeAvatar name={employee.name} avatarUrl={employee.avatarUrl} size="lg" />
          <div className="schedule-header__meta">
            <h1>{employee.name}</h1>
            <p>{employee.position || getRoleLabel(employee.role)}</p>
          </div>
        </div>
      </div>

      <div className="schedule-month-nav">
        <h2 className="schedule-month-nav__title">{formatMonthYearLabel(year, month)}</h2>
        <div className="schedule-month-nav__controls">
          <button type="button" className="btn btn--outline btn--sm" onClick={() => changeMonth(-1)} aria-label="Предыдущий месяц">
            <ChevronLeftIcon />
          </button>
          <button type="button" className="btn btn--outline btn--sm" onClick={goToday}>
            Сегодня
          </button>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => changeMonth(1)} aria-label="Следующий месяц">
            <ChevronRightIcon />
          </button>
          {canEdit && (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setShowBulkModal(true)}>
              Настроить график
            </button>
          )}
        </div>
      </div>

      {successMessage && (
        <p className="admin-success-banner" role="status">
          {successMessage}
        </p>
      )}
      {error && <p className="admin-form__error">{error}</p>}

      {loading ? (
        <div className="schedule-loading">Загрузка графика…</div>
      ) : (
        <>
          {!hasShifts && (
            <p className="schedule-empty">На этот месяц график ещё не составлен</p>
          )}
          <EmployeeScheduleCalendar
            year={year}
            month={month}
            shiftMap={shiftMap}
            editable={canEdit}
            onEditDay={setEditDateKey}
          />
        </>
      )}

      {editDateKey && canEdit && (
        <ShiftDayEditModal
          employeeName={employee.name}
          dateKey={editDateKey}
          dateLabel={formatDateLabel(editDateKey)}
          shift={editShift}
          canEditActual={canEdit}
          onClose={() => setEditDateKey(null)}
          onSave={handleSaveShift}
          saving={saving}
        />
      )}

      {showBulkModal && canEdit && (
        <BulkScheduleModal
          onClose={() => setShowBulkModal(false)}
          onApply={handleBulkApply}
          applying={bulkApplying}
        />
      )}
    </>
  )
}
