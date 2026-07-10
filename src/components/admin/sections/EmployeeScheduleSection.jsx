import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEmployeeById } from '../../../utils/employeeData'
import { getRoleLabel } from '../../../data/roles'
import {
  shiftsToMap,
  formatMonthYearLabel,
  parseDateKey,
} from '../../../utils/shiftData'
import {
  getEmployeeShiftsForMonth,
  saveEmployeeShift,
  applyBulkEmployeeShifts,
} from '../../../services/academyDataService'
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

function getInitialMonth() {
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
export default function EmployeeScheduleSection({ employeeId }) {
  const navigate = useNavigate()
  const { user } = useSession()
  const employee = getEmployeeById(Number(employeeId))
  const canEdit = canEditEmployeeSchedule(user)

  const [{ year, month }, setMonthState] = useState(getInitialMonth)
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [editDateKey, setEditDateKey] = useState(null)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [bulkApplying, setBulkApplying] = useState(false)

  const shiftMap = useMemo(() => shiftsToMap(shifts), [shifts])

  const loadShifts = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    setError('')
    try {
      const rows = await getEmployeeShiftsForMonth(employeeId, year, month)
      setShifts(rows)
    } catch (err) {
      setError(err.message || 'Не удалось загрузить график')
    } finally {
      setLoading(false)
    }
  }, [employeeId, year, month])

  useEffect(() => {
    loadShifts()
  }, [loadShifts])

  function changeMonth(delta) {
    setMonthState((prev) => {
      const date = new Date(prev.year, prev.month - 1 + delta, 1)
      return { year: date.getFullYear(), month: date.getMonth() + 1 }
    })
  }

  function goToday() {
    setMonthState(getInitialMonth())
  }

  async function handleSaveShift(payload) {
    setSaving(true)
    setError('')
    try {
      await saveEmployeeShift(employeeId, payload, user?.id || null)
      await loadShifts()
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
      await loadShifts()
      setShowBulkModal(false)
      setSuccessMessage('График сотрудника сохранён')
    } catch (err) {
      setError(err.message || 'Не удалось применить график')
    } finally {
      setBulkApplying(false)
    }
  }

  if (!employee) {
    return <p className="admin-form__error">Сотрудник не найден</p>
  }

  const hasShifts = shifts.length > 0
  const editShift = editDateKey ? shiftMap.get(editDateKey) : null

  return (
    <>
      <div className="schedule-header">
        <button type="button" className="btn btn--outline btn--sm" onClick={() => navigate(-1)}>
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
