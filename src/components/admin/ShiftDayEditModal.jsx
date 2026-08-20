import { useEffect, useMemo, useState } from 'react'
import AdminModal from './AdminModal'
import {
  SHIFT_STATUS_OPTIONS,
  SHIFT_DAY_CLEAR_OPTION,
  isShiftDayClearValue,
  isWorkingShiftStatus,
  shiftToForm,
  validateShiftForm,
  formToShiftPayload,
  formatTimeRange,
  formatTimeValue,
} from '../../utils/shiftData'
import {
  hasShiftAttendanceHistory,
  isDestructiveScheduleChange,
  getDestructiveScheduleChangeMessage,
} from '../../utils/shiftAttendanceGuard'
import './admin-shared.css'
import './EmployeeSchedule.css'

/** Модальное окно редактирования одной смены */
export default function ShiftDayEditModal({
  employeeName,
  dateKey,
  dateLabel,
  shift,
  canEditActual = true,
  onClose,
  onSave,
  onClear,
}) {
  const [form, setForm] = useState(() => shiftToForm(shift, dateKey))
  const [errors, setErrors] = useState({})
  const [destructiveConfirm, setDestructiveConfirm] = useState(false)
  const [pendingPayload, setPendingPayload] = useState(null)

  const hasAttendance = useMemo(() => hasShiftAttendanceHistory(shift), [shift])
  const canClearToEmpty = Boolean(shift) && !hasAttendance && typeof onClear === 'function'
  const statusOptions = useMemo(() => {
    if (!canClearToEmpty) return SHIFT_STATUS_OPTIONS
    return [...SHIFT_STATUS_OPTIONS, SHIFT_DAY_CLEAR_OPTION]
  }, [canClearToEmpty])

  useEffect(() => {
    setForm(shiftToForm(shift, dateKey))
    setErrors({})
    setDestructiveConfirm(false)
    setPendingPayload(null)
  }, [shift, dateKey])

  const clearingDay = isShiftDayClearValue(form.status)
  const showShiftTimes = !clearingDay && isWorkingShiftStatus(form.status)
  const lateMinutes = shift?.lateMinutes ?? shift?.computedStatus?.lateMinutes ?? 0
  const earlyLeaveMinutes =
    shift?.earlyLeaveMinutes ?? shift?.computedStatus?.earlyLeaveMinutes ?? 0
  const workedMinutes = shift?.workedMinutes ?? shift?.computedStatus?.workedMinutes ?? 0
  const plannedSummary = formatTimeRange(shift?.plannedStartTime, shift?.plannedEndTime)
  const actualStartSummary = formatTimeValue(shift?.actualStartTime)
  const actualEndSummary = formatTimeValue(shift?.actualEndTime)
  const hasAttendanceSummary =
    Boolean(shift) &&
    (Boolean(plannedSummary) ||
      Boolean(actualStartSummary) ||
      Boolean(actualEndSummary) ||
      lateMinutes > 0 ||
      earlyLeaveMinutes > 0 ||
      workedMinutes > 0)

  function submitPayload(payload) {
    onSave(payload)
  }

  function handleSubmit(event) {
    event.preventDefault()

    if (isShiftDayClearValue(form.status)) {
      if (!canClearToEmpty) return
      onClear(dateKey)
      return
    }

    const validationErrors = validateShiftForm(form)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    const payload = formToShiftPayload(form)
    if (isDestructiveScheduleChange(shift, payload)) {
      setPendingPayload(payload)
      setDestructiveConfirm(true)
      return
    }

    submitPayload(payload)
  }

  function confirmDestructiveSave() {
    if (pendingPayload) submitPayload(pendingPayload)
    setDestructiveConfirm(false)
    setPendingPayload(null)
  }

  if (destructiveConfirm) {
    return (
      <AdminModal
        title="Подтверждение изменения"
        onClose={() => {
          setDestructiveConfirm(false)
          setPendingPayload(null)
        }}
        footer={
          <>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => {
                setDestructiveConfirm(false)
                setPendingPayload(null)
              }}
            >
              Отмена
            </button>
            <button type="button" className="btn btn--primary" onClick={confirmDestructiveSave}>
              Продолжить
            </button>
          </>
        }
      >
        <p className="admin-form__hint">{getDestructiveScheduleChangeMessage()}</p>
      </AdminModal>
    )
  }

  return (
    <AdminModal
      title="Редактирование смены"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn--outline" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary" form="shift-day-form">
            {clearingDay ? 'Убрать смену' : 'Сохранить'}
          </button>
        </>
      }
    >
      <form id="shift-day-form" className="admin-form" onSubmit={handleSubmit}>
        <p className="admin-form__hint">{employeeName} · {dateLabel}</p>

        {hasAttendanceSummary && (
          <div className="admin-form__hint shift-day-summary" aria-label="Сводка смены">
            {plannedSummary && <p>Плановая смена: {plannedSummary}</p>}
            <p>Фактическое начало: {actualStartSummary || '—'}</p>
            <p>Фактическое окончание: {actualEndSummary || '—'}</p>
            {lateMinutes > 0 && <p>Опоздание: {lateMinutes} мин</p>}
            {earlyLeaveMinutes > 0 && <p>Ранний уход: {earlyLeaveMinutes} мин</p>}
            {workedMinutes > 0 && <p>Отработано: {workedMinutes} мин</p>}
          </div>
        )}

        <label className="admin-form__label">
          Статус дня
          <select
            className="admin-form__select"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {hasAttendance && (
          <p className="admin-form__hint">
            По смене есть отметки прихода/ухода — пункт «Нет смены» недоступен. Факт можно
            изменить в полях ниже.
          </p>
        )}

        {clearingDay && (
          <p className="admin-form__hint">
            Смена будет удалена из графика. День станет «Нет смены».
          </p>
        )}

        {showShiftTimes && (
          <div className="admin-form__row">
            <label className="admin-form__label">
              Начало смены *
              <input
                type="time"
                className="admin-form__input"
                value={form.plannedStartTime}
                onChange={(e) => setForm({ ...form, plannedStartTime: e.target.value })}
              />
              {errors.plannedStartTime && (
                <span className="admin-form__error">{errors.plannedStartTime}</span>
              )}
            </label>
            <label className="admin-form__label">
              Конец смены *
              <input
                type="time"
                className="admin-form__input"
                value={form.plannedEndTime}
                onChange={(e) => setForm({ ...form, plannedEndTime: e.target.value })}
              />
              {errors.plannedEndTime && (
                <span className="admin-form__error">{errors.plannedEndTime}</span>
              )}
            </label>
          </div>
        )}

        {canEditActual && !clearingDay && (
          <div className="admin-form__row">
            <label className="admin-form__label">
              Фактическое время прихода
              <input
                type="time"
                className="admin-form__input"
                value={form.actualStartTime}
                onChange={(e) => setForm({ ...form, actualStartTime: e.target.value })}
              />
            </label>
            <label className="admin-form__label">
              Фактическое время ухода
              <input
                type="time"
                className="admin-form__input"
                value={form.actualEndTime}
                onChange={(e) => setForm({ ...form, actualEndTime: e.target.value })}
              />
            </label>
          </div>
        )}

        {!clearingDay && (
          <label className="admin-form__label">
            Комментарий
            <textarea
              className="admin-form__input"
              rows={3}
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
            />
          </label>
        )}
      </form>
    </AdminModal>
  )
}
