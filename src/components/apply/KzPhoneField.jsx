import { extractKzPhoneTail, groupKzPhoneTail, KZ_PHONE_FIXED_PREFIX } from '../../utils/kzPhone'
import './KzPhoneField.css'

/**
 * KZ mobile phone input: fixed "+7 7" prefix, user types the remaining 9
 * digits. `value` is the raw 9-digit tail (or fewer while typing).
 */
export default function KzPhoneField({ id, value, onChange, disabled, required, error }) {
  function handleChange(e) {
    onChange(extractKzPhoneTail(e.target.value, value))
  }

  return (
    <div className={`kz-phone-field${error ? ' kz-phone-field--invalid' : ''}`}>
      <span className="kz-phone-field__prefix" aria-hidden="true">
        {KZ_PHONE_FIXED_PREFIX}
      </span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        className="kz-phone-field__input"
        placeholder="XX XXX XX XX"
        value={groupKzPhoneTail(value)}
        disabled={disabled}
        required={required}
        aria-invalid={Boolean(error)}
        aria-label="Номер телефона, формат +7 7XX XXX XX XX"
        onChange={handleChange}
      />
    </div>
  )
}
