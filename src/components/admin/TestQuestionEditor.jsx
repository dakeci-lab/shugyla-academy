import { useState } from 'react'
import {
  getTestQuestions,
  createTestQuestion,
  updateTestQuestion,
  deleteTestQuestion,
  reorderTestQuestions,
} from '../../services/academyDataService'
import { useAdminRefresh } from '../../hooks/useAdminRefresh'
import AdminModal from './AdminModal'
import './admin-shared.css'

const EMPTY_QUESTION = {
  questionText: '',
  options: ['', '', '', ''],
  correctOptionIndex: 0,
  explanation: '',
  points: 1,
}

function sanitizeOptions(options) {
  return options.map((o) => o.trim()).filter(Boolean)
}

function validateQuestion(form) {
  if (!form.questionText.trim()) return 'Укажите текст вопроса'
  const options = sanitizeOptions(form.options)
  if (options.length < 2) return 'Добавьте минимум 2 варианта ответа'
  if (form.correctOptionIndex < 0 || form.correctOptionIndex >= options.length) {
    return 'Выберите правильный ответ'
  }
  return null
}

/** Редактор вопросов теста */
export default function TestQuestionEditor({ testId }) {
  const { refresh } = useAdminRefresh()
  const [questions, setQuestions] = useState(() => getTestQuestions(testId))
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_QUESTION)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  function reload() {
    setQuestions(getTestQuestions(testId))
    refresh()
  }

  function openAdd() {
    setEditId(null)
    setForm(EMPTY_QUESTION)
    setError('')
    setShowForm(true)
  }

  function openEdit(q) {
    const opts = [...q.options]
    while (opts.length < 4) opts.push('')
    setEditId(q.id)
    setForm({
      questionText: q.questionText,
      options: opts,
      correctOptionIndex: q.correctOptionIndex,
      explanation: q.explanation || '',
      points: q.points ?? 1,
    })
    setError('')
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    const options = sanitizeOptions(form.options)
    let correctOptionIndex = 0
    const selectedText = form.options[form.correctOptionIndex]?.trim()
    if (selectedText) {
      const idx = options.indexOf(selectedText)
      correctOptionIndex = idx >= 0 ? idx : 0
    }

    const payload = {
      questionText: form.questionText.trim(),
      options,
      correctOptionIndex,
      explanation: form.explanation.trim(),
      points: Number(form.points) || 1,
    }

    const validationError = validateQuestion({ ...form, options })
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      if (editId) {
        await updateTestQuestion(editId, payload)
      } else {
        await createTestQuestion(testId, payload)
      }
      setShowForm(false)
      reload()
    } catch (err) {
      setError(err.message || 'Не удалось сохранить вопрос')
    }
  }

  async function handleDelete(q) {
    if (!window.confirm(`Удалить вопрос «${q.questionText.slice(0, 40)}…»?`)) return
    await deleteTestQuestion(q.id)
    reload()
  }

  async function moveQuestion(index, direction) {
    const target = index + direction
    if (target < 0 || target >= questions.length) return
    const ids = questions.map((q) => q.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    await reorderTestQuestions(testId, ids)
    reload()
  }

  function updateOption(index, value) {
    const options = [...form.options]
    options[index] = value
    setForm({ ...form, options })
  }

  return (
    <div className="test-question-editor">
      <div className="lesson-manager__header">
        <h3 className="lesson-manager__title">Вопросы ({questions.length})</h3>
        <button type="button" className="btn btn--primary btn--sm" onClick={openAdd}>
          + Добавить вопрос
        </button>
      </div>

      {questions.length === 0 ? (
        <p className="lesson-manager__empty">Добавьте первый вопрос для теста.</p>
      ) : (
        <ul className="lesson-manager__list">
          {questions.map((q, index) => (
            <li key={q.id} className="lesson-manager__item">
              <div className="lesson-manager__order">
                <button type="button" className="lesson-manager__move" onClick={() => moveQuestion(index, -1)} disabled={index === 0}>↑</button>
                <button type="button" className="lesson-manager__move" onClick={() => moveQuestion(index, 1)} disabled={index === questions.length - 1}>↓</button>
              </div>
              <div className="lesson-manager__info">
                <strong>{index + 1}. {q.questionText}</strong>
                <span>{q.options.length} вариантов · правильный: {q.correctOptionIndex + 1}</span>
              </div>
              <div className="lesson-manager__actions">
                <button type="button" className="btn btn--outline btn--sm" onClick={() => openEdit(q)}>Изменить</button>
                <button type="button" className="btn btn--outline btn--sm" onClick={() => handleDelete(q)}>Удалить</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <AdminModal
          title={editId ? 'Редактировать вопрос' : 'Добавить вопрос'}
          onClose={() => setShowForm(false)}
          wide
          footer={
            <>
              <button type="button" className="btn btn--outline" onClick={() => setShowForm(false)}>Отмена</button>
              <button type="submit" className="btn btn--primary" form="question-form">Сохранить</button>
            </>
          }
        >
          <form id="question-form" className="admin-form" onSubmit={handleSave}>
            <label className="admin-form__label">
              Текст вопроса
              <textarea className="admin-form__textarea" value={form.questionText} onChange={(e) => setForm({ ...form, questionText: e.target.value })} rows={3} required />
            </label>

            {[0, 1, 2, 3].map((index) => (
              <label key={index} className="admin-form__label admin-form__label--inline">
                <span>Вариант {index + 1}</span>
                <input className="admin-form__input" value={form.options[index] || ''} onChange={(e) => updateOption(index, e.target.value)} />
                <label className="admin-form__radio">
                  <input
                    type="radio"
                    name="correct"
                    checked={form.correctOptionIndex === index}
                    onChange={() => setForm({ ...form, correctOptionIndex: index })}
                    disabled={!form.options[index]?.trim()}
                  />
                  Правильный
                </label>
              </label>
            ))}

            <label className="admin-form__label">
              Объяснение правильного ответа
              <textarea className="admin-form__textarea" value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} rows={2} />
            </label>

            <label className="admin-form__label">
              Баллы
              <input className="admin-form__input" type="number" min="1" value={form.points} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} />
            </label>

            {error && <p className="admin-form__error">{error}</p>}
          </form>
        </AdminModal>
      )}
    </div>
  )
}
