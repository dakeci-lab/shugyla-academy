import { useState } from 'react'
import {
  getLessonsForCourse,
  addLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
  EMPTY_LESSON,
} from '../../utils/lessonData'
import { useAdminRefresh } from '../../hooks/useAdminRefresh'
import AdminModal from './AdminModal'
import './admin-shared.css'
import './CourseLessonManager.css'

const EMPTY_LESSON_FORM = { ...EMPTY_LESSON }

/** Управление уроками курса в админке */
export default function CourseLessonManager({ courseId, onChange }) {
  const { refresh } = useAdminRefresh()
  const [lessons, setLessons] = useState(() => getLessonsForCourse(courseId))
  const [editLesson, setEditLesson] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_LESSON_FORM)

  function reload() {
    setLessons(getLessonsForCourse(courseId))
    refresh()
    onChange?.()
  }

  function openAdd() {
    setEditLesson(null)
    setForm({ ...EMPTY_LESSON_FORM, order: lessons.length + 1 })
    setShowForm(true)
  }

  function openEdit(lesson) {
    setEditLesson(lesson)
    setForm({
      title: lesson.title,
      description: lesson.description,
      videoUrl: lesson.videoUrl,
      durationMinutes: lesson.durationMinutes,
      summary: lesson.summary,
      mandatory: lesson.mandatory,
    })
    setShowForm(true)
  }

  function handleSave(e) {
    e.preventDefault()
    if (editLesson) {
      updateLesson(editLesson.id, form)
    } else {
      addLesson(courseId, form)
    }
    setShowForm(false)
    reload()
  }

  function handleDelete(lesson) {
    if (!window.confirm(`Удалить урок «${lesson.title}»?`)) return
    deleteLesson(lesson.id)
    reload()
  }

  function moveLesson(index, direction) {
    const target = index + direction
    if (target < 0 || target >= lessons.length) return
    const ids = lessons.map((l) => l.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorderLessons(courseId, ids)
    reload()
  }

  return (
    <div className="lesson-manager">
      <div className="lesson-manager__header">
        <h3 className="lesson-manager__title">Уроки курса ({lessons.length})</h3>
        <button type="button" className="btn btn--primary btn--sm" onClick={openAdd}>
          + Добавить урок
        </button>
      </div>

      {lessons.length === 0 ? (
        <p className="lesson-manager__empty">Добавьте первый видеоурок для этого курса.</p>
      ) : (
        <ul className="lesson-manager__list">
          {lessons.map((lesson, index) => (
            <li key={lesson.id} className="lesson-manager__item">
              <div className="lesson-manager__order">
                <button
                  type="button"
                  className="lesson-manager__move"
                  onClick={() => moveLesson(index, -1)}
                  disabled={index === 0}
                  aria-label="Выше"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="lesson-manager__move"
                  onClick={() => moveLesson(index, 1)}
                  disabled={index === lessons.length - 1}
                  aria-label="Ниже"
                >
                  ↓
                </button>
              </div>
              <div className="lesson-manager__info">
                <strong>{index + 1}. {lesson.title}</strong>
                <span>
                  {lesson.durationMinutes} мин
                  {lesson.mandatory ? ' · Обязательный' : ' · Необязательный'}
                  {lesson.videoUrl ? ' · Есть видео' : ''}
                </span>
              </div>
              <div className="lesson-manager__actions">
                <button type="button" className="btn btn--outline btn--sm" onClick={() => openEdit(lesson)}>
                  Изменить
                </button>
                <button type="button" className="btn btn--outline btn--sm" onClick={() => handleDelete(lesson)}>
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <AdminModal
          title={editLesson ? 'Редактировать урок' : 'Добавить урок'}
          onClose={() => setShowForm(false)}
          wide
          footer={
            <>
              <button type="button" className="btn btn--outline" onClick={() => setShowForm(false)}>
                Отмена
              </button>
              <button type="submit" className="btn btn--primary" form="lesson-form">
                Сохранить урок
              </button>
            </>
          }
        >
          <form id="lesson-form" className="admin-form" onSubmit={handleSave}>
            <label className="admin-form__label">
              Название урока
              <input
                className="admin-form__input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </label>
            <label className="admin-form__label">
              Описание
              <textarea
                className="admin-form__textarea"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </label>
            <label className="admin-form__label">
              Ссылка на видео (YouTube или другая)
              <input
                className="admin-form__input"
                type="url"
                value={form.videoUrl}
                onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </label>
            <div className="admin-form__row">
              <label className="admin-form__label">
                Длительность (мин)
                <input
                  className="admin-form__input"
                  type="number"
                  min="1"
                  value={form.durationMinutes}
                  onChange={(e) =>
                    setForm({ ...form, durationMinutes: Number(e.target.value) })
                  }
                  required
                />
              </label>
              <label className="admin-form__label">
                Обязательный урок
                <select
                  className="admin-form__select"
                  value={form.mandatory ? 'yes' : 'no'}
                  onChange={(e) =>
                    setForm({ ...form, mandatory: e.target.value === 'yes' })
                  }
                >
                  <option value="yes">Да</option>
                  <option value="no">Нет</option>
                </select>
              </label>
            </div>
            <label className="admin-form__label">
              Текстовый конспект
              <textarea
                className="admin-form__textarea"
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                rows={5}
                placeholder="Ключевые тезисы урока..."
              />
            </label>
          </form>
        </AdminModal>
      )}
    </div>
  )
}
