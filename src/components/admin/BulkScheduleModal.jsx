import { useState } from 'react'
import AdminModal from './AdminModal'
import ConfirmDialog from './ConfirmDialog'
import {
  WEEKDAY_LABELS,
  WEEKDAY_INDICES,
  validateBulkScheduleForm,
  buildBulkShiftEntries,
} from '../../utils/shiftData'
import './admin-shared.css'

const EMPTY_BULK_FORM = {
  startDate: '',
  endDate: '',
  weekdays: [1, 2, 3, 4, 5],
  plannedStartTime: '09:00',
  plannedEndTime: '19:00',
  setWorking: true,
  markOthersDayOff: false,
  overwrite: false,
}

/** Модальное окно массовой настройки графика */
export default function BulkScheduleModal({ onClose, onApply }) {
  const [form, setForm] = useState(EMPTY_BULK_FORM)
  const [errors, setErrors] = useState({})
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false)

  function toggleWeekday(day) {
    setForm((prev) => {
      const set = new Set(prev.weekdays)
      if (set.has(day)) set.delete(day)
      else set.add(day)
      return { ...prev, weekdays: [...set] }
    })
  }

  function submit(overwrite = form.overwrite) {
    const formSnapshot = { ...form, overwrite }
    const validationErrors = validateBulkScheduleForm(formSnapshot)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return false

    const entries = buildBulkShiftEntries(formSnapshot)
    if (!entries.length) {
      setErrors({ weekdays: 'Нет дней для применения в выбранном периоде' })
      return false
    }

    return onApply({
      entries,
      options: { overwrite },
      form: formSnapshot,
    })
  }

  function handleApplyClick() {
    if (form.overwrite) {
      setShowOverwriteConfirm(true)
      return
    }
    submit(false)
  }

  return (
    <>
      <AdminModal
        title="Настроить график"
        onClose={onClose}
        wide
        footer={
          <>
            <button type="button" className="btn btn--outline" onClick={onClose}>
              Отмена
            </button>
            <button type="button" className="btn btn--primary" onClick={handleApplyClick}>
              Применить график
            </button>
          </>
        }
      >
        <div className="admin-form">
          <div className="admin-form__row">
            <label className="admin-form__label">
              Дата начала *
              <input
                type="date"
                className="admin-form__input"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
              {errors.startDate && <span className="admin-form__error">{errors.startDate}</span>}
            </label>
            <label className="admin-form__label">
              Дата окончания *
              <input
                type="date"
                className="admin-form__input"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
              {errors.endDate && <span className="admin-form__error">{errors.endDate}</span>}
            </label>
          </div>

          <fieldset className="bulk-schedule-weekdays">
            <legend className="admin-form__label">Дни недели *</legend>
            <div className="bulk-schedule-weekdays__grid">
              {WEEKDAY_LABELS.map((label, index) => {
                const day = WEEKDAY_INDICES[index]
                return (
                  <label key={day} className="bulk-schedule-weekday">
                    <input
                      type="checkbox"
                      checked={form.weekdays.includes(day)}
                      onChange={() => toggleWeekday(day)}
                    />
                    {label}
                  </label>
                )
              })}
            </div>
            {errors.weekdays && <span className="admin-form__error">{errors.weekdays}</span>}
          </fieldset>

          <div className="admin-form__row">
            <label className="admin-form__label">
              Начало смены
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
              Конец смены
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

          <label className="admin-form__label admin-form__label--inline">
            <input
              type="checkbox"
              checked={form.setWorking}
              onChange={(e) => setForm({ ...form, setWorking: e.target.checked })}
            />
            Установить выбранные дни как рабочие
          </label>

          <label className="admin-form__label admin-form__label--inline">
            <input
              type="checkbox"
              checked={form.markOthersDayOff}
              onChange={(e) => setForm({ ...form, markOthersDayOff: e.target.checked })}
            />
            Остальные дни сделать выходными
          </label>

          <label className="admin-form__label admin-form__label--inline">
            <input
              type="checkbox"
              checked={form.overwrite}
              onChange={(e) => setForm({ ...form, overwrite: e.target.checked })}
            />
            Перезаписать уже существующий график
          </label>
        </div>
      </AdminModal>

      {showOverwriteConfirm && (
        <ConfirmDialog
          title="Перезаписать график?"
          message="Уже существующие смены в выбранном периоде будут заменены новыми значениями."
          confirmLabel="Перезаписать"
          onCancel={() => setShowOverwriteConfirm(false)}
          onConfirm={() => {
            setShowOverwriteConfirm(false)
            submit(true)
          }}
        />
      )}
    </>
  )
}
