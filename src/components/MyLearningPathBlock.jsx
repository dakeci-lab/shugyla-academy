import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getUserActivePathProgress } from '../utils/learningPathProgress'
import { completeUserLearningPath } from '../services/academyDataService'
import { USER_PATH_STATUS } from '../utils/learningPathData'
import ProgressBar from './ProgressBar'
import StatusBadge from './admin/StatusBadge'
import './MyLearningPathBlock.css'

/** Блок «Мой обучающий маршрут» на dashboard */
export default function MyLearningPathBlock({ userId }) {
  const data = getUserActivePathProgress(userId)

  useEffect(() => {
    if (!data) return
    const { path, percent, status, assignment } = data
    if (
      assignment?.status === USER_PATH_STATUS.ACTIVE &&
      path &&
      percent === 100 &&
      status.label === 'Завершён'
    ) {
      completeUserLearningPath(userId, path.id).catch(() => {})
    }
  }, [userId, data])

  if (!data) {
    return (
      <section className="dashboard-page__section my-learning-path">
        <h2 className="dashboard-page__heading">Мой обучающий маршрут</h2>
        <div className="my-learning-path__card my-learning-path__card--empty">
          <p>Обучающий маршрут пока не назначен.</p>
        </div>
      </section>
    )
  }

  const { path, isArchived, percent, status, courses } = data
  const title = isArchived ? 'Архивный маршрут' : path?.title || 'Маршрут удалён'

  return (
    <section className="dashboard-page__section my-learning-path">
      <h2 className="dashboard-page__heading">Мой обучающий маршрут</h2>

      <div className="my-learning-path__card">
        <div className="my-learning-path__header">
          <div>
            <h3 className="my-learning-path__title">{title}</h3>
            {path?.description && !isArchived && (
              <p className="my-learning-path__desc">{path.description}</p>
            )}
            {isArchived && (
              <p className="my-learning-path__desc my-learning-path__desc--muted">
                Этот маршрут больше не активен, но ваш прогресс сохранён.
              </p>
            )}
          </div>
          <StatusBadge label={status.label} type={status.type} />
        </div>

        <ProgressBar
          percent={percent}
          label={`Общий прогресс маршрута: ${percent}%`}
        />

        {courses.length > 0 ? (
          <ol className="my-learning-path__courses">
            {courses.map((item, index) => (
              <li key={item.id} className="my-learning-path__course">
                <span className="my-learning-path__course-index">{index + 1}.</span>
                <div className="my-learning-path__course-body">
                  {item.course.status === 'published' ? (
                    <Link to={`/course/${item.courseId}`} className="my-learning-path__course-link">
                      {item.course.title}
                    </Link>
                  ) : (
                    <span>{item.course.title}</span>
                  )}
                  {!item.required && (
                    <span className="my-learning-path__optional"> · необязательный</span>
                  )}
                </div>
                <StatusBadge label={item.courseStatus.label} type={item.courseStatus.type} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="my-learning-path__desc">В маршруте пока нет курсов.</p>
        )}
      </div>
    </section>
  )
}
