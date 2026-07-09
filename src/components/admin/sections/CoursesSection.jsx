import { useMemo, useState } from 'react'
import { getAllCourses } from '../../../utils/adminData'
import {
  createCourse,
  updateCourse,
  deleteCourse,
  archiveCourse,
  restoreCourse,
} from '../../../services/academyDataService'
import {
  COURSE_STATUS,
  COURSE_STATUS_LABELS,
  COURSE_STATUS_BADGE,
} from '../../../utils/courseData'
import {
  CATEGORIES,
  ACADEMY_COURSE_ROLES,
  getAcademyCourseRoleLabel,
} from '../../../data/roles'
import { getCategoryLabel } from '../../../utils/i18n'
import { getLessonsForCourse } from '../../../utils/lessonData'
import { getTests } from '../../../services/academyDataService'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../AdminModal'
import CourseLessonManager from '../CourseLessonManager'
import StatusBadge from '../StatusBadge'
import '../admin-shared.css'

const CATEGORY_OPTIONS = CATEGORIES.filter((c) => c.id !== 'all')

const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'for_all',
  allowedRoles: ['cashier'],
  duration: '2 часа',
  status: COURSE_STATUS.DRAFT,
  lessonsCount: 0,
  testsCount: 0,
}

function formatUpdatedAt(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}

/** Раздел «Курсы» — полный CRUD */
export default function CoursesSection() {
  const { version, refresh } = useAdminRefresh()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search, setSearch] = useState('')

  void version

  const courses = getAllCourses()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return courses.filter((course) => {
      if (statusFilter !== 'all' && course.status !== statusFilter) return false
      if (categoryFilter !== 'all' && course.category !== categoryFilter) return false
      if (roleFilter !== 'all' && !course.allowedRoles?.includes(roleFilter)) return false
      if (q && !course.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [courses, statusFilter, roleFilter, categoryFilter, search, version])

  function openCreate() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setShowForm(true)
  }

  function openEdit(course) {
    setEditId(course.id)
    setForm({
      title: course.title,
      description: course.description,
      category: course.category,
      allowedRoles: [...(course.allowedRoles || [])],
      duration: course.duration,
      status: course.status,
      lessonsCount: course.lessonsCount ?? 0,
      testsCount: course.testsCount ?? 0,
    })
    setFormError('')
    setShowForm(true)
  }

  function toggleRole(roleId) {
    const roles = form.allowedRoles.includes(roleId)
      ? form.allowedRoles.filter((r) => r !== roleId)
      : [...form.allowedRoles, roleId]
    setForm({ ...form, allowedRoles: roles.length ? roles : [roleId] })
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.title.trim()) {
      setFormError('Укажите название курса')
      return
    }
    if (!form.allowedRoles.length) {
      setFormError('Выберите хотя бы одну роль')
      return
    }

    const lessonCount = editId ? getLessonsForCourse(editId).length : Number(form.lessonsCount) || 0
    const testsCount = editId
      ? getTests().filter((t) => Number(t.courseId) === Number(editId)).length
      : Number(form.testsCount) || 0

    const payload = {
      ...form,
      lessonsCount: lessonCount,
      testsCount,
      blocksCount: 1,
    }

    try {
      if (editId) {
        await updateCourse(editId, payload)
      } else {
        const newId = await createCourse(payload)
        setEditId(newId)
      }
      await refresh()
      if (editId) setShowForm(false)
    } catch (err) {
      setFormError(err.message || 'Не удалось сохранить курс')
    }
  }

  async function handleArchive(course) {
    if (!window.confirm(`Переместить «${course.title}» в архив?`)) return
    await archiveCourse(course.id)
    await refresh()
  }

  async function handleRestore(course) {
    await restoreCourse(course.id)
    await refresh()
  }

  async function handleDelete(course) {
    if (
      !window.confirm(
        'Вы действительно хотите удалить этот курс? Это действие нельзя отменить.'
      )
    ) {
      return
    }
    try {
      await deleteCourse(course.id)
      await refresh()
    } catch (err) {
      window.alert(err.message || 'Не удалось удалить курс')
    }
  }

  function closeForm() {
    setShowForm(false)
    setEditId(null)
    setFormError('')
  }

  return (
    <>
      <div className="admin-toolbar admin-toolbar--wrap">
        <span className="admin-toolbar__info">{filtered.length} из {courses.length} курсов</span>
        <div className="admin-toolbar__filters">
          <input
            type="search"
            className="admin-search"
            placeholder="Поиск по названию…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="admin-form__select admin-form__select--sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Все статусы</option>
            <option value={COURSE_STATUS.ACTIVE}>Активный</option>
            <option value={COURSE_STATUS.DRAFT}>Черновик</option>
            <option value={COURSE_STATUS.ARCHIVE}>Архив</option>
          </select>
          <select
            className="admin-form__select admin-form__select--sm"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">Все роли</option>
            {ACADEMY_COURSE_ROLES.map((role) => (
              <option key={role.id} value={role.id}>{role.label}</option>
            ))}
          </select>
          <select
            className="admin-form__select admin-form__select--sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">Все категории</option>
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.label}</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={openCreate}>
          + Создать курс
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Категория</th>
              <th>Роли</th>
              <th>Статус</th>
              <th>Уроков</th>
              <th>Тестов</th>
              <th>Обновлён</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="admin-empty">Курсы не найдены</td>
              </tr>
            ) : (
              filtered.map((course) => (
                <tr key={course.id}>
                  <td>
                    <strong>{course.title}</strong>
                    <p className="admin-table__sub">{course.description}</p>
                  </td>
                  <td>{getCategoryLabel(course.category)}</td>
                  <td className="admin-table__roles">
                    {(course.allowedRoles || [])
                      .map((r) => getAcademyCourseRoleLabel(r))
                      .join(', ')}
                  </td>
                  <td>
                    <StatusBadge
                      label={COURSE_STATUS_LABELS[course.status] || course.status}
                      type={COURSE_STATUS_BADGE[course.status] || 'idle'}
                    />
                  </td>
                  <td>{course.lessonsCount ?? 0}</td>
                  <td>{course.testsCount ?? 0}</td>
                  <td>{formatUpdatedAt(course.updatedAt)}</td>
                  <td className="admin-table__actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => openEdit(course)}
                    >
                      Редактировать
                    </button>
                    {course.status === COURSE_STATUS.ARCHIVE ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => handleRestore(course)}
                      >
                        Восстановить
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => handleArchive(course)}
                      >
                        В архив
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => handleDelete(course)}
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <AdminModal
          title={editId ? 'Редактировать курс' : 'Создать курс'}
          onClose={closeForm}
          xwide
          footer={
            <>
              <button type="button" className="btn btn--outline" onClick={closeForm}>
                {editId ? 'Закрыть' : 'Отмена'}
              </button>
              <button type="submit" className="btn btn--primary" form="course-form">
                {editId ? 'Сохранить' : 'Создать курс'}
              </button>
            </>
          }
        >
          <form id="course-form" className="admin-form" onSubmit={handleSave}>
            {formError && <p className="admin-form__error">{formError}</p>}

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
                  {CATEGORY_OPTIONS.map((cat) => (
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
                  <option value={COURSE_STATUS.ACTIVE}>Активный</option>
                  <option value={COURSE_STATUS.DRAFT}>Черновик</option>
                  <option value={COURSE_STATUS.ARCHIVE}>Архив</option>
                </select>
              </label>
            </div>
            <div className="admin-form__row">
              <label className="admin-form__label">
                Длительность
                <input
                  className="admin-form__input"
                  value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: e.target.value })}
                  placeholder="Например: 3 часа"
                />
              </label>
              {!editId && (
                <>
                  <label className="admin-form__label">
                    Количество уроков
                    <input
                      type="number"
                      min="0"
                      className="admin-form__input"
                      value={form.lessonsCount}
                      onChange={(e) =>
                        setForm({ ...form, lessonsCount: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <label className="admin-form__label">
                    Количество тестов
                    <input
                      type="number"
                      min="0"
                      className="admin-form__input"
                      value={form.testsCount}
                      onChange={(e) =>
                        setForm({ ...form, testsCount: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                </>
              )}
            </div>
            <div className="admin-form__label">
              Роли, для которых предназначен курс
              <div className="admin-form__roles">
                {ACADEMY_COURSE_ROLES.map((role) => (
                  <label
                    key={role.id}
                    className={`admin-form__role-chip ${
                      form.allowedRoles.includes(role.id)
                        ? 'admin-form__role-chip--active'
                        : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.allowedRoles.includes(role.id)}
                      onChange={() => toggleRole(role.id)}
                    />
                    {role.label}
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
