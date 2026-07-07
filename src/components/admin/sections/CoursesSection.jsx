import { useState } from 'react'
import { getAllCourses, addCourse, updateCourse } from '../../../utils/adminData'
import { getRole, ROLES, CATEGORIES, ALL_EMPLOYEE_ROLES } from '../../../data/roles'
import { getCategoryLabel } from '../../../utils/i18n'
import AdminModal from '../AdminModal'
import StatusBadge from '../StatusBadge'
import '../admin-shared.css'

const ROLE_OPTIONS = ['admin', ...ALL_EMPLOYEE_ROLES]

const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'cashier',
  allowedRoles: ['cashier'],
  lessonsCount: 4,
  blocksCount: 2,
  duration: '2 часа',
  status: 'draft',
}

const STATUS_LABELS = {
  published: 'Опубликован',
  draft: 'Черновик',
}

/** Раздел «Курсы» */
export default function CoursesSection() {
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [, setTick] = useState(0)

  const courses = getAllCourses()

  function refresh() {
    setTick((t) => t + 1)
  }

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
      lessonsCount: course.lessonsCount,
      blocksCount: course.blocksCount,
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
    if (editId) {
      updateCourse(editId, form)
    } else {
      addCourse(form)
    }
    setShowForm(false)
    refresh()
  }

  return (
    <>
      <div className="admin-toolbar">
        <span className="admin-toolbar__info">{courses.length} курсов</span>
        <button className="btn btn--primary btn--sm" onClick={openCreate}>
          + Создать курс
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Категория</th>
              <th>Доступные роли</th>
              <th>Уроков</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {courses.map((course) => (
              <tr key={course.id}>
                <td><strong>{course.title}</strong></td>
                <td>{getCategoryLabel(course.category)}</td>
                <td>
                  {course.allowedRoles
                    .map((r) => getRole(r)?.label || r)
                    .join(', ')}
                </td>
                <td>{course.lessonsCount}</td>
                <td>
                  <StatusBadge
                    label={STATUS_LABELS[course.status] || course.status}
                    type={course.status === 'published' ? 'published' : 'draft'}
                  />
                </td>
                <td>
                  <button
                    className="btn btn--outline btn--sm"
                    onClick={() => openEdit(course)}
                  >
                    Редактировать
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <AdminModal
          title={editId ? 'Редактировать курс' : 'Создать курс'}
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button className="btn btn--outline" onClick={() => setShowForm(false)}>
                Отмена
              </button>
              <button className="btn btn--primary" form="course-form">
                Сохранить
              </button>
            </>
          }
        >
          <form id="course-form" className="admin-form" onSubmit={handleSave}>
            <label className="admin-form__label">
              Название
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
              />
            </label>
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
            <div className="admin-form__label">
              Доступные роли
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
            <label className="admin-form__label">
              Количество уроков
              <input
                className="admin-form__input"
                type="number"
                min="1"
                value={form.lessonsCount}
                onChange={(e) =>
                  setForm({ ...form, lessonsCount: Number(e.target.value) })
                }
              />
            </label>
            <label className="admin-form__label">
              Количество блоков
              <input
                className="admin-form__input"
                type="number"
                min="1"
                value={form.blocksCount}
                onChange={(e) =>
                  setForm({ ...form, blocksCount: Number(e.target.value) })
                }
              />
            </label>
            <label className="admin-form__label">
              Длительность
              <input
                className="admin-form__input"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
              />
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
          </form>
        </AdminModal>
      )}
    </>
  )
}
