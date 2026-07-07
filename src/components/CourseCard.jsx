import { Link } from 'react-router-dom'
import { CATEGORIES } from '../data/roles'
import './CourseCard.css'

/** Получить название категории по id */
function getCategoryLabel(categoryId) {
  const cat = CATEGORIES.find((c) => c.id === categoryId)
  return cat ? cat.label : categoryId
}

/**
 * Карточка курса — отображается в сетке на главной и в личном кабинете
 */
export default function CourseCard({ course, progress }) {
  const progressPercent = progress
    ? Math.round((progress.completedLessons.length / course.lessonsCount) * 100)
    : 0

  return (
    <Link to={`/courses/${course.id}`} className="course-card">
      <div
        className="course-card__image"
        style={{ backgroundColor: course.imageColor }}
      >
        <span className="course-card__badge">
          {getCategoryLabel(course.category)}
        </span>
      </div>

      <div className="course-card__body">
        <h3 className="course-card__title">{course.title}</h3>
        <p className="course-card__desc">{course.description}</p>

        <div className="course-card__meta">
          <span>{course.duration}</span>
          <span>{course.lessonsCount} уроков</span>
        </div>

        {progressPercent > 0 && (
          <div className="course-card__progress">
            <div className="course-card__progress-bar">
              <div
                className="course-card__progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="course-card__progress-text">{progressPercent}%</span>
          </div>
        )}
      </div>
    </Link>
  )
}
