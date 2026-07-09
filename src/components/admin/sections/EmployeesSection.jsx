import { useState } from 'react'
import {
  getStaffEmployees,
  getEmployeeById,
  EMPTY_EMPLOYEE_FORM,
  employeeToForm,
  validateEmployeeForm,
  EMPLOYMENT_STATUS,
  getEmploymentStatusLabel,
  getEmploymentStatusBadgeType,
  isDeactivatedStaffEmployee,
  isActiveStaffEmployee,
} from '../../../utils/employeeData'
import {
  createEmployee,
  updateEmployee,
  deactivateEmployee,
  restoreEmployee,
  permanentlyDeleteEmployee,
  assignLearningPathToUser,
  getLearningPathsByRole,
  getUserLearningPath,
} from '../../../services/academyDataService'
import { getActiveLearningPathForUser } from '../../../utils/learningPathData'
import { getEmployeeProgressPercent } from '../../../utils/adminStats'
import { ROLES, ALL_EMPLOYEE_ROLES, getRoleLabel } from '../../../data/roles'
import { getCoursesForEmployee, getAssignableCourses } from '../../../utils/courseAccess'
import { getCourseProgress } from '../../../utils/storage'
import { calcLessonProgress } from '../../../utils/courseStructure'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../AdminModal'
import StatusBadge from '../StatusBadge'
import '../admin-shared.css'

const FILTER_TABS = [
  { id: 'active', label: 'Активные' },
  { id: 'deactivated', label: 'Деактивированные' },
  { id: 'all', label: 'Все' },
]

/** Раздел «Сотрудники» — полное управление и назначение курсов */
export default function EmployeesSection() {
  const { version, refresh } = useAdminRefresh()
  const [filter, setFilter] = useState('active')
  const [modalMode, setModalMode] = useState(null)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_EMPLOYEE_FORM)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')

  const [pathAssignId, setPathAssignId] = useState(null)
  const [pathForm, setPathForm] = useState({ learningPathId: '' })
  const [pathFormError, setPathFormError] = useState('')

  void version

  const employees = getStaffEmployees(filter)
  const assignableCourses = getAssignableCourses()
  const activeCount = getStaffEmployees('active').length
  const deactivatedCount = getStaffEmployees('deactivated').length
  const publishedPathsForRole = getLearningPathsByRole(form.role, { publishedOnly: true })

  function currentPathIdForUser(userId) {
    return getUserLearningPath(userId)?.learningPathId || ''
  }

  function pathLabelForEmployee(emp) {
    const info = getActiveLearningPathForUser(emp.id)
    if (!info) return 'Маршрут не назначен'
    if (info.isArchived) return 'Архивный маршрут'
    if (!info.path) return info.label || 'Маршрут удалён'
    return info.path.title
  }

  function openAdd() {
    setEditId(null)
    setForm(EMPTY_EMPLOYEE_FORM)
    setFormError('')
    setModalMode('form')
  }

  function openEdit(emp) {
    setEditId(emp.id)
    const baseForm = employeeToForm(emp)
    baseForm.learningPathId = currentPathIdForUser(emp.id)
    setForm(baseForm)
    setFormError('')
    setModalMode('form')
  }

  function openPathAssign(emp) {
    setPathAssignId(emp.id)
    setPathForm({ learningPathId: currentPathIdForUser(emp.id) })
    setPathFormError('')
    setModalMode('path')
  }

  async function assignPathToEmployee(userId, pathId) {
    if (!pathId) return null
    return assignLearningPathToUser(userId, pathId)
  }

  async function handleSave(e) {
    e.preventDefault()
    const error = validateEmployeeForm(form, editId)
    if (error) {
      setFormError(error)
      return
    }

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      position: form.position.trim(),
      role: form.role,
      login: form.login.trim(),
      employmentStatus: form.employmentStatus,
      assignedCourseIds: form.assignedCourseIds,
      ...(form.password?.trim() ? { password: form.password } : {}),
    }

    try {
      const previousPathId = editId ? currentPathIdForUser(editId) : ''
      const pathChanged = form.learningPathId && form.learningPathId !== previousPathId

      if (editId) {
        await updateEmployee(editId, payload)
        if (pathChanged) {
          await assignPathToEmployee(editId, form.learningPathId)
        }
      } else {
        const newId = await createEmployee({ ...payload, password: form.password })
        if (form.learningPathId) {
          await assignPathToEmployee(newId, form.learningPathId)
        }
      }
      setModalMode(null)
      await refresh()
    } catch (err) {
      setFormError(err.message || 'Не удалось сохранить сотрудника')
    }
  }

  async function handlePathSave(e) {
    e.preventDefault()
    if (!pathAssignId) return
    if (!pathForm.learningPathId) {
      setPathFormError('Выберите маршрут')
      return
    }

    try {
      await assignPathToEmployee(pathAssignId, pathForm.learningPathId)
      setModalMode(null)
      await refresh()
    } catch (err) {
      setPathFormError(err.message || 'Не удалось назначить маршрут')
    }
  }

  async function handleDeactivate(emp) {
    if (!window.confirm(`Деактивировать сотрудника «${emp.name}»?`)) return
    setActionError('')
    try {
      await deactivateEmployee(emp.id)
      await refresh()
    } catch (err) {
      setActionError(err.message || 'Не удалось деактивировать сотрудника')
    }
  }

  async function handleRestore(emp) {
    setActionError('')
    try {
      await restoreEmployee(emp.id)
      setFilter('active')
      await refresh()
    } catch (err) {
      setActionError(err.message || 'Не удалось восстановить сотрудника')
    }
  }

  async function handlePermanentDelete(emp) {
    const confirmed = window.confirm(
      'Вы действительно хотите удалить сотрудника навсегда? Это действие нельзя отменить.'
    )
    if (!confirmed) return

    setActionError('')
    try {
      await permanentlyDeleteEmployee(emp.id)
      await refresh()
    } catch (err) {
      setActionError(
        err.message || 'Не удалось удалить сотрудника. Попробуйте позже.'
      )
    }
  }

  function toggleCourse(courseId) {
    const ids = form.assignedCourseIds.includes(courseId)
      ? form.assignedCourseIds.filter((id) => id !== courseId)
      : [...form.assignedCourseIds, courseId]
    setForm({ ...form, assignedCourseIds: ids })
  }

  const assignedPreview = editId
    ? getCoursesForEmployee(getEmployeeById(editId))
    : []

  const pathChangedOnEdit =
    editId &&
    form.learningPathId &&
    form.learningPathId !== currentPathIdForUser(editId)

  function renderActions(emp) {
    if (isActiveStaffEmployee(emp)) {
      return (
        <>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => openEdit(emp)}
          >
            Редактировать
          </button>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => openPathAssign(emp)}
          >
            {currentPathIdForUser(emp.id) ? 'Сменить маршрут' : 'Назначить маршрут'}
          </button>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => handleDeactivate(emp)}
          >
            Деактивировать
          </button>
        </>
      )
    }

    if (isDeactivatedStaffEmployee(emp)) {
      return (
        <>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => openEdit(emp)}
          >
            Редактировать
          </button>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => handleRestore(emp)}
          >
            Восстановить
          </button>
          <button
            type="button"
            className="btn btn--outline btn--sm admin-table__danger"
            onClick={() => handlePermanentDelete(emp)}
          >
            Удалить навсегда
          </button>
        </>
      )
    }

    return (
      <button
        type="button"
        className="btn btn--outline btn--sm"
        onClick={() => openEdit(emp)}
      >
        Редактировать
      </button>
    )
  }

  return (
    <>
      <div className="admin-toolbar admin-toolbar--stack">
        <div className="admin-filter-tabs">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`admin-filter-tab ${
                filter === tab.id ? 'admin-filter-tab--active' : ''
              }`}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
              {tab.id === 'active' && ` (${activeCount})`}
              {tab.id === 'deactivated' && ` (${deactivatedCount})`}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={openAdd}>
          + Добавить сотрудника
        </button>
      </div>

      {actionError && <p className="admin-form__error">{actionError}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Должность</th>
              <th>Логин</th>
              <th>Роль</th>
              <th>Маршрут</th>
              <th>Статус</th>
              <th>Курсы</th>
              <th>Прогресс</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={9} className="admin-empty">
                  {filter === 'active' && 'Активные сотрудники не найдены.'}
                  {filter === 'deactivated' && 'Деактивированные сотрудники не найдены.'}
                  {filter === 'all' && 'Сотрудники не найдены.'}
                </td>
              </tr>
            ) : (
              employees.map((emp) => {
                const percent = getEmployeeProgressPercent(emp.id)
                const courses = getCoursesForEmployee(emp)

                return (
                  <tr key={emp.id}>
                    <td>
                      <strong>{emp.name}</strong>
                      {emp.assignedCourseIds?.length > 0 && (
                        <span className="admin-table__hint"> · назначено вручную</span>
                      )}
                    </td>
                    <td>{emp.position}</td>
                    <td><code className="admin-code">{emp.login}</code></td>
                    <td>{getRoleLabel(emp.role)}</td>
                    <td>{pathLabelForEmployee(emp)}</td>
                    <td>
                      <StatusBadge
                        label={getEmploymentStatusLabel(emp.employmentStatus)}
                        type={getEmploymentStatusBadgeType(emp.employmentStatus)}
                      />
                    </td>
                    <td>{courses.length}</td>
                    <td>
                      <div className="admin-progress-cell">
                        <div className="admin-progress-cell__bar">
                          <div
                            className="admin-progress-cell__fill"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="admin-progress-cell__text">{percent}%</span>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table__actions">
                        {renderActions(emp)}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {modalMode === 'form' && (
        <AdminModal
          title={editId ? 'Редактировать сотрудника' : 'Добавить сотрудника'}
          onClose={() => setModalMode(null)}
          xwide
          footer={
            <>
              <button type="button" className="btn btn--outline" onClick={() => setModalMode(null)}>
                Отмена
              </button>
              <button type="submit" className="btn btn--primary" form="employee-form">
                Сохранить
              </button>
            </>
          }
        >
          <form id="employee-form" className="admin-form" onSubmit={handleSave}>
            <div className="admin-form__row">
              <label className="admin-form__label">
                Имя *
                <input
                  className="admin-form__input"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  required
                />
              </label>
              <label className="admin-form__label">
                Фамилия
                <input
                  className="admin-form__input"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </label>
            </div>

            <label className="admin-form__label">
              Должность
              <input
                className="admin-form__input"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder="Например: Кассир"
              />
            </label>

            <div className="admin-form__row">
              <label className="admin-form__label">
                Роль
                <select
                  className="admin-form__select"
                  value={form.role}
                  onChange={(e) =>
                    setForm({ ...form, role: e.target.value, learningPathId: '' })
                  }
                >
                  {ALL_EMPLOYEE_ROLES.map((roleId) => (
                    <option key={roleId} value={roleId}>
                      {ROLES[roleId]?.label || roleId}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-form__label">
                Статус
                <select
                  className="admin-form__select"
                  value={form.employmentStatus}
                  onChange={(e) =>
                    setForm({ ...form, employmentStatus: e.target.value })
                  }
                >
                  <option value={EMPLOYMENT_STATUS.ACTIVE}>Активен</option>
                  <option value={EMPLOYMENT_STATUS.INACTIVE}>Деактивирован</option>
                  <option value={EMPLOYMENT_STATUS.INTERNSHIP}>Стажировка</option>
                  <option value={EMPLOYMENT_STATUS.TERMINATED}>Уволен</option>
                </select>
              </label>
            </div>

            <div className="admin-form__row">
              <label className="admin-form__label">
                Логин *
                <input
                  className="admin-form__input"
                  value={form.login}
                  onChange={(e) => setForm({ ...form, login: e.target.value })}
                  required
                />
              </label>
              <label className="admin-form__label">
                Пароль {editId ? '(оставьте пустым, чтобы не менять)' : '*'}
                <input
                  className="admin-form__input"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!editId}
                />
              </label>
            </div>

            <label className="admin-form__label">
              Обучающий маршрут
              <select
                className="admin-form__select"
                value={form.learningPathId}
                onChange={(e) => setForm({ ...form, learningPathId: e.target.value })}
              >
                <option value="">Без маршрута</option>
                {publishedPathsForRole.map((path) => (
                  <option key={path.id} value={path.id}>
                    {path.title}
                  </option>
                ))}
              </select>
              <p className="admin-form__hint">
                Показаны только опубликованные маршруты для выбранной роли.
              </p>
            </label>

            {pathChangedOnEdit && (
              <p className="admin-form__hint admin-form__hint--warning">
                Новый маршрут добавит сотруднику курсы из выбранного маршрута.
                Старые назначения и прогресс сохранятся.
              </p>
            )}

            <div className="admin-form__label">
              <span>Назначенные курсы</span>
              <p className="admin-form__hint">
                Если ничего не выбрано — сотрудник увидит опубликованные курсы по своей роли.
              </p>
              <div className="admin-form__courses">
                {assignableCourses.length === 0 ? (
                  <p className="admin-form__hint">Нет опубликованных курсов для назначения.</p>
                ) : (
                  assignableCourses.map((course) => (
                    <label
                      key={course.id}
                      className={`admin-form__course-chip ${
                        form.assignedCourseIds.includes(course.id)
                          ? 'admin-form__course-chip--active'
                          : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.assignedCourseIds.includes(course.id)}
                        onChange={() => toggleCourse(course.id)}
                      />
                      {course.title}
                    </label>
                  ))
                )}
              </div>
            </div>

            {formError && <p className="admin-form__error">{formError}</p>}
          </form>

          {editId && assignedPreview.length > 0 && (
            <div className="employee-preview-courses">
              <h3 className="admin-detail-heading">Текущие доступные курсы</h3>
              <ul className="admin-detail-list">
                {assignedPreview.map((course) => {
                  const prog = getCourseProgress(editId, course.id)
                  const pct = calcLessonProgress(prog.completedLessons, course.id)
                  return (
                    <li key={course.id}>
                      <span>{course.title}</span>
                      <span>{pct}%</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </AdminModal>
      )}

      {modalMode === 'path' && pathAssignId && (
        <AdminModal
          title={
            currentPathIdForUser(pathAssignId)
              ? 'Сменить маршрут'
              : 'Назначить маршрут'
          }
          onClose={() => setModalMode(null)}
          footer={
            <>
              <button type="button" className="btn btn--outline" onClick={() => setModalMode(null)}>
                Отмена
              </button>
              <button type="submit" className="btn btn--primary" form="path-assign-form">
                Сохранить
              </button>
            </>
          }
        >
          <form id="path-assign-form" className="admin-form" onSubmit={handlePathSave}>
            <p className="admin-form__hint admin-form__hint--warning">
              Новый маршрут добавит сотруднику курсы из выбранного маршрута.
              Старые назначения и прогресс сохранятся.
            </p>
            <label className="admin-form__label">
              Обучающий маршрут
              <select
                className="admin-form__select"
                value={pathForm.learningPathId}
                onChange={(e) =>
                  setPathForm({ ...pathForm, learningPathId: e.target.value })
                }
                required
              >
                <option value="">Выберите маршрут…</option>
                {getLearningPathsByRole(getEmployeeById(pathAssignId)?.role, {
                  publishedOnly: true,
                }).map((path) => (
                  <option key={path.id} value={path.id}>
                    {path.title}
                  </option>
                ))}
              </select>
            </label>
            {pathFormError && <p className="admin-form__error">{pathFormError}</p>}
          </form>
        </AdminModal>
      )}
    </>
  )
}
