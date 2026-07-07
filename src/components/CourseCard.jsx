import { Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { getCategoryLabel } from '../utils/i18n'
import './CourseCard.css'

/**
 * Карточка курса — название, метаданные, описание, кнопка «Открыть курс»
 */
export default function CourseCard({ course, progress }) {
  const { lang, t } = useLanguage()

  const progressPercent = progress
    ? Math.round((progress.completedLessons.length / course.lessonsCount) * 100)
    : 0

  return (
    <article className="course-card">
      <div
        className="course-card__header"
        style={{ background: `linear-gradient(135deg, ${course.imageColor} 0%, ${course.imageColor}cc 100%)` }}
      >
        <span className="course-card__badge">
          {getCategoryLabel(course.category, lang)}
        </span>
        <div className="course-card__icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </div>
      </div>

      <div className="course-card__body">
        <h3 className="course-card__title">{course.title}</h3>

        <div className="course-card__stats">
          <span className="course-card__stat">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            {course.lessonsCount} {t.lessons}
          </span>
          <span className="course-card__stat">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            {course.blocksCount} {t.blocks}
          </span>
        </div>

        <p className="course-card__desc">{course.description}</p>

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

        <Link to={`/courses/${course.id}`} className="btn btn--primary course-card__btn">
          {t.openCourse}
        </Link>
      </div>
    </article>
  )
}
