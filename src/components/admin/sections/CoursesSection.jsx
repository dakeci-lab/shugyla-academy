import { useState } from 'react'
import { getAllCourses, addCourse, updateCourse } from '../../../utils/adminData'
import { getRole, ROLES, CATEGORIES, ALL_EMPLOYEE_ROLES, ROLE_IDS } from '../../../data/roles'
import { getCategoryLabel } from '../../../utils/i18n'
import { getLessonsForCourse } from '../../../utils/lessonData'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../AdminModal'
import CourseLessonManager from '../CourseLessonManager'
import StatusBadge from '../StatusBadge'
import '../admin-shared.css'

const ROLE_OPTIONS = [ROLE_IDS.ADMIN, ...ALL_EMPLOYEE_ROLES]

const EMPTY_FORM = {
  title: '',
  description: '',
  category: ROLE_IDS.CASHIER,
  allowedRoles: [ROLE_IDS.CASHIER],
  duration: '2 часа',
  status: 'draft',
}

const STATUS_LABELS = {
  published: 'Опубликован',
  draft: 'Черновик',
}

/** Раздел «Курсы» — курсы с видеоуроками */
export default function CoursesSection() {
  const { version, refresh } = useAdminRefresh()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  void version

  const courses = getAllCourses()

  function openCreate() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(course) {
    setEditId(course.id)
    setForm({
      title: course.title,
      description: course.description,
      category: course.category,
      allowedRoles: [...course.allowedRoles],
      duration: course.duration,
      status: course.status || 'published',
    })
    setShowForm(true)
  }

  function toggleRole(roleId) {
    const roles = form.allowedRoles.includes(roleId)
      ? form.allowedRoles.filter((r) => r !== roleId)
      : [...form.allowedRoles, roleId]
    setForm({ ...form, allowedRoles: roles.length ? roles : [roleId] })
  }

  function handleSave(e) {
    e.preventDefault()
    const lessonCount = editId ? getLessonsForCourse(editId).length : 0

    const payload = {
      ...form,
      lessonsCount: lessonCount,
      blocksCount: 1,
    }

    if (editId) {
      updateCourse(editId, payload)
    } else {
      const newId = addCourse(payload)
      setEditId(newId)
      refresh()
      return
    }

    setShowForm(false)
    refresh()
  }

  function handleCloseForm() {
    setShowForm(false)
    setEditId(null)
    refresh()
  }

  return (
    <>
      <div className="admin-toolbar">
        <span className="admin-toolbar__info">{courses.length} курсов в каталоге</span>
        <button type="button" className="btn btn--primary btn--sm" onClick={openCreate}>
          + Создать курс
        </button>
      </div>

      <div className="admin-course-cards">
        {courses.map((course) => (
          <article key={course.id} className="admin-course-card">
            <div
              className="admin-course-card__accent"
              style={{ backgroundColor: course.imageColor || '#2a9d5c' }}
            />
            <div className="admin-course-card__body">
              <div className="admin-course-card__top">
                <h3 className="admin-course-card__title">{course.title}</h3>
                <StatusBadge
                  label={STATUS_LABELS[course.status] || course.status}
                  type={course.status === 'published' ? 'published' : 'draft'}
                />
              </div>
              <p className="admin-course-card__desc">{course.description}</p>
              <div className="admin-course-card__meta">
                <span>{getCategoryLabel(course.category)}</span>
                <span>{course.lessonsCount} уроков</span>
              </div>
              <p className="admin-course-card__roles">
                {course.allowedRoles.map((r) => getRole(r)?.label || r).join(', ')}
              </p>
              <button
                type="button"
                className="btn btn--outline btn--sm admin-course-card__btn"
                onClick={() => openEdit(course)}
              >
                Редактировать курс
              </button>
            </div>
          </article>
        ))}
      </div>

      {showForm && (
        <AdminModal
          title={editId ? 'Редактировать курс' : 'Создать курс'}
          onClose={handleCloseForm}
          xwide
          footer={
            <>
              <button type="button" className="btn btn--outline" onClick={handleCloseForm}>
                {editId ? 'Готово' : 'Отмена'}
              </button>
              <button type="submit" className="btn btn--primary" form="course-form">
                {editId ? 'Сохранить курс' : 'Создать курс'}
              </button>
            </>
          }
        >
          <form id="course-form" className="admin-form" onSubmit={handleSave}>
            <label className="admin-form__label">
              Название курса
              <input
                className="admin-form__input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </label>
            <label className="admin-form__label">
              Описание курса
              <textarea
                className="admin-form__textarea"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                required
              />
            </label>
            <div className="admin-form__row">
              <label className="admin-form__label">
                Категория
                <select
                  className="admin-form__select"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.filter((c) => c.id !== 'all').map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </label>
              <label className="admin-form__label">
                Статус
                <select
                  className="admin-form__select"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="published">Опубликован</option>
                  <option value="draft">Черновик</option>
                </select>
              </label>
            </div>
            <label className="admin-form__label">
              Длительность (отображение)
              <input
                className="admin-form__input"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                placeholder="Например: 3 часа"
              />
            </label>
            <div className="admin-form__label">
              Должность / роли, для кого курс
              <div className="admin-form__roles">
                {ROLE_OPTIONS.map((roleId) => (
                  <label
                    key={roleId}
                    className={`admin-form__role-chip ${
                      form.allowedRoles.includes(roleId)
                        ? 'admin-form__role-chip--active'
                        : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.allowedRoles.includes(roleId)}
                      onChange={() => toggleRole(roleId)}
                    />
                    {ROLES[roleId]?.label || roleId}
                  </label>
                ))}
              </div>
            </div>
          </form>

          {editId && (
            <CourseLessonManager
              courseId={editId}
              onChange={refresh}
              key={`lessons-${editId}-${version}`}
            />
          )}
          {!editId && (
            <p className="lesson-manager__hint">
              После создания курса вы сможете добавить видеоуроки.
            </p>
          )}
        </AdminModal>
      )}
    </>
  )
}
