import { useState } from 'react'
import { getAllEmployees, addEmployee, getEmployeeById } from '../../../utils/adminData'
import {
  getEmployeeProgressPercent,
  getEmployeeTrainingStatus,
} from '../../../utils/adminStats'
import { getRole, ROLES, ALL_EMPLOYEE_ROLES } from '../../../data/roles'
import { getCoursesForRole } from '../../../utils/auth'
import { getCourseProgress } from '../../../utils/storage'
import AdminModal from '../AdminModal'
import StatusBadge from '../StatusBadge'
import '../admin-shared.css'

const ROLE_OPTIONS = ['admin', ...ALL_EMPLOYEE_ROLES]

const EMPTY_FORM = {
  name: '',
  login: '',
  password: '',
  role: 'cashier',
  position: '',
}

/** Раздел «Сотрудники» */
export default function EmployeesSection() {
  const [showForm, setShowForm] = useState(false)
  const [viewId, setViewId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [, setTick] = useState(0)

  const employees = getAllEmployees().filter((u) => u.role !== 'admin')
  const viewed = viewId ? getEmployeeById(viewId) : null

  function refresh() {
    setTick((t) => t + 1)
  }

  function handleAdd(e) {
    e.preventDefault()
    addEmployee(form)
    setForm(EMPTY_FORM)
    setShowForm(false)
    refresh()
  }

  return (
    <>
      <div className="admin-toolbar">
        <span className="admin-toolbar__info">
          {employees.length} сотрудников
        </span>
        <button className="btn btn--primary btn--sm" onClick={() => setShowForm(true)}>
          + Добавить сотрудника
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Должность</th>
              <th>Логин</th>
              <th>Роль</th>
              <th>Статус обучения</th>
              <th>Прогресс</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const status = getEmployeeTrainingStatus(emp.id, emp.role)
              const percent = getEmployeeProgressPercent(emp.id, emp.role)
              const role = getRole(emp.role)

              return (
                <tr key={emp.id}>
                  <td><strong>{emp.name}</strong></td>
                  <td>{emp.position}</td>
                  <td>{emp.login}</td>
                  <td>{role?.label || emp.role}</td>
                  <td>
                    <StatusBadge label={status.label} type={status.type} />
                  </td>
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
                    <button
                      className="btn btn--outline btn--sm"
                      onClick={() => setViewId(emp.id)}
                    >
                      Открыть
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Форма добавления */}
      {showForm && (
        <AdminModal
          title="Добавить сотрудника"
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button className="btn btn--outline" onClick={() => setShowForm(false)}>
                Отмена
              </button>
              <button className="btn btn--primary" form="add-employee-form">
                Сохранить
              </button>
            </>
          }
        >
          <form id="add-employee-form" className="admin-form" onSubmit={handleAdd}>
            <label className="admin-form__label">
              ФИО
              <input
                className="admin-form__input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label className="admin-form__label">
              Должность
              <input
                className="admin-form__input"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder="Например: Кассир"
              />
            </label>
            <label className="admin-form__label">
              Логин
              <input
                className="admin-form__input"
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
                required
              />
            </label>
            <label className="admin-form__label">
              Пароль
              <input
                className="admin-form__input"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </label>
            <label className="admin-form__label">
              Роль
              <select
                className="admin-form__select"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {ROLE_OPTIONS.filter((r) => r !== 'admin').map((roleId) => (
                  <option key={roleId} value={roleId}>
                    {ROLES[roleId]?.label || roleId}
                  </option>
                ))}
              </select>
            </label>
          </form>
        </AdminModal>
      )}

      {/* Карточка сотрудника */}
      {viewed && (
        <AdminModal
          title={viewed.name}
          onClose={() => setViewId(null)}
          footer={
            <button className="btn btn--outline" onClick={() => setViewId(null)}>
              Закрыть
            </button>
          }
        >
          <ul className="admin-detail-list">
            <li><span>Должность</span><span>{viewed.position}</span></li>
            <li><span>Логин</span><span>{viewed.login}</span></li>
            <li><span>Роль</span><span>{getRole(viewed.role)?.label}</span></li>
            <li>
              <span>Прогресс</span>
              <span>{getEmployeeProgressPercent(viewed.id, viewed.role)}%</span>
            </li>
          </ul>
          <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>Курсы:</p>
          <ul className="admin-detail-list">
            {getCoursesForRole(viewed.role).map((course) => {
              const prog = getCourseProgress(viewed.id, course.id)
              const pct = Math.round(
                (prog.completedLessons.length / course.lessonsCount) * 100
              )
              return (
                <li key={course.id}>
                  <span>{course.title}</span>
                  <span>{pct}%</span>
                </li>
              )
            })}
          </ul>
        </AdminModal>
      )}
    </>
  )
}
