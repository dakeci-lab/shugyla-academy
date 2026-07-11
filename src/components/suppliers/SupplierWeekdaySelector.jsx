import { SUPPLIER_WEEKDAYS } from '../../utils/supplierData'
import './SupplierWeekdaySelector.css'

/** Выбор нескольких дней недели для расписания поставщика */
export default function SupplierWeekdaySelector({ label, value = [], onChange, disabled = false }) {
  const selected = new Set(value)

  function toggleDay(dayId) {
    if (disabled) return
    const next = selected.has(dayId)
      ? value.filter((id) => id !== dayId)
      : [...value, dayId]
    const ordered = SUPPLIER_WEEKDAYS.map((day) => day.id).filter((id) => next.includes(id))
    onChange?.(ordered)
  }

  return (
    <fieldset className="supplier-weekday-selector" disabled={disabled}>
      <legend className="supplier-weekday-selector__legend">{label}</legend>
      <div className="supplier-weekday-selector__grid" role="group" aria-label={label}>
        {SUPPLIER_WEEKDAYS.map((day) => {
          const checked = selected.has(day.id)
          return (
            <label
              key={day.id}
              className={`supplier-weekday-selector__day${checked ? ' supplier-weekday-selector__day--active' : ''}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleDay(day.id)}
                disabled={disabled}
              />
              <span>{day.label}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
