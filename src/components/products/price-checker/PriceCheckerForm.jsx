import { useEffect, useRef } from 'react'
import { normalizeBarcodeInput } from '../../../services/umagPriceCheckerService'

export default function PriceCheckerForm({
  value,
  onChange,
  onSubmit,
  onClear,
  loading = false,
  disabled = false,
}) {
  const inputRef = useRef(null)
  const wasLoadingRef = useRef(false)

  function focusInput() {
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (wasLoadingRef.current && !loading) {
      focusInput()
    }
    wasLoadingRef.current = loading
  }, [loading])

  function handleChange(event) {
    onChange?.(normalizeBarcodeInput(event.target.value))
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (loading || disabled) return
    onSubmit?.(normalizeBarcodeInput(value))
  }

  function handleClear() {
    onClear?.()
    focusInput()
  }

  return (
    <form className="price-checker-form" onSubmit={handleSubmit}>
      <label className="price-checker-form__label" htmlFor="price-checker-barcode">
        Штрих-код
      </label>
      <div className="price-checker-form__row">
        <input
          ref={inputRef}
          id="price-checker-barcode"
          className="price-checker-form__input"
          value={value}
          onChange={handleChange}
          placeholder="Отсканируйте или введите штрих-код"
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          aria-busy={loading}
        />
        {value ? (
          <button
            type="button"
            className="btn btn--outline price-checker-form__clear"
            onClick={handleClear}
            disabled={loading}
          >
            Очистить
          </button>
        ) : null}
        <button
          type="submit"
          className="btn btn--primary price-checker-form__submit"
          disabled={loading || disabled || !normalizeBarcodeInput(value)}
        >
          {loading ? 'Проверка…' : 'Проверить цену'}
        </button>
      </div>
      {loading ? (
        <div className="price-checker-form__loading" aria-live="polite">
          <span className="price-checker-form__spinner" aria-hidden="true" />
          <span>Запрашиваем цену в UMAG…</span>
        </div>
      ) : (
        <p className="price-checker-form__hint">
          USB-сканер работает как клавиатура и завершает ввод клавишей Enter.
        </p>
      )}
    </form>
  )
}
