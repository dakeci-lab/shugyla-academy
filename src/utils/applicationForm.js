/**
 * Shared constants and helpers for flexible vacancy application forms.
 * Server RPC remains source of truth for validation.
 */

export const APPLICATION_QUESTION_TYPES = [
  'short_text',
  'long_text',
  'phone',
  'number',
  'date',
  'single_choice',
  'multi_choice',
  'yes_no',
  'photo',
]

export const APPLICATION_QUESTION_TYPE_LABELS = {
  short_text: 'Короткий текст',
  long_text: 'Длинный текст',
  phone: 'Телефон',
  number: 'Число',
  date: 'Дата',
  single_choice: 'Один вариант',
  multi_choice: 'Несколько вариантов',
  yes_no: 'Да / нет',
  photo: 'Фотография',
}

/** Whitelist of candidate column bindings (server-enforced). */
export const APPLICATION_FIELD_BINDINGS = [
  'first_name',
  'last_name',
  'phone',
  'age',
  'city',
  'experience',
  'previous_work',
  'expected_salary',
  'available_from',
  'about',
  'photo',
]

export const PROTECTED_FIELD_BINDINGS = new Set(['first_name', 'phone'])

export const FIELD_BINDING_ALLOWED_TYPES = {
  first_name: ['short_text'],
  last_name: ['short_text'],
  phone: ['phone', 'short_text'],
  age: ['number'],
  city: ['short_text'],
  experience: ['short_text', 'long_text'],
  previous_work: ['short_text', 'long_text'],
  expected_salary: ['short_text', 'number'],
  available_from: ['short_text', 'date'],
  about: ['long_text', 'short_text'],
  photo: ['photo'],
}

export const APPLICATION_FORM_LIMITS = {
  maxActiveQuestions: 40,
  maxLabelLength: 200,
  maxHelpTextLength: 500,
  maxPlaceholderLength: 200,
  maxOptions: 20,
  maxOptionLabelLength: 120,
  maxTextAnswerLength: 2000,
  maxLongTextAnswerLength: 5000,
  maxPayloadBytes: 100_000,
}

export const ANSWERS_SNAPSHOT_VERSION = 2

export function isProtectedBinding(binding) {
  return PROTECTED_FIELD_BINDINGS.has(binding)
}

export function normalizeQuestionOptions(rawOptions) {
  if (!Array.isArray(rawOptions)) return []
  return rawOptions
    .map((item, index) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const id = String(item.id || item.value || `opt-${index + 1}`)
        const label = String(item.label ?? item.text ?? item.name ?? '').trim()
        return label ? { id, label } : null
      }
      const label = String(item ?? '').trim()
      return label ? { id: `opt-${index + 1}`, label } : null
    })
    .filter(Boolean)
}

export function normalizeApplicationQuestion(raw) {
  const options = normalizeQuestionOptions(raw?.options ?? [])
  const fieldBinding = raw?.fieldBinding ?? raw?.field_binding ?? null
  return {
    id: raw?.id,
    vacancyId: raw?.vacancyId ?? raw?.vacancy_id ?? null,
    questionText: raw?.questionText ?? raw?.question_text ?? raw?.label ?? '',
    questionType: raw?.questionType ?? raw?.question_type ?? 'short_text',
    options,
    scores: [],
    required: raw?.required !== false && raw?.is_required !== false,
    sortOrder: Number(raw?.sortOrder ?? raw?.sort_order ?? 0) || 0,
    isActive: raw?.isActive ?? raw?.is_active !== false,
    fieldBinding: fieldBinding || null,
    helpText: raw?.helpText ?? raw?.help_text ?? '',
    placeholder: raw?.placeholder ?? '',
    createdAt: raw?.createdAt ?? raw?.created_at,
    updatedAt: raw?.updatedAt ?? raw?.updated_at,
  }
}

export function createEmptyQuestionDraft(partial = {}) {
  return {
    id: partial.id || `tmp-${crypto.randomUUID()}`,
    questionText: partial.questionText || '',
    questionType: partial.questionType || 'short_text',
    required: partial.required !== false,
    sortOrder: partial.sortOrder ?? 0,
    isActive: partial.isActive !== false,
    fieldBinding: partial.fieldBinding || null,
    helpText: partial.helpText || '',
    placeholder: partial.placeholder || '',
    options: normalizeQuestionOptions(partial.options || []),
    _isNew: !partial.id || String(partial.id).startsWith('tmp-'),
  }
}

export function validateApplicationQuestionDraft(question, { allQuestions = [] } = {}) {
  const label = String(question.questionText || '').trim()
  if (!label) return 'Укажите текст вопроса'
  if (label.length > APPLICATION_FORM_LIMITS.maxLabelLength) {
    return `Текст вопроса не длиннее ${APPLICATION_FORM_LIMITS.maxLabelLength} символов`
  }
  if (!APPLICATION_QUESTION_TYPES.includes(question.questionType)) {
    return 'Неизвестный тип вопроса'
  }
  if (String(question.helpText || '').length > APPLICATION_FORM_LIMITS.maxHelpTextLength) {
    return 'Слишком длинное пояснение'
  }
  if (String(question.placeholder || '').length > APPLICATION_FORM_LIMITS.maxPlaceholderLength) {
    return 'Слишком длинный placeholder'
  }

  const binding = question.fieldBinding || null
  if (binding) {
    if (!APPLICATION_FIELD_BINDINGS.includes(binding)) {
      return 'Недопустимая системная привязка'
    }
    const allowed = FIELD_BINDING_ALLOWED_TYPES[binding] || []
    if (!allowed.includes(question.questionType)) {
      return 'Тип не совместим с системным полем'
    }
    if (isProtectedBinding(binding)) {
      if (!question.required) return 'Системное поле должно быть обязательным'
      if (question.isActive === false) return 'Системное поле нельзя отключить'
    }
    const dup = allQuestions.find(
      (q) =>
        q.id !== question.id &&
        q.isActive !== false &&
        q.fieldBinding === binding
    )
    if (dup) return 'Такая системная привязка уже используется'
  }

  if (question.questionType === 'single_choice' || question.questionType === 'multi_choice') {
    const opts = normalizeQuestionOptions(question.options)
    if (opts.length < 2) return 'Добавьте минимум 2 варианта ответа'
    if (opts.length > APPLICATION_FORM_LIMITS.maxOptions) {
      return `Не больше ${APPLICATION_FORM_LIMITS.maxOptions} вариантов`
    }
    for (const opt of opts) {
      if (opt.label.length > APPLICATION_FORM_LIMITS.maxOptionLabelLength) {
        return 'Слишком длинный вариант ответа'
      }
    }
  }

  return null
}

export function validateApplicationFormDraft(questions) {
  const active = (questions || []).filter((q) => q.isActive !== false)
  if (active.length > APPLICATION_FORM_LIMITS.maxActiveQuestions) {
    return `Не больше ${APPLICATION_FORM_LIMITS.maxActiveQuestions} активных вопросов`
  }
  const hasName = active.some(
    (q) => q.fieldBinding === 'first_name' && q.required && String(q.questionText || '').trim()
  )
  const hasPhone = active.some(
    (q) => q.fieldBinding === 'phone' && q.required && String(q.questionText || '').trim()
  )
  if (!hasName) return 'Нужен обязательный вопрос с именем кандидата'
  if (!hasPhone) return 'Нужен обязательный вопрос с телефоном кандидата'

  for (const q of questions || []) {
    const err = validateApplicationQuestionDraft(q, { allQuestions: questions })
    if (err) return err
  }
  return null
}

export function questionsToSavePayload(questions) {
  return (questions || []).map((q, index) => ({
    id: q._isNew || String(q.id).startsWith('tmp-') ? null : q.id,
    question_text: String(q.questionText || '').trim(),
    question_type: q.questionType,
    required: q.required !== false,
    sort_order: index,
    is_active: q.isActive !== false,
    field_binding: q.fieldBinding || null,
    help_text: String(q.helpText || '').trim() || null,
    placeholder: String(q.placeholder || '').trim() || null,
    options:
      q.questionType === 'single_choice' || q.questionType === 'multi_choice'
        ? normalizeQuestionOptions(q.options).map((opt) => ({
            id: opt.id,
            label: opt.label,
          }))
        : [],
  }))
}

/**
 * Backward-compatible reader for candidate.answers.
 * Supports snapshot v2, legacy option-index map, and fixed columns.
 * Never throws on malformed JSON fragments.
 */
export function getCandidateAnswerDisplayRows(candidate, questions = []) {
  let answers = candidate?.answers
  if (typeof answers === 'string') {
    try {
      answers = JSON.parse(answers)
    } catch {
      return []
    }
  }
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return []

  const questionById = new Map((questions || []).map((q) => [q.id, q]))

  if (Number(answers.version) >= 2) {
    const items = Array.isArray(answers.items) ? answers.items : []
    return items
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null
        if (item.profile_bound) return null
        const label = String(item.label || '').trim()
        return {
          questionId: item.question_id || `snap-${index}`,
          questionText: label || 'Дополнительный ответ',
          displayValue: formatSnapshotDisplayValue(item),
          fromSnapshot: true,
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        const ai = items.find((i) => i?.question_id === a.questionId)?.sort_order
        const bi = items.find((i) => i?.question_id === b.questionId)?.sort_order
        return (Number(ai) || 0) - (Number(bi) || 0)
      })
  }

  // Legacy: { [questionId]: optionIndex } — skip reserved meta keys
  const keys = Object.keys(answers).filter(
    (k) => !['version', 'form_version', 'submitted_at', 'items'].includes(k)
  )
  if (keys.length === 0) return []

  return keys
    .map((qid) => {
      try {
        const q = questionById.get(qid)
        const raw = answers[qid]
        const idx = Number(raw)
        let displayValue = '—'
        if (q) {
          const opts = normalizeQuestionOptions(q.options)
          if (Number.isFinite(idx) && opts[idx]) displayValue = opts[idx].label
          else if (Array.isArray(q.options) && typeof q.options[idx] === 'string') {
            displayValue = q.options[idx]
          }
        } else if (raw != null && typeof raw !== 'object') {
          displayValue = 'Дополнительный ответ'
        }
        return {
          questionId: qid,
          questionText: q?.questionText || 'Дополнительный ответ',
          displayValue,
          fromSnapshot: false,
        }
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

function formatSnapshotDisplayValue(item) {
  try {
    if (!item) return '—'
    if (item.display_value != null && String(item.display_value).trim() !== '') {
      return String(item.display_value)
    }
    const value = item.value
    if (value == null || value === '') return '—'
    if (Array.isArray(value)) {
      const parts = value.map((v) => String(v ?? '').trim()).filter(Boolean)
      return parts.length ? parts.join(', ') : '—'
    }
    if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
    if (item.question_type === 'photo') return value ? 'Фото загружено' : '—'
    if (typeof value === 'object') return '—'
    return String(value)
  } catch {
    return '—'
  }
}

export function mapApplicationFormRpcError(error) {
  const message = error?.message || String(error || '')
  if (message.includes('form_outdated')) {
    return 'Анкета была обновлена. Обновите страницу и заполните её ещё раз.'
  }
  if (message.includes('vacancy_closed') || message.includes('vacancy_not_found')) {
    return 'Вакансия недоступна или закрыта'
  }
  if (message.includes('answer_required')) return 'Заполните обязательные поля'
  if (message.includes('phone_invalid_kz')) {
    return 'Введите номер в формате +7 7XX XXX XX XX (мобильный, Казахстан).'
  }
  if (message.includes('submission_key_conflict')) {
    return 'Не удалось отправить анкету. Обновите страницу и заполните её заново.'
  }
  if (message.includes('answer_invalid')) return 'Проверьте ответы в анкете'
  if (message.includes('unknown_question')) return 'Анкета устарела. Обновите страницу.'
  if (message.includes('invalid_option')) return 'Выбран недопустимый вариант ответа'
  if (message.includes('photo_required')) return 'Загрузите фотографию'
  if (message.includes('photo_token_expired')) {
    return 'Срок загрузки фото истёк. Загрузите фотографию повторно.'
  }
  if (message.includes('photo_token_used') || message.includes('photo_token_cancelled')) {
    return 'Фотографию необходимо загрузить повторно.'
  }
  if (message.includes('photo_invalid')) return 'Не удалось сохранить фото'
  if (message.includes('form_invalid')) {
    if (message.includes('position')) {
      return 'Сначала исправьте должность и анкету исходной вакансии'
    }
    return 'Анкета вакансии настроена некорректно'
  }
  if (message.includes('slug_conflict')) return 'Не удалось создать уникальную ссылку вакансии'
  if (message.includes('permission_denied') || message.includes('42501')) {
    return 'Недостаточно прав для изменения анкеты'
  }
  if (message.includes('version_conflict')) {
    return 'Анкета изменилась. Обновите страницу и сохраните снова.'
  }
  return null
}
