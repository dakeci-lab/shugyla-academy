import { useEffect, useMemo, useState } from 'react'
import {
  getCandidateQuestions,
  getVacancyById,
  saveVacancyApplicationForm,
} from '../../services/platformDataService'
import {
  APPLICATION_QUESTION_TYPES,
  APPLICATION_QUESTION_TYPE_LABELS,
  createEmptyQuestionDraft,
  isProtectedBinding,
  normalizeApplicationQuestion,
  normalizeQuestionOptions,
  questionsToSavePayload,
  validateApplicationFormDraft,
  validateApplicationQuestionDraft,
} from '../../utils/applicationForm'
import { useAdminRefresh } from '../../hooks/useAdminRefresh'
import AdminModal from './AdminModal'
import DynamicApplicationForm from '../apply/DynamicApplicationForm'
import './admin-shared.css'
import './VacancyQuestionEditor.css'

function toDraft(question) {
  const n = normalizeApplicationQuestion(question)
  return {
    ...createEmptyQuestionDraft(n),
    id: n.id,
    _isNew: false,
  }
}

/** Редактор гибкой анкеты вакансии (без scoring). */
export default function VacancyQuestionEditor({ vacancyId }) {
  const { version, refresh } = useAdminRefresh()
  const vacancy = getVacancyById(vacancyId)

  const [drafts, setDrafts] = useState([])
  const [formVersion, setFormVersion] = useState(1)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editDraft, setEditDraft] = useState(null)
  const [editError, setEditError] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  void version

  useEffect(() => {
    if (!vacancyId) return
    const rows = getCandidateQuestions(vacancyId)
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map(toDraft)
    setDrafts(rows)
    setFormVersion(vacancy?.applicationFormVersion || 1)
    setDirty(false)
    setError('')
  }, [vacancyId, version, vacancy?.applicationFormVersion, vacancy?.updatedAt])

  const activeDrafts = useMemo(
    () => drafts.filter((q) => q.isActive !== false),
    [drafts]
  )

  function openCreate() {
    setEditDraft(
      createEmptyQuestionDraft({
        questionType: 'short_text',
        required: false,
        options: [
          { id: 'opt-1', label: '' },
          { id: 'opt-2', label: '' },
        ],
      })
    )
    setEditError('')
  }

  function openEdit(question) {
    const opts = normalizeQuestionOptions(question.options)
    setEditDraft({
      ...question,
      options:
        opts.length >= 2
          ? opts
          : [
              ...opts,
              ...Array.from({ length: Math.max(0, 2 - opts.length) }, (_, i) => ({
                id: `opt-new-${i}`,
                label: '',
              })),
            ],
    })
    setEditError('')
  }

  function saveEdit(e) {
    e.preventDefault()
    const nextList = drafts.some((q) => q.id === editDraft.id)
      ? drafts.map((q) => (q.id === editDraft.id ? editDraft : q))
      : [...drafts, editDraft]
    const err = validateApplicationQuestionDraft(editDraft, { allQuestions: nextList })
    if (err) {
      setEditError(err)
      return
    }
    setDrafts(nextList)
    setDirty(true)
    setEditDraft(null)
  }

  function deactivateQuestion(question) {
    if (isProtectedBinding(question.fieldBinding)) return
    if (!window.confirm('Отключить вопрос для будущих анкет?')) return
    setDrafts((prev) =>
      prev.map((q) => (q.id === question.id ? { ...q, isActive: false } : q))
    )
    setDirty(true)
  }

  function restoreQuestion(question) {
    setDrafts((prev) =>
      prev.map((q) => (q.id === question.id ? { ...q, isActive: true } : q))
    )
    setDirty(true)
  }

  function removeQuestion(question) {
    if (isProtectedBinding(question.fieldBinding)) return
    if (!window.confirm('Удалить вопрос из анкеты?')) return
    setDrafts((prev) => prev.filter((q) => q.id !== question.id))
    setDirty(true)
  }

  function moveQuestion(questionId, direction) {
    const ids = drafts.map((q) => q.id)
    const index = ids.indexOf(questionId)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    const next = drafts.slice()
    ;[next[index], next[target]] = [next[target], next[index]]
    setDrafts(next)
    setDirty(true)
  }

  async function handleSaveAll() {
    setError('')
    const validationError = validateApplicationFormDraft(drafts)
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    try {
      const result = await saveVacancyApplicationForm(vacancyId, {
        questions: questionsToSavePayload(drafts),
        expectedVersion: formVersion,
      })
      if (result?.formVersion) setFormVersion(result.formVersion)
      setDirty(false)
      await refresh()
    } catch (err) {
      setError(err.message || 'Не удалось сохранить анкету')
    } finally {
      setSaving(false)
    }
  }

  function updateEditOption(index, label) {
    const options = (editDraft.options || []).map((opt, i) =>
      i === index ? { ...opt, label } : opt
    )
    setEditDraft({ ...editDraft, options })
  }

  const inactiveDrafts = drafts.filter((q) => q.isActive === false)

  return (
    <div className="vacancy-application-editor">
      <div className="vacancy-application-editor__header">
        <div>
          <h3 className="vacancy-application-editor__title">Анкета кандидата</h3>
          <p className="admin-form__hint">
            Изменения анкеты применяются только к новым откликам. Ответы ранее отправленных
            кандидатов сохраняются.
          </p>
        </div>
        <div className="vacancy-application-editor__actions">
          <button type="button" className="btn btn--outline btn--sm" onClick={() => setShowPreview(true)}>
            Предварительный просмотр
          </button>
          <button type="button" className="btn btn--outline btn--sm" onClick={openCreate}>
            Добавить вопрос
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={handleSaveAll}
            disabled={!dirty || saving}
          >
            {saving ? 'Сохранение…' : 'Сохранить анкету'}
          </button>
        </div>
      </div>

      {error ? <p className="admin-form__error">{error}</p> : null}

      <ul className="vacancy-application-editor__list">
        {drafts.filter((q) => q.isActive !== false).map((q, index) => (
          <li key={q.id} className="vacancy-application-editor__item">
            <div className="vacancy-application-editor__item-main">
              <p className="vacancy-application-editor__item-title">
                <span className="vacancy-application-editor__num">{index + 1}.</span>
                {q.questionText || 'Без названия'}
                {q.required ? ' *' : ''}
              </p>
              <p className="vacancy-application-editor__meta">
                {APPLICATION_QUESTION_TYPE_LABELS[q.questionType] || q.questionType}
                {isProtectedBinding(q.fieldBinding) ? ' · Системное поле' : ''}
              </p>
            </div>
            <div className="vacancy-application-editor__item-actions">
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => moveQuestion(q.id, -1)}
                aria-label="Переместить выше"
                disabled={index === 0}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => moveQuestion(q.id, 1)}
                aria-label="Переместить ниже"
                disabled={index === activeDrafts.length - 1}
              >
                ↓
              </button>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => openEdit(q)}>
                Изменить
              </button>
              {!isProtectedBinding(q.fieldBinding) ? (
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={() => deactivateQuestion(q)}
                >
                  Отключить
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {inactiveDrafts.length > 0 ? (
        <details className="vacancy-application-editor__inactive">
          <summary>Отключённые вопросы ({inactiveDrafts.length})</summary>
          <ul className="vacancy-application-editor__list">
            {inactiveDrafts.map((q) => (
              <li key={q.id} className="vacancy-application-editor__item vacancy-application-editor__item--inactive">
                <div className="vacancy-application-editor__item-main">
                  <p className="vacancy-application-editor__item-title">{q.questionText}</p>
                </div>
                <div className="vacancy-application-editor__item-actions">
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => restoreQuestion(q)}>
                    Восстановить
                  </button>
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => removeQuestion(q)}>
                    Удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {editDraft ? (
        <AdminModal
          title={String(editDraft.id).startsWith('tmp-') ? 'Новый вопрос' : 'Редактировать вопрос'}
          onClose={() => setEditDraft(null)}
          footer={
            <>
              <button type="button" className="btn btn--outline" onClick={() => setEditDraft(null)}>
                Отмена
              </button>
              <button type="submit" className="btn btn--primary" form="question-edit-form">
                Готово
              </button>
            </>
          }
        >
          <form id="question-edit-form" className="admin-form" onSubmit={saveEdit}>
            {isProtectedBinding(editDraft.fieldBinding) ? (
              <p className="admin-form__hint">Системное поле — нельзя удалить или сделать необязательным.</p>
            ) : null}

            <label className="admin-form__label">
              Текст вопроса *
              <input
                className="admin-form__input"
                value={editDraft.questionText}
                onChange={(e) => setEditDraft({ ...editDraft, questionText: e.target.value })}
                required
              />
            </label>

            <label className="admin-form__label">
              Тип ответа
              <select
                className="admin-form__select"
                value={editDraft.questionType}
                disabled={isProtectedBinding(editDraft.fieldBinding)}
                onChange={(e) => setEditDraft({ ...editDraft, questionType: e.target.value })}
              >
                {APPLICATION_QUESTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {APPLICATION_QUESTION_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-form__check">
              <input
                type="checkbox"
                checked={editDraft.required !== false}
                disabled={isProtectedBinding(editDraft.fieldBinding)}
                onChange={(e) => setEditDraft({ ...editDraft, required: e.target.checked })}
              />
              Обязательный вопрос
            </label>

            <label className="admin-form__label">
              Placeholder
              <input
                className="admin-form__input"
                value={editDraft.placeholder || ''}
                onChange={(e) => setEditDraft({ ...editDraft, placeholder: e.target.value })}
              />
            </label>

            <label className="admin-form__label">
              Пояснение
              <textarea
                className="admin-form__input"
                rows={2}
                value={editDraft.helpText || ''}
                onChange={(e) => setEditDraft({ ...editDraft, helpText: e.target.value })}
              />
            </label>

            {(editDraft.questionType === 'single_choice' ||
              editDraft.questionType === 'multi_choice') && (
              <div className="vacancy-application-editor__options">
                <p className="admin-form__label">Варианты ответа</p>
                {(editDraft.options || []).map((opt, index) => (
                  <div key={opt.id || index} className="vacancy-application-editor__option-row">
                    <input
                      className="admin-form__input"
                      value={opt.label}
                      placeholder={`Вариант ${index + 1}`}
                      onChange={(e) => updateEditOption(index, e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      disabled={(editDraft.options || []).length <= 2}
                      onClick={() =>
                        setEditDraft({
                          ...editDraft,
                          options: editDraft.options.filter((_, i) => i !== index),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={() =>
                    setEditDraft({
                      ...editDraft,
                      options: [
                        ...(editDraft.options || []),
                        { id: `opt-${crypto.randomUUID()}`, label: '' },
                      ],
                    })
                  }
                >
                  Добавить вариант
                </button>
              </div>
            )}

            {editError ? <p className="admin-form__error">{editError}</p> : null}
          </form>
        </AdminModal>
      ) : null}

      {showPreview ? (
        <AdminModal
          title="Предварительный просмотр анкеты"
          onClose={() => setShowPreview(false)}
          footer={
            <button type="button" className="btn btn--outline" onClick={() => setShowPreview(false)}>
              Закрыть
            </button>
          }
        >
          <form
            className="admin-form"
            onSubmit={(e) => {
              e.preventDefault()
            }}
          >
            <DynamicApplicationForm
              questions={activeDrafts.map((q) => ({
                ...q,
                options: normalizeQuestionOptions(q.options),
              }))}
              values={Object.fromEntries(
                activeDrafts.map((q) => [
                  q.id,
                  q.questionType === 'multi_choice' ? [] : q.questionType === 'yes_no' ? null : '',
                ])
              )}
              onChange={() => {}}
              preview
              disabled
            />
          </form>
        </AdminModal>
      ) : null}
    </div>
  )
}
