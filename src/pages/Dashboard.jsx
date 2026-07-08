import { useNavigate, Link } from 'react-router-dom'
import { getCourseProgress } from '../utils/storage'
import { useSession } from '../context/SessionContext'
import { getAccessibleCourses, canViewTeamChecklists } from '../utils/auth'
import { getEmployeeById } from '../utils/employeeData'
import { getRole, getPermissionLabel } from '../data/roles'
import { calcLessonProgress, getCourseCompletionStatus } from '../utils/courseStructure'
import Header from '../components/Header'
import CourseCard from '../components/CourseCard'
import ProgressBar from '../components/ProgressBar'
import FinalAttestationBlock from '../components/FinalAttestationBlock'
import './Dashboard.css'

/**
 * Личный кабинет — /dashboard
 * Показывает назначенные или ролевые опубликованные курсы.
 */
export default function Dashboard() {
  const navigate = useNavigate()
  const { user, logout } = useSession()

  if (!user) return null

  const employee = getEmployeeById(user.id) || user
  const role = getRole(user.role)
  const myCourses = getAccessibleCourses(employee)

  let totalLessons = 0
  let completedLessons = 0

  myCourses.forEach((course) => {
    const progress = getCourseProgress(user.id, course.id)
    totalLessons += course.lessonsCount || 0
    completedLessons += progress.completedLessons.length
  })

  const overallPercent = totalLessons > 0
    ? Math.round((completedLessons / totalLessons) * 100)
    : 0

  const hasManualAssignment = (employee.assignedCourseIds?.length ?? 0) > 0

  function handleLogout() {
    logout()
    navigate('/academy')
  }

  return (
    <div className="dashboard-page">
      <Header />

      <main className="dashboard-page__main container">
        <div className="dashboard-page__welcome">
          <div>
            <h1 className="dashboard-page__greeting">
              Привет, {user.name}!
            </h1>
            <p className="dashboard-page__role">{user.roleName}</p>
          </div>
          <button type="button" className="btn btn--outline" onClick={handleLogout}>
            Выйти
          </button>
        </div>

        {role?.permissions?.length > 0 && (
          <section className="dashboard-page__permissions">
            <h2 className="dashboard-page__permissions-title">Ваши права доступа</h2>
            <ul className="dashboard-page__permissions-list">
              {role.permissions.map((perm) => (
                <li key={perm}>{getPermissionLabel(perm)}</li>
              ))}
            </ul>
            {canViewTeamChecklists(user.role) && (
              <p className="dashboard-page__permissions-note">
                Доступны чек-листы команды торгового зала.
              </p>
            )}
          </section>
        )}

        <section className="dashboard-page__section">
          <h2 className="dashboard-page__heading">Прогресс обучения</h2>
          <div className="dashboard-page__progress-card">
            <ProgressBar
              percent={overallPercent}
              label={`Пройдено ${completedLessons} из ${totalLessons} уроков`}
            />
          </div>
        </section>

        <section className="dashboard-page__section">
          <div className="dashboard-page__courses-header">
            <h2 className="dashboard-page__heading">Мои курсы</h2>
            <span className="dashboard-page__courses-count">
              {myCourses.length} {myCourses.length === 1 ? 'курс' : 'курсов'}
            </span>
          </div>

          {hasManualAssignment && (
            <p className="dashboard-page__assignment-note">
              Вам назначены индивидуальные курсы администратором.
            </p>
          )}

          <div className="dashboard-page__grid">
            {myCourses.map((course) => {
              const progress = getCourseProgress(user.id, course.id)
              const courseStatus = getCourseCompletionStatus(
                progress.completedLessons,
                course.id
              )
              const progressPercent = calcLessonProgress(
                progress.completedLessons,
                course.id
              )

              return (
                <CourseCard
                  key={course.id}
                  course={course}
                  progress={progress}
                  progressPercent={progressPercent}
                  courseStatus={courseStatus}
                />
              )
            })}
          </div>

          {myCourses.length === 0 && (
            <div className="dashboard-page__empty dashboard-page__empty--box">
              {hasManualAssignment ? (
                <p>
                  Вам пока не назначены доступные опубликованные курсы.
                  Обратитесь к администратору.
                </p>
              ) : (
                <p>
                  Для вашей роли пока нет доступных опубликованных курсов.
                  Если курсы должны быть — обратитесь к администратору.
                </p>
              )}
            </div>
          )}
        </section>

        <FinalAttestationBlock userId={user.id} role={user.role} />
      </main>
    </div>
  )
}
