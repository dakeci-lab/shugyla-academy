import { useNavigate } from 'react-router-dom'
import { getUser, clearUser, getCourseProgress } from '../utils/storage'
import { getAccessibleCourses, canViewTeamChecklists } from '../utils/auth'
import { getRole, getPermissionLabel } from '../data/roles'
import Header from '../components/Header'
import CourseCard from '../components/CourseCard'
import ProgressBar from '../components/ProgressBar'
import './Dashboard.css'

/**
 * Личный кабинет — /dashboard
 * Показывает только курсы, доступные роли пользователя (admin — все).
 */
export default function Dashboard() {
  const navigate = useNavigate()
  const user = getUser()

  if (!user) return null

  const role = getRole(user.role)
  const myCourses = getAccessibleCourses(user.role)

  let totalLessons = 0
  let completedLessons = 0

  myCourses.forEach((course) => {
    const progress = getCourseProgress(user.id, course.id)
    totalLessons += course.lessonsCount
    completedLessons += progress.completedLessons.length
  })

  const overallPercent = totalLessons > 0
    ? Math.round((completedLessons / totalLessons) * 100)
    : 0

  function handleLogout() {
    clearUser()
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
          <button className="btn btn--outline" onClick={handleLogout}>
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
          <div className="dashboard-page__grid">
            {myCourses.map((course) => {
              const progress = getCourseProgress(user.id, course.id)
              return (
                <CourseCard
                  key={course.id}
                  course={course}
                  progress={progress}
                />
              )
            })}
          </div>

          {myCourses.length === 0 && (
            <p className="dashboard-page__empty">
              Для вашей роли пока нет назначенных курсов.
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
