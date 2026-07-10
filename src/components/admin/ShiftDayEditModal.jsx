import { useEffect, useState } from 'react'
import AdminModal from './AdminModal'
import {
  SHIFT_STATUS_OPTIONS,
  isWorkingShiftStatus,
  shiftToForm,
  validateShiftForm,
  formToShiftPayload,
} from '../../utils/shiftData'
import './admin-shared.css'

/** Модальное окно редактирования одной смены */
export default function ShiftDayEditModal({
  employeeName,
  dateKey,
  dateLabel,
  shift,
  canEditActual = true,
  onClose,
  onSave,
  saving = false,
}) {
  const [form, setForm] = useState(() => shiftToForm(shift, dateKey))
  const [errors, setErrors] = useState({})

  useEffect(() => {
    setForm(shiftToForm(shift, dateKey))
    setErrors({})
  }, [shift, dateKey])

  const showShiftTimes = isWorkingShiftStatus(form.status)

  async function handleSubmit(event) {
    event.preventDefault()
    const validationErrors = validateShiftForm(form)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return
    await onSave(formToShiftPayload(form))
  }

  return (
    <AdminModal
      title="Редактирование смены"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn--outline" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary" form="shift-day-form" disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </>
      }
    >
      <form id="shift-day-form" className="admin-form" onSubmit={handleSubmit}>
        <p className="admin-form__hint">{employeeName} · {dateLabel}</p>

        <label className="admin-form__label">
          Статус дня
          <select
            className="admin-form__select"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            {SHIFT_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

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

        {canEditActual && (
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

        {shift && (shift.computedStatus?.lateMinutes > 0 || shift.computedStatus?.earlyLeaveMinutes > 0 || shift.workedMinutes > 0) && (
          <div className="admin-form__hint">
            {shift.computedStatus?.lateMinutes > 0 && (
              <p>Опоздание: {shift.computedStatus.lateMinutes} мин</p>
            )}
            {shift.computedStatus?.earlyLeaveMinutes > 0 && (
              <p>Ранний уход: {shift.computedStatus.earlyLeaveMinutes} мин</p>
            )}
            {shift.workedMinutes > 0 && <p>Отработано: {shift.workedMinutes} мин</p>}
          </div>
        )}

        <label className="admin-form__label">
          Комментарий
          <textarea
            className="admin-form__input"
            rows={3}
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
          />
        </label>
      </form>
    </AdminModal>
  )
}
