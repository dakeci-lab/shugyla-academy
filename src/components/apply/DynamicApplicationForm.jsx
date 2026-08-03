import {
  ALLOWED_CANDIDATE_PHOTO_TYPES,
} from '../../services/candidatePhotoService'

/**
 * Renders vacancy application questions dynamically.
 * Used by public Apply and HR preview (preview disables submit/upload).
 */
export default function DynamicApplicationForm({
  questions,
  values,
  errors = {},
  onChange,
  onPhotoChange,
  photoPreview,
  photoWarning,
  disabled = false,
  preview = false,
}) {
  return (
    <div className="apply-form__fields">
      {(questions || []).map((q) => {
        const id = `q-${q.id}`
        const err = errors[q.id]
        const labelText = (
          <>
            {q.questionText}
            {q.required ? ' *' : ''}
          </>
        )

        return (
          <div key={q.id} className="apply-form__field">
            {q.questionType === 'long_text' ? (
              <>
                <label className="apply-form__label" htmlFor={id}>
                  {labelText}
                </label>
                <textarea
                  id={id}
                  className="apply-form__control"
                  rows={4}
                  value={values[q.id] ?? ''}
                  placeholder={q.placeholder || undefined}
                  required={q.required}
                  disabled={disabled}
                  onChange={(e) => onChange(q.id, e.target.value)}
                />
              </>
            ) : q.questionType === 'photo' ? (
              <div className="apply-photo-field">
                <label className="apply-form__label" htmlFor={id}>
                  {labelText}
                </label>
                <input
                  id={id}
                  className="apply-form__control"
                  type="file"
                  accept={ALLOWED_CANDIDATE_PHOTO_TYPES.join(',')}
                  disabled={disabled || preview}
                  required={q.required && !preview}
                  onChange={(e) => onPhotoChange?.(q.id, e)}
                />
                {q.helpText ? <p className="apply-form__help">{q.helpText}</p> : null}
                {photoWarning ? <p className="apply-photo-warning">{photoWarning}</p> : null}
                {photoPreview ? (
                  <div className="apply-photo-preview">
                    <img src={photoPreview} alt="Превью фото" />
                  </div>
                ) : null}
                {preview ? (
                  <p className="apply-form__help">В предварительном просмотре файл не загружается.</p>
                ) : null}
              </div>
            ) : q.questionType === 'yes_no' ? (
              <fieldset className="apply-choice-fieldset">
                <legend className="apply-form__label">{labelText}</legend>
                {q.helpText ? <p className="apply-form__help">{q.helpText}</p> : null}
                <div className="apply-choice-list">
                  {[
                    { id: 'yes', label: 'Да', value: true },
                    { id: 'no', label: 'Нет', value: false },
                  ].map((opt) => (
                    <label key={opt.id} className="apply-choice-option">
                      <input
                        type="radio"
                        name={id}
                        checked={values[q.id] === opt.value}
                        disabled={disabled}
                        onChange={() => onChange(q.id, opt.value)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : q.questionType === 'single_choice' ? (
              <fieldset className="apply-choice-fieldset">
                <legend className="apply-form__label">{labelText}</legend>
                {q.helpText ? <p className="apply-form__help">{q.helpText}</p> : null}
                <div className="apply-choice-list">
                  {(q.options || []).map((opt) => (
                    <label key={opt.id} className="apply-choice-option">
                      <input
                        type="radio"
                        name={id}
                        checked={values[q.id] === opt.id}
                        disabled={disabled}
                        onChange={() => onChange(q.id, opt.id)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : q.questionType === 'multi_choice' ? (
              <fieldset className="apply-choice-fieldset">
                <legend className="apply-form__label">{labelText}</legend>
                {q.helpText ? <p className="apply-form__help">{q.helpText}</p> : null}
                <div className="apply-choice-list">
                  {(q.options || []).map((opt) => {
                    const selected = Array.isArray(values[q.id]) ? values[q.id] : []
                    const checked = selected.includes(opt.id)
                    return (
                      <label key={opt.id} className="apply-choice-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => {
                            const next = checked
                              ? selected.filter((x) => x !== opt.id)
                              : [...selected, opt.id]
                            onChange(q.id, next)
                          }}
                        />
                        <span>{opt.label}</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            ) : !['short_text', 'phone', 'number', 'date'].includes(q.questionType) ? (
              <p className="careers-apply-form__error" role="alert">
                Неизвестный тип вопроса. Обновите страницу или обратитесь в магазин.
              </p>
            ) : (
              <>
                <label className="apply-form__label" htmlFor={id}>
                  {labelText}
                </label>
                <input
                  id={id}
                  className="apply-form__control"
                  type={
                    q.questionType === 'number'
                      ? 'number'
                      : q.questionType === 'date'
                        ? 'date'
                        : q.questionType === 'phone'
                          ? 'tel'
                          : 'text'
                  }
                  inputMode={
                    q.questionType === 'phone'
                      ? 'tel'
                      : q.questionType === 'number'
                        ? 'numeric'
                        : undefined
                  }
                  value={values[q.id] ?? ''}
                  placeholder={q.placeholder || undefined}
                  required={q.required}
                  disabled={disabled}
                  onChange={(e) => onChange(q.id, e.target.value)}
                />
              </>
            )}

            {q.helpText &&
            q.questionType !== 'photo' &&
            q.questionType !== 'single_choice' &&
            q.questionType !== 'multi_choice' &&
            q.questionType !== 'yes_no' ? (
              <p className="apply-form__help">{q.helpText}</p>
            ) : null}
            {err ? <p className="careers-apply-form__error">{err}</p> : null}
          </div>
        )
      })}
    </div>
  )
}
