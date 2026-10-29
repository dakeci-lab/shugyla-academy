import { formatLongRuDate } from '../../../utils/purchaseDocument'
import './DocumentDateBox.css'

const CalendarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <rect x="2.5" y="3.5" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2.5 7.5h13M6 2v3M12 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

/**
 * A date field that always reads in Russian («вс, 25.10.2026»): the native input follows the device language, so
 * it is laid transparently over our own text and only opens the picker.
 */
export default function DocumentDateBox({ value, onChange, label, disabled = false }) {
  return (
    <div className={`docdate${disabled ? ' docdate--disabled' : ''}`}>
      <span className="docdate__text">{value ? formatLongRuDate(value) : 'Выберите дату'}</span>
      <CalendarIcon />
      <input
        type="date"
        lang="ru"
        className="docdate__input"
        value={value || ''}
        aria-label={label}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </div>
  )
}
