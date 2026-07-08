import { useState } from 'react'
import {
  getActiveEmployees,
  getEmployeeById,
  EMPTY_EMPLOYEE_FORM,
  employeeToForm,
  validateEmployeeForm,
  EMPLOYMENT_STATUS,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_STATUS_BADGE,
} from '../../../utils/employeeData'
import {
  createEmployee,
  updateEmployee,
  deactivateEmployee,
} from '../../../services/academyDataService'
import {
  getEmployeeProgressPercent,
} from '../../../utils/adminStats'
import { getRole, ROLES, ALL_EMPLOYEE_ROLES } from '../../../data/roles'
import { getCoursesForEmployee, getAssignableCourses } from '../../../utils/courseAccess'
import { getCourseProgress } from '../../../utils/storage'
import { calcLessonProgress } from '../../../utils/courseStructure'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../AdminModal'
import StatusBadge from '../StatusBadge'
import '../admin-shared.css'

/** Раздел «Сотрудники» — полное управление и назначение курсов */
export default function EmployeesSection() {
  const { version, refresh } = useAdminRefresh()
  const [modalMode, setModalMode] = useState(null)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_EMPLOYEE_FORM)
  const [formError, setFormError] = useState('')

  void version

  const employees = getActiveEmployees()
  const assignableCourses = getAssignableCourses()

  function openAdd() {
    setEditId(null)
    setForm(EMPTY_EMPLOYEE_FORM)
    setFormError('')
    setModalMode('form')
  }

  function openEdit(emp) {
    setEditId(emp.id)
    setForm(employeeToForm(emp))
    setFormError('')
    setModalMode('form')
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
      if (editId) {
        await updateEmployee(editId, payload)
      } else {
        await createEmployee({ ...payload, password: form.password })
      }
      setModalMode(null)
      await refresh()
    } catch (err) {
      setFormError(err.message || 'Не удалось сохранить сотрудника')
    }
  }

  async function handleDeactivate(emp) {
    if (!window.confirm(`Деактивировать сотрудника «${emp.name}»?`)) return
    await deactivateEmployee(emp.id)
    await refresh()
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

  return (
    <>
      <div className="admin-toolbar">
        <span className="admin-toolbar__info">
          {employees.length} активных сотрудников
        </span>
        <button type="button" className="btn btn--primary btn--sm" onClick={openAdd}>
          + Добавить сотрудника
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Должность</th>
              <th>Логин</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Курсы</th>
              <th>Прогресс</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={8} className="admin-empty">
                  Активные сотрудники не найдены.
                </td>
              </tr>
            ) : (
              employees.map((emp) => {
                const percent = getEmployeeProgressPercent(emp.id)
                const role = getRole(emp.role)
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
                    <td>{role?.label || emp.role}</td>
                    <td>
                      <StatusBadge
                        label={EMPLOYMENT_STATUS_LABELS[emp.employmentStatus]}
                        type={EMPLOYMENT_STATUS_BADGE[emp.employmentStatus]}
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
                          onClick={() => handleDeactivate(emp)}
                        >
                          Деактивировать
                        </button>
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
                Роль в системе
                <select
                  className="admin-form__select"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
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
    </>
  )
}
