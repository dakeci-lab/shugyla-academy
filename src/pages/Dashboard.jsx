import { useNavigate } from 'react-router-dom'
import { getUser, clearUser, getCourseProgress } from '../utils/storage'
import { getCoursesForRole } from '../utils/auth'
import Header from '../components/Header'
import CourseCard from '../components/CourseCard'
import ProgressBar from '../components/ProgressBar'
import './Dashboard.css'

/**
 * Личный кабинет сотрудника — /dashboard
 * Показывает курсы по роли и общий прогресс обучения
 */
export default function Dashboard() {
  const navigate = useNavigate()
  const user = getUser()

  if (!user) return null

  const myCourses = getCoursesForRole(user.role)

  // Считаем общий прогресс по всем курсам
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
          <h2 className="dashboard-page__heading">Мои курсы</h2>
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
