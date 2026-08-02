import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEmployeeById, getEmployeePositionDisplay } from '../../../utils/employeeData'
import {
  shiftsToMap,
  formatMonthYearLabel,
  parseDateKey,
  isDateKey,
  getMonthCalendarRange,
} from '../../../utils/shiftData'
import {
  canEditEmployeeScheduleDate,
  doesMonthOverlapEmployeeEmployment,
  filterScheduleEntriesToEmployment,
  getEmployeeScheduleDateRestrictionReason,
  getMonthScheduleSetupDisabledReason,
} from '../../../utils/employeeSchedulePeriod'
import { fetchEmployeeWorkforceBundle } from '../../../services/workforceAdminService'
import { isCloudMode } from '../../../lib/dataMode'
import { usePlatformPageRefresh } from '../../../context/PullToRefreshContext'
import { canEditEmployeeSchedule } from '../../../config/permissions'
import { useSession } from '../../../context/SessionContext'
import { useScheduleBackgroundSync, BULK_OPERATION_STATUS } from '../../../hooks/useScheduleBackgroundSync'
import { allowMobileBrowserBackOnce } from '../../../hooks/useBlockMobileBrowserBack'
import { toastError, toastWarning } from '../../../services/notificationService'
import EmployeeAvatar from '../../EmployeeAvatar'
import EmployeeScheduleCalendar from '../EmployeeScheduleCalendar'
import ShiftDayEditModal from '../ShiftDayEditModal'
import BulkScheduleModal from '../BulkScheduleModal'
import PlatformPeriodHeader from '../../platform/PlatformPeriodHeader'
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

/**
 * Персональный график сотрудника.
 * embedded — блок внутри карточки сотрудника (без дублирующего header/back).
 */
export default function EmployeeScheduleSection({
  employeeId,
  weekStartKey = null,
  embedded = false,
  sharedEmployee = null,
  onPeriodChange = null,
  onEmployeeSync = null,
}) {
  const navigate = useNavigate()
  const { user } = useSession()
  const canEdit = canEditEmployeeSchedule(user)

  const [{ year, month }, setMonthState] = useState(() => getInitialMonth(weekStartKey))
  const [employee, setEmployee] = useState(sharedEmployee)
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [employeeMissing, setEmployeeMissing] = useState(false)
  const [error, setError] = useState('')
  const [editDateKey, setEditDateKey] = useState(null)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const sharedEmployeeRef = useRef(sharedEmployee)
  const onEmployeeSyncRef = useRef(onEmployeeSync)
  const onPeriodChangeRef = useRef(onPeriodChange)

  sharedEmployeeRef.current = sharedEmployee
  onEmployeeSyncRef.current = onEmployeeSync
  onPeriodChangeRef.current = onPeriodChange

  const shiftMap = useMemo(() => shiftsToMap(shifts), [shifts])

  const loadScheduleData = useCallback(async (options = {}) => {
    if (!employeeId) return
    const quiet = options?.quiet === true
    if (!quiet) setLoading(true)
    setError('')
    if (!quiet) setEmployeeMissing(false)
    try {
      if (isCloudMode()) {
        const bundle = await fetchEmployeeWorkforceBundle(employeeId, year, month, 'schedule')
        const nextEmployee = bundle.employee || sharedEmployeeRef.current || null
        setEmployee(nextEmployee)
        setShifts(bundle.shifts)
        setEmployeeMissing(!nextEmployee)
        if (bundle.employee) {
          onEmployeeSyncRef.current?.(bundle.employee)
        }
      } else {
        const localEmployee = getEmployeeById(Number(employeeId)) || sharedEmployeeRef.current
        setEmployee(localEmployee)
        setEmployeeMissing(!localEmployee)
        if (localEmployee) {
          const { getEmployeeShiftsForDateRange } = await import(
            '../../../services/platformDataService'
          )
          const { dateFrom, dateTo } = getMonthCalendarRange(year, month)
          const rows = await getEmployeeShiftsForDateRange(employeeId, dateFrom, dateTo)
          setShifts(rows)
          onEmployeeSyncRef.current?.(localEmployee)
        } else {
          setShifts([])
        }
      }
    } catch (err) {
      setError(err.message || 'Не удалось загрузить график')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [employeeId, year, month])

  const { syncMetaByDate, bulkOperation, enqueueSave, enqueueBulkSave, retryBulkSave, retrySave, dismissBulkStatus } =
    useScheduleBackgroundSync({
      employeeId,
      userId: user?.id || null,
      onBulkSuccess: loadScheduleData,
    })

  usePlatformPageRefresh(loadScheduleData)

  useEffect(() => {
    loadScheduleData()
  }, [loadScheduleData])

  useEffect(() => {
    if (sharedEmployee) {
      setEmployee((current) => current || sharedEmployee)
    }
  }, [sharedEmployee])

  useEffect(() => {
    onPeriodChangeRef.current?.({
      year,
      month,
      shifts,
      loading,
      error,
    })
  }, [year, month, shifts, loading, error])

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
    allowMobileBrowserBackOnce()
    navigate(-1)
  }

  const resolvedEmployee = employee || sharedEmployee

  function handleEditDay(dateKey) {
    if (!canEdit || !resolvedEmployee) return
    if (!canEditEmployeeScheduleDate(resolvedEmployee, dateKey)) return
    setEditDateKey(dateKey)
  }

  function handleSaveShift(payload) {
    if (!resolvedEmployee || !canEditEmployeeScheduleDate(resolvedEmployee, payload.shiftDate)) {
      toastError(getEmployeeScheduleDateRestrictionReason(resolvedEmployee, payload.shiftDate) ||
        'Дата вне периода работы сотрудника')
      return
    }
    const existingShift = shiftMap.get(payload.shiftDate) || null
    setEditDateKey(null)
    enqueueSave(payload, existingShift, setShifts)
  }

  function handleBulkApply(snapshot) {
    if (!resolvedEmployee) return false
    const { allowed, skipped } = filterScheduleEntriesToEmployment(
      resolvedEmployee,
      snapshot.entries
    )
    if (!allowed.length) {
      toastError('Нет дат в периоде работы сотрудника для выбранного диапазона')
      return false
    }
    if (skipped.length > 0) {
      toastWarning(
        `Пропущено ${skipped.length} дн. вне периода работы — сохранены только допустимые даты`
      )
    }
    return enqueueBulkSave(
      { ...snapshot, entries: allowed },
      setShifts,
      () => setShowBulkModal(false)
    )
  }

  function handleRetryBulkSave() {
    retryBulkSave(setShifts)
  }

  const bulkSaving = bulkOperation.status === BULK_OPERATION_STATUS.SAVING
  const bulkFailed = bulkOperation.status === BULK_OPERATION_STATUS.ERROR

  const monthOverlapsEmployment = resolvedEmployee
    ? doesMonthOverlapEmployeeEmployment(resolvedEmployee, year, month)
    : false
  const setupDisabledReason = resolvedEmployee
    ? getMonthScheduleSetupDisabledReason(resolvedEmployee, year, month)
    : null

  function handleRetrySync(dateKey) {
    retrySave(dateKey, setShifts)
  }

  if (!embedded && loading && !employee) {
    return <div className="schedule-loading">Загрузка графика…</div>
  }

  if (!embedded && (employeeMissing || !employee)) {
    return <p className="admin-form__error">Сотрудник не найден</p>
  }

  const hasShifts = shifts.length > 0
  const editShift = editDateKey ? shiftMap.get(editDateKey) : null

  return (
    <>
      {!embedded && (
        <div className="schedule-header">
          <button type="button" className="btn btn--outline btn--sm" onClick={goBack}>
            ← Назад
          </button>
          <div className="schedule-header__profile">
            <EmployeeAvatar
              name={resolvedEmployee?.name}
              avatarUrl={resolvedEmployee?.avatarUrl}
              size="lg"
            />
            <div className="schedule-header__meta">
              <h1>{resolvedEmployee?.name}</h1>
              <p>{getEmployeePositionDisplay(resolvedEmployee)}</p>
            </div>
          </div>
        </div>
      )}

      <PlatformPeriodHeader
        title={formatMonthYearLabel(year, month)}
        onPrev={() => changeMonth(-1)}
        onNext={() => changeMonth(1)}
        onToday={goToday}
        prevLabel="Предыдущий месяц"
        nextLabel="Следующий месяц"
      />

      {canEdit && (
        <div className="schedule-employee-actions">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => setShowBulkModal(true)}
            disabled={bulkSaving || !monthOverlapsEmployment}
            title={setupDisabledReason || undefined}
            aria-disabled={bulkSaving || !monthOverlapsEmployment}
          >
            Настроить график
          </button>
          {setupDisabledReason && (
            <span className="schedule-employee-actions__hint">{setupDisabledReason}</span>
          )}
        </div>
      )}

      {bulkSaving && (
        <p className="schedule-bulk-status" role="status">
          График сохраняется…
        </p>
      )}

      {bulkFailed && (
        <div className="schedule-bulk-status schedule-bulk-status--error" role="alert">
          <span>Не удалось сохранить график</span>
          <button type="button" className="btn btn--outline btn--sm" onClick={handleRetryBulkSave}>
            Повторить
          </button>
          <button
            type="button"
            className="schedule-bulk-status__dismiss"
            onClick={dismissBulkStatus}
            aria-label="Скрыть"
          >
            ×
          </button>
        </div>
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
            syncMetaByDate={syncMetaByDate}
            editable={canEdit}
            canEditDate={(dateKey) => canEditEmployeeScheduleDate(resolvedEmployee, dateKey)}
            getDateRestrictionReason={(dateKey) =>
              getEmployeeScheduleDateRestrictionReason(resolvedEmployee, dateKey)
            }
            onEditDay={handleEditDay}
            onRetrySync={handleRetrySync}
          />
        </>
      )}

      {editDateKey &&
        canEdit &&
        resolvedEmployee &&
        canEditEmployeeScheduleDate(resolvedEmployee, editDateKey) && (
        <ShiftDayEditModal
          employeeName={resolvedEmployee.name}
          dateKey={editDateKey}
          dateLabel={formatDateLabel(editDateKey)}
          shift={editShift}
          canEditActual={canEdit}
          onClose={() => setEditDateKey(null)}
          onSave={handleSaveShift}
        />
      )}

      {showBulkModal && canEdit && monthOverlapsEmployment && (
        <BulkScheduleModal
          employee={resolvedEmployee}
          onClose={() => setShowBulkModal(false)}
          onApply={handleBulkApply}
        />
      )}
    </>
  )
}
