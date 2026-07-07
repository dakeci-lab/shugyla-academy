import { useState } from 'react'
import { useParams, Link, Navigate, useLocation } from 'react-router-dom'
import { getUser, getCourseProgress, markLessonComplete } from '../utils/storage'
import { resolveCourseAccess, ACCESS_REASON } from '../utils/auth'
import {
  getCourseStructure,
  getCourseTest,
  calcLessonProgress,
  areAllLessonsComplete,
} from '../utils/courseStructure'
import { getCategoryLabel } from '../utils/i18n'
import Header from '../components/Header'
import AccessDenied from '../components/AccessDenied'
import BlockList from '../components/BlockList'
import CourseTest from '../components/CourseTest'
import ProgressBar from '../components/ProgressBar'
import './CoursePage.css'

/**
 * Страница курса — /courses/:id
 * Структура: Курс → Блок → Урок → Тест
 */
export default function CoursePage() {
  const { id } = useParams()
  const location = useLocation()
  const courseId = Number(id)
  const user = getUser()

  const access = resolveCourseAccess(user, courseId)

  const [progress, setProgress] = useState(() =>
    user
      ? getCourseProgress(user.id, courseId)
      : { completedLessons: [], testPassed: false, testScore: null }
  )
  const [activeLesson, setActiveLesson] = useState(null)

  if (access.reason === ACCESS_REASON.NOT_FOUND) {
    return (
      <div className="course-page">
        <Header />
        <main className="container course-page__not-found">
          <h1>Курс не найден</h1>
          <Link to="/academy" className="btn btn--primary">На главную</Link>
        </main>
      </div>
    )
  }

  if (access.reason === ACCESS_REASON.UNAUTHENTICATED) {
    const redirect = encodeURIComponent(location.pathname)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }

  if (access.reason === ACCESS_REASON.FORBIDDEN) {
    return <AccessDenied course={access.course} userRole={user.role} />
  }

  const course = access.course
  const blocks = getCourseStructure(courseId)
  const courseTest = getCourseTest(courseId)
  const totalLessons = blocks.reduce((sum, b) => sum + b.lessons.length, 0)
  const progressPercent = calcLessonProgress(progress.completedLessons, courseId)
  const allLessonsDone = areAllLessonsComplete(progress.completedLessons, courseId)
  const roleLabel = getCategoryLabel(course.category)

  function refreshProgress() {
    setProgress(getCourseProgress(user.id, courseId))
  }

  function handleStartLesson(lesson) {
    setActiveLesson(lesson)
    markLessonComplete(user.id, courseId, lesson.id)
    refreshProgress()
  }

  return (
    <div className="course-page">
      <Header />

      <main className="course-page__main container">
        <Link to="/dashboard" className="course-page__back">
          ← Назад к моим курсам
        </Link>

        <div className="course-page__header">
          <div
            className="course-page__banner"
            style={{ backgroundColor: course.imageColor }}
          />
          <div className="course-page__info">
            <span className="course-page__role-badge">Для: {roleLabel}</span>
            <h1 className="course-page__title">{course.title}</h1>
            <p className="course-page__desc">{course.description}</p>
            <div className="course-page__meta">
              <span>{course.duration}</span>
              <span>{blocks.length} блоков</span>
              <span>{totalLessons} уроков</span>
            </div>
          </div>
        </div>

        <div className="course-page__progress-section">
          <ProgressBar
            percent={progressPercent}
            label={`Прогресс: ${progress.completedLessons.length} из ${totalLessons} уроков`}
          />
          {progress.testPassed && (
            <p className="course-page__test-status course-page__test-status--passed">
              ✓ Итоговый тест сдан ({progress.testScore}%)
            </p>
          )}
        </div>

        {activeLesson && (
          <div className="course-page__active-lesson">
            <div className="course-page__active-lesson-header">
              <h3>Урок: {activeLesson.title}</h3>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => setActiveLesson(null)}
              >
                Закрыть
              </button>
            </div>
            <p className="course-page__active-lesson-content">
              {activeLesson.content || 'Содержимое урока будет добавлено позже.'}
            </p>
            <p className="course-page__active-lesson-note">
              Урок отмечен как пройденный.
            </p>
          </div>
        )}

        <section className="course-page__blocks">
          <h2 className="course-page__section-title">Содержание курса</h2>
          <BlockList
            blocks={blocks}
            completedLessons={progress.completedLessons}
            onStartLesson={handleStartLesson}
          />
        </section>

        {courseTest && (
          <section className="course-page__test">
            <CourseTest
              test={courseTest}
              userId={user.id}
              courseId={courseId}
              disabled={!allLessonsDone}
              onComplete={refreshProgress}
            />
          </section>
        )}
      </main>
    </div>
  )
}
