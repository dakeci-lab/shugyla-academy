import { useState } from 'react'
import {
  getTests,
  createTest,
  updateTest,
  deleteTest,
  publishTest,
  unpublishTest,
} from '../../../services/academyDataService'
import {
  TEST_TYPE,
  TEST_TYPE_LABELS,
  TEST_STATUS_LABELS,
} from '../../../utils/testData'
import { getAllCourses } from '../../../utils/adminData'
import { ROLE_IDS, ROLES, ALL_EMPLOYEE_ROLES } from '../../../data/roles'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../AdminModal'
import TestQuestionEditor from '../TestQuestionEditor'
import StatusBadge from '../StatusBadge'
import '../admin-shared.css'

const ROLE_OPTIONS = [ROLE_IDS.ADMIN, ...ALL_EMPLOYEE_ROLES]

const EMPTY_FORM = {
  title: '',
  description: '',
  type: TEST_TYPE.COURSE,
  courseId: '',
  role: ROLE_IDS.CASHIER,
  passingScore: 80,
  maxAttempts: '',
  timeLimitMinutes: '',
  status: 'draft',
}

export default function TestsSection() {
  const { version, refresh } = useAdminRefresh()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')

  void version

  const tests = getTests()
  const courses = getAllCourses()

  function courseTitle(courseId) {
    return courses.find((c) => c.id === Number(courseId))?.title || '—'
  }

  function roleLabel(role) {
    return ROLES[role]?.label || role || '—'
  }

  function openCreate() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowForm(true)
  }

  function openEdit(test) {
    setEditId(test.id)
    setForm({
      title: test.title,
      description: test.description || '',
      type: test.type,
      courseId: test.courseId ? String(test.courseId) : '',
      role: test.role || ROLE_IDS.CASHIER,
      passingScore: test.passingScore,
      maxAttempts: test.maxAttempts ?? '',
      timeLimitMinutes: test.timeLimitMinutes ?? '',
      status: test.status,
    })
    setError('')
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      type: TEST_TYPE.COURSE,
      courseId: Number(form.courseId),
      role: null,
      passingScore: Number(form.passingScore) || 80,
      maxAttempts: form.maxAttempts === '' ? null : Number(form.maxAttempts),
      timeLimitMinutes: form.timeLimitMinutes === '' ? null : Number(form.timeLimitMinutes),
      status: form.status,
    }

    if (!payload.title) {
      setError('Укажите название теста')
      return
    }
    if (!payload.courseId) {
      setError('Выберите курс')
      return
    }

    try {
      if (editId) {
        await updateTest(editId, payload)
      } else {
        const id = await createTest(payload)
        setEditId(id)
      }
      await refresh()
      if (editId) setShowForm(false)
    } catch (err) {
      setError(err.message || 'Не удалось сохранить тест')
    }
  }

  async function handleDelete(test) {
    if (!window.confirm(`Удалить тест «${test.title}»?`)) return
    await deleteTest(test.id)
    await refresh()
  }

  async function togglePublish(test) {
    if (test.status === 'published') {
      await unpublishTest(test.id)
    } else {
      await publishTest(test.id)
    }
    await refresh()
  }

  return (
    <>
      <div className="admin-toolbar">
        <span className="admin-toolbar__info">{tests.length} тестов</span>
        <button type="button" className="btn btn--primary btn--sm" onClick={openCreate}>
          + Создать тест
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Тип</th>
              <th>Курс / роль</th>
              <th>Статус</th>
              <th>Проходной %</th>
              <th>Вопросов</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tests.length === 0 ? (
              <tr>
                <td colSpan={7} className="admin-empty">Тесты пока не созданы</td>
              </tr>
            ) : (
              tests.map((test) => (
                <tr key={test.id}>
                  <td><strong>{test.title}</strong></td>
                  <td>{TEST_TYPE_LABELS[test.type]}</td>
                  <td>
                    {test.type === TEST_TYPE.COURSE
                      ? courseTitle(test.courseId)
                      : roleLabel(test.role)}
                  </td>
                  <td>
                    <StatusBadge
                      label={TEST_STATUS_LABELS[test.status]}
                      type={test.status === 'published' ? 'published' : 'draft'}
                    />
                  </td>
                  <td>{test.passingScore}%</td>
                  <td>{test.questionCount}</td>
                  <td>
                    <div className="admin-table__actions">
                      <button type="button" className="btn btn--outline btn--sm" onClick={() => openEdit(test)}>Редактировать</button>
                      <button type="button" className="btn btn--outline btn--sm" onClick={() => togglePublish(test)}>
                        {test.status === 'published' ? 'Снять' : 'Опубликовать'}
                      </button>
                      <button type="button" className="btn btn--outline btn--sm admin-table__danger" onClick={() => handleDelete(test)}>Удалить</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <AdminModal
          title={editId ? 'Редактировать тест' : 'Создать тест'}
          onClose={() => setShowForm(false)}
          xwide
          footer={
            <>
              <button type="button" className="btn btn--outline" onClick={() => setShowForm(false)}>
                {editId ? 'Готово' : 'Отмена'}
              </button>
              <button type="submit" className="btn btn--primary" form="test-form">
                {editId ? 'Сохранить' : 'Создать тест'}
              </button>
            </>
          }
        >
          <form id="test-form" className="admin-form" onSubmit={handleSave}>
            <label className="admin-form__label">
              Название теста
              <input className="admin-form__input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label className="admin-form__label">
              Описание
              <textarea className="admin-form__textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </label>
            <label className="admin-form__label">
              Статус
              <select className="admin-form__select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="draft">Черновик</option>
                <option value="published">Опубликован</option>
              </select>
            </label>

            <label className="admin-form__label">
              Курс
              <select className="admin-form__select" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} required>
                <option value="">Выберите курс</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </label>

            <div className="admin-form__row">
              <label className="admin-form__label">
                Проходной балл %
                <input className="admin-form__input" type="number" min="1" max="100" value={form.passingScore} onChange={(e) => setForm({ ...form, passingScore: e.target.value })} />
              </label>
              <label className="admin-form__label">
                Макс. попыток (пусто = без ограничений)
                <input className="admin-form__input" type="number" min="1" value={form.maxAttempts} onChange={(e) => setForm({ ...form, maxAttempts: e.target.value })} />
              </label>
              <label className="admin-form__label">
                Лимит времени, мин (пусто = без лимита)
                <input className="admin-form__input" type="number" min="1" value={form.timeLimitMinutes} onChange={(e) => setForm({ ...form, timeLimitMinutes: e.target.value })} />
              </label>
            </div>

            {error && <p className="admin-form__error">{error}</p>}
          </form>

          {editId && (
            <TestQuestionEditor testId={editId} key={`questions-${editId}-${version}`} />
          )}
        </AdminModal>
      )}
    </>
  )
}
