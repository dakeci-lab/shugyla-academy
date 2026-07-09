import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllEmployees } from '../../utils/adminData'
import { getAssignableCourses } from '../../utils/courseAccess'
import {
  assignCourseToEmployee,
  assignCourseToRole,
} from '../../services/academyDataService'
import { ACADEMY_COURSE_ROLES, getAcademyCourseRoleLabel } from '../../data/roles'
import { useAdminRefresh } from '../../hooks/useAdminRefresh'
import '../admin/admin-shared.css'
import '../../pages/platform/PlatformAcademy.css'

/** Назначение обучения — курсы сотрудникам и ролям */
export default function AcademyAssignmentContent() {
  const { refresh } = useAdminRefresh()
  const [mode, setMode] = useState('role')
  const [employeeId, setEmployeeId] = useState('')
  const [roleId, setRoleId] = useState(ACADEMY_COURSE_ROLES[0]?.id || 'cashier')
  const [courseId, setCourseId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const employees = getAllEmployees().filter((e) => e.employmentStatus !== 'inactive')
  const courses = getAssignableCourses()

  async function handleAssign(e) {
    e.preventDefault()
    setError('')
    setMessage('')

    if (!courseId) {
      setError('Выберите курс')
      return
    }

    setSaving(true)
    try {
      if (mode === 'employee') {
        if (!employeeId) {
          setError('Выберите сотрудника')
          return
        }
        await assignCourseToEmployee(Number(employeeId), Number(courseId))
        const emp = employees.find((item) => item.id === Number(employeeId))
        setMessage(`Курс назначен сотруднику ${emp?.name || ''}.`)
      } else {
        await assignCourseToRole(roleId, Number(courseId))
        setMessage(
          `Курс назначен всем сотрудникам с ролью «${getAcademyCourseRoleLabel(roleId)}».`
        )
      }
      await refresh()
    } catch (err) {
      setError(err.message || 'Не удалось назначить курс')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="platform-academy platform-academy--assignment">
      <div className="platform-academy__catalog-top">
        <Link to="/platform/academy" className="btn btn--ghost btn--sm">
          ← Academy
        </Link>
      </div>

      <h2 className="platform-academy__assignment-title">Назначение обучения</h2>
      <p className="platform-academy__assignment-desc">
        Назначьте активный курс конкретному сотруднику или всем сотрудникам выбранной роли.
        Назначенные курсы появятся в «Мой кабинет».
      </p>

      {message && <p className="admin-form__success">{message}</p>}
      {error && <p className="admin-form__error">{error}</p>}

      <form className="admin-form platform-academy__assignment-form" onSubmit={handleAssign}>
        <div className="admin-form__label">
          Кому назначить
          <div className="admin-form__roles">
            <label className={`admin-form__role-chip ${mode === 'role' ? 'admin-form__role-chip--active' : ''}`}>
              <input
                type="radio"
                name="assign-mode"
                checked={mode === 'role'}
                onChange={() => setMode('role')}
              />
              По роли
            </label>
            <label className={`admin-form__role-chip ${mode === 'employee' ? 'admin-form__role-chip--active' : ''}`}>
              <input
                type="radio"
                name="assign-mode"
                checked={mode === 'employee'}
                onChange={() => setMode('employee')}
              />
              Конкретному сотруднику
            </label>
          </div>
        </div>

        {mode === 'role' ? (
          <label className="admin-form__label">
            Роль сотрудников
            <select
              className="admin-form__select"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
            >
              {ACADEMY_COURSE_ROLES.filter((r) => r.id !== 'for_all').map((role) => (
                <option key={role.id} value={role.id}>{role.label}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="admin-form__label">
            Сотрудник
            <select
              className="admin-form__select"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Выберите сотрудника</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({getAcademyCourseRoleLabel(emp.role)})
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="admin-form__label">
          Курс
          <select
            className="admin-form__select"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">Выберите курс</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.title}</option>
            ))}
          </select>
        </label>

        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Назначение…' : 'Назначить курс'}
        </button>
      </form>
    </div>
  )
}
