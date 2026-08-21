import {
  ALLOWED_CANDIDATE_PHOTO_TYPES,
} from '../../services/candidatePhotoService'
import { useLanguage } from '../../context/LanguageContext'
import KzPhoneField from './KzPhoneField'

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
  const { t } = useLanguage()

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
                <span className="apply-form__label" id={`${id}-label`}>
                  {labelText}
                </span>
                <input
                  id={id}
                  className="apply-photo-uploader__input"
                  type="file"
                  accept={ALLOWED_CANDIDATE_PHOTO_TYPES.join(',')}
                  disabled={disabled || preview}
                  required={q.required && !preview && !photoPreview}
                  aria-labelledby={`${id}-label`}
                  onChange={(e) => onPhotoChange?.(q.id, e)}
                />
                <label
                  htmlFor={id}
                  className={`apply-photo-uploader${photoPreview ? ' apply-photo-uploader--filled' : ''}${disabled || preview ? ' apply-photo-uploader--disabled' : ''}`}
                >
                  {photoPreview ? (
                    <div className="apply-photo-uploader__preview">
                      <img src={photoPreview} alt="" />
                    </div>
                  ) : (
                    <>
                      <span className="apply-photo-uploader__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                          <path d="M12 15V4" />
                          <path d="M8 8l4-4 4 4" />
                          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                        </svg>
                      </span>
                      <span className="apply-photo-uploader__title">{t.careersPhotoUploadTitle}</span>
                      <span className="apply-photo-uploader__hint">{t.careersPhotoUploadHint}</span>
                    </>
                  )}
                  <span className="apply-photo-uploader__btn">
                    {photoPreview ? t.careersPhotoChange : t.careersPhotoChoose}
                  </span>
                </label>
                {q.helpText ? <p className="apply-form__help">{q.helpText}</p> : null}
                {photoWarning ? <p className="apply-photo-warning">{photoWarning}</p> : null}
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
            ) : q.questionType === 'phone' || q.fieldBinding === 'phone' ? (
              <>
                <label className="apply-form__label" htmlFor={id}>
                  {labelText}
                </label>
                <KzPhoneField
                  id={id}
                  value={values[q.id]}
                  onChange={(tail) => onChange(q.id, tail)}
                  disabled={disabled}
                  required={q.required}
                  error={err}
                />
              </>
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
                        : 'text'
                  }
                  inputMode={q.questionType === 'number' ? 'numeric' : undefined}
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
