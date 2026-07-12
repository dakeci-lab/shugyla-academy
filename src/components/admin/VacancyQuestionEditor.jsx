import { useState } from 'react'
import {
  getCandidateQuestions,
  createCandidateQuestion,
  updateCandidateQuestion,
  deleteCandidateQuestion,
  reorderCandidateQuestions,
} from '../../services/academyDataService'
import {
  validateQuestionForm,
  questionFormToPayload,
  questionToForm,
  isVacancyQuestionsLocked,
  VACANCY_QUESTIONS_LOCKED_MESSAGE,
} from '../../utils/recruitmentData'
import { useAdminRefresh } from '../../hooks/useAdminRefresh'
import AdminModal from './AdminModal'
import './admin-shared.css'

const EMPTY_FORM = {
  questionText: '',
  required: true,
  optionPairs: [
    { text: '', score: 10 },
    { text: '', score: 0 },
    { text: '', score: 0 },
    { text: '', score: 0 },
  ],
}

/** Редактор фильтр-вопросов вакансии */
export default function VacancyQuestionEditor({ vacancyId, vacancy }) {
  const { version, refresh } = useAdminRefresh()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')

  void version

  const questions = getCandidateQuestions(vacancyId)
  const questionsLocked = isVacancyQuestionsLocked(vacancy)

  function openCreate() {
    if (questionsLocked) return
    setEditId(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowForm(true)
  }

  function openEdit(question) {
    if (questionsLocked) return
    setEditId(question.id)
    setForm(questionToForm(question))
    setError('')
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    const validationError = validateQuestionForm(form)
    if (validationError) {
      setError(validationError)
      return
    }

    const payload = questionFormToPayload(form)
    try {
      if (editId) {
        await updateCandidateQuestion(editId, payload)
      } else {
        await createCandidateQuestion(vacancyId, payload)
      }
      setShowForm(false)
      await refresh()
    } catch (err) {
      setError(err.message || 'Не удалось сохранить вопрос')
    }
  }

  async function handleDelete(questionId) {
    if (questionsLocked) return
    if (!window.confirm('Удалить вопрос?')) return
    try {
      await deleteCandidateQuestion(questionId)
      await refresh()
    } catch (err) {
      setError(err.message || 'Не удалось удалить вопрос')
    }
  }

  async function moveQuestion(questionId, direction) {
    if (questionsLocked) return
    const ids = questions.map((q) => q.id)
    const index = ids.indexOf(questionId)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    try {
      await reorderCandidateQuestions(vacancyId, ids)
      await refresh()
    } catch (err) {
      setError(err.message || 'Не удалось изменить порядок')
    }
  }

  function updatePair(index, field, value) {
    const optionPairs = form.optionPairs.map((pair, i) =>
      i === index ? { ...pair, [field]: value } : pair
    )
    setForm({ ...form, optionPairs })
  }

  return (
    <div className="learning-path-courses vacancy-questions-editor">
      <div className="admin-toolbar">
        <h3 className="admin-detail-heading">Фильтр-вопросы для кандидата</h3>
        {!questionsLocked && (
          <button type="button" className="btn btn--primary btn--sm" onClick={openCreate}>
            + Добавить вопрос
          </button>
        )}
      </div>

      {questionsLocked && (
        <div className="vacancy-questions-locked-notice" role="status">
          <p className="vacancy-questions-locked-notice__title">Вопросы этой вакансии зафиксированы</p>
          <p className="vacancy-questions-locked-notice__text">{VACANCY_QUESTIONS_LOCKED_MESSAGE}</p>
        </div>
      )}

      {questions.length === 0 ? (
        <p className="admin-form__hint">
          {questionsLocked
            ? 'Для этой вакансии вопросы не были настроены. Создайте новую вакансию, если нужен другой набор вопросов.'
            : 'Вопросы не добавлены. Добавьте первый фильтр-вопрос.'}
        </p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--compact">
            <thead>
              <tr>
                <th>#</th>
                <th>Вопрос</th>
                <th>Обязательный</th>
                {!questionsLocked && <th></th>}
              </tr>
            </thead>
            <tbody>
              {questions.map((q, index) => (
                <tr key={q.id}>
                  <td>{index + 1}</td>
                  <td>{q.questionText}</td>
                  <td>{q.required ? 'Да' : 'Нет'}</td>
                  {!questionsLocked && (
                    <td>
                      <div className="admin-table__actions">
                        <button type="button" className="btn btn--outline btn--sm" onClick={() => openEdit(q)}>
                          Редактировать
                        </button>
                        <button
                          type="button"
                          className="btn btn--outline btn--sm"
                          disabled={index === 0}
                          onClick={() => moveQuestion(q.id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn--outline btn--sm"
                          disabled={index === questions.length - 1}
                          onClick={() => moveQuestion(q.id, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="btn btn--outline btn--sm admin-table__danger"
                          onClick={() => handleDelete(q.id)}
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && !showForm && <p className="admin-form__error">{error}</p>}

      {showForm && !questionsLocked && (
        <AdminModal
          title={editId ? 'Редактировать вопрос' : 'Добавить вопрос'}
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button type="button" className="btn btn--outline" onClick={() => setShowForm(false)}>
                Отмена
              </button>
              <button type="submit" className="btn btn--primary" form="vacancy-question-form">
                Сохранить
              </button>
            </>
          }
        >
          <form id="vacancy-question-form" className="admin-form" onSubmit={handleSave}>
            <label className="admin-form__label">
              Текст вопроса *
              <textarea
                className="admin-form__input"
                rows={2}
                value={form.questionText}
                onChange={(e) => setForm({ ...form, questionText: e.target.value })}
                required
              />
            </label>

            {form.optionPairs.map((pair, index) => (
              <div key={index} className="admin-form__row">
                <label className="admin-form__label">
                  Вариант {index + 1}
                  <input
                    className="admin-form__input"
                    value={pair.text}
                    onChange={(e) => updatePair(index, 'text', e.target.value)}
                  />
                </label>
                <label className="admin-form__label">
                  Балл
                  <input
                    className="admin-form__input"
                    type="number"
                    value={pair.score}
                    onChange={(e) => updatePair(index, 'score', e.target.value)}
                  />
                </label>
              </div>
            ))}

            <label className="admin-form__label">
              <input
                type="checkbox"
                checked={form.required}
                onChange={(e) => setForm({ ...form, required: e.target.checked })}
              />{' '}
              Обязательный вопрос
            </label>

            {error && <p className="admin-form__error">{error}</p>}
          </form>
        </AdminModal>
      )}
    </div>
  )
}
